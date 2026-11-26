/**
 * Byte encoding and AES-256-GCM helpers shared by the Edge Functions (Web Crypto only, so the same code
 * runs in Deno and in the Node unit tests).
 */
export const enc = new TextEncoder();
export const dec = new TextDecoder();

export const b64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
export const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const b64url = (bytes: Uint8Array) => b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64url = (s: string) => unb64(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));

/** A 32-byte key given as base64 (the form our secrets use). */
export function keyBytes(keyB64: string, name: string): Uint8Array {
  let raw: Uint8Array;
  try {
    raw = unb64(keyB64.trim());
  } catch {
    throw new Error(`${name} isn't valid base64`);
  }
  if (raw.length !== 32) throw new Error(`${name} must be 32 bytes (base64), randomly generated`);
  return raw;
}

export const aesKey = (raw: Uint8Array) => crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);

/** AES-GCM with a random 12-byte IV. Output: iv | ciphertext. `aad` binds the ciphertext to a context. */
export async function seal(key: CryptoKey, plain: Uint8Array, aad?: string): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const params: AesGcmParams = aad === undefined ? { name: "AES-GCM", iv } : { name: "AES-GCM", iv, additionalData: enc.encode(aad) };
  const ct = new Uint8Array(await crypto.subtle.encrypt(params, key, plain as BufferSource));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return out;
}

export async function open(key: CryptoKey, sealed: Uint8Array, aad?: string): Promise<Uint8Array> {
  const iv = sealed.slice(0, 12);
  const params: AesGcmParams = aad === undefined ? { name: "AES-GCM", iv } : { name: "AES-GCM", iv, additionalData: enc.encode(aad) };
  return new Uint8Array(await crypto.subtle.decrypt(params, key, sealed.slice(12)));
}

export async function hmacSha256(keyRaw: Uint8Array, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", keyRaw as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
