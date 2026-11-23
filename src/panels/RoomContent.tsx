"use client";

import type { RoomId } from "@/scene/config";
import { Chores } from "./Chores";
import { NotesBoard } from "./Notes";
import { ShoppingList } from "./ShoppingList";
import { Tasks } from "./Tasks";

const REAL: RoomId[] = ["living", "kitchen", "office", "wash"];
export const hasRealContent = (room: RoomId) => REAL.includes(room);

function Later({ children }: { children: React.ReactNode }) {
  return <p className="mt-5 border-t border-[#eadfcb] pt-2.5 text-[11.5px] text-ink-2 italic">{children}</p>;
}

/** The working panel for each room (rooms not built yet keep their placeholder). */
export function RoomContent({ room }: { room: RoomId }) {
  switch (room) {
    case "kitchen":
      return (
        <>
          <ShoppingList />
          <Later>The recipe box (with website and Instagram imports) arrives in phase 6.</Later>
        </>
      );
    case "office":
      return (
        <>
          <Tasks />
          <Later>Google Calendar, milestones and the September planner arrive in phase 4.</Later>
        </>
      );
    case "wash":
      return <Chores />;
    case "living":
      return (
        <>
          <NotesBoard />
          <Later>The dashboard (today, the week ahead, what&apos;s due) arrives in phase 5.</Later>
        </>
      );
    default:
      return null;
  }
}
