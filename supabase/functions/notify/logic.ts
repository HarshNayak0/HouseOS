/**
 * Pure reminder rules for the `notify` Edge Function (no Deno or network imports, so it's unit-tested).
 * Given the household's data and the time, decide which push messages are due.
 */

import { inQuietHours, milestoneLabel, nextMilestone } from "../_shared/rules.ts";
export { inQuietHours, milestoneLabel, nextMilestone };

export const TZ = "America/Toronto";

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

export type Kind = "chores" | "tasks" | "notes" | "milestones";
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
  | { table: "milestones"; id: string; key: string; reminded: string[] };
export interface Plan {
  claim: Claim;
  messages: Message[];
}

const parts = (d: Date) => {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return { day: `${g("year")}-${g("month")}-${g("day")}`, hhmm: `${g("hour")}:${g("minute")}` };
};

/** UTC instant of a Toronto wall-clock time on a given Toronto day. */
export function torontoAt(day: string, hh: number, mm: number): Date {
  const [y, mo, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, mo - 1, d, hh, mm);
  for (const off of [-4, -5]) {
    const c = new Date(guess - off * 3_600_000);
    const p = parts(c);
    if (p.day === day && p.hhmm === `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`) return c;
  }
  return new Date(guess + 5 * 3_600_000);
}

const timeLabel = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(d);

export interface Input {
  now: Date;
  members: Member[];
  prefs: Prefs[];
  chores: Chore[];
  tasks: Task[];
  notes: Note[];
  milestones?: Milestone[];
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

export function planReminders({ now, members, prefs, chores, tasks, notes, milestones = [] }: Input): Plan[] {
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
  // milestones: 14 / 7 / 1 days before, from 9 am Toronto. Birthdays go only to the other person.
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
  return plans;
}
