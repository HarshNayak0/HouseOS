import { describe, expect, it } from "vitest";
import {
  learnFromEdit,
  learnFromTrip,
  packedShare,
  planPackingSync,
  seasonGuess,
  suggestPacking,
  type ExistingItem,
  type PackingProfile,
  type TripInput,
  type Weather,
} from "@/lib/packing";

const mild: Weather = { minC: 14, maxC: 21, rainyDays: 0, forecast: true };
const cottage: TripInput = { starts_on: "2026-12-18", ends_on: "2026-12-21", vibe: "cottage", transport: "drive", extras: [] };
const harsh: PackingProfile = { member_id: "harsh", labels: { dressy: "Confident", casual: "Cozy" } };
const prerna: PackingProfile = { member_id: "prerna", labels: { dressy: "Cute", casual: "Comfy" } };
const qty = (items: ReturnType<typeof suggestPacking>, owner: string | null, key: string) => items.find((i) => i.owner === owner && i.key === key)?.qty;
const title = (items: ReturnType<typeof suggestPacking>, owner: string | null, key: string) => items.find((i) => i.owner === owner && i.key === key)?.title;

describe("packing for a 4-day, 3-night cottage trip", () => {
  const items = suggestPacking(cottage, ["harsh", "prerna"], [harsh, prerna], mild);
  it("nightwear is one fewer than nights, outfits are mostly cozy", () => {
    expect(qty(items, "harsh", "nightwear")).toBe(2);
    expect(qty(items, "harsh", "outfit_dressy")).toBe(1);
    expect(qty(items, "harsh", "outfit_casual")).toBe(3);
    expect(qty(items, "harsh", "underwear")).toBe(5);
    expect(qty(items, "harsh", "socks")).toBe(4);
  });
  it("each person's own wording for their outfits", () => {
    expect(title(items, "harsh", "outfit_dressy")).toBe("Confident outfits");
    expect(title(items, "harsh", "outfit_casual")).toBe("Cozy outfits");
    expect(title(items, "prerna", "outfit_dressy")).toBe("Cute outfits");
    expect(title(items, "prerna", "outfit_casual")).toBe("Comfy outfits");
  });
  it("a shared list with the cottage and driving extras, and a reason on everything", () => {
    for (const k of ["bug_spray", "flashlight", "games", "road_snacks", "first_aid"]) expect(qty(items, null, k)).toBe(1);
    expect(qty(items, null, "liquids_bag")).toBeUndefined();
    expect(items.every((i) => i.reason.length > 0)).toBe(true);
    expect(items.find((i) => i.key === "outfit_casual")!.reason).toBe("4 days, cottage = mostly cozy");
  });
});

describe("the vibe changes the split and the extras", () => {
  const city = suggestPacking({ ...cottage, vibe: "city", transport: "fly" }, ["prerna"], [prerna], mild);
  it("city trips lean dressy, flying adds the passport and liquids bag", () => {
    expect(qty(city, "prerna", "outfit_dressy")).toBe(2); // round(4 × 0.55)
    expect(qty(city, "prerna", "outfit_casual")).toBe(2);
    expect(qty(city, "prerna", "id_passport")).toBe(1);
    expect(qty(city, null, "liquids_bag")).toBe(1);
  });
  it("events get the outfit and a backup; extras add their bits", () => {
    const ev = suggestPacking({ ...cottage, vibe: "event", extras: ["photo", "hiking", "swimming"] }, ["harsh"], [harsh], mild);
    expect(qty(ev, "harsh", "event_outfit")).toBe(1);
    expect(qty(ev, "harsh", "outfit_dressy")! + qty(ev, "harsh", "outfit_casual")!).toBe(3); // the event day is its own outfit
    expect(qty(ev, "harsh", "hiking_shoes")).toBe(1);
    expect(qty(ev, "harsh", "socks")).toBe(5);
    expect(qty(ev, "harsh", "swimwear")).toBe(1);
  });
  it("laundry caps clothes at 7 days on long trips", () => {
    const long = suggestPacking({ ...cottage, ends_on: "2027-01-01", extras: ["laundry"] }, ["harsh"], [harsh], mild);
    expect(qty(long, "harsh", "outfit_dressy")! + qty(long, "harsh", "outfit_casual")!).toBe(7);
    expect(qty(long, "harsh", "underwear")).toBe(8);
    expect(qty(long, null, "laundry_kit")).toBe(1);
  });
  it("a day trip has no nightwear", () => {
    expect(qty(suggestPacking({ ...cottage, ends_on: cottage.starts_on }, ["harsh"], [harsh], mild), "harsh", "nightwear")).toBeUndefined();
  });
});

describe("weather", () => {
  it("rain, cold and heat add the right things", () => {
    const wet = suggestPacking(cottage, ["harsh"], [harsh], { minC: 2, maxC: 8, rainyDays: 2, forecast: true });
    expect(qty(wet, "harsh", "rain_jacket")).toBe(1);
    expect(qty(wet, "harsh", "warm_jacket")).toBe(1);
    expect(qty(wet, null, "umbrella")).toBe(1);
    const hot = suggestPacking({ ...cottage, vibe: "city" }, ["harsh"], [harsh], { minC: 18, maxC: 30, rainyDays: 0, forecast: true });
    expect(qty(hot, null, "sunscreen")).toBe(1);
    expect(qty(hot, "harsh", "layer")).toBeUndefined();
  });
  it("guesses from the season for trips too far off for a forecast", () => {
    expect(seasonGuess("2027-01-10", 43.65).minC).toBeLessThan(0); // Toronto in January
    expect(seasonGuess("2027-07-10", 43.65).maxC).toBeGreaterThan(24);
    expect(seasonGuess("2027-07-10", -33.9).minC).toBeLessThan(5); // Cape Town in July: winter
    expect(seasonGuess("2027-01-10", 9.93).maxC).toBeGreaterThan(28); // Kochi: tropical
  });
});

describe("learning", () => {
  it("a profile's changes for a vibe apply next time", () => {
    const learned: PackingProfile = { ...harsh, vibes: { cottage: { share: 0.5, delta: { socks: 1 }, add: ["Fishing rod"], drop: ["games"] } } };
    const items = suggestPacking(cottage, ["harsh"], [learned], mild);
    expect(qty(items, "harsh", "outfit_dressy")).toBe(2);
    expect(qty(items, "harsh", "socks")).toBe(5);
    expect(qty(items, "harsh", "custom:fishing-rod")).toBe(1);
    // drops only apply to the person's own items, not the shared list
    expect(qty(items, null, "games")).toBe(1);
  });
  it("remembering an edit", () => {
    expect(learnFromEdit({}, { rule_key: "socks", qty: 6, suggested_qty: 4 })).toEqual({ delta: { socks: 2 }, drop: [] });
    expect(learnFromEdit({ delta: { socks: 2 } }, { rule_key: "socks", qty: 4, suggested_qty: 6 })).toEqual({ delta: {}, drop: [] });
    expect(learnFromEdit({}, { rule_key: "outfit_dressy", qty: 2, suggested_qty: 1 }, { dressy: 2, casual: 2 }).share).toBe(0.5);
    expect(learnFromEdit({}, { rule_key: "sunglasses", qty: 0, suggested_qty: 1 }).drop).toEqual(["sunglasses"]);
  });
  it("after the trip: unused comes down, wished-for is added", () => {
    const next = learnFromTrip({}, [{ rule_key: "outfit_dressy", count: 1, qty: 2 }, { rule_key: "sunglasses", count: 1, qty: 1 }], ["Fleece", " "]);
    expect(next.delta).toEqual({ outfit_dressy: -1 });
    expect(next.drop).toEqual(["sunglasses"]);
    expect(next.add).toEqual(["Fleece"]);
  });
});

describe("keeping a trip's list in step", () => {
  const base = (o: Partial<ExistingItem>): ExistingItem => ({ id: "x", owner_id: "harsh", rule_key: "socks", title: "Socks", qty: 4, packed_count: 0, suggested_qty: 4, edited: false, reason: "one pair a day", deleted_at: null, ...o });
  const sug = (o: Partial<ReturnType<typeof suggestPacking>[number]>) => ({ owner: "harsh", key: "socks", title: "Socks", qty: 4, reason: "one pair a day", category: "clothes" as const, ...o });
  it("adds new suggestions and leaves matching ones alone", () => {
    expect(planPackingSync([sug({})], [base({})])).toEqual({ insert: [], update: [], remove: [] });
    expect(planPackingSync([sug({ key: "hat" })], []).insert).toHaveLength(1);
    expect(planPackingSync([sug({ qty: 0 })], []).insert).toHaveLength(0);
  });
  it("untouched suggestions follow the trip; hand-edited ones keep your number", () => {
    expect(planPackingSync([sug({ qty: 6 })], [base({ packed_count: 0 })]).update).toEqual([{ id: "x", patch: { qty: 6, suggested_qty: 6 } }]);
    expect(planPackingSync([sug({ qty: 2 })], [base({ packed_count: 3 })]).update[0].patch).toEqual({ qty: 2, packed_count: 2, suggested_qty: 2 });
    expect(planPackingSync([sug({ qty: 6 })], [base({ edited: true, qty: 5 })]).update).toEqual([{ id: "x", patch: { suggested_qty: 6 } }]);
  });
  it("removes suggestions that no longer apply, unless changed or packed; never touches your own items", () => {
    expect(planPackingSync([], [base({})]).remove).toEqual(["x"]);
    expect(planPackingSync([], [base({ packed_count: 1 })]).remove).toEqual([]);
    expect(planPackingSync([], [base({ edited: true })]).remove).toEqual([]);
    expect(planPackingSync([], [base({ rule_key: null })]).remove).toEqual([]);
  });
  it("progress counts quantities", () => {
    expect(packedShare([{ trip_id: "t", qty: 3, packed_count: 2, packed: false, deleted_at: null }, { trip_id: "t", qty: 1, packed_count: 0, packed: true, deleted_at: null }], "t")).toBe(75);
    expect(packedShare([{ trip_id: "t", qty: 0, packed_count: 0, packed: false, deleted_at: null }], "t")).toBeNull();
  });
});
