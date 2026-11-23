import { describe, expect, it } from "vitest";
import { buildUrgent, type UrgentInput } from "@/lib/dashboard";
import { dueLabel } from "@/lib/lists/dates";
import { torontoDayKey, torontoToUtc } from "@/lib/time";

const now = torontoToUtc(2026, 11, 25, 12, 0); // Wed noon, Toronto
const iso = (d: number, h: number, m = 0) => torontoToUtc(2026, 11, d, h, m).toISOString();
const base: UrgentInput = {
  now,
  today: torontoDayKey(now),
  tasks: [],
  chores: [],
  milestones: [],
  dayKey: (s) => torontoDayKey(s),
  label: (s, t) => dueLabel(s, t, now),
};
const task = (id: string, due: string | null, timed = false, extra = {}) => ({ id, title: id, due_at: due, due_has_time: timed, completed_at: null, deleted_at: null, ...extra });
const chore = (id: string, due: string) => ({ id, title: id, next_due_at: due, paused: false, deleted_at: null });

describe("time-sensitive strip", () => {
  it("ranks overdue, then due within 48 h, then milestones", () => {
    const r = buildUrgent({
      ...base,
      tasks: [task("soon-task", iso(26, 23, 59)), task("late-task", iso(24, 23, 59)), task("later", iso(30, 9))],
      chores: [chore("late-chore", iso(23, 18)), chore("today-chore", iso(25, 18))],
      milestones: [{ id: "m", title: "Anniversary", date: "2026-12-01", daysAway: 6, label: "2nd anniversary" }],
    });
    expect(r.map((x) => `${x.tone}:${x.title}`)).toEqual([
      "overdue:late-chore",
      "overdue:late-task",
      "soon:today-chore",
      "soon:soon-task",
      "milestone:Anniversary",
    ]);
    expect(r[4].detail).toBe("in 6 days · 2nd anniversary");
  });

  it("a date-only task due today is not overdue yet; a timed one past its time is", () => {
    const r = buildUrgent({ ...base, tasks: [task("today", iso(25, 23, 59)), task("timed", iso(25, 9), true)] });
    expect(r.find((x) => x.title === "today")?.tone).toBe("soon");
    expect(r.find((x) => x.title === "timed")?.tone).toBe("overdue");
  });

  it("ignores done, deleted, paused and far-off things", () => {
    const r = buildUrgent({
      ...base,
      tasks: [task("done", iso(24, 9), false, { completed_at: "x" }), task("gone", iso(24, 9), false, { deleted_at: "x" }), task("no-date", null)],
      chores: [{ ...chore("paused", iso(23, 18)), paused: true }],
      milestones: [{ id: "far", title: "Far", date: "2027-01-30", daysAway: 66, label: "" }],
    });
    expect(r).toEqual([]);
  });

  it("includes trips and renewals within 30 days (phase 7), after milestones", () => {
    const r = buildUrgent({
      ...base,
      trips: [{ id: "t", title: "Montréal", starts_on: "2026-12-10", daysAway: 15, packedPct: 60 }],
      renewals: [{ id: "v", title: "Tenant insurance", date: "2026-12-05", daysAway: 10 }],
      milestones: [{ id: "m", title: "Birthday", date: "2026-12-01", daysAway: 6, label: "" }],
    });
    expect(r.map((x) => x.tone)).toEqual(["milestone", "trip", "renewal"]);
    expect(r[1].detail).toBe("in 15 days · 60% packed");
  });
});
