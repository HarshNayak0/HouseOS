"use client";

/** Calls one of our Supabase Edge Functions with the signed-in person's session. */
import { supabaseBrowser } from "./supabase/browser";
import { SUPABASE_URL } from "./supabase/config";

export class FunctionError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function callFunction<T = unknown>(
  fn: "calendar" | "recipes" | "vault",
  path: string,
  body: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Promise<T> {
  const { data } = (await supabaseBrowser()?.auth.getSession()) ?? { data: { session: null } };
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}/${path}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new FunctionError(res.status, j.error ?? `${fn} error ${res.status}`);
  return j as T;
}
