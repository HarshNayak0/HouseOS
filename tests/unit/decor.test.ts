import { describe, expect, it } from "vitest";
import { decorFor, jasmineFor, seasonOf } from "@/lib/decor";
import { lookPhase, resolveLook } from "@/lib/look";

const TO = 43.65;
const ms = [
  { kind: "anniversary", base_date: "2025-10-18" },
  { kind: "anniversary", base_date: "2025-09-11" },
  { kind: "birthday", base_date: "2001-09-01" },
  { kind: "birthday", base_date: "2000-02-29" },
];

describe("decor", () => {
  it("festivals on their days", () => {
    expect(decorFor("2026-11-08", [], [], TO).diwali).toBe(true);
    expect(decorFor("2026-11-06", [], [], TO).diwali).toBe(true);
    expect(decorFor("2026-11-11", [], [], TO).diwali).toBe(false);
    expect(decorFor("2026-08-17", [], [], TO).onam).toBe(true); // Atham, 9 days before Thiruvonam
    expect(decorFor("2026-08-28", [], [], TO).onam).toBe(false);
    expect(decorFor("2027-04-16", [], [], TO).vishu).toBe(true);
    expect(decorFor("2031-04-14", [], [], TO).vishu).toBe(true); // falls back to April 14
    expect(decorFor("2026-12-01", [], [], TO).christmas).toBe(true);
    expect(decorFor("2027-01-06", [], [], TO).christmas).toBe(true);
    expect(decorFor("2027-01-07", [], [], TO).christmas).toBe(false);
  });
  it("Halloween sits among the autumn leaves", () => {
    const d = decorFor("2026-10-30", [], [], TO);
    expect(d.halloween).toBe(true);
    expect(d.season).toBe("autumn");
  });
  it("seasons: none in the tropics, flipped in the south", () => {
    expect(seasonOf("2026-01-10", TO)).toBe("winter");
    expect(seasonOf("2026-09-10", TO)).toBe(null);
    expect(seasonOf("2026-01-10", 9.93)).toBe(null); // Kochi
    expect(seasonOf("2026-01-10", -33.9)).toBe("summer"); // Sydney
  });
  it("garlands for both anniversaries (±1 day) and birthdays; balloons only on birthdays", () => {
    expect(decorFor("2026-10-17", ms, [], TO).garlands).toBe(true);
    expect(decorFor("2026-10-19", ms, [], TO).garlands).toBe(true);
    expect(decorFor("2026-10-20", ms, [], TO).garlands).toBe(false);
    expect(decorFor("2026-09-12", ms, [], TO)).toMatchObject({ garlands: true, balloons: false });
    expect(decorFor("2026-09-01", ms, [], TO)).toMatchObject({ garlands: true, balloons: true });
    expect(decorFor("2027-02-28", ms, [], TO).balloons).toBe(true); // Feb 29 birthday
  });
  it("respects what's turned off", () => {
    const d = decorFor("2026-10-30", ms, ["halloween", "seasons"], TO);
    expect(d.halloween).toBe(false);
    expect(d.season).toBe(null);
    expect(decorFor("2026-10-18", ms, ["anniversary"], TO).garlands).toBe(false);
  });
});

describe("jasmine", () => {
  it("grows with everything done and flowers with this week", () => {
    expect(jasmineFor([], "2026-11-28")).toMatchObject({ growth: 0, bloom: 0 });
    const done = [...Array(40)].map((_, i) => (i < 7 ? "2026-11-27" : "2026-10-01"));
    const j = jasmineFor(done, "2026-11-28");
    expect(j.growth).toBe(6);
    expect(j.thisWeek).toBe(7);
    expect(j.bloom).toBe(0.5);
    expect(jasmineFor([...Array(500)].map(() => "2026-01-01"), "2026-11-28").growth).toBe(8);
  });
});

describe("look", () => {
  it("follows the sun in Toronto", () => {
    expect(lookPhase(new Date("2026-06-21T12:00:00Z"))).toBe("morning"); // 8 am
    expect(lookPhase(new Date("2026-06-21T18:00:00Z"))).toBe("day"); // 2 pm
    expect(lookPhase(new Date("2026-06-22T01:00:00Z"))).toBe("dusk"); // 9 pm, sunset ~9:03
    expect(lookPhase(new Date("2026-06-22T03:00:00Z"))).toBe("night"); // 11 pm
  });
  it("settings and the header button", () => {
    expect(resolveLook("evening", "morning", null)).toBe("night");
    expect(resolveLook("day", "dusk", null)).toBe("day");
    expect(resolveLook("auto", "dusk", true)).toBe("dusk");
    expect(resolveLook("auto", "night", false)).toBe("day");
    expect(resolveLook("auto", "morning", null)).toBe("morning");
  });
});
