"use client";

import type { Chore } from "@/panels/Chores";
import type { Note } from "@/panels/Notes";
import { visibleNotes } from "@/panels/Notes";
import type { ShoppingItem } from "@/panels/ShoppingList";
import type { DateIdea } from "@/panels/Dates";
import type { Trip } from "@/panels/Trips";
import type { VaultItemRow } from "@/lib/vault";
import { daysBetween, inWeek, tripIsSoon } from "@/lib/trips";
import { EMPTY_INDICATORS, type IndicatorState } from "@/scene/indicators/state";
import { useHousehold } from "@/lib/household";
import { torontoDayKey } from "@/lib/time";
import { dueState, weekStartKey } from "./dates";
import { live, useRows } from "./rows";
import { useNow } from "./useNow";

/** Drives the in-scene indicators (SPEC §3.3) from real data. */
export function useIndicatorState(): IndicatorState {
  const { data } = useHousehold();
  const { data: shopping } = useRows<ShoppingItem>("shopping_items");
  const { data: chores } = useRows<Chore>("chores");
  const { data: notes } = useRows<Note>("notes");
  const { data: trips } = useRows<Trip>("trips");
  const { data: dates } = useRows<DateIdea>("date_ideas");
  const { data: vault } = useRows<VaultItemRow>("vault_items");
  const nowMs = useNow();
  if (!data?.me) return EMPTY_INDICATORS;
  const now = new Date(nowMs);
  const open = live(chores).filter((c) => !c.paused && ["overdue", "today"].includes(dueState(c.next_due_at, now)));
  const dayAgo = nowMs - 86_400_000;
  const today = torontoDayKey(now);
  const weekStart = weekStartKey(now);
  return {
    ...EMPTY_INDICATORS,
    shoppingOpen: live(shopping).filter((i) => !i.checked_at).length,
    choresOpen: open.length,
    choresOverdue: open.filter((c) => dueState(c.next_due_at, now) === "overdue").length,
    newNoteFromPartner: visibleNotes(notes, nowMs).some((n) => n.created_by !== data.user?.id && Date.parse(n.created_at) > dayAgo),
    // the boat lantern: a trip starts within 30 days (or is under way)
    tripSoon: live(trips).some((t) => tripIsSoon(t, today)),
    // the bedroom lamp: a date planned for this Mon–Sun week
    // the brass bell on the closet door: a lease or insurance renewal within 30 days
    renewalSoon: live(vault).some((v) => !!v.renewal_date && v.renewal_date >= today && daysBetween(today, v.renewal_date) <= 30),
    dateThisWeek: live(dates).some((d) => d.status === "planned" && !!d.planned_for && inWeek(torontoDayKey(d.planned_for), weekStart)),
  };
}
