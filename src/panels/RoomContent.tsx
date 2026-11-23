"use client";

import type { RoomId } from "@/scene/config";
import { CalendarView } from "./Calendar";
import { Chores } from "./Chores";
import { ActivityFeed, Dashboard, TogetherCounter } from "./Dashboard";
import { Milestones } from "./Milestones";
import { NotesBoard } from "./Notes";
import { RecipeBox } from "./Recipes";
import { ShoppingList } from "./ShoppingList";
import { Tasks } from "./Tasks";

const REAL: RoomId[] = ["living", "kitchen", "office", "wash"];
export const hasRealContent = (room: RoomId) => REAL.includes(room);


/** The working panel for each room (rooms not built yet keep their placeholder). */
export function RoomContent({ room }: { room: RoomId }) {
  switch (room) {
    case "kitchen":
      return (
        <>
          <ShoppingList />
          <RecipeBox />
        </>
      );
    case "office":
      return (
        <>
          <CalendarView />
          <Tasks />
          <Milestones />
        </>
      );
    case "wash":
      return <Chores />;
    case "living":
      return (
        <>
          <Dashboard />
          <NotesBoard />
          <TogetherCounter />
          <ActivityFeed />
        </>
      );
    default:
      return null;
  }
}
