import { describe, expect, it } from "vitest";
import { planReminders, torontoAt, type Chore, type Input, type Note, type Task } from "../../supabase/functions/notify/logic";

const H = "h1";
const members = [
  { id: "harsh", user_id: "u-harsh", display_name: "Harsh", household_id: H },
  { id: "prerna", user_id: "u-prerna", display_name: "Prerna", household_id: H },
];
const prefs = members.map((m) => ({ member_id: m.id, enabled: true, quiet_start: "23:00:00", quiet_end: "07:00:00", kinds: {} }));
const at = (day: string, hh: number, mm = 0) => torontoAt(day, hh, mm);
const chore = (o: Partial<Chore> = {}): Chore => ({
  id: "c1",
  household_id: H,
  title: "Take out recycling",
  next_due_at: at("2026-11-24", 18).toISOString(),
  assignee_id: "prerna",
  remind: true,
  paused: false,
  deleted_at: null,
  reminded_due_at: null,
  ...o,
});
const task = (o: Partial<Task> = {}): Task => ({
  id: "t1",
  household_id: H,
  title: "Pay hydro",
  due_at: at("2026-11-24", 23, 59).toISOString(),
  due_has_time: false,
  assignee_id: null,
  visibility: "shared",
  created_by: "u-harsh",
  completed_at: null,
  deleted_at: null,
  reminded_due_at: null,
  ...o,
});
const note = (o: Partial<Note> = {}): Note => ({
  id: "n1",
  household_id: H,
  body: "Have a good shift",
  created_by: "u-prerna",
  created_at: at("2026-11-24", 12).toISOString(),
  deleted_at: null,
  archived_at: null,
  notified_at: null,
  ...o,
});
const run = (now: Date, o: Partial<Input>) => planReminders({ now, members, prefs, chores: [], tasks: [], notes: [], ...o });

describe("chore reminders", () => {
  it("fires at the due time, to the assignee only", () => {
    expect(run(at("2026-11-24", 17, 55), { chores: [chore()] })).toHaveLength(0);
    const p = run(at("2026-11-24", 18, 2), { chores: [chore()] });
    expect(p).toHaveLength(1);
    expect(p[0].messages.map((m) => m.memberId)).toEqual(["prerna"]);
    expect(p[0].messages[0]).toMatchObject({ url: "/wash", body: "Take out recycling" });
  });
  it("goes to both when it's for both", () => {
    expect(run(at("2026-11-24", 18, 2), { chores: [chore({ assignee_id: null })] })[0].messages).toHaveLength(2);
  });
  it("is sent once per occurrence", () => {
    const c = chore({ reminded_due_at: at("2026-11-24", 18).toISOString() });
    expect(run(at("2026-11-24", 19), { chores: [c] })).toHaveLength(0);
  });
  it("skips paused chores and chores with reminders off", () => {
    expect(run(at("2026-11-24", 19), { chores: [chore({ paused: true }), chore({ id: "c2", remind: false })] })).toHaveLength(0);
  });
  it("waits out quiet hours, then sends in the morning", () => {
    const late = chore({ next_due_at: at("2026-11-24", 23, 30).toISOString() });
    expect(run(at("2026-11-24", 23, 35), { chores: [late] })).toHaveLength(0);
    expect(run(at("2026-11-25", 7, 2), { chores: [late] })).toHaveLength(1);
  });
  it("respects turning chore notifications off", () => {
    const off = prefs.map((p) => (p.member_id === "prerna" ? { ...p, kinds: { chores: false } } : p));
    const p = planReminders({ now: at("2026-11-24", 18, 5), members, prefs: off, chores: [chore()], tasks: [], notes: [] });
    expect(p[0].messages).toHaveLength(0);
  });
  it("doesn't nag about things more than two days stale", () => {
    expect(run(at("2026-11-27", 9), { chores: [chore()] })).toHaveLength(0);
  });
});

describe("task reminders", () => {
  it("date-only tasks remind at 9 am Toronto on the day", () => {
    expect(run(at("2026-11-24", 8, 55), { tasks: [task()] })).toHaveLength(0);
    const p = run(at("2026-11-24", 9, 1), { tasks: [task()] });
    expect(p[0].messages).toHaveLength(2);
    expect(p[0].messages[0].title).toBe("Due today");
  });
  it("timed tasks remind at their time", () => {
    const t = task({ due_at: at("2026-11-24", 14, 30).toISOString(), due_has_time: true, assignee_id: "harsh" });
    expect(run(at("2026-11-24", 14, 20), { tasks: [t] })).toHaveLength(0);
    const p = run(at("2026-11-24", 14, 31), { tasks: [t] });
    expect(p[0].messages.map((m) => m.memberId)).toEqual(["harsh"]);
    expect(p[0].messages[0].title).toMatch(/Due at 2:30/);
  });
  it("personal tasks only remind their creator", () => {
    const p = run(at("2026-11-24", 9, 1), { tasks: [task({ visibility: "personal" })] });
    expect(p[0].messages.map((m) => m.memberId)).toEqual(["harsh"]);
  });
  it("re-reminds when the due date changes", () => {
    const t = task({ reminded_due_at: at("2026-11-23", 23, 59).toISOString() });
    expect(run(at("2026-11-24", 9, 1), { tasks: [t] })).toHaveLength(1);
  });
  it("skips completed tasks", () => {
    expect(run(at("2026-11-24", 9, 1), { tasks: [task({ completed_at: "x" })] })).toHaveLength(0);
  });
});

describe("note notifications", () => {
  it("tell the other person, with the author's name", () => {
    const p = run(at("2026-11-24", 12, 1), { notes: [note()] });
    expect(p[0].messages.map((m) => m.memberId)).toEqual(["harsh"]);
    expect(p[0].messages[0]).toMatchObject({ title: "Prerna left a note", body: "Have a good shift", url: "/living" });
  });
  it("wait until quiet hours end", () => {
    const n = note({ created_at: at("2026-11-24", 23, 40).toISOString() });
    expect(run(at("2026-11-24", 23, 41), { notes: [n] })).toHaveLength(0);
    expect(run(at("2026-11-25", 7, 1), { notes: [n] })).toHaveLength(1);
  });
  it("are sent once", () => {
    expect(run(at("2026-11-24", 12, 5), { notes: [note({ notified_at: "x" })] })).toHaveLength(0);
  });
});

describe("Toronto time", () => {
  it("handles both offsets", () => {
    expect(at("2026-07-01", 9).toISOString()).toBe("2026-07-01T13:00:00.000Z");
    expect(at("2026-12-01", 9).toISOString()).toBe("2026-12-01T14:00:00.000Z");
  });
});
