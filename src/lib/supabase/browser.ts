"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, authEnabled } from "./config";

let client: SupabaseClient | null = null;

/** The browser Supabase client (one per tab). Null when sign-in isn't configured. */
export function supabaseBrowser(): SupabaseClient | null {
  if (!authEnabled) return null;
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}
