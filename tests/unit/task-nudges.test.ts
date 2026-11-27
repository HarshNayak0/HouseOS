import { describe, expect, it } from "vitest";
import { digestFor, nagState, planReminders, torontoAt, type Input, type Task } from "../../supabase/functions/notify/logic";

const H = "h1";
const members = [
  { id: "harsh", user_id: "u-harsh", display_name: "Harsh", household_id: H },
  { id: "prerna", user_id: "u-prerna", display_name: "Prerna", household_id: H },
];
const prefs = members.map((m) => ({ member_id: m.id, enabled: true, quiet_start: "23:00:00", quiet_end: "07:00:00", kinds: {} as Record<string, boolean> }));
const at = (day: string, hh: number, mm = 0) => torontoAt(day, hh, mm);
const today = "2026-11-27";
const task = (o: Partial<Task>): Task => ({
  id: "t1",
  household_id: H,
  title: "Call the landlord",
  due_at: null,
  due_has_time: false,
  assignee_id: null,
  visibility: "shared",
  created_by: "u-harsh",
  created_at: at("2026-11-26", 10).toISOString(),
  completed_at: null,
  deleted_at: null,
  reminded_due_at: null,
  priority: 3,
  ...o,
});
const digest = { sources: [], events: [], dates: [], trips: [], renewals: [], sentToday: [], nudgesSent: [] as string[] };
const input = (o: Partial<Input> = {}): Input => ({ now: at(today, 18, 5), members, prefs, chores: [], tasks: [], notes: [], digest, ...o });
const nudges = (i: Input) => planReminders(i).filter((p) => p.claim.table === "task_nudge_log");

describe("who a high or medium task keeps reminding, and from when", () => {
  it("only its owner: the assignee, else the creator", () => {
    expect(nagState(task({}), "harsh", members, today)).toBe("high"); // unassigned: the creator
    expect(nagState(task({}), "prerna", members, today)).toBeNull();
    expect(nagState(task({ assignee_id: "prerna" }), "prerna", members, today)).toBe("high");
    expect(nagState(task({ assignee_id: "prerna" }), "harsh", members, today)).toBeNull();
  });
  it("from its due day; with no due date, from when it was made", () => {
    expect(nagState(task({ due_at: at("2026-12-04", 12).toISOString() }), "harsh", members, today)).toBeNull(); // next week
    expect(nagState(task({ due_at: at(today, 23, 59).toISOString() }), "harsh", members, today)).toBe("high");
    expect(nagState(task({ due_at: null }), "harsh", members, today)).toBe("high");
  });
  it("high tasks fade to the digest after 7 days; medium stays daily; low and done tasks never", () => {
    expect(nagState(task({ due_at: at("2026-11-21", 9).toISOString() }), "harsh", members, today)).toBe("high"); // day 7
    expect(nagState(task({ due_at: at("2026-11-20", 9).toISOString() }), "harsh", members, today)).toBe("high-faded"); // day 8
    expect(nagState(task({ priority: 2, due_at: at("2026-10-01", 9).toISOString() }), "harsh", members, today)).toBe("medium");
    expect(nagState(task({ priority: 1 }), "harsh", members, today)).toBeNull();
    expect(nagState(task({ completed_at: at(today, 9).toISOString() }), "harsh", members, today)).toBeNull();
  });
});

describe("the 6 pm nudge", () => {
  it("one notification per person, listing all their high tasks, once", () => {
    const tasks = [task({ id: "a", title: "Call the landlord" }), task({ id: "b", title: "Renew passport" }), task({ id: "c", title: "Prerna's", created_by: "u-prerna" })];
    const plans = nudges(input({ tasks }));
    expect(plans.map((p) => p.claim)).toEqual([
      { table: "task_nudge_log", memberId: "harsh", day: today, slot: "pm" },
      { table: "task_nudge_log", memberId: "prerna", day: today, slot: "pm" },
    ]);
    expect(plans[0].messages[0]).toEqual(expect.objectContaining({ title: "❗ 2 high-priority tasks still to do", body: "Call the landlord, Renew passport", tag: "high-tasks" }));
    expect(nudges(input({ tasks, digest: { ...digest, nudgesSent: ["harsh:pm", "prerna:pm"] } }))).toEqual([]);
  });
  it("not before 6, not after 9, not for faded or medium tasks, and not when switched off", () => {
    const tasks = [task({})];
    expect(nudges(input({ tasks, now: at(today, 17, 55) }))).toEqual([]);
    expect(nudges(input({ tasks, now: at(today, 21, 5) }))).toEqual([]);
    expect(nudges(input({ tasks: [task({ due_at: at("2026-11-15", 9).toISOString() })] }))).toEqual([]);
    expect(nudges(input({ tasks: [task({ priority: 2 })] }))).toEqual([]);
    const off = prefs.map((p) => ({ ...p, kinds: { nudges: false } }));
    expect(nudges(input({ tasks, prefs: off }))).toEqual([]);
  });
  it("the morning nudge is the digest, unless someone switched the digest off", () => {
    const tasks = [task({})];
    expect(nudges(input({ tasks, now: at(today, 8, 5) }))).toEqual([]);
    const noDigest = prefs.map((p) => ({ ...p, kinds: { digest: false } }));
    expect(nudges(input({ tasks, prefs: noDigest, now: at(today, 8, 5) })).map((p) => p.claim)).toEqual([{ table: "task_nudge_log", memberId: "harsh", day: today, slot: "am" }]);
  });
});

describe("the morning digest lists them", () => {
  it("high first with ❗, then medium, until done; others' and future ones aren't listed", () => {
    const tasks = [
      task({ id: "m", title: "Book dentist", priority: 2 }),
      task({ id: "h", title: "Call the landlord" }),
      task({ id: "f", title: "Next week's", due_at: at("2026-12-04", 12).toISOString() }),
      task({ id: "p", title: "Prerna's medium", priority: 2, created_by: "u-prerna" }),
      task({ id: "l", title: "Low, no date", priority: 1 }),
    ];
    const d = digestFor("harsh", input({ tasks, now: at(today, 8, 5) }), today)!;
    expect(d.title).toBe("Good morning, Harsh ☀️ 2 things today");
    expect(d.body).toBe("❗ Call the landlord, Book dentist");
  });
});
