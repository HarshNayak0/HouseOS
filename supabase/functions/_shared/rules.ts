/**
 * Small rules used both in the app and by the `notify` function, kept in one place so the reminder
 * and the screen always agree.
 */

export const ordinal = (n: number) => n + (["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0] ?? "th");

export type MilestoneKind = "birthday" | "anniversary" | "other";

/** Next yearly occurrence (Toronto day, on or after `today`) and how many years it marks. Feb 29 → Feb 28. */
export function nextMilestone(base: string, today: string): { date: string; years: number; daysAway: number } {
  const [by, bm, bd] = base.split("-").map(Number);
  const mmdd = `${String(bm).padStart(2, "0")}-${String(bm === 2 && bd === 29 ? 28 : bd).padStart(2, "0")}`;
  let year = Number(today.slice(0, 4));
  if (`${year}-${mmdd}` < today) year++;
  const date = `${year}-${mmdd}`;
  const daysAway = Math.round((Date.parse(date + "T12:00:00Z") - Date.parse(today + "T12:00:00Z")) / 86_400_000);
  return { date, years: year - by, daysAway };
}

/** "turning 26" / "2nd anniversary" / "3 years" / "" */
export function milestoneLabel(kind: MilestoneKind, years: number): string {
  if (years <= 0) return "";
  if (kind === "birthday") return `turning ${years}`;
  if (kind === "anniversary") return `${ordinal(years)} anniversary`;
  return `${years} year${years > 1 ? "s" : ""}`;
}

/** Is `hhmm` (HH:MM) inside quiet hours? Handles windows that cross midnight (23:00–07:00). */
export function inQuietHours(hhmm: string, start: string, end: string): boolean {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const t = m(hhmm),
    s = m(start),
    e = m(end);
  if (s === e) return false;
  return s < e ? t >= s && t < e : t >= s || t < e;
}
