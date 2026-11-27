// Supabase Edge Function: sends due reminders and new-note notifications as Web Push.
// Called every 5 minutes by pg_cron (and right after a note is posted). Safe to call any time:
// each reminder is claimed in the database before sending, so nothing is sent twice.
// Deployed by .github/workflows/deploy-functions.yml (no JWT check; it takes no input).
import webpush from "npm:web-push@3.6.7";
import { adminKey, db, env } from "../_shared/server.ts";
import { zonedDayTime } from "../_shared/tz.ts";
import {
  planReminders,
  torontoAt,
  type CalendarEvent,
  type CalendarSource,
  type Chore,
  type Member,
  type Milestone,
  type Note,
  type PlannedDate,
  type Prefs,
  type Renewal,
  type ShoppingItem,
  type StoreVisit,
  type Task,
  type Trip,
} from "./logic.ts";

const TASK_COLUMNS = "id, household_id, title, due_at, due_has_time, assignee_id, visibility, created_by, created_at, priority, completed_at, deleted_at, reminded_due_at";
const torontoToday = () => zonedDayTime(new Date()).day;
const plusDays = (day: string, n: number) => new Date(Date.parse(day + "T12:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

Deno.serve(async () => {
  const pub = env("VAPID_PUBLIC_KEY"),
    priv = env("VAPID_PRIVATE_KEY"),
    subject = env("VAPID_SUBJECT");
  if (!pub || !priv || !subject) return Response.json({ error: "VAPID secrets missing" }, { status: 500 });
  webpush.setVapidDetails(subject, pub, priv);
  if (!adminKey()) return Response.json({ error: "No secret/service key available to the function" }, { status: 500 });

  // Tell the database where the functions live (the pg_cron and trigger pings read it). A new copy
  // gets this on its first run; afterwards it's a no-op. Ignored before the app_config migration.
  const functionsUrl = `${env("SUPABASE_URL")}/functions/v1`;
  const { data: cfg, error: cfgErr } = await db.from("app_config").select("value").eq("key", "functions_url").maybeSingle();
  if (!cfgErr && cfg?.value !== functionsUrl) await db.from("app_config").upsert({ key: "functions_url", value: functionsUrl, updated_at: new Date().toISOString() });

  const now = new Date();
  const since = new Date(now.getTime() - 3 * 86_400_000).toISOString();
  const today = torontoToday();
  const dayStart = torontoAt(today, 0, 0).toISOString(),
    dayEnd = torontoAt(plusDays(today, 1), 0, 0).toISOString();
  const [members, prefs, chores, tasks, notes, subs, milestones] = await Promise.all([
    db.from("members").select("id, user_id, display_name, household_id").is("deleted_at", null),
    db.from("notification_prefs").select("member_id, enabled, quiet_start, quiet_end, kinds"),
    // up to the end of today: reminders only fire once due; the digest lists the rest of today
    db.from("chores").select("id, household_id, title, next_due_at, assignee_id, remind, paused, deleted_at, reminded_due_at").is("deleted_at", null).lt("next_due_at", dayEnd).gte("next_due_at", since),
    db.from("tasks").select(TASK_COLUMNS).is("deleted_at", null).is("completed_at", null).not("due_at", "is", null).gte("due_at", since),
    db.from("notes").select("id, household_id, body, created_by, created_at, deleted_at, archived_at, notified_at").is("notified_at", null).gte("created_at", since),
    db.from("push_subscriptions").select("id, member_id, endpoint, p256dh, auth").is("deleted_at", null),
    db.from("milestones").select("id, household_id, title, kind, base_date, person_id, remind_days, reminded, deleted_at").is("deleted_at", null),
  ]);
  // (milestones is optional so reminders keep working even before its migration has run)
  const err = [members, prefs, chores, tasks, notes, subs].find((r) => r.error)?.error;
  if (err) return Response.json({ error: err.message }, { status: 500 });

  // store visits and the morning digest (each optional: if its tables aren't there yet, it's skipped)
  const twoHoursAgo = new Date(now.getTime() - 2 * 3_600_000).toISOString();
  const [visits, shopping, sources, events, dates, trips, renewals, sentToday, nagTasks, nudgesSent] = await Promise.all([
    db.from("store_visits").select("id, household_id, member_id, store, started_at, ended_at, notified_at, items_pushed_until").is("ended_at", null).gte("started_at", twoHoursAgo),
    db.from("shopping_items").select("household_id, name, store, created_by, created_at, checked_at, deleted_at").is("deleted_at", null).is("checked_at", null),
    db.from("calendar_sources").select("id, member_id, is_us_calendar, visible").is("deleted_at", null),
    db.from("calendar_event_cache").select("source_id, google_event_id, summary, starts_at, ends_at, all_day").is("deleted_at", null).lt("starts_at", dayEnd).gt("ends_at", dayStart),
    db.from("date_ideas").select("household_id, title, planned_for").is("deleted_at", null).eq("status", "planned").gte("planned_for", dayStart).lt("planned_for", dayEnd),
    db.from("trips").select("household_id, title, starts_on, ends_on").is("deleted_at", null).gte("starts_on", today).lte("starts_on", plusDays(today, 14)),
    db.from("vault_items").select("household_id, label, renewal_date").is("deleted_at", null).gte("renewal_date", today).lte("renewal_date", plusDays(today, 7)),
    db.from("digest_log").select("member_id").eq("day", today),
    // high and medium tasks remind until they're done, whatever their due date
    db.from("tasks").select(TASK_COLUMNS).is("deleted_at", null).is("completed_at", null).gte("priority", 2),
    db.from("task_nudge_log").select("member_id, slot").eq("day", today),
  ]);
  const allTasks = [...(tasks.data as Task[])];
  for (const t of (nagTasks.error ? [] : nagTasks.data) as Task[]) if (!allTasks.some((x) => x.id === t.id)) allTasks.push(t);
  const digestReady = ![sources, events, dates, trips, renewals, sentToday].some((r) => r.error);

  const plans = planReminders({
    now,
    members: members.data as Member[],
    prefs: prefs.data as Prefs[],
    chores: chores.data as Chore[],
    tasks: allTasks,
    notes: notes.data as Note[],
    milestones: (milestones.error ? [] : milestones.data) as Milestone[],
    visits: (visits.error ? [] : visits.data) as StoreVisit[],
    shopping: (shopping.error ? [] : shopping.data) as ShoppingItem[],
    digest: digestReady
      ? {
          sources: sources.data as CalendarSource[],
          events: events.data as CalendarEvent[],
          dates: dates.data as PlannedDate[],
          trips: trips.data as Trip[],
          renewals: renewals.data as Renewal[],
          sentToday: (sentToday.data ?? []).map((r) => r.member_id as string),
          nudgesSent: nudgesSent.error ? undefined : (nudgesSent.data ?? []).map((r) => `${r.member_id}:${r.slot}`),
        }
      : undefined,
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
          : c.table === "store_visits"
            ? await db.from("store_visits").update({ notified_at: new Date().toISOString() }).eq("id", c.id).is("notified_at", null).select("id")
            : c.table === "store_items"
              ? await (c.prev
                  ? db.from("store_visits").update({ items_pushed_until: c.until }).eq("id", c.id).eq("items_pushed_until", c.prev)
                  : db.from("store_visits").update({ items_pushed_until: c.until }).eq("id", c.id).is("items_pushed_until", null)
                ).select("id")
              : c.table === "digest_log"
                ? await db.from("digest_log").insert({ member_id: c.memberId, day: c.day }).select("member_id")
                : c.table === "task_nudge_log"
                ? await db.from("task_nudge_log").insert({ member_id: c.memberId, day: c.day, slot: c.slot }).select("member_id")
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
  // housekeeping: old digest records and finished store visits
  await db.from("digest_log").delete().lt("day", plusDays(today, -14));
  await db.from("task_nudge_log").delete().lt("day", plusDays(today, -14));
  await db.from("store_visits").delete().lt("started_at", new Date(now.getTime() - 30 * 86_400_000).toISOString());
  return Response.json({ plans: plans.length, sent, skipped });
});
