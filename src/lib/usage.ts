"use client";

/** Free-plan usage (database and file storage) from the monthly snapshot, with the 70% warning. */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseBrowser } from "./supabase/browser";

/** Supabase Free plan limits (see the cost table in README). */
export const LIMITS = { db: 500 * 1024 * 1024, storage: 1024 * 1024 * 1024 } as const;
export const WARN_AT = 0.7;

export interface UsageSnapshot {
  taken_at: string;
  db_bytes: number;
  storage_bytes: number;
  storage_files: number;
  largest_tables: { table: string; bytes: number }[];
}

export const usageKey = ["usage"] as const;

export function useUsage() {
  return useQuery({
    queryKey: usageKey,
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const { data } = (await supabaseBrowser()?.from("usage_snapshots").select("taken_at, db_bytes, storage_bytes, storage_files, largest_tables").order("taken_at", { ascending: false }).limit(1).maybeSingle()) ?? { data: null };
      return (data as UsageSnapshot | null) ?? null;
    },
  });
}

export function useCheckUsageNow() {
  const qc = useQueryClient();
  return async () => {
    const { error } = (await supabaseBrowser()?.rpc("check_usage")) ?? {};
    if (error) throw new Error(error.message);
    await qc.invalidateQueries({ queryKey: usageKey });
  };
}

/** Which limits are at or above the warning level, as shares (0–1). */
export function usageWarnings(u: Pick<UsageSnapshot, "db_bytes" | "storage_bytes"> | null | undefined) {
  if (!u) return [];
  const out: { what: "database" | "file storage"; share: number }[] = [];
  const db = u.db_bytes / LIMITS.db,
    st = u.storage_bytes / LIMITS.storage;
  if (db >= WARN_AT) out.push({ what: "database", share: db });
  if (st >= WARN_AT) out.push({ what: "file storage", share: st });
  return out;
}

export function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
