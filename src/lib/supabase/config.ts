/**
 * Supabase connection settings (public values only). Sign-in is switched on once both are set,
 * so the app still runs (without accounts) in CI and before Supabase is configured.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const authEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
