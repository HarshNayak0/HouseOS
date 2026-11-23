"use client";

import type { Chore } from "@/panels/Chores";
import type { Note } from "@/panels/Notes";
import { visibleNotes } from "@/panels/Notes";
import type { ShoppingItem } from "@/panels/ShoppingList";
import { EMPTY_INDICATORS, type IndicatorState } from "@/scene/indicators/state";
import { useHousehold } from "@/lib/household";
import { dueState } from "./dates";
import { live, useRows } from "./rows";
import { useNow } from "./useNow";

/** Drives the in-scene indicators (SPEC §3.3) from real data. */
export function useIndicatorState(): IndicatorState {
  const { data } = useHousehold();
  const { data: shopping } = useRows<ShoppingItem>("shopping_items");
  const { data: chores } = useRows<Chore>("chores");
  const { data: notes } = useRows<Note>("notes");
  const nowMs = useNow();
  if (!data?.me) return EMPTY_INDICATORS;
  const now = new Date(nowMs);
  const open = live(chores).filter((c) => !c.paused && ["overdue", "today"].includes(dueState(c.next_due_at, now)));
  const dayAgo = nowMs - 86_400_000;
  return {
    ...EMPTY_INDICATORS,
    shoppingOpen: live(shopping).filter((i) => !i.checked_at).length,
    choresOpen: open.length,
    choresOverdue: open.filter((c) => dueState(c.next_due_at, now) === "overdue").length,
    newNoteFromPartner: visibleNotes(notes, nowMs).some((n) => n.created_by !== data.user?.id && Date.parse(n.created_at) > dayAgo),
  };
}
