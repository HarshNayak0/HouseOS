// Simple health check for uptime checks and the e2e suite.
export function GET() {
  return Response.json({ ok: true, app: "veedu" });
}
