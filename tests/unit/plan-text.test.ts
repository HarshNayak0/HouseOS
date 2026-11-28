import { describe, expect, it } from "vitest";
import { parsePlanText } from "@/lib/planText";

// Fri Dec 18 → Mon Dec 21, 2026
const days = ["2026-12-18", "2026-12-19", "2026-12-20", "2026-12-21"];

describe("plan items in plain words", () => {
  it("weekday and time", () => {
    expect(parsePlanText("Sat 7pm dinner at The Kitchen", days)).toEqual({ day: "2026-12-19", time: "19:00", title: "Dinner at The Kitchen" });
    expect(parsePlanText("brunch on sunday at 10:30am", days)).toEqual({ day: "2026-12-20", time: "10:30", title: "Brunch" });
  });
  it("day numbers, first / last day, dates", () => {
    expect(parsePlanText("day 2 hike to the lookout", days)).toEqual({ day: "2026-12-19", time: null, title: "Hike to the lookout" });
    expect(parsePlanText("last day check out 11:00", days)).toEqual({ day: "2026-12-21", time: "11:00", title: "Check out" });
    expect(parsePlanText("Dec 20 spa noon", days)).toEqual({ day: "2026-12-20", time: "12:00", title: "Spa" });
    expect(parsePlanText("20th December spa", days).day).toBe("2026-12-20");
  });
  it("no day named, or a day outside the trip", () => {
    expect(parsePlanText("Groceries on the way up", days)).toEqual({ day: null, time: null, title: "Groceries on the way up" });
    expect(parsePlanText("Tue 9am kayak", days)).toEqual({ day: null, time: "09:00", title: "Tue kayak" });
  });
  it("12 am / 12 pm", () => {
    expect(parsePlanText("Fri 12pm lunch", days).time).toBe("12:00");
    expect(parsePlanText("Fri 12am stargazing", days).time).toBe("00:00");
  });
});
