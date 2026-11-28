"use client";

import { useState } from "react";
import { HOME_TZ } from "@/lib/time";
import { LIMITS, WARN_AT, formatBytes, useCheckUsageNow, useUsage } from "@/lib/usage";
import { Section } from "./AccountSettings";

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const share = used / limit;
  const warn = share >= WARN_AT;
  return (
    <div className="mb-3">
      <div className="flex justify-between text-sm">
        <span className="font-bold">{label}</span>
        <span className={warn ? "font-bold text-urgent" : "text-ink-2"}>
          {formatBytes(used)} of {formatBytes(limit)} · {Math.round(share * 100)}%
        </span>
      </div>
      <div
        className="mt-1 h-2 overflow-hidden rounded-full bg-track"
        role="meter"
        aria-label={`${label} used`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(share * 100)}
      >
        <div className={`h-full ${warn ? "bg-urgent" : "bg-leaf"}`} style={{ width: `${Math.min(100, share * 100)}%` }} />
      </div>
    </div>
  );
}

export function UsageSettings() {
  const { data, isLoading } = useUsage();
  const check = useCheckUsageNow();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Section title="Free-plan usage">
      {isLoading ? (
        <p className="text-sm text-ink-2">Loading…</p>
      ) : !data ? (
        <p className="text-sm text-ink-2">No reading yet.</p>
      ) : (
        <>
          <Meter label="Database" used={data.db_bytes} limit={LIMITS.db} />
          <Meter label={`Photos and files (${data.storage_files})`} used={data.storage_bytes} limit={LIMITS.storage} />
          <p className="m-0 text-xs text-ink-2">
            Last checked {new Date(data.taken_at).toLocaleString("en-CA", { timeZone: HOME_TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            <br />
            Checked automatically on the 1st of each month. You&apos;ll see a warning on the dashboard at {WARN_AT * 100}%.
          </p>
        </>
      )}
      <button
        type="button"
        className="mt-2 min-h-11 text-sm font-bold text-teak underline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await check();
          } catch (e) {
            setError((e as Error).message);
          }
          setBusy(false);
        }}
      >
        {busy ? "Checking…" : "Check now"}
      </button>
      {error && <p className="m-0 text-sm text-urgent">{error}</p>}
      <p className="mt-1 mb-0 text-xs text-ink-2">
        Not measured here: data transfer and function calls (Supabase dashboard → Usage) and Vercel bandwidth (Vercel → Usage). At our size they stay far below the free limits.
      </p>
    </Section>
  );
}
