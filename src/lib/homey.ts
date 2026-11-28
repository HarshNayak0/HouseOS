"use client";

/** Everything the 3D house needs to feel like home: nameplate, chappals, wall photos, festivals, jasmine. */
import { useQueries } from "@tanstack/react-query";
import { INSTANCE } from "./instance";
import { PERSON_COLORS } from "./colors";
import { decorFor, jasmineFor, type DecorState, type Milestone } from "./decor";
import { FILES_BUCKET } from "./files";
import { useHousehold, type Member } from "./household";
import { live, useRows } from "./lists/rows";
import { useNow } from "./lists/useNow";
import { supabaseBrowser } from "./supabase/browser";
import { torontoDayKey } from "./time";

export interface HomeyState {
  nameplate: string;
  /** Owner's pair first; null = not opened Veedu today. */
  chappals: ({ color: number } | null)[];
  photos: (string | null)[];
  decor: DecorState;
  jasmine: { growth: number; bloom: number; total: number; thisWeek: number };
}

/** Owner first, so both phones show the same order ("Harsh & Prerna"). */
export const ordered = (members: Member[]) => [...members].sort((a, b) => (a.role === b.role ? 0 : a.role === "owner" ? -1 : 1));

export function defaultNameplate(members: Member[]) {
  const names = ordered(members).map((m) => m.display_name);
  return names.length ? names.join(" & ") : "Our home";
}

export function useWallPhotoUrls(): (string | null)[] {
  const { data } = useHousehold();
  const paths = [0, 1, 2].map((i) => data?.settings?.wall_photos?.[i]?.path ?? null);
  const qs = useQueries({
    queries: paths.map((p) => ({
      queryKey: ["signed", FILES_BUCKET, p],
      enabled: !!p,
      staleTime: 50 * 60_000,
      queryFn: async () => {
        const { data: d } = (await supabaseBrowser()?.storage.from(FILES_BUCKET).createSignedUrl(p!, 3600)) ?? { data: null };
        return d?.signedUrl ?? null;
      },
    })),
  });
  return qs.map((q, i) => (paths[i] ? (q.data ?? null) : null));
}

interface DoneRow {
  completed_at?: string | null;
  happened_on?: string | null;
  deleted_at: string | null;
}

export function useHomeyState(): HomeyState | null {
  const { data } = useHousehold();
  const now = useNow(5 * 60_000);
  const { data: milestones } = useRows<Milestone & { deleted_at: string | null }>("milestones");
  const { data: chores } = useRows<DoneRow & { id: string }>("chore_completions");
  const { data: tasks } = useRows<DoneRow & { id: string }>("tasks");
  const { data: memories } = useRows<DoneRow & { id: string }>("date_memories");
  const photos = useWallPhotoUrls();
  if (!data?.me) return null;
  const today = torontoDayKey(new Date(now));
  const s = data.settings;
  const members = ordered(data.members);
  const done = [
    ...live(chores).map((r) => r.completed_at),
    ...live(tasks).map((r) => r.completed_at),
    ...live(memories).map((r) => r.happened_on),
  ]
    .filter((d): d is string => !!d)
    .map((d) => (d.length === 10 ? d : torontoDayKey(new Date(d))));
  return {
    nameplate: s?.nameplate?.trim() || defaultNameplate(data.members),
    chappals: members.slice(0, 2).map((m) => (m.last_seen_on === today ? { color: parseInt(PERSON_COLORS[m.color]?.hex.slice(1) ?? "7a4527", 16) } : null)),
    photos,
    decor: decorFor(today, milestones ?? [], s?.decor_off ?? [], INSTANCE.lat),
    jasmine: jasmineFor(done, today),
  };
}

/** How the jasmine is doing, in words. */
export function jasmineWords(j: HomeyState["jasmine"]) {
  const stage = j.growth >= 8 ? "right across the verandah" : j.growth >= 5 ? "up the pillar and along the beam" : j.growth >= 2 ? "climbing the pillar" : "just a sprout";
  const flowers = j.thisWeek >= 14 ? "in full flower" : j.thisWeek >= 7 ? "flowering" : j.thisWeek ? "starting to open" : "all green buds for now";
  return { stage, flowers };
}
