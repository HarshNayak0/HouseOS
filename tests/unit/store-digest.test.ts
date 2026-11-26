import { describe, expect, it } from "vitest";
import { digestFor, planReminders, torontoAt, type Input, type ShoppingItem, type StoreVisit } from "../../supabase/functions/notify/logic";

const H = "h1";
const members = [
  { id: "harsh", user_id: "u-harsh", display_name: "Harsh", household_id: H },
  { id: "prerna", user_id: "u-prerna", display_name: "Prerna", household_id: H },
];
const prefs = members.map((m) => ({ member_id: m.id, enabled: true, quiet_start: "23:00:00", quiet_end: "07:00:00", kinds: {} }));
const at = (day: string, hh: number, mm = 0) => torontoAt(day, hh, mm);
const base = (o: Partial<Input> = {}): Input => ({ now: at("2026-11-24", 17, 10), members, prefs, chores: [], tasks: [], notes: [], ...o });
const visit = (o: Partial<StoreVisit> = {}): StoreVisit => ({
  id: "v1",
  household_id: H,
  member_id: "harsh",
  store: "No Frills",
  started_at: at("2026-11-24", 17, 0).toISOString(),
  ended_at: null,
  notified_at: null,
  items_pushed_until: null,
  ...o,
});
const item = (name: string, by: string, hh: number, mm: number, o: Partial<ShoppingItem> = {}): ShoppingItem => ({
  household_id: H,
  name,
  store: "No Frills",
  created_by: by,
  created_at: at("2026-11-24", hh, mm).toISOString(),
  checked_at: null,
  deleted_at: null,
  ...o,
});

describe("I'm at the store", () => {
  it("tells the other person, with how much is on the list", () => {
    const plans = planReminders(base({ visits: [visit()], shopping: [item("Milk", "u-harsh", 16, 0)] }));
    expect(plans).toHaveLength(1);
    expect(plans[0].claim).toEqual({ table: "store_visits", id: "v1" });
    expect(plans[0].messages).toEqual([expect.objectContaining({ memberId: "prerna", title: "Harsh is at No Frills 🛒", body: "Anything to add? 1 item on the list so far." })]);
  });
  it("doesn't repeat, and stays quiet once the visit is old or over", () => {
    expect(planReminders(base({ visits: [visit({ notified_at: at("2026-11-24", 17, 1).toISOString() })] }))).toEqual([]);
    expect(planReminders(base({ now: at("2026-11-24", 17, 45), visits: [visit()] }))).toEqual([]); // 45 min later: too stale to announce
    expect(planReminders(base({ visits: [visit({ ended_at: at("2026-11-24", 17, 5).toISOString() })] }))).toEqual([]);
  });
  it("pushes items the other person adds to the shopper, once", () => {
    const shopping = [item("Milk", "u-harsh", 17, 2), item("Eggs", "u-prerna", 17, 3), item("Curry leaves", "u-prerna", 17, 6), item("Old", "u-prerna", 16, 0)];
    const plans = planReminders(base({ visits: [visit({ notified_at: at("2026-11-24", 17, 1).toISOString() })], shopping }));
    expect(plans).toHaveLength(1);
    expect(plans[0].messages[0]).toEqual(expect.objectContaining({ memberId: "harsh", title: "Prerna added to the list", body: "Eggs, Curry leaves" }));
    expect(plans[0].claim).toEqual({ table: "store_items", id: "v1", prev: null, until: at("2026-11-24", 17, 6).toISOString() });
    // after claiming up to 17:06, nothing new
    const again = planReminders(base({ visits: [visit({ notified_at: "x", items_pushed_until: at("2026-11-24", 17, 6).toISOString() })], shopping }));
    expect(again).toEqual([]);
  });
  it("respects the store switch in notification settings", () => {
    const off = prefs.map((p) => (p.member_id === "prerna" ? { ...p, kinds: { store: false } } : p));
    expect(planReminders(base({ prefs: off, visits: [visit()] }))).toEqual([]);
  });
});

describe("morning digest", () => {
  const today = "2026-11-24";
  const digest = {
    sources: [
      { id: "s-h", member_id: "harsh", is_us_calendar: false, visible: true },
      { id: "s-p", member_id: "prerna", is_us_calendar: false, visible: true },
      { id: "s-us", member_id: "harsh", is_us_calendar: true, visible: true },
      { id: "s-us2", member_id: "prerna", is_us_calendar: true, visible: true },
    ],
    events: [
      { source_id: "s-h", google_event_id: "e1", summary: "Dentist", starts_at: at(today, 15).toISOString(), ends_at: at(today, 16).toISOString(), all_day: false },
      { source_id: "s-p", google_event_id: "e2", summary: "Pilates", starts_at: at(today, 18).toISOString(), ends_at: at(today, 19).toISOString(), all_day: false },
      { source_id: "s-us", google_event_id: "e3", summary: "Dinner together", starts_at: at(today, 20).toISOString(), ends_at: at(today, 21).toISOString(), all_day: false },
      { source_id: "s-us2", google_event_id: "e3", summary: "Dinner together", starts_at: at(today, 20).toISOString(), ends_at: at(today, 21).toISOString(), all_day: false },
    ],
    dates: [],
    trips: [{ household_id: H, title: "Montréal", starts_on: "2026-12-06", ends_on: "2026-12-08" }],
    renewals: [{ household_id: H, label: "Tenant insurance", renewal_date: "2026-11-27" }],
    sentToday: [],
  };
  const input = base({
    now: at(today, 8, 5),
    digest,
    chores: [{ id: "c1", household_id: H, title: "Wash towels", next_due_at: at(today, 18).toISOString(), assignee_id: "harsh", remind: true, paused: false, deleted_at: null, reminded_due_at: null }],
    tasks: [
      { id: "t1", household_id: H, title: "Book dental cleanings", due_at: at(today, 23, 59).toISOString(), due_has_time: false, assignee_id: null, visibility: "shared", created_by: "u-prerna", completed_at: null, deleted_at: null, reminded_due_at: null },
      { id: "t2", household_id: H, title: "Prerna's secret", due_at: at(today, 12).toISOString(), due_has_time: true, assignee_id: null, visibility: "personal", created_by: "u-prerna", completed_at: null, deleted_at: null, reminded_due_at: null },
    ],
  });

  it("lists each person's own day, the shared calendar once, and what's coming", () => {
    const d = digestFor("harsh", input, today)!;
    expect(d.title).toBe("Good morning, Harsh ☀️ 4 things today");
    expect(d.body.split("\n")[0]).toBe("Dentist 3:00 p.m., Dinner together 8:00 p.m., Wash towels, Book dental cleanings");
    expect(d.body.split("\n")[1]).toBe("🧳 Montréal in 12 days · 🔔 Tenant insurance renews in 3 days");
    expect(d.body).not.toContain("Pilates"); // Prerna's calendar
    expect(d.body).not.toContain("secret"); // Prerna's personal task
  });
  it("is sent once, from 8 am, and claimed per person and day", () => {
    const plans = planReminders(input).filter((p) => p.claim.table === "digest_log");
    expect(plans.map((p) => p.claim)).toEqual([
      { table: "digest_log", memberId: "harsh", day: today },
      { table: "digest_log", memberId: "prerna", day: today },
    ]);
    expect(planReminders({ ...input, now: at(today, 7, 55) }).filter((p) => p.claim.table === "digest_log")).toEqual([]);
    expect(planReminders({ ...input, now: at(today, 11, 5) }).filter((p) => p.claim.table === "digest_log")).toEqual([]);
    expect(planReminders({ ...input, digest: { ...digest, sentToday: ["harsh", "prerna"] } }).filter((p) => p.claim.table === "digest_log")).toEqual([]);
  });
  it("says nothing on an empty day", () => {
    expect(digestFor("harsh", base({ digest: { ...digest, events: [], trips: [], renewals: [] } }), today)).toBeNull();
  });
});
