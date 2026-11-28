"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { btnPrimary, btnSecondary } from "@/components/ui/Card";

/** Makes a single-use, 48-hour invite link and offers to copy or share it. */
export function InviteLink({ partnerHint = "your partner" }: { partnerHint?: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const make = async () => {
    setError(null);
    const { data, error } = (await supabaseBrowser()?.rpc("create_invite")) ?? { data: null, error: null };
    if (error || !data) return setError(error?.message ?? "Couldn't create a link");
    setLink(`${location.origin}/invite/${data as string}`);
  };
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy. Select the link and copy it instead.");
    }
  };
  const share = async () => {
    if (link && navigator.share) await navigator.share({ title: "Veedu", text: "Come home to Veedu 🏡", url: link }).catch(() => {});
  };
  return (
    <div>
      {!link ? (
        <button type="button" className={btnPrimary} onClick={make}>
          Create invite link for {partnerHint}
        </button>
      ) : (
        <>
          <input readOnly value={link} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} className="min-h-11 w-full rounded-lg border border-line-strong bg-card px-3 font-mono text-xs" />
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} onClick={copy}>
              {copied ? "Copied ✓" : "Copy link"}
            </button>
            {typeof navigator !== "undefined" && "share" in navigator && (
              <button type="button" className={btnSecondary} onClick={share}>
                Share…
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-ink-2">Works once, for 48 hours. Making a new link cancels this one.</p>
        </>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-urgent">
          {error}
        </p>
      )}
    </div>
  );
}
