/** Pure helpers for trips (unit-tested). Day keys are YYYY-MM-DD in Toronto. */

/** Whole days from day key a to day key b. */
export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86_400_000);
}

export const addDays = (day: string, n: number) => new Date(Date.parse(day + "T12:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

/** Share of a trip's packing items that are packed, or null when the list is empty. */
export function packedPct(items: { trip_id: string; packed: boolean; deleted_at: string | null }[], tripId: string): number | null {
  const mine = items.filter((p) => p.trip_id === tripId && !p.deleted_at);
  return mine.length ? (100 * mine.filter((p) => p.packed).length) / mine.length : null;
}

/** Parse a typed amount ("$1,250.5") to a number with cents, or null. */
export function parseAmount(s: string): number | null {
  const n = Number(s.replace(/[^0-9.]/g, ""));
  return s.trim() && /\d/.test(s) && Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** True when a trip is under way or starts within `days` days. */
export function tripIsSoon(t: { starts_on: string; ends_on: string }, today: string, days = 30) {
  return t.ends_on >= today && daysBetween(today, t.starts_on) <= days;
}

/** True when a Toronto day key falls in the Mon–Sun week starting at weekStart. */
export function inWeek(day: string, weekStart: string) {
  return day >= weekStart && day <= addDays(weekStart, 6);
}
