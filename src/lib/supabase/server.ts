import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL, authEnabled } from "./config";

/** Supabase client for route handlers and server components, acting as the signed-in user (RLS applies). */
export async function supabaseServer() {
  if (!authEnabled) return null;
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // called from a server component; the proxy refreshes the session instead
        }
      },
    },
  });
}
