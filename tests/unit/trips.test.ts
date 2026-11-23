import { describe, expect, it } from "vitest";
import { addDays, daysBetween, inWeek, packedPct, parseAmount, tripIsSoon } from "@/lib/trips";

describe("trips helpers", () => {
  it("counts days across a DST change and month ends", () => {
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetween("2026-11-30", "2026-12-01")).toBe(1);
    expect(daysBetween("2026-12-05", "2026-12-01")).toBe(-4);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("works out the packed share per trip, ignoring deleted items", () => {
    const items = [
      { trip_id: "a", packed: true, deleted_at: null },
      { trip_id: "a", packed: false, deleted_at: null },
      { trip_id: "a", packed: false, deleted_at: "2026-01-01" },
      { trip_id: "b", packed: true, deleted_at: null },
    ];
    expect(packedPct(items, "a")).toBe(50);
    expect(packedPct(items, "b")).toBe(100);
    expect(packedPct(items, "c")).toBeNull();
  });
  it("parses typed amounts", () => {
    expect(parseAmount("$1,250.50")).toBe(1250.5);
    expect(parseAmount("12.345")).toBe(12.35);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });
  it("lights the lantern for trips within 30 days or under way", () => {
    const today = "2026-11-23";
    expect(tripIsSoon({ starts_on: "2026-12-23", ends_on: "2026-12-30" }, today)).toBe(true);
    expect(tripIsSoon({ starts_on: "2026-12-24", ends_on: "2026-12-30" }, today)).toBe(false);
    expect(tripIsSoon({ starts_on: "2026-11-20", ends_on: "2026-11-23" }, today)).toBe(true);
    expect(tripIsSoon({ starts_on: "2026-11-01", ends_on: "2026-11-22" }, today)).toBe(false);
  });
  it("checks the Mon–Sun week", () => {
    expect(inWeek("2026-11-23", "2026-11-23")).toBe(true);
    expect(inWeek("2026-11-29", "2026-11-23")).toBe(true);
    expect(inWeek("2026-11-30", "2026-11-23")).toBe(false);
  });
});
