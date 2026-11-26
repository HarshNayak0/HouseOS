import { describe, expect, it } from "vitest";
import {
  formatToronto,
  startOfTorontoDay,
  torontoDayKey,
  torontoOffsetMinutes,
  torontoToUtc,
} from "@/lib/time";

describe("Toronto time helpers", () => {
  it("knows EST and EDT offsets", () => {
    expect(torontoOffsetMinutes(new Date("2027-01-15T12:00:00Z"))).toBe(-300);
    expect(torontoOffsetMinutes(new Date("2027-07-15T12:00:00Z"))).toBe(-240);
  });

  it("puts a late-evening UTC instant on the right Toronto day", () => {
    // 03:30 UTC on Nov 23 is 22:30 on Nov 22 in Toronto
    expect(torontoDayKey("2026-11-23T03:30:00Z")).toBe("2026-11-22");
  });

  it("converts ordinary wall-clock times", () => {
    expect(torontoToUtc(2027, 1, 15, 9, 0).toISOString()).toBe("2027-01-15T14:00:00.000Z");
    expect(torontoToUtc(2027, 7, 15, 9, 0).toISOString()).toBe("2027-07-15T13:00:00.000Z");
  });

  it("handles spring forward (2027-03-14, 02:00 → 03:00)", () => {
    expect(torontoToUtc(2027, 3, 14, 1, 30).toISOString()).toBe("2027-03-14T06:30:00.000Z");
    expect(torontoToUtc(2027, 3, 14, 3, 30).toISOString()).toBe("2027-03-14T07:30:00.000Z");
    // 02:30 doesn't exist; it lands at 03:30 EDT
    expect(torontoToUtc(2027, 3, 14, 2, 30).toISOString()).toBe("2027-03-14T07:30:00.000Z");
  });

  it("handles fall back (2026-11-01, 02:00 → 01:00), choosing the earlier 01:30", () => {
    expect(torontoToUtc(2026, 11, 1, 1, 30).toISOString()).toBe("2026-11-01T05:30:00.000Z");
    expect(torontoToUtc(2026, 11, 1, 3, 0).toISOString()).toBe("2026-11-01T08:00:00.000Z");
  });

  it("finds the start of a Toronto day across DST days", () => {
    expect(startOfTorontoDay("2027-03-14T18:00:00Z").toISOString()).toBe("2027-03-14T05:00:00.000Z");
    expect(startOfTorontoDay("2026-11-01T18:00:00Z").toISOString()).toBe("2026-11-01T04:00:00.000Z");
  });

  it("formats for display in Toronto", () => {
    expect(formatToronto("2026-09-01T16:00:00Z", { hour: "numeric", minute: "2-digit" })).toMatch(
      /^12:00\s?p\.m\.$/,
    );
  });
});

import { addDays, addMonths, daysBetween, formatDay, weekdayMon } from "@/lib/time";
describe("day-key helpers", () => {
  it("adds days across month, year and daylight-saving changes", () => {
    expect(addDays("2026-03-07", 2)).toBe("2026-03-09");
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("steps months to the 1st", () => {
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-31", -1)).toBe("2025-12-01");
  });
  it("counts days and weekdays", () => {
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetween("2026-12-05", "2026-12-01")).toBe(-4);
    expect(weekdayMon("2026-11-23")).toBe(0); // Monday
    expect(weekdayMon("2026-11-29")).toBe(6); // Sunday
    expect(formatDay("2026-12-13", { weekday: "short", month: "short", day: "numeric" })).toBe("Sun, Dec 13");
  });
});

import { zonedToUtc, zoneOffsetMinutes } from "@/lib/time";
describe("any home time zone (other couples' copies)", () => {
  it("converts wall-clock times in India (no daylight saving)", () => {
    expect(zonedToUtc("Asia/Kolkata", 2026, 11, 24, 8, 0).toISOString()).toBe("2026-11-24T02:30:00.000Z");
    expect(zoneOffsetMinutes(new Date("2026-06-01T00:00:00Z"), "Asia/Kolkata")).toBe(330);
  });
  it("follows London's own daylight-saving dates", () => {
    expect(zonedToUtc("Europe/London", 2026, 3, 28, 9, 0).toISOString()).toBe("2026-03-28T09:00:00.000Z"); // still GMT
    expect(zonedToUtc("Europe/London", 2026, 3, 29, 9, 0).toISOString()).toBe("2026-03-29T08:00:00.000Z"); // BST from Mar 29
    expect(zonedToUtc("Europe/London", 2026, 3, 29, 1, 30).toISOString()).toBe("2026-03-29T01:30:00.000Z"); // 1:30 doesn't exist: moves forward to 2:30 BST
  });
  it("handles zones far from UTC (Auckland)", () => {
    expect(zonedToUtc("Pacific/Auckland", 2026, 1, 1, 0, 0).toISOString()).toBe("2025-12-31T11:00:00.000Z");
  });
});
