/**
 * Pure helpers for the `vault` Edge Function: envelope encryption, PIN hashing, lockouts and session
 * tokens. Web Crypto only, so the same code runs in Deno and in the Node unit tests.
 *
 * Envelope encryption: each item gets a fresh 256-bit data key (DEK). The item's fields are encrypted
 * with the DEK (AES-256-GCM, the item id as associated data so ciphertexts can't be swapped between
 * items). The DEK is then encrypted ("wrapped") with the master key, which lives only in the function's
 * secrets. The database holds ciphertext and wrapped keys, never a usable key.
 */

import { aesKey, b64, b64url, dec, enc, hmacSha256, keyBytes, open, seal, timingSafeEqual, unb64 } from "../_shared/crypto.ts";
export { b64, b64url, unb64, unb64url } from "../_shared/crypto.ts";

const masterBytes = (masterB64: string) => keyBytes(masterB64, "VAULT_MASTER_KEY");
const sealB64 = async (key: CryptoKey, plain: Uint8Array, aad: string) => b64(await seal(key, plain, aad));
const openB64 = (key: CryptoKey, sealed: string, aad: string) => open(key, unb64(sealed), aad);

/** Encrypt an item's fields. Returns the wrapped data key and the ciphertext (both base64). */
export async function encryptItem(itemId: string, fields: Record<string, string>, masterB64: string) {
  const dek = crypto.getRandomValues(new Uint8Array(32));
  const ciphertext = await sealB64(await aesKey(dek), enc.encode(JSON.stringify(fields)), `item:${itemId}`);
  const wrapped_dek = await sealB64(await aesKey(masterBytes(masterB64)), dek, `dek:${itemId}`);
  dek.fill(0);
  return { wrapped_dek, ciphertext, key_version: 1 };
}

export async function decryptItem(itemId: string, row: { wrapped_dek: string; ciphertext: string }, masterB64: string): Promise<Record<string, string>> {
  const dek = await openB64(await aesKey(masterBytes(masterB64)), row.wrapped_dek, `dek:${itemId}`);
  const plain = await openB64(await aesKey(dek), row.ciphertext, `item:${itemId}`);
  dek.fill(0);
  return JSON.parse(dec.decode(plain));
}

/**
 * PIN hash: PBKDF2-SHA256 over HMAC(pepper, pin), with a per-person salt. The pepper comes from the
 * master key, so a copy of the database alone can't be brute-forced (a 6-digit PIN has only a million
 * possibilities).
 */
export async function hashPin(pin: string, saltB64: string, masterB64: string, iterations = 150_000) {
  const peppered = await hmacSha256(masterBytes(masterB64), `veedu-pin:${pin}`);
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

/** The pause after wrong try number `n` (mirrors the SQL in vault_pin_try): 5th 15 min, 10th 1 h, 15th on 24 h. */
export function lockoutMs(n: number): number {
  if (n >= 15) return 24 * 3_600_000;
  if (n === 10) return 3_600_000;
  if (n > 0 && n % 5 === 0) return 15 * 60_000;
  return 0;
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
