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
