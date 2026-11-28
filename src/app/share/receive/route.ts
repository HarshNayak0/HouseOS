import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Android "Share → Veedu" (the PWA share target, see manifest.ts).
 * - files (a ticket PDF, a booking screenshot): stored in the household's private folder, then the
 *   backyard asks which trip to attach them to
 * - text or a link (an Instagram caption, a recipe page): handed to the kitchen's recipe importer
 */
const TYPES: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX = 5 * 1024 * 1024; // the bucket's limit

export async function POST(request: NextRequest) {
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url), { status: 303 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return to("/");
  }
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) {
    const text = [form.get("text"), form.get("url")]
      .filter((x): x is string => typeof x === "string" && !!x.trim())
      .filter((x, i, a) => a.indexOf(x) === i)
      .join("\n")
      .trim();
    return to(text ? `/kitchen?import=${encodeURIComponent(text.slice(0, 8000))}` : "/kitchen");
  }

  const sb = await supabaseServer();
  const { data: claims } = (await sb?.auth.getClaims()) ?? { data: null };
  const uid = claims?.claims?.sub;
  if (!sb || !uid) return to("/signin?next=/backyard");
  const { data: me } = await sb.from("members").select("household_id").eq("user_id", uid).is("deleted_at", null).maybeSingle();
  if (!me) return to("/onboarding");

  const saved: { path: string; name: string }[] = [];
  let problem = "";
  for (const f of files.slice(0, 5)) {
    const ext = TYPES[f.type];
    if (!ext) problem = "Only photos and PDFs can be attached";
    else if (f.size > MAX) problem = "Files can be up to 5 MB";
    else {
      const path = `${me.household_id}/bookings/${randomUUID()}.${ext}`;
      const { error } = await sb.storage.from("household-files").upload(path, f, { contentType: f.type, upsert: false });
      if (error) problem = "Couldn't save the file";
      else saved.push({ path, name: (f.name || `Shared file.${ext}`).slice(0, 160) });
    }
  }
  const q = new URLSearchParams();
  if (saved.length) q.set("shared", JSON.stringify(saved));
  if (problem) q.set("shared_error", problem);
  return to(`/backyard?${q}`);
}
