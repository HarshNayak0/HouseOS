// Supabase Edge Function: recipe imports for Veedu.
//   POST /recipes/import  (signed in) { url } or { caption, source_url? } → { job_id, draft }
//   POST /recipes/image   (signed in) { url } → { mime, data } (base64), so the app can compress and store it
// Websites: schema.org JSON-LD first (no AI); Gemini only as a fallback. Captions: Gemini (rules if unavailable).
// Only recipe content is ever sent to Gemini. Limits: 20 imports a day, 60 a month per household.
import { createClient } from "npm:@supabase/supabase-js@2.119.2";
import {
  captionByRules,
  extractJsonLdRecipe,
  htmlToText,
  isInstagram,
  isSafePublicUrl,
  normalizeAiDraft,
  type RecipeDraft,
} from "../_shared/recipe.ts";

const env = (k: string) => Deno.env.get(k) ?? "";
const APP_URL = env("APP_URL") || "https://veeduos.vercel.app";
function adminKey(): string {
  try {
    const keys = JSON.parse(env("SUPABASE_SECRET_KEYS") || "{}") as Record<string, string>;
    const k = keys.default ?? Object.values(keys)[0];
    if (k) return k;
  } catch {
    /* not JSON */
  }
  return env("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");
}
const db = createClient(env("SUPABASE_URL"), adminKey(), { auth: { persistSession: false } });

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function member(req: Request) {
  const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!jwt) throw new HttpError(401, "Not signed in");
  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, "Not signed in");
  const { data: m } = await db.from("members").select("id, household_id").eq("user_id", data.user.id).is("deleted_at", null).maybeSingle();
  if (!m) throw new HttpError(403, "Not in a household");
  return { ...m, user_id: data.user.id } as { id: string; household_id: string; user_id: string };
}

async function checkLimits(household: string) {
  const since = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  const day = await db.from("recipe_import_jobs").select("id", { count: "exact", head: true }).eq("household_id", household).gte("created_at", since(24));
  if ((day.count ?? 0) >= 20) throw new HttpError(429, "That's 20 imports today, the daily limit. Try again tomorrow.");
  const month = await db.from("recipe_import_jobs").select("id", { count: "exact", head: true }).eq("household_id", household).gte("created_at", since(24 * 30));
  if ((month.count ?? 0) >= 60) throw new HttpError(429, "That's 60 imports this month, the monthly limit.");
}

async function fetchLimited(url: string, maxBytes: number, accept: string): Promise<{ body: Uint8Array; type: string; finalUrl: string }> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; VeeduRecipeImporter/1.0)", Accept: accept, "Accept-Language": "en-CA,en;q=0.9" },
    redirect: "follow",
    signal: AbortSignal.timeout(12_000),
  });
  if (!isSafePublicUrl(res.url || url)) throw new HttpError(400, "That link redirects somewhere we can't open");
  if (!res.ok) throw new HttpError(422, `The site answered ${res.status}. Paste the recipe text instead.`);
  const reader = res.body?.getReader();
  if (!reader) throw new HttpError(422, "Empty page");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, "That file is too large");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) {
    body.set(c, o);
    o += c.length;
  }
  return { body, type: res.headers.get("content-type") ?? "", finalUrl: res.url || url };
}

const GEMINI_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    servings: { type: "NUMBER", nullable: true },
    prep_min: { type: "INTEGER", nullable: true },
    cook_min: { type: "INTEGER", nullable: true },
    tags: { type: "ARRAY", items: { type: "STRING" } },
    creator: { type: "STRING", nullable: true },
    ingredients: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          qty: { type: "NUMBER", nullable: true },
          unit: { type: "STRING", nullable: true },
          item: { type: "STRING" },
          note: { type: "STRING", nullable: true },
          confidence: { type: "NUMBER" },
        },
        required: ["item", "confidence"],
      },
    },
    steps: { type: "ARRAY", items: { type: "STRING" } },
    confidence: {
      type: "OBJECT",
      properties: { title: { type: "NUMBER" }, servings: { type: "NUMBER" }, times: { type: "NUMBER" }, steps: { type: "NUMBER" } },
      required: ["title", "servings", "times", "steps"],
    },
  },
  required: ["title", "ingredients", "steps", "confidence"],
};

const PROMPT = `You turn recipe text into structured data for a home cooking app.
Rules:
- Use ONLY information present in the text. Never invent quantities, times or servings.
- If an ingredient's amount isn't stated, set qty to null and its confidence to 0.5 or lower.
- Units: short forms (g, kg, ml, l, cup, tbsp, tsp, oz, lb, clove, can, pinch) or null.
- Steps: clear, in order, one or two sentences each. Drop hashtags, emojis-only lines, and "follow/like/save" calls to action.
- tags: up to 5 short words (cuisine, meal, diet). creator: an @handle or name if the text credits one.
- confidence (0–1) per field: how sure you are it's stated correctly in the text.
- If there is no recipe in the text, return an empty title and empty arrays.`;

async function gemini(text: string, sourceUrl: string | null): Promise<RecipeDraft | null> {
  const key = env("GEMINI_API_KEY");
  if (!key) return null;
  const model = env("GEMINI_MODEL") || "gemini-2.5-flash";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(40_000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: PROMPT }] },
      contents: [{ role: "user", parts: [{ text: text.slice(0, 20_000) }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: GEMINI_SCHEMA, temperature: 0.1 },
    }),
  });
  if (!res.ok) {
    console.error("gemini", res.status, (await res.text()).slice(0, 300));
    return null;
  }
  const j = await res.json();
  const out = j?.candidates?.[0]?.content?.parts?.[0]?.text;
  try {
    return normalizeAiDraft(JSON.parse(out), sourceUrl);
  } catch {
    return null;
  }
}

async function importRecipe(m: { id: string; household_id: string; user_id: string }, body: Record<string, unknown>) {
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const caption = typeof body.caption === "string" ? body.caption.trim().slice(0, 10_000) : "";
  const sourceUrl = typeof body.source_url === "string" && /^https?:\/\//.test(body.source_url) ? body.source_url.slice(0, 500) : url || null;
  if (!url && !caption) throw new HttpError(400, "Paste a link or the recipe text");
  if (url && !caption && isInstagram(url)) throw new HttpError(400, "Instagram links can't be read. Copy the post's caption and paste it instead.");
  if (url && !isSafePublicUrl(url)) throw new HttpError(400, "That doesn't look like a public web link");
  await checkLimits(m.household_id);

  const { data: job } = await db
    .from("recipe_import_jobs")
    .insert({ household_id: m.household_id, kind: caption ? "caption" : "url", source_url: sourceUrl, status: "reading", created_by: m.user_id })
    .select("id")
    .single();
  const fail = async (status: number, msg: string): Promise<never> => {
    await db.from("recipe_import_jobs").update({ status: "failed", error: msg.slice(0, 300) }).eq("id", job!.id);
    throw new HttpError(status, msg);
  };

  let draft: RecipeDraft | null = null;
  if (caption) {
    await db.from("recipe_import_jobs").update({ status: "structuring" }).eq("id", job!.id);
    draft = (await gemini(caption, sourceUrl)) ?? captionByRules(caption, sourceUrl);
  } else {
    let page;
    try {
      page = await fetchLimited(url, 4_000_000, "text/html,application/xhtml+xml");
    } catch (e) {
      return fail(e instanceof HttpError ? e.status : 422, e instanceof HttpError ? e.message : "Couldn't open that page. Paste the recipe text instead.");
    }
    const html = new TextDecoder().decode(page.body);
    draft = extractJsonLdRecipe(html, page.finalUrl);
    if (!draft) {
      await db.from("recipe_import_jobs").update({ status: "structuring" }).eq("id", job!.id);
      draft = await gemini(htmlToText(html), page.finalUrl);
      if (draft) {
        const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
        if (og && /^https?:\/\//.test(og)) draft.image_url = og;
      }
    }
    if (!draft) return fail(422, "Couldn't find a recipe on that page. Paste the recipe text instead.");
  }
  if (!draft.ingredients.length && !draft.steps.length) return fail(422, "That doesn't look like a recipe. Check the text and try again.");
  await db.from("recipe_import_jobs").update({ status: "ready", method: draft.method === "json-ld" ? "json-ld" : "gemini", draft }).eq("id", job!.id);
  return { job_id: job!.id, draft };
}

async function fetchImage(body: Record<string, unknown>) {
  const url = typeof body.url === "string" ? body.url : "";
  if (!isSafePublicUrl(url)) throw new HttpError(400, "Bad image link");
  const img = await fetchLimited(url, 6_000_000, "image/*");
  if (!/^image\/(jpeg|png|webp|gif|avif)/.test(img.type)) throw new HttpError(415, "That link isn't an image");
  let bin = "";
  for (let i = 0; i < img.body.length; i += 0x8000) bin += String.fromCharCode(...img.body.subarray(i, i + 0x8000));
  return { mime: img.type.split(";")[0], data: btoa(bin) };
}

function corsFor(origin: string | null): Record<string, string> {
  const ok = origin && (origin === APP_URL || /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin));
  return ok
    ? { "Access-Control-Allow-Origin": origin!, "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", Vary: "Origin" }
    : {};
}

Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const json = (b: unknown, status = 200) => Response.json(b, { status, headers: cors });
  const route = new URL(req.url).pathname.replace(/^.*\/recipes/, "") || "/";
  try {
    if (req.method !== "POST") throw new HttpError(405, "Use POST");
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const m = await member(req);
    if (route === "/import") return json(await importRecipe(m, body));
    if (route === "/image") return json(await fetchImage(body));
    throw new HttpError(404, "Not found");
  } catch (e) {
    return json({ error: (e as Error).message }, e instanceof HttpError ? e.status : 500);
  }
});
