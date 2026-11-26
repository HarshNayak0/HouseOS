/** Checks for instances/<slug>.json, shared by scripts/new-couple.mjs and the unit tests. */
/** Problems with a couple's instances/<slug>.json (empty when it's fine). */
export function validateConfig(c, slug = c?.slug) {
  const problems = [];
  if (c.slug !== slug) problems.push(`slug should be "${slug}"`);
  if (!/^https:\/\/[a-z0-9.-]+$/.test(c.appUrl ?? "")) problems.push("appUrl must look like https://name.vercel.app (no trailing slash)");
  if (!/^[a-z]{20}$/.test(c.supabaseProjectRef ?? "")) problems.push("supabaseProjectRef is the 20-letter id in the Supabase project URL");
  try {
    new Intl.DateTimeFormat("en", { timeZone: c.timeZone });
  } catch {
    problems.push(`timeZone "${c.timeZone}" isn't a valid IANA zone (e.g. America/Toronto, Asia/Kolkata)`);
  }
  if (!c.city) problems.push("city is required (shown as e.g. 'Quiet hours (Toronto time)')");
  if (!(Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180)) problems.push("lat / lng must be the city's coordinates");
  if (c.previewOriginRegex) {
    try {
      new RegExp(c.previewOriginRegex);
    } catch {
      problems.push("previewOriginRegex isn't a valid regex");
    }
  }
  return problems;
}
