/** Friendly due-date labels in Toronto time. */
import { addDays, formatToronto, torontoDayKey, weekdayMon } from "@/lib/time";

export function dayDiff(utc: Date | string, now = new Date()): number {
  const a = Date.parse(torontoDayKey(utc) + "T00:00:00Z"),
    b = Date.parse(torontoDayKey(now) + "T00:00:00Z");
  return Math.round((a - b) / 86_400_000);
}

export function dueLabel(utc: Date | string, withTime = false, now = new Date()): string {
  const d = dayDiff(utc, now);
  const time = withTime ? ` · ${formatToronto(utc, { hour: "numeric", minute: "2-digit" })}` : "";
  if (d < -1) return `${-d} days overdue`;
  if (d === -1) return "Yesterday" + time;
  if (d === 0) return "Today" + time;
  if (d === 1) return "Tomorrow" + time;
  if (d < 7) return formatToronto(utc, { weekday: "long" }) + time;
  return formatToronto(utc, { month: "short", day: "numeric" }) + time;
}

export type DueState = "overdue" | "today" | "soon" | "later" | "none";
export function dueState(utc: Date | string | null | undefined, now = new Date()): DueState {
  if (!utc) return "none";
  const d = dayDiff(utc, now);
  return d < 0 ? "overdue" : d === 0 ? "today" : d <= 2 ? "soon" : "later";
}

/** Monday 00:00 Toronto of the current week, as a day key. */
export function weekStartKey(now = new Date()): string {
  const key = torontoDayKey(now);
  return addDays(key, -weekdayMon(key));
}
