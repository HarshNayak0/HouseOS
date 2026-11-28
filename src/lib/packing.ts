/**
 * The packing list, worked out from the trip: how long it is, its vibe, how you're getting there, the
 * extras, the season or the weather forecast, and what each person's profile has learned. Pure (no
 * React, no network), so every rule is unit-tested. The panel turns the result into packing items and
 * keeps them in step when the trip changes (see `planPackingSync`).
 */
import { addDays, daysBetween } from "./time";

export type Vibe = "city" | "beach" | "cottage" | "event";
export type Transport = "drive" | "fly" | "train";
export type Extra = "swimming" | "hiking" | "dressy" | "photo" | "laundry";

export const VIBES: Record<Vibe, { icon: string; label: string; hint: string; dressyShare: number }> = {
  city: { icon: "🏙️", label: "City", hint: "sightseeing, dinners, photos", dressyShare: 0.55 },
  beach: { icon: "🏖️", label: "Beach", hint: "sun, swimming, slow days", dressyShare: 0.4 },
  cottage: { icon: "🌲", label: "Cottage", hint: "cozy, outdoors, relaxed", dressyShare: 0.2 },
  event: { icon: "💍", label: "Event", hint: "a wedding, party or conference", dressyShare: 0.3 },
};
export const TRANSPORTS: Record<Transport, { icon: string; label: string }> = {
  drive: { icon: "🚗", label: "Drive" },
  fly: { icon: "✈️", label: "Fly" },
  train: { icon: "🚆", label: "Train" },
};
export const EXTRAS: Record<Extra, { icon: string; label: string }> = {
  swimming: { icon: "🏊", label: "Swimming" },
  hiking: { icon: "🥾", label: "Hiking" },
  dressy: { icon: "🍷", label: "Dressy dinner" },
  photo: { icon: "📸", label: "Photo day" },
  laundry: { icon: "🧺", label: "Laundry there" },
};

/** What each person calls their two kinds of outfits. Until they choose, a neutral pair. */
export const LABEL_PRESETS: { dressy: string; casual: string }[] = [
  { dressy: "Cute", casual: "Comfy" },
  { dressy: "Confident", casual: "Cozy" },
  { dressy: "Dressy", casual: "Casual" },
];
export const DEFAULT_LABELS = LABEL_PRESETS[2];

/** What a person's profile has learned for one vibe. */
export interface VibeLearning {
  /** their own dressy share of day outfits (0–1), instead of the vibe's default */
  share?: number;
  /** +/- per suggestion, e.g. { socks: 1 } */
  delta?: Record<string, number>;
  /** things they always bring on this kind of trip */
  add?: string[];
  /** suggestions they never want (rule keys) */
  drop?: string[];
}
export interface PackingProfile {
  member_id: string;
  labels?: { dressy?: string; casual?: string };
  vibes?: Partial<Record<Vibe, VibeLearning>>;
}

export interface Weather {
  /** coldest night and warmest day over the trip, °C */
  minC: number;
  maxC: number;
  /** days with a ≥ 50% chance of rain */
  rainyDays: number;
  /** from the forecast (true) or a guess from the season (false) */
  forecast: boolean;
}

export interface TripInput {
  starts_on: string;
  ends_on: string;
  vibe: Vibe;
  transport: Transport | null;
  extras: Extra[];
}

export interface SuggestedItem {
  /** member id, or null for the shared list */
  owner: string | null;
  key: string;
  title: string;
  qty: number;
  reason: string;
  category: "clothes" | "shoes" | "toiletries" | "documents" | "gear" | "food" | "custom";
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** A rough guess at the weather from the month and latitude, for trips too far off for a forecast. */
export function seasonGuess(startsOn: string, lat: number): Weather {
  const month = Number(startsOn.slice(5, 7)); // 1–12
  if (Math.abs(lat) < 23.5) return { minC: 22, maxC: 31, rainyDays: 0, forecast: false }; // tropics
  // northern-hemisphere months; flip by six months south of the equator
  const m = lat >= 0 ? month : ((month + 5) % 12) + 1;
  if (m === 12 || m <= 2) return { minC: -8, maxC: 0, rainyDays: 0, forecast: false };
  if (m <= 4 || m >= 10) return { minC: 3, maxC: 13, rainyDays: 0, forecast: false };
  if (m === 5 || m === 9) return { minC: 10, maxC: 20, rainyDays: 0, forecast: false };
  return { minC: 16, maxC: 27, rainyDays: 0, forecast: false };
}

/** Nights and days of a trip (a same-day trip is 0 nights, 1 day). */
export function tripLength(starts_on: string, ends_on: string) {
  const nights = Math.max(0, daysBetween(starts_on, ends_on));
  return { nights, days: nights + 1 };
}

/**
 * Everything to pack for this trip: one list per person in `people`, plus the shared list (owner null).
 * Each item says why ("4 days, cottage = mostly cozy") so the list can explain itself.
 */
export function suggestPacking(trip: TripInput, people: string[], profiles: PackingProfile[], weather: Weather): SuggestedItem[] {
  const out: SuggestedItem[] = [];
  const { nights, days } = tripLength(trip.starts_on, trip.ends_on);
  const v = VIBES[trip.vibe];
  const has = (e: Extra) => trip.extras.includes(e);
  // with laundry, clothes for at most 7 days
  const clothesDays = has("laundry") ? Math.min(days, 7) : days;
  const laundryNote = has("laundry") && days > 7 ? " (laundry there: packing for 7)" : "";
  const cold = weather.minC < 5;
  const cool = !cold && weather.minC < 13;
  const hot = weather.maxC >= 24;
  const wxSource = weather.forecast ? "forecast" : "season";

  for (const person of people) {
    const profile = profiles.find((p) => p.member_id === person);
    const learned = profile?.vibes?.[trip.vibe] ?? {};
    const labels = { ...DEFAULT_LABELS, ...profile?.labels };
    const add = (key: string, title: string, qty: number, reason: string, category: SuggestedItem["category"]) =>
      out.push({ owner: person, key, title, qty, reason, category });

    // day outfits, split between the two kinds by the vibe (or what this person has taught it)
    const share = learned.share ?? v.dressyShare;
    let outfitDays = clothesDays;
    if (trip.vibe === "event") {
      add("event_outfit", "Event outfit", 1, "for the occasion", "clothes");
      add("event_backup", "Backup for the event (shirt / top)", 1, "in case of spills", "clothes");
      outfitDays = Math.max(0, clothesDays - 1);
    }
    let dressy = Math.round(outfitDays * share);
    if (has("photo")) dressy = Math.min(outfitDays, dressy + 1);
    const casual = outfitDays - dressy;
    const splitWhy = `${plural(days, "day")}, ${v.label.toLowerCase()} = ${share >= 0.5 ? `mostly ${labels.dressy.toLowerCase()}` : `mostly ${labels.casual.toLowerCase()}`}${has("photo") ? ", +1 for the photo day" : ""}${laundryNote}`;
    add("outfit_dressy", `${labels.dressy} outfits`, dressy, splitWhy, "clothes");
    add("outfit_casual", `${labels.casual} outfits`, casual, splitWhy, "clothes");
    if (has("dressy")) add("dinner_outfit", "Dinner outfit", 1, "for the dressy dinner", "clothes");

    if (nights > 0) add("nightwear", "Nightwear", Math.max(1, nights - 1), `${plural(nights, "night")}: one fewer than nights`, "clothes");
    add("underwear", "Underwear", Math.min(clothesDays, 7) + 1, `one per day, plus a spare${laundryNote}`, "clothes");
    const socks = (trip.vibe === "beach" ? Math.ceil(clothesDays / 2) : clothesDays) + (has("hiking") ? 1 : 0);
    add("socks", "Socks", socks, trip.vibe === "beach" ? "beach days: fewer socks" : `one pair a day${has("hiking") ? ", +1 for hiking" : ""}`, "clothes");

    // shoes
    const shoes: Record<Vibe, [string, string]> = {
      city: ["Comfortable walking shoes", "lots of walking"],
      beach: ["Sandals / slides", "beach days"],
      cottage: ["Boots or sturdy sneakers", "outdoors and trails"],
      event: ["Dress shoes", "for the event"],
    };
    add("shoes_main", shoes[trip.vibe][0], 1, shoes[trip.vibe][1], "shoes");
    if (trip.vibe === "event" || has("dressy")) add("shoes_everyday", "Everyday shoes", 1, "for the rest of the trip", "shoes");
    if (has("hiking")) add("hiking_shoes", "Hiking shoes", 1, "for hiking", "shoes");

    // weather
    if (cold) {
      add("warm_jacket", "Warm jacket", 1, `cold nights (${weather.minC} °C, ${wxSource})`, "clothes");
      add("hat_gloves", "Toque and gloves", 1, `below 5 °C (${wxSource})`, "clothes");
    } else if (cool) add("layer", "Hoodie or fleece", 1, `cool evenings (${weather.minC} °C, ${wxSource})`, "clothes");
    if (trip.vibe === "cottage" && !cold) add("cozy_layer", "Cozy sweater", 1, "cottage evenings", "clothes");
    if (weather.rainyDays > 0) add("rain_jacket", "Rain jacket", 1, `${plural(weather.rainyDays, "rainy day")} in the forecast`, "clothes");
    if (hot || trip.vibe === "beach") add("sunglasses", "Sunglasses", 1, hot ? `up to ${weather.maxC} °C (${wxSource})` : "beach", "gear");
    if (has("swimming") || trip.vibe === "beach") add("swimwear", "Swimwear", trip.vibe === "beach" ? 2 : 1, trip.vibe === "beach" ? "one to wear, one drying" : "for swimming", "clothes");

    // personal bits
    add("toiletry_kit", "Toothbrush and personal toiletries", 1, "every trip", "toiletries");
    add("meds", "Medication", 1, "every trip", "toiletries");
    add("phone_charger", "Phone charger", 1, "every trip", "gear");
    if (trip.transport === "fly") {
      add("id_passport", "Passport / ID", 1, "flying", "documents");
      add("neck_pillow", "Neck pillow", 1, "flying", "gear");
    } else add("id_card", "Driver's licence / ID", 1, "every trip", "documents");
    if (trip.vibe === "cottage") add("cozy_socks", "Cozy socks / slippers", 1, "cottage", "clothes");

    // this person's learned changes for this vibe
    const drop = new Set(learned.drop ?? []);
    for (const item of out) {
      if (item.owner !== person) continue;
      if (drop.has(item.key)) item.qty = 0;
      const d = learned.delta?.[item.key];
      if (d) {
        item.qty = Math.max(0, Math.min(30, item.qty + d));
        item.reason += ` (${d > 0 ? "+" : ""}${d}: your usual)`;
      }
    }
    for (const title of learned.add ?? []) add(`custom:${slug(title)}`, title, 1, `you always bring this on ${v.label.toLowerCase()} trips`, "custom");
  }

  // the shared list
  const shared = (key: string, title: string, qty: number, reason: string, category: SuggestedItem["category"]) =>
    out.push({ owner: null, key, title, qty, reason, category });
  shared("toiletries", "Shared toiletries (shampoo, toothpaste, deodorant)", 1, "every trip", "toiletries");
  shared("first_aid", "First aid kit (painkillers, plasters)", 1, "every trip", "toiletries");
  shared("power_bank", "Power bank", 1, "every trip", "gear");
  if (trip.transport === "drive") {
    shared("road_snacks", "Snacks for the road", 1, "driving", "food");
    shared("car_charger", "Car charger / cable", 1, "driving", "gear");
  }
  if (trip.transport === "fly") shared("liquids_bag", "Clear liquids bag", 1, "flying: carry-on liquids", "toiletries");
  if (trip.transport === "train") shared("train_snacks", "Snacks and water for the train", 1, "train ride", "food");
  if (trip.vibe === "cottage") {
    shared("bug_spray", "Bug spray", 1, "cottage", "gear");
    shared("flashlight", "Flashlight", 1, "cottage: dark nights", "gear");
    shared("games", "Cards / board games", 1, "cottage evenings", "gear");
  }
  if (trip.vibe === "beach") {
    shared("beach_towels", "Beach towels", 2, "one each", "gear");
    shared("beach_bag", "Beach bag", 1, "beach", "gear");
  }
  if (trip.vibe === "beach" || hot) shared("sunscreen", "Sunscreen", 1, hot ? `up to ${weather.maxC} °C` : "beach", "toiletries");
  if (trip.vibe === "city") shared("day_bag", "Day bag", 1, "out all day", "gear");
  if (trip.vibe === "event") {
    shared("gift", "Gift / card", 1, "for the event", "gear");
    shared("steamer", "Travel steamer or iron", 1, "keep the event outfits crisp", "gear");
  }
  if (has("hiking")) {
    shared("water_bottles", "Water bottles", 2, "hiking", "gear");
    shared("trail_snacks", "Trail snacks", 1, "hiking", "food");
  }
  if (has("laundry") && days > 7) shared("laundry_kit", "Laundry bag and detergent pods", 1, "washing halfway", "gear");
  if (weather.rainyDays > 0) shared("umbrella", "Umbrella", 1, "rain in the forecast", "gear");

  return out;
}

// ---------- keeping a trip's list in step with the suggestions ----------

export interface ExistingItem {
  id: string;
  owner_id: string | null;
  rule_key: string | null;
  title: string;
  qty: number;
  packed_count: number;
  suggested_qty: number | null;
  edited: boolean;
  reason: string | null;
  deleted_at: string | null;
}

export interface PackingSync {
  insert: SuggestedItem[];
  update: { id: string; patch: { title?: string; qty?: number; suggested_qty?: number; reason?: string; packed_count?: number } }[];
  remove: string[];
}

/**
 * How to bring the trip's list in line with the suggestions:
 * - a new suggestion is added (with nothing in it packed yet)
 * - an untouched suggestion follows the rules (new quantity, wording, reason)
 * - a suggestion you changed by hand keeps your quantity (only its suggested_qty is refreshed)
 * - a suggestion that no longer applies goes away, unless you changed it or packed some
 * Items you added yourself (no rule key) are never touched.
 */
export function planPackingSync(suggested: SuggestedItem[], existing: ExistingItem[]): PackingSync {
  const plan: PackingSync = { insert: [], update: [], remove: [] };
  const live = existing.filter((e) => e.rule_key && !e.deleted_at);
  const keyOf = (owner: string | null, key: string) => `${owner ?? "shared"}|${key}`;
  const have = new Map(live.map((e) => [keyOf(e.owner_id, e.rule_key!), e]));
  const wanted = new Set<string>();
  for (const s of suggested) {
    const k = keyOf(s.owner, s.key);
    wanted.add(k);
    const e = have.get(k);
    if (!e) {
      if (s.qty > 0) plan.insert.push(s);
      continue;
    }
    if (e.edited) {
      if (e.suggested_qty !== s.qty) plan.update.push({ id: e.id, patch: { suggested_qty: s.qty } });
      continue;
    }
    const patch: PackingSync["update"][number]["patch"] = {};
    if (e.qty !== s.qty) {
      patch.qty = s.qty;
      if (e.packed_count > s.qty) patch.packed_count = s.qty;
    }
    if (e.suggested_qty !== s.qty) patch.suggested_qty = s.qty;
    if (e.title !== s.title) patch.title = s.title;
    if (e.reason !== s.reason) patch.reason = s.reason;
    if (Object.keys(patch).length) plan.update.push({ id: e.id, patch });
  }
  for (const e of live) if (!wanted.has(keyOf(e.owner_id, e.rule_key!)) && !e.edited && e.packed_count === 0) plan.remove.push(e.id);
  return plan;
}

/** Share of a trip's packing that's done, counting quantities ("2 of 3 outfits" = 2 of 3), or null when empty. */
export function packedShare(items: { trip_id: string; qty?: number | null; packed_count?: number | null; packed: boolean; deleted_at: string | null }[], tripId: string): number | null {
  let need = 0,
    done = 0;
  for (const i of items) {
    if (i.trip_id !== tripId || i.deleted_at) continue;
    const q = i.qty ?? 1;
    if (q <= 0) continue;
    need += q;
    done += Math.min(q, Math.max(i.packed_count ?? 0, i.packed ? q : 0));
  }
  return need ? (100 * done) / need : null;
}

/** "Remember for cottage trips": fold a hand-made change into the person's profile for that vibe. */
export function learnFromEdit(
  learning: VibeLearning,
  item: { rule_key: string; qty: number; suggested_qty: number },
  outfits?: { dressy: number; casual: number },
): VibeLearning {
  const next: VibeLearning = { ...learning, delta: { ...learning.delta }, drop: [...(learning.drop ?? [])] };
  if ((item.rule_key === "outfit_dressy" || item.rule_key === "outfit_casual") && outfits && outfits.dressy + outfits.casual > 0) {
    next.share = Math.round((outfits.dressy / (outfits.dressy + outfits.casual)) * 100) / 100;
    return next;
  }
  if (item.qty === 0) {
    if (!next.drop!.includes(item.rule_key)) next.drop!.push(item.rule_key);
    return next;
  }
  const d = (next.delta![item.rule_key] ?? 0) + (item.qty - item.suggested_qty);
  if (d) next.delta![item.rule_key] = d;
  else delete next.delta![item.rule_key];
  next.drop = next.drop!.filter((k) => k !== item.rule_key);
  return next;
}

/** After a trip: things you didn't use come down next time, things you wished you had are always added. */
export function learnFromTrip(learning: VibeLearning, unused: { rule_key: string; count: number; qty: number }[], wished: string[]): VibeLearning {
  const next: VibeLearning = { ...learning, delta: { ...learning.delta }, drop: [...(learning.drop ?? [])], add: [...(learning.add ?? [])] };
  for (const u of unused) {
    if (u.count <= 0) continue;
    if (u.rule_key.startsWith("custom:")) continue;
    if (u.count >= u.qty) {
      if (!next.drop!.includes(u.rule_key)) next.drop!.push(u.rule_key);
    } else next.delta![u.rule_key] = (next.delta![u.rule_key] ?? 0) - u.count;
  }
  for (const w of wished.map((x) => x.trim()).filter(Boolean)) if (!next.add!.some((a) => a.toLowerCase() === w.toLowerCase())) next.add!.push(w.slice(0, 80));
  return next;
}

/** The days of a trip, as day keys. */
export const tripDays = (starts_on: string, ends_on: string) => Array.from({ length: Math.min(60, Math.max(0, daysBetween(starts_on, ends_on))) + 1 }, (_, i) => addDays(starts_on, i));
