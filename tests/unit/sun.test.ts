import { describe, expect, it } from "vitest";
import { isEvening, sunTimes } from "@/lib/sun";
import { formatToronto, torontoToUtc } from "@/lib/time";

const hm = (d: Date) => formatToronto(d, { hour: "2-digit", minute: "2-digit", hour12: false });
const mins = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const near = (got: Date, want: string, tol = 4) => expect(Math.abs(mins(hm(got)) - mins(want))).toBeLessThanOrEqual(tol);

describe("Toronto sunrise and sunset", () => {
  it("matches published times within a few minutes", () => {
    // NRC / timeanddate.com for Toronto
    const june = sunTimes("2026-06-21");
    near(june.sunrise, "05:36");
    near(june.sunset, "21:03"); // past midnight UTC, still the right Toronto day
    const dec = sunTimes("2026-12-21");
    near(dec.sunrise, "07:48");
    near(dec.sunset, "16:43");
    const mar = sunTimes("2026-03-20");
    near(mar.sunrise, "07:21");
    near(mar.sunset, "19:29");
  });
  it("switches to evening around sunset and back after sunrise", () => {
    expect(isEvening(torontoToUtc(2026, 12, 21, 12, 0))).toBe(false);
    expect(isEvening(torontoToUtc(2026, 12, 21, 16, 30))).toBe(true); // 13 min before sunset
    expect(isEvening(torontoToUtc(2026, 12, 21, 23, 30))).toBe(true);
    expect(isEvening(torontoToUtc(2026, 12, 22, 6, 0))).toBe(true);
    expect(isEvening(torontoToUtc(2026, 6, 21, 20, 0))).toBe(false);
    expect(isEvening(torontoToUtc(2026, 6, 21, 20, 50))).toBe(true);
    expect(isEvening(torontoToUtc(2026, 6, 22, 0, 30))).toBe(true); // after midnight
  });
});

import { resolveEvening } from "@/lib/view-pref";
describe("evening mode with a manual override", () => {
  it("follows the sun in automatic mode", () => {
    expect(resolveEvening("auto", true, null)).toBe(true);
    expect(resolveEvening("auto", false, null)).toBe(false);
  });
  it("a tap overrides until the next sunset or sunrise", () => {
    const tappedAtDusk = { value: false, auto: true };
    expect(resolveEvening("auto", true, tappedAtDusk)).toBe(false); // still dusk: stays day
    expect(resolveEvening("auto", false, tappedAtDusk)).toBe(false); // sunrise: back to automatic (day)
    const tappedInDay = { value: true, auto: false };
    expect(resolveEvening("auto", true, tappedInDay)).toBe(true); // sunset came: automatic says evening too
    expect(resolveEvening("auto", false, { value: true, auto: true })).toBe(false); // the sun moved on: override dropped
  });
  it("fixed preferences ignore the sun", () => {
    expect(resolveEvening("day", true, null)).toBe(false);
    expect(resolveEvening("evening", false, null)).toBe(true);
    expect(resolveEvening("day", true, { value: true, auto: true })).toBe(true);
  });
});
