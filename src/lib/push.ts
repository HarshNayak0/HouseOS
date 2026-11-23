"use client";

import { pushSubscriptionSchema } from "./schemas";
import { supabaseBrowser } from "./supabase/browser";

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export type PushStatus =
  | "unsupported" // browser can't do Web Push
  | "ios-needs-home-screen" // iPhone/iPad: only works from the installed app (iOS 16.4+)
  | "not-configured" // no VAPID key yet
  | "denied"
  | "off"
  | "on";

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export async function getPushStatus(): Promise<PushStatus> {
  if (isIOS() && !isStandalone()) return "ios-needs-home-screen";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (!VAPID_PUBLIC_KEY) return "not-configured";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Ask permission, subscribe this device and save the subscription (RLS: only you can see it). */
export async function enablePush(householdId: string, memberId: string): Promise<PushStatus> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }));
  const parsed = pushSubscriptionSchema.parse(sub.toJSON());
  const sb = supabaseBrowser();
  if (!sb) return "not-configured";
  const row = {
    household_id: householdId,
    member_id: memberId,
    endpoint: parsed.endpoint,
    p256dh: parsed.keys.p256dh,
    auth: parsed.keys.auth,
    user_agent: navigator.userAgent.slice(0, 200),
  };
  // Insert; if this device is already registered, refresh its keys instead.
  // (An upsert would also try to update member_id/household_id, which clients may not change.)
  const { error } = await sb.from("push_subscriptions").insert(row);
  if (error?.code === "23505") {
    const { error: upd } = await sb
      .from("push_subscriptions")
      .update({ p256dh: row.p256dh, auth: row.auth, user_agent: row.user_agent })
      .eq("endpoint", row.endpoint);
    if (upd) throw new Error(upd.message);
  } else if (error) {
    throw new Error(error.message);
  }
  return "on";
}

export async function disablePush(): Promise<PushStatus> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabaseBrowser()?.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
  }
  return "off";
}
