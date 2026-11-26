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

/** Quiet hours (shared with the reminder function). */
export { inQuietHours } from "../../supabase/functions/_shared/rules";
