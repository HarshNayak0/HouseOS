/**
 * Pure helpers for the `vault` Edge Function: envelope encryption, PIN hashing, lockouts and session
 * tokens. Web Crypto only, so the same code runs in Deno and in the Node unit tests.
 *
 * Envelope encryption: each item gets a fresh 256-bit data key (DEK). The item's fields are encrypted
 * with the DEK (AES-256-GCM, the item id as associated data so ciphertexts can't be swapped between
 * items). The DEK is then encrypted ("wrapped") with the master key, which lives only in the function's
 * secrets. The database holds ciphertext and wrapped keys, never a usable key.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();
export const b64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
export const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const b64url = (bytes: Uint8Array) => b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64url = (s: string) => unb64(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));

function masterBytes(masterB64: string) {
  let raw: Uint8Array;
  try {
    raw = unb64(masterB64.trim());
  } catch {
    throw new Error("VAULT_MASTER_KEY isn't valid base64");
  }
  if (raw.length !== 32) throw new Error("VAULT_MASTER_KEY must be 32 random bytes (base64)");
  return raw;
}

const aes = (raw: Uint8Array) => crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);

async function seal(key: CryptoKey, plain: Uint8Array, aad: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, key, plain as BufferSource));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return b64(out);
}

async function open(key: CryptoKey, sealed: string, aad: string) {
  const all = unb64(sealed);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12), additionalData: enc.encode(aad) }, key, all.slice(12)));
}

/** Encrypt an item's fields. Returns the wrapped data key and the ciphertext (both base64). */
export async function encryptItem(itemId: string, fields: Record<string, string>, masterB64: string) {
  const dek = crypto.getRandomValues(new Uint8Array(32));
  const ciphertext = await seal(await aes(dek), enc.encode(JSON.stringify(fields)), `item:${itemId}`);
  const wrapped_dek = await seal(await aes(masterBytes(masterB64)), dek, `dek:${itemId}`);
  dek.fill(0);
  return { wrapped_dek, ciphertext, key_version: 1 };
}

export async function decryptItem(itemId: string, row: { wrapped_dek: string; ciphertext: string }, masterB64: string): Promise<Record<string, string>> {
  const dek = await open(await aes(masterBytes(masterB64)), row.wrapped_dek, `dek:${itemId}`);
  const plain = await open(await aes(dek), row.ciphertext, `item:${itemId}`);
  dek.fill(0);
  return JSON.parse(dec.decode(plain));
}

/**
 * PIN hash: PBKDF2-SHA256 over HMAC(pepper, pin), with a per-person salt. The pepper comes from the
 * master key, so a copy of the database alone can't be brute-forced (a 6-digit PIN has only a million
 * possibilities).
 */
export async function hashPin(pin: string, saltB64: string, masterB64: string, iterations = 150_000) {
  const pepperKey = await crypto.subtle.importKey("raw", masterBytes(masterB64) as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const peppered = new Uint8Array(await crypto.subtle.sign("HMAC", pepperKey, enc.encode(`veedu-pin:${pin}`)));
  const base = await crypto.subtle.importKey("raw", peppered as BufferSource, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unb64(saltB64) as BufferSource, iterations }, base, 256);
  return `p1:${iterations}:${b64(new Uint8Array(bits))}`;
}

export const newSalt = () => b64(crypto.getRandomValues(new Uint8Array(16)));

export async function verifyPin(pin: string, saltB64: string, stored: string, masterB64: string) {
  const [, it] = stored.split(":");
  const fresh = await hashPin(pin, saltB64, masterB64, Number(it) || 150_000);
  return timingSafeEqual(fresh, stored);
}

export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** The pause after wrong try number `n` (mirrors the SQL in vault_pin_try): 5th 15 min, 10th 1 h, 15th on 24 h. */
export function lockoutMs(n: number): number {
  if (n >= 15) return 24 * 3_600_000;
  if (n === 10) return 3_600_000;
  if (n > 0 && n % 5 === 0) return 15 * 60_000;
  return 0;
}

/** Decode a JWT payload (only after the token has been verified with Supabase Auth). */
export function jwtPayload(jwt: string): Record<string, unknown> {
  try {
    return JSON.parse(dec.decode(unb64url(jwt.split(".")[1] ?? "")));
  } catch {
    return {};
  }
}

/** True when the person signed in (with Google) within the last `maxAgeSec` seconds. */
export function signedInRecently(payload: Record<string, unknown>, nowSec: number, maxAgeSec = 15 * 60): boolean {
  const amr = Array.isArray(payload.amr) ? (payload.amr as { timestamp?: number }[]) : [];
  const latest = Math.max(0, ...amr.map((a) => Number(a?.timestamp) || 0));
  return latest > 0 && nowSec - latest <= maxAgeSec;
}

export const newToken = () => b64url(crypto.getRandomValues(new Uint8Array(32)));

export async function sha256(s: string) {
  return b64(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s))));
}

export const SESSION_IDLE_MS = 5 * 60_000;
export const SESSION_MAX_MS = 30 * 60_000;

/** Allowed browser origins (CORS) — also the origins a passkey may come from. */
export function allowedOrigin(origin: string | null, appUrl: string): string | null {
  if (!origin) return null;
  if (origin === appUrl) return origin;
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return origin;
  return null;
}
