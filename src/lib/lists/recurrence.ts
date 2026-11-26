/**
 * Chore recurrence (RRULE) in Toronto time.
 * Rules are evaluated on "floating" local wall-clock times (UTC fields = Toronto fields), then
 * converted to real UTC instants, so daylight-saving changes never shift a chore's day.
 */
import { RRule, rrulestr } from "rrule";
import { HOME_TZ, torontoToUtc } from "@/lib/time";
import { ordinal } from "../../../supabase/functions/_shared/rules";

const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
const DAY_NAMES: Record<Weekday, string> = { MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun" };

export type Repeat =
  | { kind: "daily"; every: number }
  | { kind: "weekly"; every: number; days: Weekday[] }
  | { kind: "monthly"; every: number; day: number };

export function toRRule(r: Repeat): string {
  const interval = Math.max(1, Math.min(r.every, 52));
  if (r.kind === "daily") return `FREQ=DAILY;INTERVAL=${interval}`;
  if (r.kind === "weekly") {
    const days = (r.days.length ? r.days : (["MO"] as Weekday[])).filter((d) => (WEEKDAYS as readonly string[]).includes(d));
    return `FREQ=WEEKLY;INTERVAL=${interval};BYDAY=${days.join(",")}`;
  }
  return `FREQ=MONTHLY;INTERVAL=${interval};BYMONTHDAY=${Math.max(1, Math.min(r.day, 28))}`;
}

export function fromRRule(rule: string): Repeat {
  const parts = Object.fromEntries(rule.split(";").map((p) => p.split("=") as [string, string]));
  const every = Number(parts.INTERVAL ?? 1);
  if (parts.FREQ === "DAILY") return { kind: "daily", every };
  if (parts.FREQ === "MONTHLY") return { kind: "monthly", every, day: Number(parts.BYMONTHDAY ?? 1) };
  return { kind: "weekly", every, days: (parts.BYDAY ?? "MO").split(",") as Weekday[] };
}

export function describeRepeat(rule: string): string {
  const r = fromRRule(rule);
  if (r.kind === "daily") return r.every === 1 ? "Every day" : `Every ${r.every} days`;
  if (r.kind === "monthly") return `${r.every === 1 ? "Every month" : `Every ${r.every} months`} on the ${ordinal(r.day)}`;
  const days = r.days.length === 7 ? "every day" : r.days.map((d) => DAY_NAMES[d]).join(", ");
  return r.every === 1 ? `Weekly · ${days}` : r.every === 2 ? `Every other week · ${days}` : `Every ${r.every} weeks · ${days}`;
}


/** Toronto wall-clock parts of a UTC instant, as a "floating" Date. */
function floating(utc: Date): Date {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: HOME_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(utc);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return new Date(Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute")));
}

const unfloat = (f: Date) => torontoToUtc(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate(), f.getUTCHours(), f.getUTCMinutes());

/**
 * The next occurrence strictly after `after` (default now), for a rule anchored at `dtstart`.
 * When a chore is completed, pass max(current due, now) so missed weeks don't pile up.
 */
export function nextOccurrence(rule: string, dtstart: Date, after: Date = new Date()): Date {
  const r = rrulestr(`RRULE:${rule}`, { dtstart: floating(dtstart) }) as RRule;
  const next = r.after(floating(after), false);
  if (!next) throw new Error("This repeat rule has no more dates");
  return unfloat(next);
}

/** First due date on or after `from` (used when a chore is created). */
export function firstOccurrence(rule: string, dtstart: Date): Date {
  const r = rrulestr(`RRULE:${rule}`, { dtstart: floating(dtstart) }) as RRule;
  const first = r.after(floating(dtstart), true);
  if (!first) throw new Error("This repeat rule has no dates");
  return unfloat(first);
}
