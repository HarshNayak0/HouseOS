/**
 * Living-room dashboard: the ranked "time-sensitive" strip (SPEC §4.1). Pure, so it's unit-tested.
 * Order: overdue (tasks + chores) → due within 48 h → milestones within 14 days → trips within 30 days
 * → vault renewals within 30 days (the last two arrive in phase 7).
 */
import { RoomId } from "@/scene/config";

export type UrgentTone = "overdue" | "soon" | "milestone" | "trip" | "renewal";
export interface UrgentItem {
  key: string;
  tone: UrgentTone;
  title: string;
  detail: string;
  room: RoomId;
  /** sort key within a tone (smaller = sooner) */
  at: number;
}

export interface UrgentInput {
  now: Date;
  /** Toronto day key for today */
  today: string;
  tasks: { id: string; title: string; due_at: string | null; due_has_time: boolean; completed_at: string | null; deleted_at: string | null }[];
  chores: { id: string; title: string; next_due_at: string; paused: boolean; deleted_at: string | null }[];
  milestones: { id: string; title: string; date: string; daysAway: number; label: string }[];
  trips?: { id: string; title: string; starts_on: string; daysAway: number; packedPct: number | null }[];
  renewals?: { id: string; title: string; date: string; daysAway: number }[];
  dayKey: (iso: string) => string;
  label: (iso: string, withTime: boolean) => string;
}

const ORDER: UrgentTone[] = ["overdue", "soon", "milestone", "trip", "renewal"];
const H48 = 48 * 3_600_000;

export function buildUrgent(i: UrgentInput, limit = 10): UrgentItem[] {
  const out: UrgentItem[] = [];
  const now = i.now.getTime();
  for (const t of i.tasks) {
    if (!t.due_at || t.completed_at || t.deleted_at) continue;
    const due = Date.parse(t.due_at);
    // date-only tasks are overdue once their day has passed; timed tasks once their time has
    const overdue = t.due_has_time ? due < now : i.dayKey(t.due_at) < i.today;
    if (overdue) out.push({ key: `t:${t.id}`, tone: "overdue", title: t.title, detail: i.label(t.due_at, t.due_has_time), room: "office", at: due });
    else if (due - now <= H48) out.push({ key: `t:${t.id}`, tone: "soon", title: t.title, detail: i.label(t.due_at, t.due_has_time), room: "office", at: due });
  }
  for (const c of i.chores) {
    if (c.paused || c.deleted_at) continue;
    const due = Date.parse(c.next_due_at);
    const day = i.dayKey(c.next_due_at);
    if (day < i.today) out.push({ key: `c:${c.id}`, tone: "overdue", title: c.title, detail: i.label(c.next_due_at, false), room: "wash", at: due });
    else if (due - now <= H48) out.push({ key: `c:${c.id}`, tone: "soon", title: c.title, detail: i.label(c.next_due_at, false), room: "wash", at: due });
  }
  for (const m of i.milestones) {
    if (m.daysAway > 14) continue;
    const when = m.daysAway === 0 ? "today 🎉" : m.daysAway === 1 ? "tomorrow" : `in ${m.daysAway} days`;
    out.push({ key: `m:${m.id}`, tone: "milestone", title: m.title, detail: [when, m.label].filter(Boolean).join(" · "), room: "office", at: m.daysAway });
  }
  for (const t of i.trips ?? []) {
    if (t.daysAway < 0 || t.daysAway > 30) continue;
    const packed = t.packedPct === null ? "" : ` · ${Math.round(t.packedPct)}% packed`;
    out.push({ key: `trip:${t.id}`, tone: "trip", title: t.title, detail: `${t.daysAway === 0 ? "today" : `in ${t.daysAway} days`}${packed}`, room: "backyard", at: t.daysAway });
  }
  for (const r of i.renewals ?? []) {
    if (r.daysAway < 0 || r.daysAway > 30) continue;
    out.push({ key: `r:${r.id}`, tone: "renewal", title: r.title, detail: r.daysAway === 0 ? "renews today" : r.daysAway === 1 ? "renews tomorrow" : `renews in ${r.daysAway} days`, room: "closet", at: r.daysAway });
  }
  return out.sort((a, b) => ORDER.indexOf(a.tone) - ORDER.indexOf(b.tone) || a.at - b.at).slice(0, limit);
}
