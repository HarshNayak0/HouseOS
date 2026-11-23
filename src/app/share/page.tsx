"use client";

import { useEffect } from "react";

/** Android share target: hand whatever was shared (a link, a caption) to the kitchen's recipe importer. */
export default function SharePage() {
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const text = [q.get("text"), q.get("url")].filter((x, i, a) => x && a.indexOf(x) === i).join("\n").trim();
    location.replace(text ? `/kitchen?import=${encodeURIComponent(text.slice(0, 8000))}` : "/kitchen");
  }, []);
  return <p className="p-6 text-center text-sm text-ink-2">Opening the recipe box…</p>;
}
