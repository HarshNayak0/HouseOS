/**
 * Pure helpers for the `calendar` Edge Function (Web Crypto + data mapping only; unit-tested in Node).
 */

import { aesKey, b64, b64url, dec, enc, hmacSha256, keyBytes, open, seal, timingSafeEqual, unb64, unb64url } from "../_shared/crypto.ts";
export { allowedOrigin } from "../_shared/http.ts";

export const TZ = "America/Toronto";

const aesFrom = (keyB64: string) => aesKey(keyBytes(keyB64, "TOKEN_ENCRYPTION_KEY"));

/** Encrypt a secret (refresh token) with AES-256-GCM. Output: "v1:" + base64(iv | ciphertext). */
export async function encryptSecret(plain: string, keyB64: string): Promise<string> {
  return "v1:" + b64(await seal(await aesFrom(keyB64), enc.encode(plain)));
}

export async function decryptSecret(stored: string, keyB64: string): Promise<string> {
  if (!stored.startsWith("v1:")) throw new Error("Unknown token format");
  return dec.decode(await open(await aesFrom(keyB64), unb64(stored.slice(3))));
}

const hmac = (data: string, keyB64: string) => hmacSha256(unb64(keyB64), data);

export interface OAuthState {
  member: string;
  exp: number; // epoch ms
  to: string; // path to return to in the app
}

/** Signed OAuth `state` so the callback knows which member started the connection (and it can't be forged). */
export async function signState(s: OAuthState, keyB64: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(s)));
  return body + "." + b64url(await hmac(body, keyB64));
}

export async function verifyState(token: string, keyB64: string, now = Date.now()): Promise<OAuthState | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  if (!timingSafeEqual(b64url(await hmac(body, keyB64)), sig)) return null;
  try {
    const s = JSON.parse(dec.decode(unb64url(body))) as OAuthState;
    if (typeof s.member !== "string" || typeof s.exp !== "number" || s.exp < now) return null;
    if (typeof s.to !== "string" || !s.to.startsWith("/") || s.to.startsWith("//")) s.to = "/settings";
    return s;
  } catch {
    return null;
  }
}

/** UTC instant for 00:00 Toronto on a YYYY-MM-DD day (handles DST). */
export function torontoMidnight(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  for (const off of [4, 5]) {
    const c = new Date(Date.UTC(y, m - 1, d, off, 0));
    const hh = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(c);
    if (hh === "00") return c;
  }
  return new Date(Date.UTC(y, m - 1, d, 5, 0));
}

export interface GoogleEvent {
  id: string;
  status?: string;
  etag?: string;
  summary?: string;
  location?: string;
  description?: string;
  htmlLink?: string;
  recurringEventId?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}

export interface CacheRow {
  google_event_id: string;
  etag: string | null;
  summary: string | null;
  location: string | null;
  description: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  html_link: string | null;
  recurring_event_id: string | null;
}

/** Google event → cache row (null for cancelled/unusable events, which should be removed). */
export function toCacheRow(e: GoogleEvent): CacheRow | null {
  if (e.status === "cancelled" || !e.start || !e.end) return null;
  const allDay = !!e.start.date && !e.start.dateTime;
  const starts = allDay ? torontoMidnight(e.start.date!) : new Date(e.start.dateTime!);
  const ends = allDay ? torontoMidnight(e.end.date ?? e.start.date!) : new Date(e.end.dateTime ?? e.start.dateTime!);
  if (isNaN(starts.getTime()) || isNaN(ends.getTime())) return null;
  return {
    google_event_id: e.id,
    etag: e.etag ?? null,
    summary: e.summary?.slice(0, 300) ?? "(busy)",
    location: e.location?.slice(0, 300) ?? null,
    description: e.description?.slice(0, 1000) ?? null,
    starts_at: starts.toISOString(),
    ends_at: ends.toISOString(),
    all_day: allDay,
    html_link: e.htmlLink ?? null,
    recurring_event_id: e.recurringEventId ?? null,
  };
}

export interface EventInput {
  summary: string;
  location?: string | null;
  description?: string | null;
  all_day: boolean;
  /** all-day: YYYY-MM-DD (start) and exclusive end date; timed: ISO instants */
  start: string;
  end: string;
}

/** App event → Google API body. */
export function toGoogleBody(e: EventInput) {
  const base = {
    summary: e.summary.slice(0, 300),
    location: e.location?.slice(0, 300) || undefined,
    description: e.description?.slice(0, 1000) || undefined,
  };
  if (e.all_day) return { ...base, start: { date: e.start }, end: { date: e.end } };
  return { ...base, start: { dateTime: e.start, timeZone: TZ }, end: { dateTime: e.end, timeZone: TZ } };
}

export function validateEventInput(x: unknown): EventInput | string {
  if (!x || typeof x !== "object") return "Missing event";
  const e = x as Record<string, unknown>;
  if (typeof e.summary !== "string" || !e.summary.trim()) return "Give the event a title";
  if (typeof e.all_day !== "boolean") return "Missing all_day";
  if (typeof e.start !== "string" || typeof e.end !== "string") return "Missing start or end";
  if (e.all_day) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.start) || !/^\d{4}-\d{2}-\d{2}$/.test(e.end)) return "Use YYYY-MM-DD for all-day events";
    if (e.end <= e.start) return "End must be after start";
  } else {
    const s = Date.parse(e.start),
      t = Date.parse(e.end);
    if (isNaN(s) || isNaN(t)) return "Bad date";
    if (t <= s) return "End must be after start";
  }
  return {
    summary: e.summary.trim(),
    location: typeof e.location === "string" ? e.location : null,
    description: typeof e.description === "string" ? e.description : null,
    all_day: e.all_day,
    start: e.start,
    end: e.end,
  };
}
