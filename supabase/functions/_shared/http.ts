/** Which browser origins may call our Edge Functions (CORS). Pure, so it's unit-tested. */

/** The live app, this project's own Vercel previews, and localhost for development. */
export function allowedOrigin(origin: string | null, appUrl: string): string | null {
  if (!origin) return null;
  if (origin === appUrl) return origin;
  if (/^https:\/\/houseos-[a-z0-9-]+-harsh-s-vercel\.vercel\.app$/.test(origin)) return origin;
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return origin;
  return null;
}

/** CORS headers for an allowed origin (none for anything else, so browsers block the response). */
export function corsHeaders(origin: string | null, appUrl: string, extraHeaders = ""): Record<string, string> {
  const ok = allowedOrigin(origin, appUrl);
  return ok
    ? {
        "Access-Control-Allow-Origin": ok,
        "Access-Control-Allow-Headers": `authorization, content-type, apikey, x-client-info${extraHeaders ? `, ${extraHeaders}` : ""}`,
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        Vary: "Origin",
      }
    : {};
}
