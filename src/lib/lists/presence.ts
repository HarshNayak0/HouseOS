"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/** Rows the other person changed in the last few seconds (for the "updated by … just now" hint). */
const edits = new Map<string, number>();
const listeners = new Set<() => void>();
let version = 0;
const HINT_MS = 6000;

export function markPartnerEdit(id: string) {
  edits.set(id, Date.now());
  version++;
  listeners.forEach((l) => l());
}

export function usePartnerEdited(id: string): boolean {
  const v = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
    () => version,
  );
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    const at = edits.get(id) ?? 0;
    const left = at + HINT_MS - Date.now();
    if (left <= 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- show the hint for a few seconds
    setFresh(true);
    const t = setTimeout(() => setFresh(false), left);
    return () => clearTimeout(t);
  }, [v, id]);
  return fresh;
}
