// Supabase Edge Function: Google Calendar for Veedu.
//   POST /calendar/start       (signed in)  → { url } to Google's consent screen
//   GET  /calendar/callback    (Google)     → stores the encrypted refresh token, redirects to the app
//   POST /calendar/sync        (anyone)     → incremental sync of every connected calendar (throttled)
//   POST /calendar/event       (signed in)  → create / update / delete an event (two-way sync)
//   POST /calendar/us          (signed in)  → create the shared "Us" calendar and share it with the partner
//   POST /calendar/disconnect  (signed in)  → revoke Google access and remove the cached calendars
// Google secrets live only in this function's secrets. Deployed with no JWT check; the endpoints that
// act for a person verify their Supabase session themselves.
import { corsHeaders } from "../_shared/http.ts";
import { APP_URL, PREVIEW_ORIGIN, caller, db, env, errorResponse, HttpError, type Caller as Member } from "../_shared/server.ts";
import {
  decryptSecret,
  encryptSecret,
  signState,
  toCacheRow,
  toGoogleBody,
  TZ,
  validateEventInput,
  verifyState,
  type GoogleEvent,
} from "./logic.ts";

const GOOGLE = "https://www.googleapis.com/calendar/v3";
const SCOPE = "openid email https://www.googleapis.com/auth/calendar";
const CALLBACK = `${env("SUPABASE_URL")}/functions/v1/calendar/callback`;

interface Account {
  id: string;
  household_id: string;
  member_id: string;
  google_email: string;
  refresh_token_enc: string;
  status: string;
}
interface Source {
  id: string;
  household_id: string;
  account_id: string;
  member_id: string;
  google_calendar_id: string;
  access_role: string;
  is_us_calendar: boolean;
  visible: boolean;
  sync_token: string | null;
  last_synced_at: string | null;
  full_synced_at: string | null;
}

// ---------- auth ----------
// ---------- Google ----------
async function accessToken(acc: Account): Promise<string> {
  const refresh = await decryptSecret(acc.refresh_token_enc, env("TOKEN_ENCRYPTION_KEY"));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"), refresh_token: refresh, grant_type: "refresh_token" }),
  });
  const j = await res.json();
  if (!res.ok) {
    const revoked = j.error === "invalid_grant";
    await db.from("calendar_accounts").update({ status: revoked ? "revoked" : "error", last_error: String(j.error_description ?? j.error ?? res.status).slice(0, 200) }).eq("id", acc.id);
    throw new HttpError(502, revoked ? "Google access was removed. Reconnect the calendar in Settings." : "Couldn't reach Google");
  }
  if (acc.status !== "ok") await db.from("calendar_accounts").update({ status: "ok", last_error: null }).eq("id", acc.id);
  return j.access_token as string;
}

async function g<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path.startsWith("http") ? path : GOOGLE + path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (res.status === 204) return undefined as T;
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(res.status, j?.error?.message ?? `Google error ${res.status}`);
  return j as T;
}

// ---------- calendars list ----------
async function refreshCalendarList(acc: Account, token: string) {
  const list = await g<{ items: { id: string; summary: string; backgroundColor?: string; accessRole: string; primary?: boolean }[] }>(
    token,
    "/users/me/calendarList?minAccessRole=reader&maxResults=250",
  );
  const { data: existing } = await db.from("calendar_sources").select("google_calendar_id").eq("account_id", acc.id);
  const known = new Set((existing ?? []).map((s) => s.google_calendar_id));
  const { data: usSources } = await db.from("calendar_sources").select("google_calendar_id").eq("household_id", acc.household_id).eq("is_us_calendar", true);
  const usIds = new Set((usSources ?? []).map((s) => s.google_calendar_id));
  for (const c of list.items ?? []) {
    const row = {
      household_id: acc.household_id,
      account_id: acc.id,
      member_id: acc.member_id,
      google_calendar_id: c.id,
      summary: c.summary?.slice(0, 120) ?? c.id,
      color: c.backgroundColor ?? null,
      access_role: c.accessRole,
      is_primary: !!c.primary,
      is_us_calendar: usIds.has(c.id),
    };
    if (known.has(c.id)) await db.from("calendar_sources").update(row).eq("account_id", acc.id).eq("google_calendar_id", c.id);
    else await db.from("calendar_sources").insert({ ...row, visible: !!c.primary || usIds.has(c.id) });
  }
  // calendars removed from Google
  const ids = new Set((list.items ?? []).map((c) => c.id));
  for (const id of known) if (!ids.has(id)) await db.from("calendar_sources").delete().eq("account_id", acc.id).eq("google_calendar_id", id);
}

// ---------- event sync ----------
const DAY = 86_400_000;

async function syncSource(src: Source, token: string) {
  const full = !src.sync_token || !src.full_synced_at || Date.now() - Date.parse(src.full_synced_at) > 7 * DAY;
  const base = `/calendars/${encodeURIComponent(src.google_calendar_id)}/events?singleEvents=true&showDeleted=true&maxResults=2500`;
  let url = full
    ? `${base}&timeMin=${new Date(Date.now() - 60 * DAY).toISOString()}&timeMax=${new Date(Date.now() + 400 * DAY).toISOString()}`
    : `${base}&syncToken=${encodeURIComponent(src.sync_token!)}`;
  let nextSync: string | undefined;
  const seen = new Set<string>();
  for (let page = 0; page < 20; page++) {
    let j: { items?: GoogleEvent[]; nextPageToken?: string; nextSyncToken?: string };
    try {
      j = await g(token, url);
    } catch (e) {
      if (e instanceof HttpError && e.status === 410) {
        // sync token expired: start again
        await db.from("calendar_sources").update({ sync_token: null, full_synced_at: null }).eq("id", src.id);
        return syncSource({ ...src, sync_token: null, full_synced_at: null }, token);
      }
      throw e;
    }
    const upserts = [];
    const removals: string[] = [];
    for (const e of j.items ?? []) {
      seen.add(e.id);
      const row = toCacheRow(e);
      if (row) upserts.push({ ...row, household_id: src.household_id, source_id: src.id });
      else removals.push(e.id);
    }
    if (upserts.length) await db.from("calendar_event_cache").upsert(upserts, { onConflict: "source_id,google_event_id" });
    if (removals.length) await db.from("calendar_event_cache").delete().eq("source_id", src.id).in("google_event_id", removals);
    if (j.nextPageToken) url = (full ? `${base}&timeMin=${new Date(Date.now() - 60 * DAY).toISOString()}&timeMax=${new Date(Date.now() + 400 * DAY).toISOString()}` : `${base}&syncToken=${encodeURIComponent(src.sync_token!)}`) + `&pageToken=${encodeURIComponent(j.nextPageToken)}`;
    else {
      nextSync = j.nextSyncToken;
      break;
    }
  }
  if (full) {
    // anything we had that Google no longer lists in the window is gone
    const { data: cached } = await db.from("calendar_event_cache").select("google_event_id").eq("source_id", src.id);
    const stale = (cached ?? []).map((c) => c.google_event_id).filter((id) => !seen.has(id));
    for (let i = 0; i < stale.length; i += 200) await db.from("calendar_event_cache").delete().eq("source_id", src.id).in("google_event_id", stale.slice(i, i + 200));
  }
  const now = new Date().toISOString();
  await db.from("calendar_sources").update({ sync_token: nextSync ?? src.sync_token, last_synced_at: now, ...(full ? { full_synced_at: now } : {}) }).eq("id", src.id);
}

async function syncAll(force: boolean, householdId?: string) {
  let q = db.from("calendar_accounts").select("*").is("deleted_at", null).neq("status", "revoked");
  if (householdId) q = q.eq("household_id", householdId);
  const { data: accounts } = await q;
  let synced = 0;
  const errors: string[] = [];
  for (const acc of (accounts ?? []) as Account[]) {
    try {
      const token = await accessToken(acc);
      await refreshCalendarList(acc, token);
      const { data: sources } = await db.from("calendar_sources").select("*").eq("account_id", acc.id).eq("visible", true);
      for (const s of (sources ?? []) as Source[]) {
        if (!force && s.last_synced_at && Date.now() - Date.parse(s.last_synced_at) < 60_000) continue;
        await syncSource(s, token);
        synced++;
      }
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  return { synced, errors };
}

// ---------- the shared "Us" calendar ----------
async function linkUsCalendarFor(acc: Account, token: string) {
  const { data: us } = await db.from("calendar_sources").select("google_calendar_id").eq("household_id", acc.household_id).eq("is_us_calendar", true).neq("account_id", acc.id).limit(1).maybeSingle();
  if (!us) return;
  try {
    await g(token, "/users/me/calendarList", { method: "POST", body: JSON.stringify({ id: us.google_calendar_id }) });
  } catch (e) {
    if (!(e instanceof HttpError && e.status === 409)) throw e; // already in the list
  }
}

async function createUs(me: Member) {
  const { data: existing } = await db.from("calendar_sources").select("id").eq("household_id", me.household_id).eq("is_us_calendar", true).limit(1);
  if (existing?.length) throw new HttpError(409, "The Us calendar already exists");
  const { data: acc } = await db.from("calendar_accounts").select("*").eq("member_id", me.id).maybeSingle();
  if (!acc) throw new HttpError(400, "Connect your Google Calendar first");
  const token = await accessToken(acc as Account);
  const cal = await g<{ id: string }>(token, "/calendars", { method: "POST", body: JSON.stringify({ summary: "Us", description: "Shared by Veedu", timeZone: TZ }) });
  await db.from("calendar_sources").insert({
    household_id: me.household_id,
    account_id: acc.id,
    member_id: me.id,
    google_calendar_id: cal.id,
    summary: "Us",
    access_role: "owner",
    is_us_calendar: true,
    visible: true,
  });
  // share it with the partner (their Google calendar email if connected, else their sign-in email)
  const { data: partner } = await db.from("members").select("id, user_id").eq("household_id", me.household_id).neq("id", me.id).is("deleted_at", null).maybeSingle();
  if (partner) {
    const { data: pAcc } = await db.from("calendar_accounts").select("*").eq("member_id", partner.id).maybeSingle();
    let email = (pAcc as Account | null)?.google_email;
    if (!email) email = (await db.auth.admin.getUserById(partner.user_id)).data.user?.email ?? undefined;
    if (email) {
      await g(token, `/calendars/${encodeURIComponent(cal.id)}/acl?sendNotifications=false`, {
        method: "POST",
        body: JSON.stringify({ role: "writer", scope: { type: "user", value: email } }),
      });
    }
    if (pAcc) {
      const pToken = await accessToken(pAcc as Account);
      await linkUsCalendarFor(pAcc as Account, pToken);
      await refreshCalendarList(pAcc as Account, pToken);
    }
  }
  await syncAll(true, me.household_id);
  return { id: cal.id };
}

// ---------- events ----------
async function writeEvent(me: Member, body: Record<string, unknown>) {
  const op = body.op;
  const { data: src } = await db.from("calendar_sources").select("*").eq("id", String(body.source_id ?? "")).eq("household_id", me.household_id).maybeSingle();
  if (!src) throw new HttpError(404, "Calendar not found");
  if (!["owner", "writer"].includes((src as Source).access_role)) throw new HttpError(403, "That calendar is read-only");
  const { data: acc } = await db.from("calendar_accounts").select("*").eq("id", (src as Source).account_id).maybeSingle();
  if (!acc) throw new HttpError(404, "Calendar account not found");
  const token = await accessToken(acc as Account);
  const path = `/calendars/${encodeURIComponent((src as Source).google_calendar_id)}/events`;
  if (op === "delete") {
    const id = String(body.event_id ?? "");
    try {
      await g(token, `${path}/${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch (e) {
      if (!(e instanceof HttpError && (e.status === 404 || e.status === 410))) throw e;
    }
    await db.from("calendar_event_cache").delete().eq("source_id", (src as Source).id).eq("google_event_id", id);
    return { ok: true };
  }
  const input = validateEventInput(body.event);
  if (typeof input === "string") throw new HttpError(400, input);
  const ev =
    op === "update"
      ? await g<GoogleEvent>(token, `${path}/${encodeURIComponent(String(body.event_id ?? ""))}`, { method: "PATCH", body: JSON.stringify(toGoogleBody(input)) })
      : await g<GoogleEvent>(token, path, { method: "POST", body: JSON.stringify(toGoogleBody(input)) });
  const row = toCacheRow(ev);
  if (row) await db.from("calendar_event_cache").upsert({ ...row, household_id: me.household_id, source_id: (src as Source).id }, { onConflict: "source_id,google_event_id" });
  return { ok: true, event_id: ev.id };
}

// ---------- connect / disconnect ----------
async function start(me: Member, body: Record<string, unknown>) {
  const state = await signState({ member: me.id, exp: Date.now() + 10 * 60_000, to: typeof body.to === "string" ? body.to : "/settings" }, env("TOKEN_ENCRYPTION_KEY"));
  const { data: user } = await db.auth.admin.getUserById(me.user_id);
  const p = new URLSearchParams({
    client_id: env("GOOGLE_CLIENT_ID"),
    redirect_uri: CALLBACK,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  if (user.user?.email) p.set("login_hint", user.user.email);
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${p}` };
}

async function callback(url: URL): Promise<Response> {
  const back = (to: string, result: string) => Response.redirect(`${APP_URL}${to}${to.includes("?") ? "&" : "?"}calendar=${result}`, 302);
  const state = await verifyState(url.searchParams.get("state") ?? "", env("TOKEN_ENCRYPTION_KEY"));
  if (!state) return back("/settings", "error");
  if (url.searchParams.get("error")) return back(state.to, "cancelled");
  const code = url.searchParams.get("code");
  if (!code) return back(state.to, "error");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"), redirect_uri: CALLBACK, grant_type: "authorization_code" }),
  });
  const tok = await res.json();
  if (!res.ok || !tok.refresh_token) return back(state.to, "error");
  const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` } }).then((r) => r.json());
  const { data: m } = await db.from("members").select("id, household_id, user_id").eq("id", state.member).is("deleted_at", null).maybeSingle();
  if (!m) return back("/settings", "error");
  const enc = await encryptSecret(tok.refresh_token, env("TOKEN_ENCRYPTION_KEY"));
  const { data: acc, error } = await db
    .from("calendar_accounts")
    .upsert(
      { household_id: m.household_id, member_id: m.id, google_email: String(info.email ?? "unknown"), refresh_token_enc: enc, status: "ok", last_error: null, created_by: m.user_id, deleted_at: null },
      { onConflict: "member_id" },
    )
    .select("*")
    .single();
  if (error || !acc) return back(state.to, "error");
  try {
    await linkUsCalendarFor(acc as Account, tok.access_token);
    await refreshCalendarList(acc as Account, tok.access_token);
    await syncAll(true, m.household_id);
  } catch {
    /* first sync will be retried by the schedule */
  }
  return back(state.to, "connected");
}

async function disconnect(me: Member) {
  const { data: acc } = await db.from("calendar_accounts").select("*").eq("member_id", me.id).maybeSingle();
  if (!acc) return { ok: true };
  try {
    const refresh = await decryptSecret((acc as Account).refresh_token_enc, env("TOKEN_ENCRYPTION_KEY"));
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, { method: "POST" });
  } catch {
    /* already revoked */
  }
  await db.from("calendar_accounts").delete().eq("id", (acc as Account).id); // cascades to sources + cached events
  return { ok: true };
}

// ---------- router ----------
Deno.serve(async (req) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^.*\/calendar/, "") || "/";
  const cors = corsHeaders(req.headers.get("Origin"), APP_URL, "", PREVIEW_ORIGIN);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
  try {
    if (!env("GOOGLE_CLIENT_ID") || !env("GOOGLE_CLIENT_SECRET") || !env("TOKEN_ENCRYPTION_KEY")) throw new HttpError(503, "Calendar isn't set up yet");
    if (route === "/callback" && req.method === "GET") return await callback(url);
    if (req.method !== "POST") throw new HttpError(405, "Use POST");
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    switch (route) {
      case "/sync": {
        // signed in → sync this household now; otherwise (the schedule) → everyone, throttled
        let household: string | undefined;
        if (req.headers.get("Authorization")) household = (await caller(req).catch(() => null))?.household_id;
        return json(await syncAll(false, household));
      }
      case "/start":
        return json(await start(await caller(req), body));
      case "/event":
        return json(await writeEvent(await caller(req), body));
      case "/us":
        return json(await createUs(await caller(req)));
      case "/disconnect":
        return json(await disconnect(await caller(req)));
      default:
        throw new HttpError(404, "Not found");
    }
  } catch (e) {
    return errorResponse(e, cors);
  }
});
