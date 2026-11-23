import { describe, expect, it } from "vitest";
import { displayNameSchema, inQuietHours, inviteTokenSchema, pushSubscriptionSchema, quietHoursSchema, roomLabelsSchema } from "@/lib/schemas";

describe("quiet hours", () => {
  it("handles a window that crosses midnight (23:00–07:00)", () => {
    expect(inQuietHours("23:30", "23:00", "07:00")).toBe(true);
    expect(inQuietHours("03:00", "23:00", "07:00")).toBe(true);
    expect(inQuietHours("07:00", "23:00", "07:00")).toBe(false);
    expect(inQuietHours("12:00", "23:00", "07:00")).toBe(false);
  });
  it("handles a same-day window", () => {
    expect(inQuietHours("14:00", "13:00", "15:00")).toBe(true);
    expect(inQuietHours("15:00", "13:00", "15:00")).toBe(false);
  });
  it("treats equal start and end as no quiet hours", () => {
    expect(inQuietHours("10:00", "09:00", "09:00")).toBe(false);
  });
  it("validates times", () => {
    expect(quietHoursSchema.safeParse({ quiet_start: "23:00", quiet_end: "07:00" }).success).toBe(true);
    expect(quietHoursSchema.safeParse({ quiet_start: "25:00", quiet_end: "07:00" }).success).toBe(false);
  });
});

describe("input validation", () => {
  it("trims and limits names", () => {
    expect(displayNameSchema.parse("  Prerna ")).toBe("Prerna");
    expect(displayNameSchema.safeParse("").success).toBe(false);
    expect(displayNameSchema.safeParse("x".repeat(41)).success).toBe(false);
  });
  it("only accepts well-formed invite tokens", () => {
    expect(inviteTokenSchema.safeParse("a".repeat(48)).success).toBe(true);
    expect(inviteTokenSchema.safeParse("../etc").success).toBe(false);
  });
  it("accepts room label overrides only for real rooms", () => {
    expect(roomLabelsSchema.safeParse({ wash: { name: "Laundry", ml: "അലക്ക്" } }).success).toBe(true);
    expect(roomLabelsSchema.safeParse({ garage: { name: "Garage", ml: "" } }).success).toBe(false);
  });
  it("requires https push endpoints", () => {
    const keys = { p256dh: "k", auth: "a" };
    expect(pushSubscriptionSchema.safeParse({ endpoint: "https://fcm.googleapis.com/x", keys }).success).toBe(true);
    expect(pushSubscriptionSchema.safeParse({ endpoint: "http://evil.example/x", keys }).success).toBe(false);
  });
});
