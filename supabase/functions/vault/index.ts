// The `vault` Edge Function: unlock by passkey or PIN, then read and write encrypted vault items.
// Secrets in, secrets out: nothing here is ever logged, and errors never echo what was sent.
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "npm:@simplewebauthn/server@14.0.3";
import { allowedOrigin, corsHeaders } from "../_shared/http.ts";
import { APP_URL, PREVIEW_ORIGIN, caller, db, env, errorResponse, HttpError, type Caller as Me } from "../_shared/server.ts";
import { TZ } from "../_shared/tz.ts";
import { pinProblem, validateVaultItem } from "../_shared/vault.ts";
import {
  b64url,
  decryptItem,
  encryptItem,
  hashPin,
  lockoutMs,
  newSalt,
  newToken,
  SESSION_IDLE_MS,
  SESSION_MAX_MS,
  sha256,
  signedInRecently,
  unb64url,
  verifyPin,
} from "./logic.ts";

const MASTER = () => {
  const k = env("VAULT_MASTER_KEY");
  if (!k) throw new HttpError(503, "The vault isn't set up yet (VAULT_MASTER_KEY is missing)");
  return k;
};
const FILES = "vault-files";

// ---------- unlock sessions ----------
async function openSession(m: Me) {
  const token = newToken();
  const now = Date.now();
  await db.from("vault_sessions").delete().eq("member_id", m.id).lt("expires_at", new Date(now).toISOString());
  await db.from("vault_sessions").insert({
    token_hash: await sha256(token),
    member_id: m.id,
    household_id: m.household_id,
    expires_at: new Date(now + SESSION_IDLE_MS).toISOString(),
    hard_expires_at: new Date(now + SESSION_MAX_MS).toISOString(),
  });
  return { token, expires_at: new Date(now + SESSION_IDLE_MS).toISOString() };
}

/** The caller must hold an unlocked session; each use slides the 5-minute idle timer. */
async function requireUnlocked(req: Request, m: Me) {
  const token = req.headers.get("x-vault-token") ?? "";
  if (!token) throw new HttpError(423, "Locked");
  const hash = await sha256(token);
  const { data: s } = await db.from("vault_sessions").select("*").eq("token_hash", hash).eq("member_id", m.id).maybeSingle();
  const now = Date.now();
  if (!s || Date.parse(s.expires_at) < now || Date.parse(s.hard_expires_at) < now) {
    if (s) await db.from("vault_sessions").delete().eq("token_hash", hash);
    throw new HttpError(423, "Locked");
  }
  const expires = new Date(Math.min(now + SESSION_IDLE_MS, Date.parse(s.hard_expires_at))).toISOString();
  await db.from("vault_sessions").update({ expires_at: expires }).eq("token_hash", hash);
  return expires;
}

async function status(m: Me) {
  const { data: pin } = await db.from("vault_pins").select("failed_attempts, locked_until").eq("member_id", m.id).maybeSingle();
  const { data: keys } = await db.from("webauthn_credentials").select("id, name, created_at, last_used_at").eq("member_id", m.id).order("created_at");
  return {
    pin_set: !!pin,
    locked_until: pin?.locked_until && Date.parse(pin.locked_until) > Date.now() ? pin.locked_until : null,
    passkeys: keys ?? [],
    signed_in_recently: signedInRecently(m.claims, Date.now() / 1000),
  };
}

// ---------- PIN ----------
async function setPin(req: Request, m: Me, body: Record<string, unknown>) {
  const problem = pinProblem(body.pin);
  if (problem) throw new HttpError(400, problem);
  const { data: existing } = await db.from("vault_pins").select("member_id").eq("member_id", m.id).maybeSingle();
  // first PIN, or a forgotten one: needs a fresh Google sign-in. Changing it: needs the vault unlocked.
  if (existing) {
    const unlocked = await requireUnlocked(req, m).then(() => true, () => false);
    if (!unlocked && !signedInRecently(m.claims, Date.now() / 1000)) throw new HttpError(403, "To reset your PIN, sign out and sign in again first");
  } else if (!signedInRecently(m.claims, Date.now() / 1000)) {
    throw new HttpError(403, "To set up the vault, sign out and sign in again first (it checks it's really you)");
  }
  const salt = newSalt();
  const pin_hash = await hashPin(body.pin as string, salt, MASTER());
  await db.from("vault_pins").upsert({ member_id: m.id, pin_hash, salt, failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() });
  await db.from("vault_sessions").delete().eq("member_id", m.id); // other devices must unlock again
  return openSession(m);
}

async function unlockPin(m: Me, body: Record<string, unknown>) {
  const { data: p } = await db.from("vault_pins").select("salt, pin_hash, locked_until").eq("member_id", m.id).maybeSingle();
  if (!p) throw new HttpError(400, "Set a PIN first");
  const paused = (until: string | null) =>
    new HttpError(429, `Too many tries. The PIN works again after ${until ? new Date(until).toLocaleString("en-CA", { timeZone: TZ, weekday: "short", hour: "numeric", minute: "2-digit" }) : "a while"}, or use your passkey`);
  // count the try first (atomically), then check the PIN
  const { data: attempt } = await db.rpc("vault_pin_try", { p_member: m.id });
  if (attempt === null || attempt === undefined) throw paused(p.locked_until);
  const ok = typeof body.pin === "string" && /^\d{6}$/.test(body.pin) && (await verifyPin(body.pin, p.salt, p.pin_hash, MASTER()));
  if (!ok) {
    const n = Number(attempt);
    const lock = lockoutMs(n);
    if (lock) throw new HttpError(429, `Wrong PIN. The PIN is paused for ${lock >= 86_400_000 ? "24 hours" : lock >= 3_600_000 ? "an hour" : "15 minutes"}. Your passkey still works`);
    const left = 5 - (n % 5);
    throw new HttpError(401, `Wrong PIN. ${left} ${left === 1 ? "try" : "tries"} left before a pause`);
  }
  await db.from("vault_pins").update({ failed_attempts: 0, locked_until: null }).eq("member_id", m.id);
  return openSession(m);
}

// ---------- passkeys ----------
function rp(origin: string) {
  return { rpID: new URL(origin).hostname, origin };
}

async function passkeyRegisterOptions(req: Request, m: Me, origin: string) {
  await requireUnlocked(req, m);
  const { data: keys } = await db.from("webauthn_credentials").select("credential_id, transports").eq("member_id", m.id);
  const opts = await generateRegistrationOptions({
    rpName: "Veedu",
    rpID: rp(origin).rpID,
    userName: m.display_name,
    userDisplayName: m.display_name,
    userID: new TextEncoder().encode(m.id),
    attestationType: "none",
    excludeCredentials: (keys ?? []).map((k) => ({ id: k.credential_id, transports: k.transports })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
  });
  await db.from("vault_challenges").delete().eq("member_id", m.id).eq("kind", "register");
  await db.from("vault_challenges").insert({ member_id: m.id, kind: "register", challenge: opts.challenge, expires_at: new Date(Date.now() + 5 * 60_000).toISOString() });
  return opts;
}

async function takeChallenge(m: Me, kind: string) {
  const { data } = await db.from("vault_challenges").select("id, challenge, expires_at").eq("member_id", m.id).eq("kind", kind).order("expires_at", { ascending: false }).limit(1).maybeSingle();
  if (!data || Date.parse(data.expires_at) < Date.now()) throw new HttpError(400, "That took too long. Try again");
  await db.from("vault_challenges").delete().eq("id", data.id);
  return data.challenge as string;
}

async function passkeyRegisterVerify(req: Request, m: Me, origin: string, body: Record<string, unknown>) {
  await requireUnlocked(req, m);
  const expectedChallenge = await takeChallenge(m, "register");
  const { rpID } = rp(origin);
  // deno-lint-ignore no-explicit-any
  const v = await verifyRegistrationResponse({ response: body.response as any, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true }).catch(() => null);
  if (!v?.verified) throw new HttpError(400, "Couldn't save that passkey");
  const c = v.registrationInfo.credential;
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 60) : "Passkey";
  const { error } = await db.from("webauthn_credentials").insert({ member_id: m.id, credential_id: c.id, public_key: b64url(c.publicKey), counter: c.counter, transports: c.transports ?? [], name });
  if (error) throw new HttpError(409, "That passkey is already saved");
  return { ok: true };
}

async function passkeyAuthOptions(m: Me, origin: string) {
  const { data: keys } = await db.from("webauthn_credentials").select("credential_id, transports").eq("member_id", m.id);
  if (!keys?.length) throw new HttpError(400, "No passkey on this account yet");
  const opts = await generateAuthenticationOptions({ rpID: rp(origin).rpID, userVerification: "required", allowCredentials: keys.map((k) => ({ id: k.credential_id, transports: k.transports })) });
  await db.from("vault_challenges").delete().eq("member_id", m.id).eq("kind", "authenticate");
  await db.from("vault_challenges").insert({ member_id: m.id, kind: "authenticate", challenge: opts.challenge, expires_at: new Date(Date.now() + 5 * 60_000).toISOString() });
  return opts;
}

async function passkeyAuthVerify(m: Me, origin: string, body: Record<string, unknown>) {
  const response = body.response as { id?: string } | undefined;
  const expectedChallenge = await takeChallenge(m, "authenticate");
  const { data: key } = await db.from("webauthn_credentials").select("*").eq("member_id", m.id).eq("credential_id", String(response?.id ?? "")).maybeSingle();
  if (!key) throw new HttpError(400, "That passkey isn't linked to your account");
  const v = await verifyAuthenticationResponse({
    // deno-lint-ignore no-explicit-any
    response: response as any,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rp(origin).rpID,
    requireUserVerification: true,
    credential: { id: key.credential_id, publicKey: unb64url(key.public_key), counter: Number(key.counter), transports: key.transports },
  }).catch(() => null);
  if (!v?.verified) throw new HttpError(401, "Passkey check failed");
  await db.from("webauthn_credentials").update({ counter: v.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }).eq("id", key.id);
  // a passkey unlock also clears a PIN pause
  await db.from("vault_pins").update({ failed_attempts: 0, locked_until: null }).eq("member_id", m.id);
  return openSession(m);
}

async function passkeyDelete(req: Request, m: Me, body: Record<string, unknown>) {
  await requireUnlocked(req, m);
  await db.from("webauthn_credentials").delete().eq("member_id", m.id).eq("id", String(body.id ?? ""));
  return { ok: true };
}

// ---------- items ----------
async function log(m: Me, verb: string, id: string, summary: string) {
  await db.from("activity_log").insert({ household_id: m.household_id, actor_id: m.id, verb, entity_type: "vault_items", entity_id: id, summary: summary.slice(0, 200), created_by: m.user_id });
}

async function purgeTrash(m: Me) {
  const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: old } = await db.from("vault_items").select("id").eq("household_id", m.household_id).lt("deleted_at", cutoff);
  if (!old?.length) return;
  const ids = old.map((o) => o.id);
  const { data: files } = await db.from("vault_secrets").select("attachment_path").in("item_id", ids).not("attachment_path", "is", null);
  const paths = (files ?? []).map((f) => f.attachment_path as string);
  if (paths.length) await db.storage.from(FILES).remove(paths);
  await db.from("vault_items").delete().in("id", ids);
}

async function list(req: Request, m: Me) {
  const expires_at = await requireUnlocked(req, m);
  await purgeTrash(m);
  const { data: items } = await db.from("vault_items").select("id, section, label, renewal_date, has_attachment, updated_at, updated_by, deleted_at").eq("household_id", m.household_id);
  const { data: secrets } = await db.from("vault_secrets").select("item_id, wrapped_dek, ciphertext, attachment_name").eq("household_id", m.household_id);
  const byId = new Map((secrets ?? []).map((s) => [s.item_id, s]));
  const out = [];
  for (const it of items ?? []) {
    const s = byId.get(it.id);
    let fields: Record<string, string> = {};
    let broken = false;
    if (s) {
      try {
        fields = await decryptItem(it.id, s, MASTER());
      } catch {
        broken = true; // wrong master key or tampered data: show the item, not the contents
      }
    }
    out.push({ ...it, fields, broken, attachment_name: s?.attachment_name ?? null });
  }
  return { items: out, expires_at };
}

async function save(req: Request, m: Me, body: Record<string, unknown>) {
  await requireUnlocked(req, m);
  const input = validateVaultItem(body.item);
  if (typeof input === "string") throw new HttpError(400, input);
  const now = new Date().toISOString();
  let id = input.id;
  if (id) {
    const { data: row } = await db.from("vault_items").select("id").eq("id", id).eq("household_id", m.household_id).maybeSingle();
    if (!row) throw new HttpError(404, "Not found");
    await db.from("vault_items").update({ label: input.label, renewal_date: input.renewal_date, updated_by: m.user_id, updated_at: now }).eq("id", id);
  } else {
    id = crypto.randomUUID();
    const { error } = await db.from("vault_items").insert({ id, household_id: m.household_id, section: input.section, label: input.label, renewal_date: input.renewal_date, created_by: m.user_id, updated_by: m.user_id });
    if (error) throw new HttpError(500, "Couldn't save");
  }
  const sealed = await encryptItem(id, input.fields, MASTER());
  const { error } = await db.from("vault_secrets").upsert({ item_id: id, household_id: m.household_id, ...sealed, updated_at: now });
  if (error) throw new HttpError(500, "Couldn't save");
  await log(m, input.id ? "vault.update" : "vault.insert", id, `${input.id ? "updated" : "added"} “${input.label}” in the closet`);
  return { id };
}

async function remove(req: Request, m: Me, body: Record<string, unknown>) {
  await requireUnlocked(req, m);
  const restore = body.restore === true;
  const { data, error } = await db.from("vault_items").update({ deleted_at: restore ? null : new Date().toISOString(), updated_by: m.user_id }).eq("id", String(body.id ?? "")).eq("household_id", m.household_id).select("id");
  if (error || !data?.length) throw new HttpError(404, "Not found");
  return { ok: true };
}

const MIME = new Set(["image/webp", "image/jpeg", "image/png", "application/pdf"]);
async function attachStart(req: Request, m: Me, body: Record<string, unknown>) {
  await requireUnlocked(req, m);
  const id = String(body.id ?? "");
  const type = String(body.type ?? "");
  if (!MIME.has(type)) throw new HttpError(400, "Only photos and PDFs can be attached");
  if (Number(body.size) > 5 * 1024 * 1024) throw new HttpError(400, "Files can be up to 5 MB");
  const { data: row } = await db.from("vault_items").select("id").eq("id", id).eq("household_id", m.household_id).maybeSingle();
  if (!row) throw new HttpError(404, "Not found");
  const ext = type === "application/pdf" ? "pdf" : type.split("/")[1].replace("jpeg", "jpg");
  const path = `${m.household_id}/${id}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await db.storage.from(FILES).createSignedUploadUrl(path);
  if (error || !data) throw new HttpError(500, "Couldn't start the upload");
  return { path, token: data.token };
}

async function attachFinish(req: Request, m: Me, body: Record<string, unknown>) {
  await requireUnlocked(req, m);
  const id = String(body.id ?? "");
  const path = String(body.path ?? "");
  if (!path.startsWith(`${m.household_id}/${id}/`)) throw new HttpError(400, "Bad file");
  const { data: s } = await db.from("vault_secrets").select("attachment_path").eq("item_id", id).eq("household_id", m.household_id).maybeSingle();
  if (!s) throw new HttpError(404, "Not found");
  if (s.attachment_path && s.attachment_path !== path) await db.storage.from(FILES).remove([s.attachment_path]);
  const name = String(body.name ?? "Attachment").slice(0, 160);
  await db.from("vault_secrets").update({ attachment_path: path, attachment_name: name }).eq("item_id", id);
  await db.from("vault_items").update({ has_attachment: true, updated_by: m.user_id }).eq("id", id);
  return { ok: true };
}

async function attachRemove(req: Request, m: Me, body: Record<string, unknown>) {
  await requireUnlocked(req, m);
  const id = String(body.id ?? "");
  const { data: s } = await db.from("vault_secrets").select("attachment_path").eq("item_id", id).eq("household_id", m.household_id).maybeSingle();
  if (!s) throw new HttpError(404, "Not found");
  if (s.attachment_path) await db.storage.from(FILES).remove([s.attachment_path]);
  await db.from("vault_secrets").update({ attachment_path: null, attachment_name: null }).eq("item_id", id);
  await db.from("vault_items").update({ has_attachment: false, updated_by: m.user_id }).eq("id", id);
  return { ok: true };
}

async function fileLink(req: Request, m: Me, body: Record<string, unknown>) {
  await requireUnlocked(req, m);
  const { data: s } = await db.from("vault_secrets").select("attachment_path").eq("item_id", String(body.id ?? "")).eq("household_id", m.household_id).maybeSingle();
  if (!s?.attachment_path) throw new HttpError(404, "No file");
  const { data } = await db.storage.from(FILES).createSignedUrl(s.attachment_path, 60);
  if (!data?.signedUrl) throw new HttpError(500, "Couldn't open the file");
  return { url: data.signedUrl };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^.*\/vault/, "") || "/";
  const origin = allowedOrigin(req.headers.get("Origin"), APP_URL, PREVIEW_ORIGIN);
  const cors = corsHeaders(origin, APP_URL, "x-vault-token", PREVIEW_ORIGIN);
  const headers = { ...cors, "Cache-Control": "no-store" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
  try {
    if (req.method !== "POST") throw new HttpError(405, "Use POST");
    if (!origin) throw new HttpError(403, "Open the vault from the Veedu app");
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const m = await caller(req);
    switch (route) {
      case "/status":
        return json(await status(m));
      case "/pin":
        return json(await setPin(req, m, body));
      case "/unlock/pin":
        return json(await unlockPin(m, body));
      case "/passkey/register/options":
        return json(await passkeyRegisterOptions(req, m, origin));
      case "/passkey/register/verify":
        return json(await passkeyRegisterVerify(req, m, origin, body));
      case "/passkey/auth/options":
        return json(await passkeyAuthOptions(m, origin));
      case "/passkey/auth/verify":
        return json(await passkeyAuthVerify(m, origin, body));
      case "/passkey/delete":
        return json(await passkeyDelete(req, m, body));
      case "/lock":
        await db.from("vault_sessions").delete().eq("token_hash", await sha256(req.headers.get("x-vault-token") ?? ""));
        return json({ ok: true });
      case "/items":
        return json(await list(req, m));
      case "/items/save":
        return json(await save(req, m, body));
      case "/items/delete":
        return json(await remove(req, m, body));
      case "/items/attach/start":
        return json(await attachStart(req, m, body));
      case "/items/attach/finish":
        return json(await attachFinish(req, m, body));
      case "/items/attach/remove":
        return json(await attachRemove(req, m, body));
      case "/items/file":
        return json(await fileLink(req, m, body));
      default:
        throw new HttpError(404, "Not found");
    }
  } catch (e) {
    // never log request bodies or decrypted data; only the status reaches the platform logs
    return errorResponse(e, headers, "Something went wrong in the vault");
  }
});
