import { z } from "zod";

/**
 * Environment variables, validated with Zod.
 * Only NEXT_PUBLIC_* values may reach the browser. Everything else is server-only.
 * These are the Vercel (web app) variables; see .env.example. The Edge Functions' secrets (Google, Gemini,
 * vault key) live in GitHub Secrets and are copied to Supabase by the deploy workflow, never to Vercel.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(1).optional(),
});

const serverSchema = publicSchema.extend({
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  VAPID_SUBJECT: z.string().min(1).optional(),
});

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || undefined,
});

export function serverEnv() {
  if (typeof window !== "undefined") throw new Error("serverEnv() called in the browser");
  const raw = Object.fromEntries(
    Object.keys(serverSchema.shape).map((k) => [k, process.env[k] || undefined]),
  );
  return serverSchema.parse(raw);
}
