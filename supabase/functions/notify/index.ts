// Supabase Edge Function: sends due reminders and new-note notifications as Web Push.
// Called every 5 minutes by pg_cron (and right after a note is posted). Safe to call any time:
// each reminder is claimed in the database before sending, so nothing is sent twice.
// Deployed by .github/workflows/deploy-functions.yml (no JWT check; it takes no input).
import { createClient } from "npm:@supabase/supabase-js@2.119.2";
import webpush from "npm:web-push@3.6.7";
import { planReminders, type Chore, type Member, type Milestone, type Note, type Prefs, type Task } from "./logic.ts";

const env = (k: string) => Deno.env.get(k) ?? "";

/**
 * The project's admin key. Newer projects provide SUPABASE_SECRET_KEYS (JSON: {"default": "sb_secret_…"});
 * older ones provide SUPABASE_SERVICE_ROLE_KEY.
 */
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

Deno.serve(async () => {
  const pub = env("VAPID_PUBLIC_KEY"),
    priv = env("VAPID_PRIVATE_KEY"),
    subject = env("VAPID_SUBJECT");
  if (!pub || !priv || !subject) return Response.json({ error: "VAPID secrets missing" }, { status: 500 });
  webpush.setVapidDetails(subject, pub, priv);
  const key = adminKey();
  if (!key) return Response.json({ error: "No secret/service key available to the function" }, { status: 500 });
  const db = createClient(env("SUPABASE_URL"), key, { auth: { persistSession: false } });

  const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const [members, prefs, chores, tasks, notes, subs, milestones] = await Promise.all([
    db.from("members").select("id, user_id, display_name, household_id").is("deleted_at", null),
    db.from("notification_prefs").select("member_id, enabled, quiet_start, quiet_end, kinds"),
    db.from("chores").select("id, household_id, title, next_due_at, assignee_id, remind, paused, deleted_at, reminded_due_at").is("deleted_at", null).lte("next_due_at", new Date().toISOString()).gte("next_due_at", since),
    db.from("tasks").select("id, household_id, title, due_at, due_has_time, assignee_id, visibility, created_by, completed_at, deleted_at, reminded_due_at").is("deleted_at", null).is("completed_at", null).not("due_at", "is", null).gte("due_at", since),
    db.from("notes").select("id, household_id, body, created_by, created_at, deleted_at, archived_at, notified_at").is("notified_at", null).gte("created_at", since),
    db.from("push_subscriptions").select("id, member_id, endpoint, p256dh, auth").is("deleted_at", null),
    db.from("milestones").select("id, household_id, title, kind, base_date, person_id, remind_days, reminded, deleted_at").is("deleted_at", null),
  ]);
  // (milestones is optional so reminders keep working even before its migration has run)
  const err = [members, prefs, chores, tasks, notes, subs].find((r) => r.error)?.error;
  if (err) return Response.json({ error: err.message }, { status: 500 });

  const plans = planReminders({
    now: new Date(),
    members: members.data as Member[],
    prefs: prefs.data as Prefs[],
    chores: chores.data as Chore[],
    tasks: tasks.data as Task[],
    notes: notes.data as Note[],
    milestones: (milestones.error ? [] : milestones.data) as Milestone[],
  });

  let sent = 0,
    skipped = 0;
  for (const plan of plans) {
    // Claim first: only one run can mark a reminder, so it's never sent twice.
    const c = plan.claim;
    const claimed =
      c.table === "notes"
        ? await db.from("notes").update({ notified_at: new Date().toISOString() }).eq("id", c.id).is("notified_at", null).select("id")
        : c.table === "milestones"
          ? await db.from("milestones").update({ reminded: [...c.reminded.slice(-20), c.key] }).eq("id", c.id).not("reminded", "cs", `{${c.key}}`).select("id")
          : await db.from(c.table).update({ reminded_due_at: c.due }).eq("id", c.id).or(`reminded_due_at.is.null,reminded_due_at.neq.${c.due}`).select("id");
    if (claimed.error || !claimed.data?.length) {
      skipped++;
      continue;
    }
    for (const m of plan.messages) {
      for (const s of (subs.data ?? []).filter((x) => x.member_id === m.memberId)) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ title: m.title, body: m.body, url: m.url, tag: m.tag }),
            { TTL: 6 * 3600 },
          );
          sent++;
          await db.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", s.id);
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    }
  }
  return Response.json({ plans: plans.length, sent, skipped });
});
