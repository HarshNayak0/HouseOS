import { describe, expect, it } from "vitest";
import {
  allowedOrigin,
  decryptSecret,
  encryptSecret,
  signState,
  toCacheRow,
  toGoogleBody,
  torontoMidnight,
  validateEventInput,
  verifyState,
} from "../../supabase/functions/calendar/logic";

const KEY = Buffer.alloc(32, 7).toString("base64");
const OTHER = Buffer.alloc(32, 9).toString("base64");

describe("refresh token encryption", () => {
  it("round-trips and uses a fresh IV each time", async () => {
    const a = await encryptSecret("1//refresh-token", KEY);
    const b = await encryptSecret("1//refresh-token", KEY);
    expect(a).not.toBe(b);
    expect(a.startsWith("v1:")).toBe(true);
    expect(await decryptSecret(a, KEY)).toBe("1//refresh-token");
  });
  it("fails with the wrong key", async () => {
    await expect(decryptSecret(await encryptSecret("x", KEY), OTHER)).rejects.toThrow();
  });
  it("rejects a short key", async () => {
    await expect(encryptSecret("x", Buffer.alloc(16).toString("base64"))).rejects.toThrow(/32 bytes/);
  });
});

describe("OAuth state", () => {
  it("verifies its own signature and expiry", async () => {
    const s = await signState({ member: "m1", exp: Date.now() + 60_000, to: "/office" }, KEY);
    expect(await verifyState(s, KEY)).toMatchObject({ member: "m1", to: "/office" });
    expect(await verifyState(s, OTHER)).toBeNull();
    expect(await verifyState(s, KEY, Date.now() + 120_000)).toBeNull();
  });
  it("rejects tampering and unsafe return paths", async () => {
    const s = await signState({ member: "m1", exp: Date.now() + 60_000, to: "//evil.com" }, KEY);
    expect((await verifyState(s, KEY))?.to).toBe("/settings");
    const [body, sig] = s.split(".");
    expect(await verifyState(body + "x." + sig, KEY)).toBeNull();
    expect(await verifyState("garbage", KEY)).toBeNull();
  });
});

describe("event mapping", () => {
  it("maps timed events", () => {
    const r = toCacheRow({ id: "e1", summary: "Pilates", start: { dateTime: "2026-11-24T18:30:00-05:00" }, end: { dateTime: "2026-11-24T19:30:00-05:00" } });
    expect(r).toMatchObject({ all_day: false, starts_at: "2026-11-24T23:30:00.000Z", summary: "Pilates" });
  });
  it("maps all-day events to Toronto midnight", () => {
    const r = toCacheRow({ id: "e2", summary: "Diwali", start: { date: "2026-11-08" }, end: { date: "2026-11-09" } });
    expect(r).toMatchObject({ all_day: true, starts_at: "2026-11-08T05:00:00.000Z", ends_at: "2026-11-09T05:00:00.000Z" });
    expect(torontoMidnight("2026-07-01").toISOString()).toBe("2026-07-01T04:00:00.000Z");
  });
  it("drops cancelled events and labels untitled ones", () => {
    expect(toCacheRow({ id: "e3", status: "cancelled" })).toBeNull();
    expect(toCacheRow({ id: "e4", start: { date: "2026-11-08" }, end: { date: "2026-11-09" } })?.summary).toBe("(busy)");
  });
  it("builds Google bodies in Toronto time", () => {
    expect(toGoogleBody({ summary: "Dinner", all_day: false, start: "2026-11-24T23:30:00.000Z", end: "2026-11-25T01:00:00.000Z" })).toMatchObject({
      start: { dateTime: "2026-11-24T23:30:00.000Z", timeZone: "America/Toronto" },
    });
    expect(toGoogleBody({ summary: "Trip", all_day: true, start: "2026-12-20", end: "2026-12-23" })).toMatchObject({ start: { date: "2026-12-20" }, end: { date: "2026-12-23" } });
  });
  it("validates input", () => {
    expect(validateEventInput({ summary: "", all_day: false, start: "a", end: "b" })).toBe("Give the event a title");
    expect(validateEventInput({ summary: "x", all_day: true, start: "2026-12-20", end: "2026-12-19" })).toBe("End must be after start");
    expect(typeof validateEventInput({ summary: "x", all_day: false, start: "2026-12-20T10:00:00Z", end: "2026-12-20T11:00:00Z" })).toBe("object");
  });
});

describe("CORS", () => {
  it("allows the app, Vercel previews and localhost only", () => {
    const app = "https://veeduos.vercel.app";
    expect(allowedOrigin(app, app)).toBe(app);
    expect(allowedOrigin("https://houseos-git-x-harsh-s-vercel.vercel.app", app)).not.toBeNull();
    expect(allowedOrigin("http://localhost:3000", app)).not.toBeNull();
    expect(allowedOrigin("https://evil.example", app)).toBeNull();
    expect(allowedOrigin("https://vercel.app.evil.example", app)).toBeNull();
  });
});
