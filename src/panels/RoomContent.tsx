"use client";

import dynamic from "next/dynamic";
import type { RoomId } from "@/scene/config";

/**
 * The working panel for each room. Each room's code is its own chunk, loaded when the room opens
 * (and prefetched once the house is idle), so the house's first load stays small.
 */
const loading = () => <p className="text-sm text-ink-2">Opening…</p>;

const loaders = {
  living: () => Promise.all([import("./Dashboard"), import("./Notes"), import("./WallPhotos")]),
  kitchen: () => Promise.all([import("./ShoppingList"), import("./Recipes")]),
  office: () => Promise.all([import("./Calendar"), import("./Tasks"), import("./Milestones")]),
  wash: () => import("./Chores"),
  bedroom: () => import("./Dates"),
  backyard: () => import("./Trips"),
  closet: () => import("./Vault"),
} satisfies Record<RoomId, () => Promise<unknown>>;

const ROOMS: Record<RoomId, React.ComponentType> = {
  living: dynamic(
    () =>
      loaders.living().then(([d, n, w]) => {
        const Living = () => (
          <>
            <d.Dashboard />
            <n.NotesBoard />
            <w.WallPhotos />
            <w.JasmineNote />
            <d.TogetherCounter />
            <d.ActivityFeed />
          </>
        );
        return Living;
      }),
    { loading },
  ),
  kitchen: dynamic(
    () =>
      loaders.kitchen().then(([s, r]) => {
        const Kitchen = () => (
          <>
            <s.ShoppingList />
            <r.RecipeBox />
          </>
        );
        return Kitchen;
      }),
    { loading },
  ),
  office: dynamic(
    () =>
      loaders.office().then(([c, t, m]) => {
        const Office = () => (
          <>
            <c.CalendarView />
            <t.Tasks />
            <m.Milestones />
          </>
        );
        return Office;
      }),
    { loading },
  ),
  wash: dynamic(() => loaders.wash().then((m) => m.Chores), { loading }),
  bedroom: dynamic(() => loaders.bedroom().then((m) => m.DateIdeas), { loading }),
  backyard: dynamic(() => loaders.backyard().then((m) => m.TripsRoom), { loading }),
  closet: dynamic(() => loaders.closet().then((m) => m.ClosetVault), { loading }),
};

export function RoomContent({ room }: { room: RoomId }) {
  const Room = ROOMS[room];
  return <Room />;
}

/** Fetch every room's code in the background (after the house has loaded), so rooms open instantly. */
export function prefetchRooms() {
  for (const load of Object.values(loaders)) void load().catch(() => {});
}
