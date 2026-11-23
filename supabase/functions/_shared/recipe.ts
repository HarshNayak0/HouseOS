/**
 * Recipe parsing shared by the `recipes` Edge Function and the app (pure TypeScript, unit-tested).
 * - schema.org/Recipe JSON-LD extraction (no AI)
 * - ingredient line parsing ("2 ½ cups basmati rice, rinsed")
 * - a rule-based caption fallback for when Gemini is unavailable
 * - quantity scaling and friendly fractions
 */

export interface DraftIngredient {
  qty: number | null;
  unit: string | null;
  item: string;
  note: string | null;
  /** 0–1; below 0.7 the review screen highlights it */
  confidence: number;
}
export interface RecipeDraft {
  title: string;
  servings: number | null;
  prep_min: number | null;
  cook_min: number | null;
  tags: string[];
  creator: string | null;
  source_url: string | null;
  image_url: string | null;
  ingredients: DraftIngredient[];
  steps: string[];
  confidence: { title: number; servings: number; times: number; steps: number };
  method: "json-ld" | "gemini" | "rules";
}

const UNICODE_FRACTIONS: Record<string, number> = { "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75, "⅕": 0.2, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875 };
const UNITS: Record<string, string> = {
  cup: "cup", cups: "cup", c: "cup",
  tbsp: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp", tbs: "tbsp", tbl: "tbsp", T: "tbsp",
  tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp", t: "tsp",
  g: "g", gram: "g", grams: "g", gm: "g", gms: "g",
  kg: "kg", kilogram: "kg", kilograms: "kg",
  ml: "ml", millilitre: "ml", milliliter: "ml", millilitres: "ml", milliliters: "ml",
  l: "l", litre: "l", liter: "l", litres: "l", liters: "l",
  oz: "oz", ounce: "oz", ounces: "oz", lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
  pinch: "pinch", pinches: "pinch", clove: "clove", cloves: "clove", can: "can", cans: "can",
  sprig: "sprig", sprigs: "sprig", bunch: "bunch", bunches: "bunch", handful: "handful", handfuls: "handful",
  piece: "piece", pieces: "piece", slice: "slice", slices: "slice", stick: "stick", sticks: "stick", inch: "inch", inches: "inch",
};

/** "1 1/2", "1½", "½", "1.5", "1-2" → number (ranges take the lower bound). */
export function parseQty(s: string): number | null {
  let t = s.trim();
  for (const [ch, v] of Object.entries(UNICODE_FRACTIONS)) t = t.replace(new RegExp(`(\\d)?\\s*${ch}`), (_m, w) => ` ${(w ? Number(w) : 0) + v}`);
  t = t.trim().replace(/\s*(?:-|–|to)\s*[\d.\/]+$/, "");
  const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[2]) ? Number(frac[1]) / Number(frac[2]) : null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const QTY_RE = /^((?:\d+\s+\d+\/\d+)|(?:\d+\/\d+)|(?:\d*\s*[½⅓⅔¼¾⅕⅛⅜⅝⅞])|(?:\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*\d+(?:\.\d+)?)?)\s*/;

/** Parse one ingredient line. */
export function parseIngredient(line: string): DraftIngredient {
  let rest = line.replace(/^[\s•\-*·▪️✅🔸🔹]+/u, "").replace(/\s+/g, " ").trim();
  let qty: number | null = null;
  let unit: string | null = null;
  const q = rest.match(QTY_RE);
  if (q && q[1].trim()) {
    qty = parseQty(q[1]);
    rest = rest.slice(q[0].length);
  }
  const u = rest.match(/^([A-Za-z]+)\.?\s+(?:of\s+)?/);
  if (u && (UNITS[u[1]] || UNITS[u[1].toLowerCase()])) {
    unit = UNITS[u[1]] ?? UNITS[u[1].toLowerCase()];
    rest = rest.slice(u[0].length);
  }
  let note: string | null = null;
  const paren = rest.match(/\s*\(([^)]*)\)\s*$/);
  if (paren) {
    note = paren[1].trim() || null;
    rest = rest.slice(0, paren.index).trim();
  }
  const comma = rest.indexOf(",");
  if (comma > 0) {
    note = [rest.slice(comma + 1).trim(), note].filter(Boolean).join("; ") || null;
    rest = rest.slice(0, comma).trim();
  }
  const item = rest.trim() || line.trim();
  return { qty, unit, item: item.slice(0, 120), note: note?.slice(0, 120) ?? null, confidence: 0.9 };
}

/** ISO-8601 duration ("PT1H20M") → minutes. */
export function isoMinutes(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = v.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!m) return null;
  const mins = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) + Math.round(Number(m[4] ?? 0) / 60);
  return mins > 0 ? mins : null;
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, " ")
    .trim();

type J = Record<string, unknown>;
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const isRecipe = (o: J) => asArray(o["@type"]).some((t) => String(t).toLowerCase() === "recipe");

function findRecipe(node: unknown): J | null {
  for (const n of asArray(node)) {
    if (!n || typeof n !== "object") continue;
    const o = n as J;
    if (isRecipe(o)) return o;
    const inner = findRecipe(o["@graph"]) ?? findRecipe(o.mainEntity);
    if (inner) return inner;
  }
  return null;
}

function steps(v: unknown): string[] {
  const out: string[] = [];
  for (const s of asArray(v)) {
    if (typeof s === "string") out.push(...s.split(/\n+/).map(decode).filter(Boolean));
    else if (s && typeof s === "object") {
      const o = s as J;
      if (o.itemListElement) out.push(...steps(o.itemListElement)); // HowToSection
      else if (o.text) out.push(decode(String(o.text)));
      else if (o.name) out.push(decode(String(o.name)));
    }
  }
  return out.filter((x) => x.length > 1).slice(0, 60);
}

function firstImage(v: unknown): string | null {
  for (const i of asArray(v)) {
    if (typeof i === "string" && /^https?:\/\//.test(i)) return i;
    if (i && typeof i === "object" && typeof (i as J).url === "string") return (i as J).url as string;
  }
  return null;
}

function yieldToServings(v: unknown): number | null {
  for (const y of asArray(v)) {
    const m = String(y).match(/\d+(?:\.\d+)?/);
    if (m) return Number(m[0]);
  }
  return null;
}

/** Extract a schema.org Recipe from a page's JSON-LD. Returns null if the page has none. */
export function extractJsonLdRecipe(html: string, pageUrl: string): RecipeDraft | null {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  for (const raw of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(raw.trim());
    } catch {
      continue;
    }
    const r = findRecipe(data);
    if (!r) continue;
    const ingredients = asArray(r.recipeIngredient ?? r.ingredients)
      .map((x) => decode(String(x)))
      .filter(Boolean)
      .slice(0, 80)
      .map(parseIngredient);
    const author = asArray(r.author)[0];
    const creator = typeof author === "string" ? author : author && typeof author === "object" ? String((author as J).name ?? "") || null : null;
    const tags = [...asArray(r.recipeCategory), ...asArray(r.recipeCuisine), ...(typeof r.keywords === "string" ? r.keywords.split(",") : asArray(r.keywords))]
      .map((t) => decode(String(t)))
      .filter((t) => t && t.length <= 30);
    const cook = isoMinutes(r.cookTime);
    const prep = isoMinutes(r.prepTime) ?? (cook === null ? isoMinutes(r.totalTime) : null);
    return {
      title: decode(String(r.name ?? "")).slice(0, 140) || "Untitled recipe",
      servings: yieldToServings(r.recipeYield),
      prep_min: prep,
      cook_min: cook,
      tags: [...new Set(tags)].slice(0, 6),
      creator: creator ? decode(creator).slice(0, 80) : null,
      source_url: pageUrl,
      image_url: firstImage(r.image),
      ingredients,
      steps: steps(r.recipeInstructions),
      confidence: { title: 1, servings: 0.9, times: 0.9, steps: 0.95 },
      method: "json-ld",
    };
  }
  return null;
}

/** Visible text of a page (for the Gemini fallback), trimmed to `max` characters. */
export function htmlToText(html: string, max = 20_000): string {
  return decode(html.replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")).slice(0, max);
}

/** No-AI caption reader: lines that start with an amount become ingredients, the rest steps. */
export function captionByRules(caption: string, sourceUrl: string | null): RecipeDraft {
  const lines = caption
    .split(/\n|(?<=\.)\s+(?=\d+\s*[).])/)
    .map((l) => l.replace(/#\S+/g, "").trim())
    .filter((l) => l && !/^(follow|like|save|share|comment)\b/i.test(l));
  const title = lines.find((l) => !QTY_RE.test(l) && l.length < 80)?.replace(/[:\-–]+$/, "").trim() || "Recipe from a caption";
  const ingredients: DraftIngredient[] = [];
  const stepLines: string[] = [];
  for (const l of lines) {
    if (l === title) continue;
    if (/^ingredients?:?$/i.test(l) || /^(method|steps|instructions|directions):?$/i.test(l)) continue;
    const ing = parseIngredient(l);
    if (ing.qty !== null && l.length < 90) ingredients.push({ ...ing, confidence: 0.5 });
    else stepLines.push(l.replace(/^\d+\s*[).]\s*/, ""));
  }
  const creator = caption.match(/@([A-Za-z0-9_.]{2,30})/)?.[1];
  return {
    title,
    servings: null,
    prep_min: null,
    cook_min: null,
    tags: [],
    creator: creator ? `@${creator}` : null,
    source_url: sourceUrl,
    image_url: null,
    ingredients,
    steps: stepLines.slice(0, 40),
    confidence: { title: 0.4, servings: 0, times: 0, steps: 0.5 },
    method: "rules",
  };
}

/** Scale a quantity by servings (null stays null). */
export const scaleQty = (qty: number | null, factor: number) => (qty === null ? null : qty * factor);

/** 1.5 → "1 ½", 0.333 → "⅓", 2 → "2", 0.13 → "0.13". */
export function formatQty(q: number | null): string {
  if (q === null) return "";
  const whole = Math.floor(q + 1e-9);
  const frac = q - whole;
  const fr: [number, string][] = [
    [0, ""],
    [0.125, "⅛"],
    [0.25, "¼"],
    [1 / 3, "⅓"],
    [0.375, "⅜"],
    [0.5, "½"],
    [0.625, "⅝"],
    [2 / 3, "⅔"],
    [0.75, "¾"],
    [0.875, "⅞"],
    [1, ""],
  ];
  const [v, sym] = fr.reduce((best, cur) => (Math.abs(cur[0] - frac) < Math.abs(best[0] - frac) ? cur : best));
  if (Math.abs(v - frac) > 0.02) return String(Math.round(q * 100) / 100);
  const w = v === 1 ? whole + 1 : whole;
  return [w || (sym ? "" : "0"), sym].filter(Boolean).join(w && sym ? " " : "");
}

const clamp01 = (v: unknown, d = 0.5) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);
const posNum = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 && v <= max ? v : null);
const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/**
 * Validate and clean an AI answer into a RecipeDraft. Anything malformed is dropped; an ingredient
 * without a stated amount keeps qty = null and is capped at confidence 0.5 so the review screen flags it.
 * Returns null when there's no usable recipe.
 */
export function normalizeAiDraft(raw: unknown, sourceUrl: string | null): RecipeDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const ingredients: DraftIngredient[] = (Array.isArray(r.ingredients) ? r.ingredients : [])
    .slice(0, 80)
    .flatMap((x) => {
      if (!x || typeof x !== "object") return [];
      const i = x as Record<string, unknown>;
      const item = str(i.item, 120);
      if (!item) return [];
      const qty = posNum(i.qty, 100_000);
      const conf = clamp01(i.confidence, 0.6);
      return [{ qty, unit: str(i.unit, 20), item, note: str(i.note, 120), confidence: qty === null ? Math.min(conf, 0.5) : conf }];
    });
  const steps = (Array.isArray(r.steps) ? r.steps : []).map((s) => str(s, 2000)).filter((s): s is string => !!s).slice(0, 60);
  const title = str(r.title, 140);
  if (!title && !ingredients.length && !steps.length) return null;
  const c = (r.confidence && typeof r.confidence === "object" ? r.confidence : {}) as Record<string, unknown>;
  const creatorRaw = str(r.creator, 80);
  return {
    title: title ?? "Untitled recipe",
    servings: posNum(r.servings, 100),
    prep_min: posNum(r.prep_min, 2880) === null ? null : Math.round(r.prep_min as number),
    cook_min: posNum(r.cook_min, 2880) === null ? null : Math.round(r.cook_min as number),
    tags: (Array.isArray(r.tags) ? r.tags : []).map((t) => str(t, 30)).filter((t): t is string => !!t).slice(0, 6),
    creator: creatorRaw,
    source_url: sourceUrl,
    image_url: null,
    ingredients,
    steps,
    confidence: { title: title ? clamp01(c.title) : 0, servings: clamp01(c.servings, 0.3), times: clamp01(c.times, 0.3), steps: clamp01(c.steps) },
    method: "gemini",
  };
}

/** Is this an Instagram link? (We never download from Instagram; the caption is pasted instead.) */
export const isInstagram = (url: string) => /^https?:\/\/(www\.)?(instagram\.com|instagr\.am)\//i.test(url);

/** Refuse URLs that point at local/private hosts (keeps the importer from being used to probe internal services). */
export function isSafePublicUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (u.username || u.password) return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":") || h.startsWith("[")) return false; // IP literals
  if (!h.includes(".")) return false;
  return true;
}

export interface InlineImage {
  mime: string;
  data: string; // base64
}
const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

/** Check uploaded screenshots: at most 4, real image types, each ≤ 1.5 MB. Returns the images or an error message. */
export function validateScreenshots(raw: unknown): InlineImage[] | string {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return "Bad screenshots";
  if (raw.length > 4) return "Up to 4 screenshots at a time";
  const out: InlineImage[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") return "Bad screenshot";
    const { mime, data } = x as Record<string, unknown>;
    if (typeof mime !== "string" || !IMAGE_MIMES.includes(mime)) return "Screenshots must be images";
    if (typeof data !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return "Bad screenshot data";
    if ((data.length * 3) / 4 > 1_500_000) return "A screenshot is too large";
    out.push({ mime, data });
  }
  return out;
}
