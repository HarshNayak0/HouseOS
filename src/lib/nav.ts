"use client";

import { roomPath, type RoomId } from "@/scene/config";

/** Open another room from inside a panel (the camera flies there; no page load). */
export function goToRoom(id: RoomId) {
  if (location.pathname !== roomPath(id)) history.pushState(null, "", roomPath(id));
}
