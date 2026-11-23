"use client";

import { useEffect, useState } from "react";

/** The current time, refreshed every `everyMs` (keeps renders pure; due labels roll over at midnight). */
export function useNow(everyMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}
