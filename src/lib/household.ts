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

export interface Member {
  id: string;
  household_id: string;
  user_id: string;
  display_name: string;
  role: "owner" | "partner";
  color: PersonColor;
}

export interface HouseholdSettings {
  household_id: string;
  room_labels: Partial<Record<RoomId, { name: string; ml: string }>>;
  both_color: PersonColor;
}

export interface HouseholdState {
  user: User | null;
  me: Member | null;
  partner: Member | null;
  members: Member[];
  settings: HouseholdSettings | null;
  householdName: string | null;
}

export const householdKey = ["household"] as const;

async function loadHousehold(): Promise<HouseholdState> {
  const sb = supabaseBrowser();
  const empty: HouseholdState = { user: null, me: null, partner: null, members: [], settings: null, householdName: null };
  if (!sb) return empty;
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return empty;
  const { data: members, error } = await sb.from("members").select("id, household_id, user_id, display_name, role, color").is("deleted_at", null);
  if (error) throw error;
  const me = (members as Member[]).find((m) => m.user_id === user.id) ?? null;
  if (!me) return { ...empty, user };
  const [{ data: settings }, { data: household }] = await Promise.all([
    sb.from("household_settings").select("household_id, room_labels, both_color").eq("household_id", me.household_id).maybeSingle(),
    sb.from("households").select("name").eq("id", me.household_id).maybeSingle(),
  ]);
  return {
    user,
    me,
    partner: (members as Member[]).find((m) => m.id !== me.id) ?? null,
    members: members as Member[],
    settings: (settings as HouseholdSettings | null) ?? null,
    householdName: household?.name ?? null,
  };
}

export function useHousehold() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: householdKey, queryFn: loadHousehold, enabled: authEnabled, staleTime: 60_000 });
  const householdId = query.data?.me?.household_id;

  // Live updates: names, colours, labels and new members.
  useEffect(() => {
    const sb = supabaseBrowser();
    if (!sb || !householdId) return;
    const ch = sb
      .channel(`household:${householdId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "members", filter: `household_id=eq.${householdId}` }, () =>
        qc.invalidateQueries({ queryKey: householdKey }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "household_settings", filter: `household_id=eq.${householdId}` }, () =>
        qc.invalidateQueries({ queryKey: householdKey }),
      )
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [householdId, qc]);

  return query;
}

/** Room labels with the household's overrides applied. */
export function useRoomLabels(): Record<RoomId, RoomLabel> {
  const { data } = useHousehold();
  const over = data?.settings?.room_labels ?? {};
  return Object.fromEntries(
    ROOM_IDS.map((id) => [id, { ...DEFAULT_LABELS[id], ...(over[id] ?? {}) }]),
  ) as Record<RoomId, RoomLabel>;
}
