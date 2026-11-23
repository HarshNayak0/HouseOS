import { z } from "zod";
import { PERSON_COLOR_NAMES } from "./colors";
import { ROOM_IDS } from "@/scene/config";

export const displayNameSchema = z.string().trim().min(1, "Enter a name").max(40, "40 characters at most");
export const personColorSchema = z.enum(PERSON_COLOR_NAMES as [string, ...string[]]);

export const memberProfileSchema = z.object({ display_name: displayNameSchema, color: personColorSchema });

const labelSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(30),
  ml: z.string().trim().max(30),
});
/** Room label overrides stored in household_settings.room_labels. */
export const roomLabelsSchema = z.partialRecord(z.enum(ROOM_IDS), labelSchema);

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:\d\d)?$/, "Use HH:MM");
export const quietHoursSchema = z.object({ quiet_start: time, quiet_end: time });

/** Invite tokens are 48 hex characters. */
export const inviteTokenSchema = z.string().regex(/^[0-9a-f]{48}$/);

/** Browser PushSubscription.toJSON() shape. */
export const pushSubscriptionSchema = z.object({
  endpoint: z.url().startsWith("https://"),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

/** Is `time` (HH:MM) inside quiet hours? Handles windows that cross midnight (23:00–07:00). */
export function inQuietHours(hhmm: string, start: string, end: string): boolean {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const t = m(hhmm),
    s = m(start),
    e = m(end);
  if (s === e) return false;
  return s < e ? t >= s && t < e : t >= s || t < e;
}
