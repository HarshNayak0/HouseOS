"use client";

/**
 * Shared list data: load a table (RLS limits it to our household), and change rows with
 * optimistic updates (the UI changes instantly; it rolls back with a message if the save fails).
 * Live changes from the other phone arrive through Realtime (see useListsRealtime).
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useHousehold } from "@/lib/household";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { authEnabled } from "@/lib/supabase/config";
import { markPartnerEdit } from "./presence";
import { toast } from "./toast";

export type ListTable =
  | "shopping_items"
  | "item_frequency"
  | "tasks"
  | "subtasks"
  | "chores"
  | "chore_completions"
  | "notes"
  | "activity_log"
  | "calendar_accounts"
  | "calendar_sources"
  | "calendar_event_cache"
  | "milestones"
  | "gift_ideas"
  | "recipes"
  | "recipe_ingredients"
  | "recipe_steps"
  | "recipe_ratings"
  | "date_ideas"
  | "date_memories"
  | "date_ratings"
  | "trips"
  | "trip_days"
  | "trip_bookings"
  | "trip_expenses"
  | "packing_items"
  | "packing_templates"
  | "vault_items";
export const rowsKey = (t: ListTable) => ["rows", t] as const;

export interface BaseRow {
  id: string;
  household_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  updated_by?: string | null;
}

const ORDER: Partial<Record<ListTable, { column: string; ascending: boolean; limit?: number }>> = {
  chore_completions: { column: "completed_at", ascending: false, limit: 200 },
  notes: { column: "created_at", ascending: false },
  activity_log: { column: "created_at", ascending: false, limit: 50 },
  item_frequency: { column: "times_added", ascending: false, limit: 300 },
  calendar_event_cache: { column: "starts_at", ascending: true, limit: 3000 },
  milestones: { column: "base_date", ascending: true },
  recipes: { column: "created_at", ascending: false },
  recipe_ingredients: { column: "position", ascending: true, limit: 5000 },
  recipe_steps: { column: "position", ascending: true, limit: 5000 },
  date_memories: { column: "happened_on", ascending: false },
  trips: { column: "starts_on", ascending: true },
  trip_days: { column: "day_date", ascending: true },
};

/** Tables whose secret columns the app may not read. */
const SELECT: Partial<Record<ListTable, string>> = {
  calendar_accounts: "id, household_id, member_id, google_email, status, last_error, created_at, updated_at, deleted_at",
  calendar_sources:
    "id, household_id, account_id, member_id, google_calendar_id, summary, color, access_role, is_primary, is_us_calendar, visible, last_synced_at, created_at, updated_at, deleted_at",
};

export function useRows<T extends object>(table: ListTable) {
  const { data } = useHousehold();
  const householdId = data?.me?.household_id;
  return useQuery({
    queryKey: rowsKey(table),
    enabled: authEnabled && !!householdId,
    queryFn: async () => {
      const sb = supabaseBrowser()!;
      const o = ORDER[table] ?? { column: "created_at", ascending: true };
      let q = sb.from(table).select(SELECT[table] ?? "*").order(o.column, { ascending: o.ascending });
      if (o.limit) q = q.limit(o.limit);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as T[];
    },
  });
}

/** Non-deleted rows only. */
export const live = <T extends { deleted_at: string | null }>(rows: T[] | undefined) => (rows ?? []).filter((r) => !r.deleted_at);
/** Deleted in the last 7 days (the trash). */
export const trashed = <T extends { deleted_at: string | null }>(rows: T[] | undefined) =>
  (rows ?? []).filter((r) => r.deleted_at && Date.now() - Date.parse(r.deleted_at) < 7 * 86_400_000);

type Change<T> = { op: "insert"; row: Partial<T> & { id: string } } | { op: "update"; id: string; patch: Partial<T> };

function applyOptimistic<T extends { id: string }>(qc: QueryClient, table: ListTable, c: Change<T>) {
  qc.setQueryData<T[]>(rowsKey(table), (old = []) => {
    if (c.op === "insert") {
      const now = new Date().toISOString();
      return [...old, { created_at: now, updated_at: now, deleted_at: null, ...c.row } as unknown as T];
    }
    return old.map((r) => (r.id === c.id ? { ...r, ...c.patch } : r));
  });
}

/** Insert/update rows with optimistic UI. Last write wins. */
export function useRowMutation<T extends { id: string }>(table: ListTable) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async (c: Change<T>) => {
      const sb = supabaseBrowser()!;
      const { error } =
        c.op === "insert"
          ? await sb.from(table).insert(c.row as Record<string, unknown>)
          : await sb.from(table).update(c.patch as Record<string, unknown>).eq("id", c.id);
      if (error) throw error;
    },
    onMutate: async (c) => {
      await qc.cancelQueries({ queryKey: rowsKey(table) });
      const prev = qc.getQueryData<T[]>(rowsKey(table));
      applyOptimistic(qc, table, c);
      return { prev };
    },
    onError: (err, _c, ctx) => {
      if (ctx?.prev) qc.setQueryData(rowsKey(table), ctx.prev);
      toast(`Couldn't save: ${(err as { message?: string }).message ?? "unknown error"}`, { tone: "error" });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: rowsKey(table) }),
  });
  return {
    insert: (row: Partial<T>) => {
      const id = crypto.randomUUID();
      m.mutate({ op: "insert", row: { ...row, id } as Partial<T> & { id: string } });
      return id;
    },
    update: (id: string, patch: Partial<T>) => m.mutate({ op: "update", id, patch }),
    /** Soft delete with an Undo toast. */
    remove: (id: string, label = "Deleted") => {
      m.mutate({ op: "update", id, patch: { deleted_at: new Date().toISOString() } as unknown as Partial<T> });
      toast(label, { action: { label: "Undo", run: () => m.mutate({ op: "update", id, patch: { deleted_at: null } as unknown as Partial<T> }) } });
    },
    restore: (id: string) => m.mutate({ op: "update", id, patch: { deleted_at: null } as unknown as Partial<T> }),
  };
}

const LIVE_TABLES: ListTable[] = [
  "shopping_items",
  "tasks",
  "subtasks",
  "chores",
  "chore_completions",
  "notes",
  "activity_log",
  "calendar_accounts",
  "calendar_sources",
  "calendar_event_cache",
  "milestones",
  "gift_ideas",
  "recipes",
  "recipe_ingredients",
  "recipe_steps",
  "recipe_ratings",
  "date_ideas",
  "date_memories",
  "date_ratings",
  "trips",
  "trip_days",
  "trip_bookings",
  "trip_expenses",
  "packing_items",
  "packing_templates",
  "vault_items",
];

/**
 * One Realtime channel for every list (mounted once, in <Providers>). Changes from the other
 * person refresh the list and flag the row for the "updated by … just now" hint.
 */
export function useListsRealtime() {
  const qc = useQueryClient();
  const { data } = useHousehold();
  const householdId = data?.me?.household_id;
  const myUserId = data?.user?.id;
  useEffect(() => {
    const sb = supabaseBrowser();
    if (!sb || !householdId) return;
    const topic = `lists:${householdId}`;
    sb.getChannels()
      .filter((c) => c.topic === `realtime:${topic}`)
      .forEach((c) => sb.removeChannel(c));
    let ch = sb.channel(topic);
    for (const table of LIVE_TABLES) {
      ch = ch.on("postgres_changes", { event: "*", schema: "public", table, filter: `household_id=eq.${householdId}` }, (payload) => {
        const row = (payload.new ?? {}) as Partial<BaseRow>;
        const by = row.updated_by ?? row.created_by;
        if (row.id && by && by !== myUserId) markPartnerEdit(row.id);
        qc.invalidateQueries({ queryKey: rowsKey(table) });
        if (table === "chore_completions") qc.invalidateQueries({ queryKey: rowsKey("chores") });
        if (table === "shopping_items") qc.invalidateQueries({ queryKey: rowsKey("item_frequency") });
      });
    }
    ch.subscribe((status) => {
      // after a reconnect, catch up on anything missed
      if (status === "SUBSCRIBED") LIVE_TABLES.forEach((t) => qc.invalidateQueries({ queryKey: rowsKey(t) }));
    });
    return () => {
      sb.removeChannel(ch);
    };
  }, [householdId, myUserId, qc]);
}
