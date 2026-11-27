/**
 * Pure reminder rules for the `notify` Edge Function (no Deno or network imports, so it's unit-tested).
 * Given the household's data and the time, decide which push messages are due.
 */

import { inQuietHours, milestoneLabel, nextMilestone } from "../_shared/rules.ts";
import { TZ, zonedAt, zonedDayTime } from "../_shared/tz.ts";
export { inQuietHours, milestoneLabel, nextMilestone, TZ };

export interface Member {
  id: string;
  user_id: string;
  display_name: string;
  household_id: string;
}
export interface Prefs {
  member_id: string;
  enabled: boolean;
  quiet_start: string; // "23:00:00"
  quiet_end: string;
  kinds: Record<string, boolean>;
}
export interface Chore {
  id: string;
  household_id: string;
  title: string;
  next_due_at: string;
  assignee_id: string | null;
  remind: boolean;
  paused: boolean;
  deleted_at: string | null;
  reminded_due_at: string | null;
}
export interface Task {
  id: string;
  household_id: string;
  title: string;
  due_at: string | null;
  due_has_time: boolean;
  assignee_id: string | null;
  visibility: "shared" | "personal";
  created_by: string | null;
  completed_at: string | null;
  deleted_at: string | null;
  reminded_due_at: string | null;
  /** 0 none, 1 low, 2 medium, 3 high */
  priority?: number;
  created_at?: string;
}
export interface Note {
  id: string;
  household_id: string;
  body: string;
  created_by: string | null;
  created_at: string;
  deleted_at: string | null;
  archived_at: string | null;
  notified_at: string | null;
}

export interface Milestone {
  id: string;
  household_id: string;
  title: string;
  kind: "birthday" | "anniversary" | "other";
  base_date: string; // YYYY-MM-DD
  person_id: string | null;
  remind_days: number[];
  reminded: string[];
  deleted_at: string | null;
}

export type Kind = "chores" | "tasks" | "notes" | "milestones" | "store" | "digest" | "nudges";
export interface Message {
  memberId: string;
  kind: Kind;
  title: string;
  body: string;
  url: string;
  tag: string;
}
/** A row to mark as handled (claimed) before its messages are sent. */
export type Claim =
  | { table: "chores" | "tasks"; id: string; due: string }
  | { table: "notes"; id: string }
  | { table: "milestones"; id: string; key: string; reminded: string[] }
  | { table: "store_visits"; id: string }
  | { table: "store_items"; id: string; prev: string | null; until: string }
  | { table: "digest_log"; memberId: string; day: string }
  | { table: "task_nudge_log"; memberId: string; day: string; slot: "am" | "pm" };
export interface Plan {
  claim: Claim;
  messages: Message[];
}

/** Day and time of an instant in the home time zone. */
const parts = (d: Date) => zonedDayTime(d);

/** UTC instant of a home-time-zone wall-clock time on a given home day (named for history). */
export const torontoAt = (day: string, hh: number, mm: number): Date => zonedAt(day, hh, mm);

const timeLabel = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(d);

export interface StoreVisit {
  id: string;
  household_id: string;
  member_id: string;
  store: string;
  started_at: string;
  ended_at: string | null;
  notified_at: string | null;
  items_pushed_until: string | null;
}
export interface ShoppingItem {
  household_id: string;
  name: string;
  store: string;
  created_by: string | null;
  created_at: string;
  checked_at: string | null;
  deleted_at: string | null;
}
export interface CalendarSource {
  id: string;
  member_id: string;
  is_us_calendar: boolean;
  visible: boolean;
}
export interface CalendarEvent {
  source_id: string;
  google_event_id: string;
  summary: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
}
export interface PlannedDate {
  household_id: string;
  title: string;
  planned_for: string;
}
export interface Trip {
  household_id: string;
  title: string;
  starts_on: string;
  ends_on: string;
}
export interface Renewal {
  household_id: string;
  label: string;
  renewal_date: string;
}

export interface Input {
  now: Date;
  members: Member[];
  prefs: Prefs[];
  chores: Chore[];
  tasks: Task[];
  notes: Note[];
  milestones?: Milestone[];
  visits?: StoreVisit[];
  shopping?: ShoppingItem[];
  /** for the morning digest */
  digest?: {
    sources: CalendarSource[];
    events: CalendarEvent[];
    dates: PlannedDate[];
    trips: Trip[];
    renewals: Renewal[];
    sentToday: string[];
    /** high-priority nudges already sent today, as "<memberId>:am" / "<memberId>:pm" */
    nudgesSent?: string[];
  };
}

/**
 * Who can be messaged right now for a kind. Returns null if any recipient is in quiet hours
 * (the reminder then waits until everyone is out of quiet hours, and is sent on a later run).
 */
function deliverable(ids: string[], kind: Kind, prefs: Prefs[], hhmm: string): string[] | null {
  const out: string[] = [];
  for (const id of ids) {
    const p = prefs.find((x) => x.member_id === id);
    if (p && (!p.enabled || p.kinds?.[kind] === false)) continue; // opted out: skip, don't wait
    if (inQuietHours(hhmm, p?.quiet_start ?? "23:00", p?.quiet_end ?? "07:00")) return null;
    out.push(id);
  }
  return out;
}

const MAX_LATE_MS = 2 * 86_400_000; // don't send reminders for things more than 2 days stale

export function planReminders(input: Input): Plan[] {
  const { now, members, prefs, chores, tasks, notes, milestones = [] } = input;
  const { hhmm, day: today } = parts(now);
  const plans: Plan[] = [];
  const everyone = (household: string) => members.filter((m) => m.household_id === household).map((m) => m.id);
  const memberOfUser = (uid: string | null) => members.find((m) => m.user_id === uid);

  for (const c of chores) {
    const due = new Date(c.next_due_at);
    if (!c.remind || c.paused || c.deleted_at || due > now || now.getTime() - due.getTime() > MAX_LATE_MS) continue;
    if (c.reminded_due_at && new Date(c.reminded_due_at).getTime() === due.getTime()) continue;
    const to = deliverable(c.assignee_id ? [c.assignee_id] : everyone(c.household_id), "chores", prefs, hhmm);
    if (!to) continue;
    plans.push({
      claim: { table: "chores", id: c.id, due: c.next_due_at },
      messages: to.map((memberId) => ({ memberId, kind: "chores", title: "Chore due today", body: c.title, url: "/wash", tag: `chore-${c.id}` })),
    });
  }

  for (const t of tasks) {
    if (!t.due_at || t.completed_at || t.deleted_at) continue;
    const due = new Date(t.due_at);
    const remindAt = t.due_has_time ? due : torontoAt(parts(due).day, 9, 0);
    if (remindAt > now || now.getTime() - remindAt.getTime() > MAX_LATE_MS) continue;
    if (t.reminded_due_at && new Date(t.reminded_due_at).getTime() === due.getTime()) continue;
    const creator = memberOfUser(t.created_by);
    const ids = t.visibility === "personal" ? (creator ? [creator.id] : []) : t.assignee_id ? [t.assignee_id] : everyone(t.household_id);
    const to = deliverable(ids, "tasks", prefs, hhmm);
    if (!to) continue;
    plans.push({
      claim: { table: "tasks", id: t.id, due: t.due_at },
      messages: to.map((memberId) => ({
        memberId,
        kind: "tasks",
        title: t.due_has_time ? `Due at ${timeLabel(due)}` : "Due today",
        body: t.title,
        url: "/office",
        tag: `task-${t.id}`,
      })),
    });
  }

  for (const n of notes) {
    if (n.notified_at || n.deleted_at || n.archived_at || now.getTime() - Date.parse(n.created_at) > 86_400_000) continue;
    const author = memberOfUser(n.created_by);
    const others = everyone(n.household_id).filter((id) => id !== author?.id);
    const to = deliverable(others, "notes", prefs, hhmm);
    if (!to) continue;
    plans.push({
      claim: { table: "notes", id: n.id },
      messages: to.map((memberId) => ({
        memberId,
        kind: "notes",
        title: `${author?.display_name ?? "Someone"} left a note`,
        body: n.body.length > 120 ? n.body.slice(0, 117) + "…" : n.body,
        url: "/living",
        tag: `note-${n.id}`,
      })),
    });
  }
  // milestones: 14 / 7 / 1 days before, from 9 am home time. Birthdays go only to the other person.
  if (hhmm >= "09:00") {
    for (const ms of milestones) {
      if (ms.deleted_at) continue;
      const next = nextMilestone(ms.base_date, today);
      if (!ms.remind_days.includes(next.daysAway)) continue;
      const key = `${next.date}:${next.daysAway}`;
      if (ms.reminded.includes(key)) continue;
      const ids = everyone(ms.household_id).filter((id) => !(ms.kind === "birthday" && id === ms.person_id));
      const to = deliverable(ids, "milestones", prefs, hhmm);
      if (!to) continue;
      const label = milestoneLabel(ms.kind, next.years);
      const when = next.daysAway === 1 ? "tomorrow" : `in ${next.daysAway} days`;
      plans.push({
        claim: { table: "milestones", id: ms.id, key, reminded: ms.reminded },
        messages: to.map((memberId) => ({
          memberId,
          kind: "milestones",
          title: `${ms.title} ${when}`,
          body: label ? `${label[0].toUpperCase()}${label.slice(1)} · plan something 🎁` : "Plan something 🎁",
          url: "/office",
          tag: `milestone-${ms.id}-${next.daysAway}`,
        })),
      });
    }
  }
  plans.push(...planStore(input, hhmm), ...planDigests(input, hhmm, today), ...planNudges(input, hhmm, today));
  return plans;
}

const VISIT_MS = 2 * 3_600_000; // a visit ends by itself after 2 hours
const list = (names: string[], max = 4) => (names.length > max ? `${names.slice(0, max).join(", ")} and ${names.length - max} more` : names.join(", "));

/** "<shopper> is at <store>" to the other person, and items they add while there back to the shopper. */
function planStore({ now, members, prefs, visits = [], shopping = [] }: Input, hhmm: string): Plan[] {
  const plans: Plan[] = [];
  const byId = (id: string) => members.find((m) => m.id === id);
  for (const v of visits) {
    const started = Date.parse(v.started_at);
    if (v.ended_at || now.getTime() - started > VISIT_MS) continue;
    const shopper = byId(v.member_id);
    if (!shopper) continue;
    const others = members.filter((m) => m.household_id === v.household_id && m.id !== v.member_id).map((m) => m.id);
    // 1. tell the others (only while it's fresh: a stale "at the store" is just noise)
    if (!v.notified_at && now.getTime() - started < 30 * 60_000) {
      const to = deliverable(others, "store", prefs, hhmm);
      if (to?.length) {
        const open = shopping.filter((i) => i.household_id === v.household_id && !i.checked_at && !i.deleted_at).length;
        plans.push({
          claim: { table: "store_visits", id: v.id },
          messages: to.map((memberId) => ({
            memberId,
            kind: "store",
            title: `${shopper.display_name} is at ${v.store} 🛒`,
            body: `Anything to add? ${open ? `${open} item${open > 1 ? "s" : ""} on the list so far.` : "The list is empty."}`,
            url: "/kitchen",
            tag: `store-${v.id}`,
          })),
        });
      }
    }
    // 2. new items from the others, pushed to the shopper
    const since = Date.parse(v.items_pushed_until ?? v.started_at);
    const added = shopping
      .filter((i) => i.household_id === v.household_id && !i.deleted_at && !i.checked_at && i.created_by !== shopper.user_id && Date.parse(i.created_at) > since)
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    if (added.length) {
      const to = deliverable([shopper.id], "store", prefs, hhmm);
      if (to?.length) {
        const who = members.find((m) => m.user_id === added[0].created_by)?.display_name ?? "Someone";
        plans.push({
          claim: { table: "store_items", id: v.id, prev: v.items_pushed_until, until: added[added.length - 1].created_at },
          messages: [{ memberId: shopper.id, kind: "store", title: `${who} added to the list`, body: list(added.map((i) => i.name)), url: "/kitchen", tag: `store-items-${v.id}` }],
        });
      }
    }
  }
  return plans;
}

/** High-priority tasks are nudged twice a day for their first week, then fall back to the daily digest. */
export const NUDGE_DAYS = 7;
/** The evening nudge: from 6 pm, dropped after 9 pm (the morning one is part of the digest). */
export const NUDGE_PM = ["18:00", "21:00"] as const;

const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86_400_000);

/**
 * Is this open task one that keeps reminding `memberId` until it's done?
 * - only its owner: whoever it's assigned to, else whoever created it (personal tasks: the creator)
 * - from its due day (or, without a due date, from the day it was created)
 * "high" = nudged twice a day; "high-faded" = past the first week, digest only; "medium" = digest daily.
 */
export function nagState(t: Task, memberId: string, members: Member[], today: string): "high" | "high-faded" | "medium" | null {
  if (t.completed_at || t.deleted_at || (t.priority ?? 0) < 2) return null;
  const creator = members.find((m) => m.user_id === t.created_by)?.id ?? null;
  const owner = t.visibility === "personal" ? creator : (t.assignee_id ?? creator);
  if (owner !== memberId) return null;
  const start = zonedDayTime(new Date(t.due_at ?? t.created_at ?? Date.now())).day;
  if (start > today) return null;
  if (t.priority === 2) return "medium";
  return dayDiff(start, today) < NUDGE_DAYS ? "high" : "high-faded";
}

/** The morning digest: one push per person from 8 am (home time), only if there's something to say. */
export function digestFor(memberId: string, input: Input, today: string): { title: string; body: string } | null {
  const { members, chores, tasks, milestones = [], digest } = input;
  if (!digest) return null;
  const me = members.find((m) => m.id === memberId);
  if (!me) return null;
  const tomorrow = new Date(Date.parse(today + "T12:00:00Z") + 86_400_000).toISOString().slice(0, 10);
  const dayStart = torontoAt(today, 0, 0).getTime(),
    dayEnd = torontoAt(tomorrow, 0, 0).getTime();
  const isToday = (iso: string) => Date.parse(iso) >= dayStart && Date.parse(iso) < dayEnd;
  const todayItems: string[] = [];

  // calendar: my calendars and the shared "Us" one (each event once)
  const mine = new Map(digest.sources.filter((s) => s.visible && (s.member_id === memberId || s.is_us_calendar)).map((s) => [s.id, s]));
  const seen = new Set<string>();
  const events = digest.events
    .filter((e) => mine.has(e.source_id) && Date.parse(e.starts_at) < dayEnd && Date.parse(e.ends_at) > dayStart)
    .sort((a, b) => Number(b.all_day) - Number(a.all_day) || Date.parse(a.starts_at) - Date.parse(b.starts_at));
  for (const e of events) {
    const key = mine.get(e.source_id)!.is_us_calendar ? `us:${e.google_event_id}` : `${e.source_id}:${e.google_event_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    todayItems.push(e.all_day ? (e.summary ?? "Busy") : `${e.summary ?? "Busy"} ${timeLabel(new Date(e.starts_at))}`);
  }
  for (const d of digest.dates) if (d.household_id === me.household_id && isToday(d.planned_for)) todayItems.push(`💛 ${d.title} ${timeLabel(new Date(d.planned_for))}`);
  // chores and tasks that are mine (or anyone's) and due today or overdue
  for (const c of chores)
    if (c.household_id === me.household_id && !c.paused && !c.deleted_at && Date.parse(c.next_due_at) < dayEnd && (!c.assignee_id || c.assignee_id === memberId))
      todayItems.push(c.title);
  // tasks: due today or overdue (mine or anyone's), plus my high and medium ones until they're done
  const listed = new Set<string>();
  for (const t of [...tasks].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))) {
    if (t.household_id !== me.household_id || t.completed_at || t.deleted_at || listed.has(t.id)) continue;
    const forMe = t.visibility === "personal" ? t.created_by === me.user_id : !t.assignee_id || t.assignee_id === memberId;
    const dueToday = !!t.due_at && Date.parse(t.due_at) < dayEnd && forMe;
    if (!dueToday && !nagState(t, memberId, members, today)) continue;
    listed.add(t.id);
    todayItems.push(t.priority === 3 ? `❗ ${t.title}` : t.title);
  }
  // coming up
  const soon: string[] = [];
  for (const ms of milestones) {
    if (ms.deleted_at || ms.household_id !== me.household_id) continue;
    const n = nextMilestone(ms.base_date, today);
    if (n.daysAway === 0 && !(ms.kind === "birthday" && ms.person_id === memberId)) soon.push(`🎉 ${ms.title} today`);
  }
  for (const t of digest.trips) {
    if (t.household_id !== me.household_id) continue;
    const away = Math.round((Date.parse(t.starts_on + "T12:00:00Z") - Date.parse(today + "T12:00:00Z")) / 86_400_000);
    if (away >= 1 && away <= 14) soon.push(`🧳 ${t.title} ${away === 1 ? "tomorrow" : `in ${away} days`}`);
  }
  for (const r of digest.renewals) {
    if (r.household_id !== me.household_id) continue;
    const away = Math.round((Date.parse(r.renewal_date + "T12:00:00Z") - Date.parse(today + "T12:00:00Z")) / 86_400_000);
    if (away >= 0 && away <= 7) soon.push(`🔔 ${r.label} renews ${away === 0 ? "today" : away === 1 ? "tomorrow" : `in ${away} days`}`);
  }
  if (!todayItems.length && !soon.length) return null;
  const n = todayItems.length;
  const title = n ? `Good morning, ${me.display_name} ☀️ ${n} thing${n > 1 ? "s" : ""} today` : `Good morning, ${me.display_name} ☀️`;
  const body = [todayItems.length ? list(todayItems, 5) : "", soon.join(" · ")].filter(Boolean).join("\n");
  return { title, body: body.length > 230 ? body.slice(0, 227) + "…" : body };
}

/**
 * The second high-priority nudge of the day (6 pm), one notification per person listing all their high
 * tasks. Anyone who has switched the digest off gets the morning one separately too.
 */
function planNudges(input: Input, hhmm: string, today: string): Plan[] {
  if (!input.digest) return [];
  const slot = hhmm >= NUDGE_PM[0] && hhmm < NUDGE_PM[1] ? "pm" : hhmm >= "08:00" && hhmm < "11:00" ? "am" : null;
  if (!slot) return [];
  const sent = new Set(input.digest.nudgesSent ?? []);
  const plans: Plan[] = [];
  for (const m of input.members) {
    if (sent.has(`${m.id}:${slot}`)) continue;
    const prefs = input.prefs.find((p) => p.member_id === m.id);
    if (slot === "am" && prefs?.kinds?.digest !== false) continue; // it's in their digest
    const high = input.tasks.filter((t) => t.household_id === m.household_id && nagState(t, m.id, input.members, today) === "high");
    if (!high.length) continue;
    const to = deliverable([m.id], "nudges", input.prefs, hhmm);
    if (!to?.length) continue;
    plans.push({
      claim: { table: "task_nudge_log", memberId: m.id, day: today, slot },
      messages: [
        {
          memberId: m.id,
          kind: "nudges",
          title: high.length === 1 ? "❗ Still to do" : `❗ ${high.length} high-priority tasks still to do`,
          body: list(high.map((t) => t.title)),
          url: "/office",
          tag: "high-tasks", // each nudge replaces the last one on the lock screen
        },
      ],
    });
  }
  return plans;
}

function planDigests(input: Input, hhmm: string, today: string): Plan[] {
  if (!input.digest || hhmm < "08:00" || hhmm >= "11:00") return []; // a digest after 11 am would be stale
  const plans: Plan[] = [];
  for (const m of input.members) {
    if (input.digest.sentToday.includes(m.id)) continue;
    const to = deliverable([m.id], "digest", input.prefs, hhmm);
    if (!to?.length) continue;
    const d = digestFor(m.id, input, today);
    if (!d) continue;
    plans.push({ claim: { table: "digest_log", memberId: m.id, day: today }, messages: [{ memberId: m.id, kind: "digest", title: d.title, body: d.body, url: "/living", tag: `digest-${today}` }] });
  }
  return plans;
}
