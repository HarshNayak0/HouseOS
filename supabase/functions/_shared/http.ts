/** Which browser origins may call our Edge Functions (CORS). Pure, so it's unit-tested. */

/**
 * The live app, this copy's own Vercel previews (`previewPattern`: a regex for their origins, the
 * PREVIEW_ORIGIN_REGEX function secret; none if unset), and localhost for development.
 */
export function allowedOrigin(origin: string | null, appUrl: string, previewPattern = ""): string | null {
  if (!origin) return null;
  if (origin === appUrl) return origin;
  if (previewPattern && safeRegex(previewPattern)?.test(origin)) return origin;
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return origin;
  return null;
}

function safeRegex(p: string): RegExp | null {
  try {
    return new RegExp(p.startsWith("^") ? p : `^${p}$`);
  } catch {
    return null;
  }
}

/** CORS headers for an allowed origin (none for anything else, so browsers block the response). */
export function corsHeaders(origin: string | null, appUrl: string, extraHeaders = "", previewPattern = ""): Record<string, string> {
  const ok = allowedOrigin(origin, appUrl, previewPattern);
  return ok
    ? {
        "Access-Control-Allow-Origin": ok,
        "Access-Control-Allow-Headers": `authorization, content-type, apikey, x-client-info${extraHeaders ? `, ${extraHeaders}` : ""}`,
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        Vary: "Origin",
      }
    : {};
}
