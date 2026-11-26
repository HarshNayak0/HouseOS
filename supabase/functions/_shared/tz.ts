/**
 * The home time zone for this copy of Veedu (the HOME_TZ function secret; Toronto by default) and
 * wall-clock helpers that work for any zone. Pure: reads Deno's env only when running in Deno, so the
 * unit tests in Node get the default.
 */
const denoEnv = (k: string): string | undefined =>
  (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get(k);

export const TZ = denoEnv("HOME_TZ") || "America/Toronto";

function parts(d: Date, tz: string) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return { y: g("year"), mo: g("month"), d: g("day"), h: g("hour"), mi: g("minute") };
}

/** Offset of `tz` from UTC at instant `d`, in minutes. */
function offset(d: Date, tz: string) {
  const p = parts(d, tz);
  return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - Math.floor(d.getTime() / 60000) * 60000) / 60000);
}

/** UTC instant of a wall-clock time on a YYYY-MM-DD day in `tz` (a time in the spring-forward gap moves forward). */
export function zonedAt(day: string, hh: number, mm: number, tz = TZ): Date {
  const [y, mo, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, mo - 1, d, hh, mm);
  const offs = [offset(new Date(guess - 12 * 3_600_000), tz), offset(new Date(guess + 12 * 3_600_000), tz)].sort((a, b) => b - a);
  for (const off of offs) {
    const c = new Date(guess - off * 60_000);
    const p = parts(c, tz);
    if (p.y === y && p.mo === mo && p.d === d && p.h === hh && p.mi === mm) return c;
  }
  return new Date(guess - Math.min(...offs) * 60_000);
}

/** The YYYY-MM-DD day and HH:MM time of an instant in `tz`. */
export function zonedDayTime(d: Date, tz = TZ): { day: string; hhmm: string } {
  const p = parts(d, tz);
  const two = (n: number) => String(n).padStart(2, "0");
  return { day: `${p.y}-${two(p.mo)}-${two(p.d)}`, hhmm: `${two(p.h)}:${two(p.mi)}` };
}
