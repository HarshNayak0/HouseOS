"use client";

/**
 * The signed-in person, their household and shared settings, via TanStack Query.
 * Changes from the other person arrive live through Supabase Realtime.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { useEffect } from "react";
import { DEFAULT_LABELS, ROOM_IDS, type RoomId, type RoomLabel } from "@/scene/config";
import type { PersonColor } from "./colors";
import { supabaseBrowser } from "./supabase/browser";
import { authEnabled } from "./supabase/config";
import { torontoDayKey } from "./time";

export interface Member {
  id: string;
  household_id: string;
  user_id: string;
  display_name: string;
  role: "owner" | "partner";
  color: PersonColor;
  /** The day (home time) they last opened Veedu: their chappals sit at the door that day. */
  last_seen_on?: string | null;
}

export interface HouseholdSettings {
  household_id: string;
  room_labels: Partial<Record<RoomId, { name: string; ml: string }>>;
  both_color: PersonColor;
  /** Brass nameplate on the gate (null = your two names). */
  nameplate?: string | null;
  /** The three frames in the living room. */
  wall_photos?: ({ path: string } | null)[];
  /** Festivals and seasons turned off (see src/lib/decor.ts). */
  decor_off?: string[];
}

export interface HouseholdState {
  user: User | null;
  me: Member | null;
  partner: Member | null;
  members: Member[];
  settings: HouseholdSettings | null;
  householdName: string | null;
  togetherSince: string | null;
}

export const householdKey = ["household"] as const;

async function loadHousehold(): Promise<HouseholdState> {
  const sb = supabaseBrowser();
  const empty: HouseholdState = { user: null, me: null, partner: null, members: [], settings: null, householdName: null, togetherSince: null };
  if (!sb) return empty;
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return empty;
  // (falls back to the older columns if the newest migration hasn't been run yet)
  const cols = "id, household_id, user_id, display_name, role, color";
  let { data: members, error } = await sb.from("members").select(`${cols}, last_seen_on`).is("deleted_at", null);
  // (last_seen_on:color is only a stand-in of the right shape: never a date, so no chappals)
  if (error?.code === "42703") ({ data: members, error } = await sb.from("members").select(`${cols}, last_seen_on:color`).is("deleted_at", null));
  if (error) throw error;
  const me = (members as Member[]).find((m) => m.user_id === user.id) ?? null;
  if (!me) return { ...empty, user };
  const [{ data: settings }, { data: household }] = await Promise.all([
    sb
      .from("household_settings")
      .select("household_id, room_labels, both_color, nameplate, wall_photos, decor_off")
      .eq("household_id", me.household_id)
      .maybeSingle()
      .then((r) => (r.error?.code === "42703" ? sb.from("household_settings").select("household_id, room_labels, both_color").eq("household_id", me.household_id).maybeSingle() : r)),
    sb.from("households").select("name, together_since").eq("id", me.household_id).maybeSingle(),
  ]);
  return {
    user,
    me,
    partner: (members as Member[]).find((m) => m.id !== me.id) ?? null,
    members: members as Member[],
    settings: (settings as HouseholdSettings | null) ?? null,
    householdName: household?.name ?? null,
    togetherSince: (household as { together_since?: string | null } | null)?.together_since ?? null,
  };
}

export function useHousehold() {
  return useQuery({ queryKey: householdKey, queryFn: loadHousehold, enabled: authEnabled, staleTime: 60_000 });
}

/**
 * Live updates (names, colours, labels, new members) through Supabase Realtime.
 * Call this exactly once for the whole app (it's mounted in <Providers>): a second subscriber to the
 * same channel name would make supabase-js throw.
 */
export function useHouseholdRealtime() {
  const qc = useQueryClient();
  const { data } = useHousehold();
  const householdId = data?.me?.household_id;
  useEffect(() => {
    const sb = supabaseBrowser();
    if (!sb || !householdId) return;
    const topic = `household:${householdId}`;
    // Clean up any leftover channel with the same name (e.g. after a fast remount).
    sb.getChannels()
      .filter((c) => c.topic === `realtime:${topic}`)
      .forEach((c) => sb.removeChannel(c));
    const refresh = () => qc.invalidateQueries({ queryKey: householdKey });
    const ch = sb
      .channel(topic)
      .on("postgres_changes", { event: "*", schema: "public", table: "members", filter: `household_id=eq.${householdId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "household_settings", filter: `household_id=eq.${householdId}` }, refresh)
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [householdId, qc]);
}

/** Room labels with the household's overrides applied. */
export function useRoomLabels(): Record<RoomId, RoomLabel> {
  const { data } = useHousehold();
  const over = data?.settings?.room_labels ?? {};
  return Object.fromEntries(
    ROOM_IDS.map((id) => [id, { ...DEFAULT_LABELS[id], ...(over[id] ?? {}) }]),
  ) as Record<RoomId, RoomLabel>;
}

/** Note that I opened Veedu today (once a day), so my chappals appear at the door on both phones. */
export function useMarkSeen() {
  const qc = useQueryClient();
  const { data } = useHousehold();
  const me = data?.me;
  useEffect(() => {
    const sb = supabaseBrowser();
    if (!sb || !me) return;
    const check = () => {
      const today = torontoDayKey(new Date());
      if (me.last_seen_on === today || document.visibilityState !== "visible") return;
      sb.from("members")
        .update({ last_seen_on: today })
        .eq("id", me.id)
        .then(({ error }) => {
          if (!error) qc.invalidateQueries({ queryKey: householdKey });
        });
    };
    check();
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, [me, qc]);
}
