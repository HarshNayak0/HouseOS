import { sendNotification, setVapidDetails } from "web-push";
import { supabaseServer } from "@/lib/supabase/server";

/** Sends a test notification to the signed-in person's own devices. */
export async function POST() {
  const sb = await supabaseServer();
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    priv = process.env.VAPID_PRIVATE_KEY,
    subject = process.env.VAPID_SUBJECT;
  if (!sb || !pub || !priv || !subject) return Response.json({ error: "Notifications aren't set up yet" }, { status: 503 });
  const { data: claims } = await sb.auth.getClaims();
  if (!claims?.claims?.sub) return Response.json({ error: "Not signed in" }, { status: 401 });

  // RLS: only this person's own subscriptions are visible.
  const { data: subs, error } = await sb.from("push_subscriptions").select("id, endpoint, p256dh, auth").is("deleted_at", null);
  if (error) return Response.json({ error: "Couldn't load your devices" }, { status: 500 });
  if (!subs?.length) return Response.json({ error: "Turn on notifications on this device first" }, { status: 400 });

  setVapidDetails(subject, pub, priv);
  const payload = JSON.stringify({ title: "Veedu", body: "Notifications are working 🪔", url: "/settings", tag: "test" });
  let sent = 0;
  for (const s of subs) {
    try {
      await sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await sb.from("push_subscriptions").delete().eq("id", s.id); // device unsubscribed
    }
  }
  return sent ? Response.json({ sent }) : Response.json({ error: "No device accepted the notification" }, { status: 502 });
}
