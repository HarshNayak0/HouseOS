// Setup shared by the Edge Functions (Deno only): environment, the admin database client, errors,
// and "who is calling".
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.119.2";

export const env = (k: string) => Deno.env.get(k) ?? "";
export const APP_URL = env("APP_URL") || "https://veeduos.vercel.app";

/**
 * The project's admin key. Newer projects provide SUPABASE_SECRET_KEYS (JSON: {"default": "sb_secret_…"});
 * older ones provide SUPABASE_SERVICE_ROLE_KEY.
 */
export function adminKey(): string {
  try {
    const keys = JSON.parse(env("SUPABASE_SECRET_KEYS") || "{}") as Record<string, string>;
    const k = keys.default ?? Object.values(keys)[0];
    if (k) return k;
  } catch {
    /* not JSON */
  }
  return env("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");
}

/** The admin client (bypasses RLS: every query here must filter by the caller's household). */
export const db: SupabaseClient = createClient(env("SUPABASE_URL"), adminKey(), { auth: { persistSession: false } });

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface Caller {
  id: string;
  user_id: string;
  household_id: string;
  display_name: string;
  /** the verified JWT claims (sub, amr, …) */
  claims: Record<string, unknown>;
}

/**
 * The signed-in member making this request. The JWT is verified with getClaims: locally against the
 * project's signing keys when they're asymmetric (no network call), otherwise by asking Supabase Auth.
 */
export async function caller(req: Request): Promise<Caller> {
  const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!jwt) throw new HttpError(401, "Not signed in");
  const { data, error } = await db.auth.getClaims(jwt);
  const sub = data?.claims?.sub;
  if (error || typeof sub !== "string") throw new HttpError(401, "Not signed in");
  const { data: m } = await db.from("members").select("id, user_id, household_id, display_name").eq("user_id", sub).is("deleted_at", null).maybeSingle();
  if (!m) throw new HttpError(403, "Not in a household");
  return { ...(m as Omit<Caller, "claims">), claims: data!.claims as Record<string, unknown> };
}

/**
 * The error response. Expected errors (HttpError) carry their own message. For unexpected ones, `hide`
 * replaces the message with a generic one (the vault never echoes internals).
 */
export function errorResponse(e: unknown, headers: Record<string, string>, hide?: string) {
  const status = e instanceof HttpError ? e.status : 500;
  const message = e instanceof HttpError || hide === undefined ? (e as Error).message : hide;
  return Response.json({ error: message }, { status, headers });
}
