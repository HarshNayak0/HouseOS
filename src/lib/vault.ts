"use client";

/**
 * Client side of the closet vault. The unlock token and the decrypted items live only in memory
 * (never in localStorage or the query cache), and are wiped on lock, on expiry, or on reload.
 */
import { useSyncExternalStore } from "react";
import type { VaultItemInput, VaultSection } from "../../supabase/functions/_shared/vault";
import { compressToWebp } from "./image";
import type { BaseRow } from "./lists/rows";
import { supabaseBrowser } from "./supabase/browser";
import { SUPABASE_URL } from "./supabase/config";

/** What the household can see without unlocking (dashboard, calendar, closet bell). */
export interface VaultItemRow extends BaseRow {
  section: VaultSection;
  label: string;
  renewal_date: string | null;
  has_attachment: boolean;
}

export interface VaultItem {
  id: string;
  section: VaultSection;
  label: string;
  renewal_date: string | null;
  has_attachment: boolean;
  attachment_name: string | null;
  fields: Record<string, string>;
  broken: boolean;
  updated_at: string;
  updated_by: string | null;
  deleted_at: string | null;
}

export interface VaultStatus {
  pin_set: boolean;
  locked_until: string | null;
  passkeys: { id: string; name: string; created_at: string; last_used_at: string | null }[];
  signed_in_recently: boolean;
}

export class VaultError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// ---------- in-memory session ----------
interface Session {
  token: string;
  expiresAt: number;
}
let session: Session | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function setSession(s: Session | null) {
  session = s;
  if (timer) clearTimeout(timer);
  timer = s ? setTimeout(() => lockVault(false), Math.max(0, s.expiresAt - Date.now())) : null;
  emit();
}

export function useVaultSession() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => session,
    () => null,
  );
}

/** Lock now. Tells the server too, unless the session already ran out. */
export function lockVault(tellServer = true) {
  const s = session;
  setSession(null);
  if (tellServer && s) void callVault("lock", {}, s.token).catch(() => {});
}

// mobile browsers pause timers in the background: check the clock when the app comes back
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && session && session.expiresAt <= Date.now()) lockVault(false);
  });
}

// ---------- calls ----------
export async function callVault<T = unknown>(path: string, body: Record<string, unknown> = {}, token = session?.token): Promise<T> {
  const sb = supabaseBrowser();
  const { data } = (await sb?.auth.getSession()) ?? { data: { session: null } };
  const res = await fetch(`${SUPABASE_URL}/functions/v1/vault/${path}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
      ...(token ? { "x-vault-token": token } : {}),
    },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (res.status === 423) {
    setSession(null);
    throw new VaultError(423, "The vault locked itself. Unlock it again");
  }
  if (!res.ok) throw new VaultError(res.status, j.error ?? `Vault error ${res.status}`);
  // every unlocked call slides the 5-minute timer
  if (session && token === session.token) setSession({ ...session, expiresAt: typeof j.expires_at === "string" ? Date.parse(j.expires_at) : Date.now() + 5 * 60_000 });
  return j as T;
}

function started(r: { token: string; expires_at: string }) {
  setSession({ token: r.token, expiresAt: Date.parse(r.expires_at) });
}

export const vaultStatus = () => callVault<VaultStatus>("status");

export async function setPin(pin: string) {
  started(await callVault<{ token: string; expires_at: string }>("pin", { pin }));
}

export async function unlockWithPin(pin: string) {
  started(await callVault<{ token: string; expires_at: string }>("unlock/pin", { pin }));
}

export async function unlockWithPasskey() {
  const { startAuthentication } = await import("@simplewebauthn/browser");
  const optionsJSON = await callVault<Parameters<typeof startAuthentication>[0]["optionsJSON"]>("passkey/auth/options");
  const response = await startAuthentication({ optionsJSON });
  started(await callVault<{ token: string; expires_at: string }>("passkey/auth/verify", { response }));
}

export async function addPasskey(name: string) {
  const { startRegistration } = await import("@simplewebauthn/browser");
  const optionsJSON = await callVault<Parameters<typeof startRegistration>[0]["optionsJSON"]>("passkey/register/options");
  const response = await startRegistration({ optionsJSON });
  await callVault("passkey/register/verify", { response, name });
}

export async function passkeysSupported() {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** A friendly name for the passkey, from the device it's made on. */
export function deviceName() {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return /Pixel/.test(ua) ? "Pixel" : "Android phone";
  if (/Mac OS X/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  return "This device";
}

export const listItems = () => callVault<{ items: VaultItem[] }>("items").then((r) => r.items);
export const saveItem = (item: VaultItemInput) => callVault<{ id: string }>("items/save", { item });
export const deleteItem = (id: string, restore = false) => callVault("items/delete", { id, restore });

/** Upload a manual or document into the private vault bucket through a one-time signed link. */
export async function attachFile(id: string, file: File) {
  const isImage = file.type.startsWith("image/");
  if (!isImage && file.type !== "application/pdf") throw new Error("Only photos and PDFs can be attached");
  const body = isImage ? await compressToWebp(file) : file;
  if (body.size > 5 * 1024 * 1024) throw new Error("Files can be up to 5 MB");
  const { path, token } = await callVault<{ path: string; token: string }>("items/attach/start", { id, type: body.type, size: body.size });
  const { error } = (await supabaseBrowser()?.storage.from("vault-files").uploadToSignedUrl(path, token, body, { contentType: body.type })) ?? {};
  if (error) throw new Error(error.message);
  await callVault("items/attach/finish", { id, path, name: file.name });
}
export const removeFile = (id: string) => callVault("items/attach/remove", { id });
export const fileLink = (id: string) => callVault<{ url: string }>("items/file", { id }).then((r) => r.url);
