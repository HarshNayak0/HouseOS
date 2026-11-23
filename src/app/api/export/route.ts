import { supabaseServer } from "@/lib/supabase/server";

/** Tables included in "Export all data". Add each new table here as later phases create them. */
const TABLES = [
  "households",
  "members",
  "household_settings",
  "notification_prefs",
  "activity_log",
  "invites",
  "shopping_items",
  "item_frequency",
  "tasks",
  "subtasks",
  "chores",
  "chore_completions",
  "notes",
  "calendar_accounts",
  "calendar_sources",
  "calendar_event_cache",
  "milestones",
  "gift_ideas",
] as const;

/** Downloads everything the signed-in person can see (RLS applies) as one JSON file. */
export async function GET() {
  const sb = await supabaseServer();
  if (!sb) return Response.json({ error: "Not set up" }, { status: 503 });
  const { data: claims } = await sb.auth.getClaims();
  if (!claims?.claims?.sub) return Response.json({ error: "Not signed in" }, { status: 401 });

  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), app: "veedu", version: 1 };
  for (const t of TABLES) {
    const cols: Partial<Record<string, string>> = {
      invites: "id, household_id, expires_at, used_at, created_at",
      calendar_accounts: "id, household_id, member_id, google_email, status, created_at",
      calendar_sources: "id, household_id, member_id, google_calendar_id, summary, is_primary, is_us_calendar, visible",
    };
    const { data, error } = await sb.from(t).select(cols[t] ?? "*");
    if (error) return Response.json({ error: `Couldn't read ${t}` }, { status: 500 });
    out[t] = data;
  }
  const day = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(out, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="veedu-export-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
