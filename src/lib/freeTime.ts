/**
 * "When are we both free?" for planning a date. Pure, so it's unit-tested.
 * Looks at both calendars (timed events only: all-day ones are usually holidays and birthdays), other
 * planned dates and trip days, and finds the earliest slot per day that fits, over the next two weeks.
 */
import { addDays, torontoDayKey, torontoToUtc, weekdayMon } from "./time";

export type Span = [start: number, end: number]; // ms

/** Date-ish windows: weekday evenings and weekend days (Toronto time). */
const WINDOWS = { weekday: [18, 0, 22, 30], weekend: [10, 0, 22, 30] } as const;
const PAD = 30 * 60_000; // leave half an hour around other plans
const STEP = 30 * 60_000;

const at = (day: string, h: number, m: number) => {
  const [y, mo, d] = day.split("-").map(Number);
  return torontoToUtc(y, mo, d, h, m).getTime();
};
const ceilStep = (t: number) => Math.ceil(t / STEP) * STEP;

function window(day: string): Span {
  const [h0, m0, h1, m1] = weekdayMon(day) >= 5 ? WINDOWS.weekend : WINDOWS.weekday;
  return [at(day, h0, m0), at(day, h1, m1)];
}

/** Earliest start inside `win` where [start, start + len] avoids every busy span (padded). */
function earliest(win: Span, from: number, len: number, busy: Span[]): number | null {
  let t = ceilStep(Math.max(win[0], from));
  while (t + len <= win[1]) {
    const clash = busy.find(([s, e]) => t < e + PAD && t + len > s - PAD);
    if (!clash) return t;
    t = ceilStep(clash[1] + PAD);
  }
  return null;
}

export interface FreeSlot {
  day: string;
  start: Date;
}

/**
 * @param durationHours how long the date takes; 24 or more means a weekend (Saturday and Sunday both free).
 * @param blockedDays days that are out entirely (trips).
 */
export function findFreeSlots(opts: { busy: Span[]; blockedDays?: Set<string>; from: number; durationHours: number; days?: number; max?: number }): FreeSlot[] {
  const { busy, blockedDays = new Set(), from, durationHours, days = 14, max = 6 } = opts;
  const out: FreeSlot[] = [];
  const first = torontoDayKey(new Date(from));
  for (let i = 0; i < days && out.length < max; i++) {
    const day = addDays(first, i);
    if (blockedDays.has(day)) continue;
    if (durationHours >= 24) {
      // a weekend away: Saturday and Sunday both clear
      if (weekdayMon(day) !== 5 || blockedDays.has(addDays(day, 1))) continue;
      const span: Span = [window(day)[0], window(addDays(day, 1))[1]];
      if (span[0] < from) continue;
      if (!busy.some(([s, e]) => s < span[1] && e > span[0])) out.push({ day, start: new Date(span[0]) });
      continue;
    }
    const t = earliest(window(day), from, durationHours * 3_600_000, busy);
    if (t !== null) out.push({ day, start: new Date(t) });
  }
  return out;
}

/** Busy spans from cached calendar events (timed only) on the given calendars. */
export function busyFromEvents(events: { source_id: string; starts_at: string; ends_at: string; all_day: boolean; deleted_at?: string | null }[], sourceIds: Set<string>): Span[] {
  return events.filter((e) => !e.deleted_at && !e.all_day && sourceIds.has(e.source_id)).map((e) => [Date.parse(e.starts_at), Date.parse(e.ends_at)]);
}
