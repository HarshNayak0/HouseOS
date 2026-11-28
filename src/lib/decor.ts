/**
 * What decorates the house today: festivals, the season, your anniversaries and birthdays, and how far
 * the verandah jasmine has grown. Pure (unit-tested); the 3D scene only shows or hides what this says.
 */
import { addDays, daysBetween } from "./time";

export const DECOR_KEYS = ["onam", "vishu", "diwali", "christmas", "halloween", "seasons", "anniversary", "birthday"] as const;
export type DecorKey = (typeof DECOR_KEYS)[number];
export const DECOR_LABELS: Record<DecorKey, { label: string; hint: string }> = {
  onam: { label: "Onam", hint: "A pookalam flower carpet in the front yard (the 10 days up to Thiruvonam)" },
  vishu: { label: "Vishu", hint: "A golden konna tree in bloom by the gate" },
  diwali: { label: "Diwali", hint: "Clay diyas along the verandah, steps and the path to the gate (5 days)" },
  christmas: { label: "Christmas", hint: "A Kerala paper star at the door (Dec 1 – Jan 6)" },
  halloween: { label: "Halloween", hint: "Carved pumpkins on the steps and at the gate (Oct 24–31), among the autumn leaves" },
  seasons: { label: "Seasons", hint: "Spring blossoms, summer fireflies, autumn leaves, winter snow" },
  anniversary: { label: "Your anniversaries", hint: "Marigold garlands on the gate and the verandah pillars, and the boat lantern lit (the day before to the day after)" },
  birthday: { label: "Birthdays", hint: "Garlands, and balloons tied to the gateposts" },
};

export type Season = "spring" | "summer" | "autumn" | "winter";

export interface DecorState {
  onam: boolean;
  vishu: boolean;
  diwali: boolean;
  christmas: boolean;
  halloween: boolean;
  season: Season | null;
  garlands: boolean;
  balloons: boolean;
}

export const NO_DECOR: DecorState = { onam: false, vishu: false, diwali: false, christmas: false, halloween: false, season: null, garlands: false, balloons: false };

// Festival days that move each year (checked against several almanacs). Onam = Thiruvonam; Diwali =
// Lakshmi Puja; Vishu = Medam 1. Add later years here; a year that isn't listed simply has no decoration
// for that festival (Vishu falls back to April 14).
const THIRUVONAM: Record<number, string> = { 2026: "2026-08-26", 2027: "2027-09-12", 2028: "2028-09-01" };
const DIWALI: Record<number, string> = { 2026: "2026-11-08", 2027: "2027-10-29", 2028: "2028-10-17", 2029: "2029-11-05", 2030: "2030-10-26" };
const VISHU: Record<number, string> = { 2026: "2026-04-14", 2027: "2027-04-15", 2028: "2028-04-14", 2029: "2029-04-14", 2030: "2030-04-15" };

const within = (day: string, from: string, to: string) => day >= from && day <= to;

/** Seasons where they exist (outside the tropics), flipped south of the equator. */
export function seasonOf(day: string, lat: number): Season | null {
  if (Math.abs(lat) < 23.5) return null;
  const m = Number(day.slice(5, 7));
  const north: (Season | null)[] = [null, "winter", "winter", "winter", "spring", "spring", "summer", "summer", "summer", null, "autumn", "autumn", "winter"];
  const s = north[m];
  if (lat >= 0 || !s) return lat >= 0 ? s : null;
  return ({ winter: "summer", summer: "winter", spring: "autumn", autumn: "spring" } as const)[s];
}

/** This year's date for a month-day (Feb 29 → Feb 28 in other years). */
function thisYears(base: string, year: number): string {
  const md = base.slice(5);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return `${year}-${md === "02-29" && !leap ? "02-28" : md}`;
}

export interface Milestone {
  kind: string;
  base_date: string;
  deleted_at?: string | null;
}

export function decorFor(day: string, milestones: Milestone[], off: readonly string[], lat: number): DecorState {
  const on = (k: DecorKey) => !off.includes(k);
  const y = Number(day.slice(0, 4));
  const near = (date: string | undefined, before: number, after: number) => !!date && within(day, addDays(date, -before), addDays(date, after));
  const live = milestones.filter((m) => !m.deleted_at);
  // anniversaries: the day before to the day after (also across New Year)
  const anniversary = live.some((m) => m.kind === "anniversary" && [y - 1, y, y + 1].some((yy) => Math.abs(daysBetween(day, thisYears(m.base_date, yy))) <= 1));
  const birthday = live.some((m) => m.kind === "birthday" && thisYears(m.base_date, y) === day);
  const md = day.slice(5);
  return {
    onam: on("onam") && near(THIRUVONAM[y], 9, 1),
    vishu: on("vishu") && near(VISHU[y] ?? `${y}-04-14`, 1, 1),
    diwali: on("diwali") && near(DIWALI[y], 2, 2),
    christmas: on("christmas") && (md >= "12-01" || md <= "01-06"),
    halloween: on("halloween") && md >= "10-24" && md <= "10-31",
    season: on("seasons") ? seasonOf(day, lat) : null,
    garlands: (on("anniversary") && anniversary) || (on("birthday") && birthday),
    balloons: on("birthday") && birthday,
  };
}

// ---------- the verandah jasmine ----------

/** Things done together (chores, tasks, dates) needed for each growth stage; it never shrinks. */
export const JASMINE_STAGES = [0, 1, 4, 9, 16, 26, 40, 58, 80];
export const JASMINE_MAX = JASMINE_STAGES.length - 1;
/** Things done in the last 7 days for the vine to be in full flower. */
export const FULL_BLOOM = 14;

export interface Jasmine {
  /** 0 (a sprout) … 8 (across the verandah beam), fractional between stages */
  growth: number;
  /** 0 = green buds … 1 = covered in flowers (from the last 7 days) */
  bloom: number;
  total: number;
  thisWeek: number;
}

/** `done` = the days (YYYY-MM-DD, home time) each chore, task or date was done. */
export function jasmineFor(done: string[], today: string): Jasmine {
  const total = done.length;
  let stage = 0;
  while (stage < JASMINE_MAX && total >= JASMINE_STAGES[stage + 1]) stage++;
  const next = JASMINE_STAGES[stage + 1];
  const growth = stage >= JASMINE_MAX ? JASMINE_MAX : stage + (total - JASMINE_STAGES[stage]) / (next - JASMINE_STAGES[stage]);
  const weekStart = addDays(today, -6);
  const thisWeek = done.filter((d) => d >= weekStart && d <= today).length;
  return { growth, bloom: Math.min(1, thisWeek / FULL_BLOOM), total, thisWeek };
}
