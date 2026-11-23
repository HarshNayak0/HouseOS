import { describe, expect, it } from "vitest";
import { dueLabel, dueState, weekStartKey } from "@/lib/lists/dates";
import { describeRepeat, firstOccurrence, fromRRule, nextOccurrence, toRRule } from "@/lib/lists/recurrence";
import { formatToronto, torontoToUtc } from "@/lib/time";

const local = (d: Date) => formatToronto(d, { weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

describe("chore recurrence (Toronto time)", () => {
  it("round-trips presets", () => {
    expect(toRRule({ kind: "weekly", every: 1, days: ["TU", "FR"] })).toBe("FREQ=WEEKLY;INTERVAL=1;BYDAY=TU,FR");
    expect(fromRRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=SA")).toEqual({ kind: "weekly", every: 2, days: ["SA"] });
    expect(toRRule({ kind: "monthly", every: 1, day: 31 })).toBe("FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=28");
  });

  it("describes rules in plain words", () => {
    expect(describeRepeat("FREQ=DAILY;INTERVAL=1")).toBe("Every day");
    expect(describeRepeat("FREQ=WEEKLY;INTERVAL=2;BYDAY=SA,SU")).toBe("Every other week · Sat, Sun");
    expect(describeRepeat("FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=1")).toBe("Every month on the 1st");
  });

  it("weekly on Tuesday at 6 pm stays 6 pm Toronto across the November DST change", () => {
    const start = torontoToUtc(2026, 10, 27, 18, 0); // Tue Oct 27, EDT
    const next = nextOccurrence("FREQ=WEEKLY;INTERVAL=1;BYDAY=TU", start, start);
    expect(local(next)).toMatch(/Tue.*11\/03\/2026.*18:00|Tue.*2026-11-03.*18:00/);
    expect(next.toISOString()).toBe("2026-11-03T23:00:00.000Z"); // EST now: 18:00 = 23:00Z
  });

  it("skips missed weeks instead of piling them up", () => {
    const start = torontoToUtc(2026, 11, 3, 18, 0);
    const late = torontoToUtc(2026, 11, 20, 9, 0);
    expect(nextOccurrence("FREQ=WEEKLY;INTERVAL=1;BYDAY=TU", start, late).toISOString()).toBe(torontoToUtc(2026, 11, 24, 18, 0).toISOString());
  });

  it("first occurrence lands on a matching day", () => {
    const fri = torontoToUtc(2026, 11, 27, 18, 0);
    expect(firstOccurrence("FREQ=WEEKLY;INTERVAL=1;BYDAY=MO", fri).toISOString()).toBe(torontoToUtc(2026, 11, 30, 18, 0).toISOString());
    expect(firstOccurrence("FREQ=WEEKLY;INTERVAL=1;BYDAY=FR", fri).toISOString()).toBe(fri.toISOString());
  });

  it("monthly across the March DST change", () => {
    const start = torontoToUtc(2027, 2, 14, 9, 0);
    expect(nextOccurrence("FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=14", start, start).toISOString()).toBe(torontoToUtc(2027, 3, 14, 9, 0).toISOString());
  });
});

describe("due labels", () => {
  const now = torontoToUtc(2026, 11, 25, 12, 0); // Wed
  it("labels relative days in Toronto", () => {
    expect(dueLabel(torontoToUtc(2026, 11, 25, 23, 30), false, now)).toBe("Today");
    expect(dueLabel(torontoToUtc(2026, 11, 26, 0, 30), false, now)).toBe("Tomorrow");
    expect(dueLabel(torontoToUtc(2026, 11, 22, 9, 0), false, now)).toBe("3 days overdue");
    expect(dueState(torontoToUtc(2026, 11, 24, 9, 0), now)).toBe("overdue");
  });
  it("finds the start of the week (Monday)", () => {
    expect(weekStartKey(now)).toBe("2026-11-23");
    expect(weekStartKey(torontoToUtc(2026, 11, 29, 22, 0))).toBe("2026-11-23"); // Sunday night
  });
});
