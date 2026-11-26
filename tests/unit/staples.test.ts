import { describe, expect, it } from "vitest";
import { dueStaples, type FrequencyRow } from "@/lib/staples";

const now = Date.parse("2026-11-24T17:00:00Z");
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();
const row = (name: string, times: number, firstDaysAgo: number, lastDaysAgo: number): FrequencyRow => ({
  normalized_name: name.toLowerCase(),
  display_name: name,
  times_added: times,
  last_store: "No Frills",
  created_at: daysAgo(firstDaysAgo),
  last_added_at: daysAgo(lastDaysAgo),
});

describe("staples", () => {
  it("suggests items whose usual gap has passed, most overdue first", () => {
    const rows = [
      row("Milk", 5, 28, 8), // every 5 days, 8 days ago → due
      row("Rice", 3, 60, 32), // every 14 days, 32 days ago → due (2.3×)
      row("Eggs", 4, 21, 2), // every ~6 days, 2 days ago → not yet
      row("Ghee", 2, 30, 20), // only bought twice: no rhythm yet
      row("Cake", 3, 3, 1), // added 3 times in two days: no rhythm
      row("Paneer", 3, 200, 150), // stopped buying it long ago
    ];
    expect(dueStaples(rows, new Set(), now).map((s) => [s.name, s.everyDays, s.sinceDays])).toEqual([
      ["Rice", 14, 32],
      ["Milk", 5, 8],
    ]);
  });
  it("skips anything already on the list", () => {
    expect(dueStaples([row("Milk", 5, 28, 8)], new Set(["milk"]), now)).toEqual([]);
  });
});
