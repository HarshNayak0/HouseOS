"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { btnPrimary } from "./ui/Card";

/** Starts Google sign-in; after Google, Supabase returns to /auth/callback, then `next`. */
export function GoogleButton({ next = "/", label = "Continue with Google" }: { next?: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    const sb = supabaseBrowser();
    if (!sb) return setError("Sign-in isn't set up yet.");
    setBusy(true);
    const redirectTo = `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" onClick={go} disabled={busy} className={`${btnPrimary} w-full`}>
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#fff" d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z" />
        </svg>
        {busy ? "Opening Google…" : label}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-urgent">
          {error}
        </p>
      )}
    </>
  );
}
