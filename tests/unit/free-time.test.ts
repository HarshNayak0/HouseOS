import { describe, expect, it } from "vitest";
import { busyFromEvents, findFreeSlots, type Span } from "@/lib/freeTime";
import { formatToronto, torontoToUtc } from "@/lib/time";

const t = (d: number, h: number, m = 0) => torontoToUtc(2026, 11, d, h, m).getTime(); // November 2026
const label = (x: { start: Date }) => formatToronto(x.start, { weekday: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const from = t(24, 9); // Tuesday Nov 24, 9 am

describe("when are we both free", () => {
  it("offers weekday evenings and weekend days, one slot per day", () => {
    const slots = findFreeSlots({ busy: [], from, durationHours: 3, days: 6 });
    expect(slots.map(label)).toEqual(["Tue 24, 6:00 p.m.", "Wed 25, 6:00 p.m.", "Thu 26, 6:00 p.m.", "Fri 27, 6:00 p.m.", "Sat 28, 10:00 a.m.", "Sun 29, 10:00 a.m."]);
  });
  it("works around both people's plans with a half-hour buffer", () => {
    const busy: Span[] = [
      [t(24, 17, 0), t(24, 19, 0)], // Harsh until 7 → free from 7:30
      [t(25, 18, 30), t(25, 21, 0)], // Prerna's book club → 3 hours won't fit after 9:30
      [t(28, 9, 0), t(28, 13, 0)], // Saturday morning
    ];
    const slots = findFreeSlots({ busy, from, durationHours: 3, days: 5 });
    expect(slots.map(label)).toEqual(["Tue 24, 7:30 p.m.", "Thu 26, 6:00 p.m.", "Fri 27, 6:00 p.m.", "Sat 28, 1:30 p.m."]);
  });
  it("skips trip days and the past", () => {
    const slots = findFreeSlots({ busy: [], blockedDays: new Set(["2026-11-25"]), from: t(24, 21), durationHours: 1, days: 3 });
    expect(slots.map(label)).toEqual(["Tue 24, 9:00 p.m.", "Thu 26, 6:00 p.m."]);
  });
  it("only fits long dates on weekends, and a weekend away needs both days", () => {
    expect(findFreeSlots({ busy: [], from, durationHours: 8, days: 7 }).map(label)).toEqual(["Sat 28, 10:00 a.m.", "Sun 29, 10:00 a.m."]);
    expect(findFreeSlots({ busy: [], from, durationHours: 24, days: 7 }).map(label)).toEqual(["Sat 28, 10:00 a.m."]);
    expect(findFreeSlots({ busy: [[t(29, 12), t(29, 13)]], from, durationHours: 24, days: 7 })).toEqual([]);
  });
  it("ignores all-day events and calendars that aren't ours", () => {
    const events = [
      { source_id: "a", starts_at: new Date(t(24, 18)).toISOString(), ends_at: new Date(t(24, 20)).toISOString(), all_day: false },
      { source_id: "a", starts_at: new Date(t(24, 0)).toISOString(), ends_at: new Date(t(25, 0)).toISOString(), all_day: true },
      { source_id: "holidays", starts_at: new Date(t(24, 18)).toISOString(), ends_at: new Date(t(24, 22)).toISOString(), all_day: false },
    ];
    expect(busyFromEvents(events, new Set(["a"]))).toEqual([[t(24, 18), t(24, 20)]]);
  });
});
