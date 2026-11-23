/**
 * Time rules (SPEC §4.4, CLAUDE.md): store UTC, display America/Toronto.
 * Uses Intl only, so it adds nothing to the bundle and handles DST correctly.
 */
export const HOME_TZ = "America/Toronto";

/** Format a UTC instant for display in Toronto. */
export function formatToronto(
  date: Date | string | number,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: HOME_TZ, ...options }).format(
    new Date(date),
  );
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function torontoParts(date: Date): Parts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HOME_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Toronto's offset from UTC at that instant, in minutes (e.g. -300 for EST, -240 for EDT). */
export function torontoOffsetMinutes(date: Date): number {
  const p = torontoParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** The Toronto calendar day ("YYYY-MM-DD") that a UTC instant falls on. */
export function torontoDayKey(date: Date | string | number): string {
  const p = torontoParts(new Date(date));
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/**
 * Convert a Toronto wall-clock time to the UTC instant.
 * In the spring-forward gap (e.g. 02:30 that doesn't exist) the time moves forward an hour;
 * in the fall-back overlap the earlier (daylight) instant is used.
 */
export function torontoToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // Try the offset before and after the guess; pick the one that round-trips.
  const offsets = [
    torontoOffsetMinutes(new Date(guess - 12 * 3600_000)),
    torontoOffsetMinutes(new Date(guess + 12 * 3600_000)),
  ];
  for (const off of offsets.sort((a, b) => b - a)) {
    const candidate = new Date(guess - off * 60000);
    const p = torontoParts(candidate);
    if (p.year === year && p.month === month && p.day === day && p.hour === hour && p.minute === minute) {
      return candidate;
    }
  }
  // Nonexistent local time (spring-forward gap): shift forward by the gap.
  return new Date(guess - Math.min(...offsets) * 60000);
}

/** UTC instant of midnight at the start of a Toronto day. */
export function startOfTorontoDay(date: Date | string | number): Date {
  const [y, m, d] = torontoDayKey(date).split("-").map(Number);
  return torontoToUtc(y, m, d);
}
