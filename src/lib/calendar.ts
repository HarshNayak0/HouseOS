"use client";

/**
 * Calendar: calls to the `calendar` Edge Function, plus one merged list of everything that belongs on
 * the calendar (Google events, tasks and chores with dates, milestones), coloured by person.
 */
import { useEffect } from "react";
import { PERSON_COLORS } from "@/lib/colors";
import { useHousehold } from "@/lib/household";
import { live, useRows, type BaseRow } from "@/lib/lists/rows";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { SUPABASE_URL } from "@/lib/supabase/config";
import { torontoDayKey, torontoToUtc } from "@/lib/time";
import type { Chore } from "@/panels/Chores";
import type { DateIdea } from "@/panels/Dates";
import type { Trip } from "@/panels/Trips";
import type { Task } from "@/panels/Tasks";

export interface CalendarAccount extends BaseRow {
  member_id: string;
  google_email: string;
  status: "ok" | "error" | "revoked";
  last_error: string | null;
}
export interface CalendarSource extends BaseRow {
  account_id: string;
  member_id: string;
  google_calendar_id: string;
  summary: string;
  color: string | null;
  access_role: string;
  is_primary: boolean;
  is_us_calendar: boolean;
  visible: boolean;
  last_synced_at: string | null;
}
export interface CachedEvent extends BaseRow {
  source_id: string;
  google_event_id: string;
  summary: string | null;
  location: string | null;
  description: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  html_link: string | null;
}
export interface Milestone extends BaseRow {
  title: string;
  kind: "birthday" | "anniversary" | "other";
  base_date: string;
  person_id: string | null;
  remind_days: number[];
}
export interface GiftIdea extends BaseRow {
  milestone_id: string | null;
  for_member_id: string | null;
  title: string;
  link: string | null;
  price: number | null;
  status: "idea" | "bought" | "given";
  notes: string | null;
}

export async function callCalendar<T = unknown>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const sb = supabaseBrowser();
  const { data } = (await sb?.auth.getSession()) ?? { data: { session: null } };
  const res = await fetch(`${SUPABASE_URL}/functions/v1/calendar/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}) },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `Calendar error ${res.status}`);
  return j as T;
}

/** Ask for a calendar sync once when the app opens (the schedule covers the rest). */
export function useSyncOnOpen() {
  const { data } = useHousehold();
  const householdId = data?.me?.household_id;
  useEffect(() => {
    if (!householdId) return;
    callCalendar("sync").catch(() => {});
  }, [householdId]);
}

/** Next yearly occurrence of a milestone (Toronto day) and the number of years it marks. */
export function nextOccurrence(base: string, today = torontoDayKey(new Date())) {
  const [by, bm, bd] = base.split("-").map(Number);
  const mmdd = `${String(bm).padStart(2, "0")}-${String(bm === 2 && bd === 29 ? 28 : bd).padStart(2, "0")}`;
  let year = Number(today.slice(0, 4));
  if (`${year}-${mmdd}` < today) year++;
  const date = `${year}-${mmdd}`;
  const daysAway = Math.round((Date.parse(date + "T12:00:00Z") - Date.parse(today + "T12:00:00Z")) / 86_400_000);
  return { date, years: year - by, daysAway };
}

const ordinal = (n: number) => n + (["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0] ?? "th");
export function milestoneLabel(kind: Milestone["kind"], years: number) {
  if (years <= 0) return "";
  return kind === "birthday" ? `turning ${years}` : kind === "anniversary" ? `${ordinal(years)} anniversary` : `${years} years`;
}

export type ItemKind = "event" | "task" | "chore" | "milestone" | "trip" | "date";
export interface CalItem {
  key: string;
  kind: ItemKind;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  color: string;
  who: string | null; // member id, null = both
  day: string; // Toronto day key of the start
  event?: CachedEvent;
  source?: CalendarSource;
  sub?: string;
}

/** Everything on the calendar, merged and coloured. */
export function useCalendarItems() {
  const { data } = useHousehold();
  const members = data?.members ?? [];
  const bothHex = PERSON_COLORS[data?.settings?.both_color ?? "leaf"].hex;
  const colorOf = (memberId: string | null) => {
    const m = members.find((x) => x.id === memberId);
    return m ? PERSON_COLORS[m.color].hex : bothHex;
  };
  const sources = useRows<CalendarSource>("calendar_sources");
  const events = useRows<CachedEvent>("calendar_event_cache");
  const tasks = useRows<Task>("tasks");
  const chores = useRows<Chore>("chores");
  const milestones = useRows<Milestone>("milestones");
  const trips = useRows<Trip>("trips");
  const dates = useRows<DateIdea>("date_ideas");

  const visible = live(sources.data).filter((s) => s.visible);
  const srcById = new Map(visible.map((s) => [s.id, s]));
  const items: CalItem[] = [];
  const seen = new Set<string>();
  for (const e of live(events.data)) {
    const src = srcById.get(e.source_id);
    if (!src) continue;
    // the Us calendar shows up in both accounts: show each event once
    const dedupe = src.is_us_calendar ? `us:${e.google_event_id}` : `${src.id}:${e.google_event_id}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const who = src.is_us_calendar ? null : src.member_id;
    const start = new Date(e.starts_at);
    items.push({ key: `e:${e.id}`, kind: "event", title: e.summary ?? "(busy)", start, end: new Date(e.ends_at), allDay: e.all_day, color: colorOf(who), who, day: torontoDayKey(start), event: e, source: src });
  }
  for (const t of live(tasks.data)) {
    if (!t.due_at || t.completed_at) continue;
    const start = new Date(t.due_at);
    items.push({ key: `t:${t.id}`, kind: "task", title: t.title, start, end: start, allDay: !t.due_has_time, color: colorOf(t.assignee_id), who: t.assignee_id, day: torontoDayKey(start), sub: "Task" });
  }
  for (const c of live(chores.data)) {
    if (c.paused) continue;
    const start = new Date(c.next_due_at);
    items.push({ key: `c:${c.id}`, kind: "chore", title: c.title, start, end: start, allDay: true, color: colorOf(c.assignee_id), who: c.assignee_id, day: torontoDayKey(start), sub: "Chore" });
  }
  for (const m of live(milestones.data)) {
    const n = nextOccurrence(m.base_date);
    for (const date of [n.date, `${Number(n.date.slice(0, 4)) + 1}${n.date.slice(4)}`]) {
      const [y, mo, d] = date.split("-").map(Number);
      const start = torontoToUtc(y, mo, d, 0, 0);
      const years = y - Number(m.base_date.slice(0, 4));
      items.push({ key: `m:${m.id}:${date}`, kind: "milestone", title: m.title, start, end: start, allDay: true, color: "#B8893B", who: m.person_id, day: date, sub: milestoneLabel(m.kind, years) });
    }
  }
  for (const t of live(trips.data)) {
    const [y, mo, d] = t.starts_on.split("-").map(Number);
    const [y2, mo2, d2] = t.ends_on.split("-").map(Number);
    const start = torontoToUtc(y, mo, d, 0, 0);
    // all-day spans end at the start of the day after the last day
    const end = new Date(torontoToUtc(y2, mo2, d2, 12, 0).getTime() + 12 * 3_600_000);
    items.push({ key: `trip:${t.id}`, kind: "trip", title: `🧳 ${t.title}`, start, end, allDay: true, color: colorOf(null), who: null, day: t.starts_on, sub: t.destination ?? "Trip" });
  }
  // planned dates already on Google Calendar show up as events; the rest show here
  for (const d of live(dates.data)) {
    if (d.status !== "planned" || !d.planned_for || d.calendar_event_id) continue;
    const start = new Date(d.planned_for);
    items.push({ key: `date:${d.id}`, kind: "date", title: `💛 ${d.title}`, start, end: start, allDay: false, color: colorOf(null), who: null, day: torontoDayKey(start), sub: "Date night" });
  }
  items.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.getTime() - b.start.getTime());
  return { items, sources: live(sources.data), loading: events.isLoading || sources.isLoading };
}
