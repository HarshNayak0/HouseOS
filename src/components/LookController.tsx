"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { LOOK_CHANGED, lookOverride, lookPhase, markFast, resolveLook, takeFast } from "@/lib/look";
import { useNow } from "@/lib/lists/useNow";
import { readEveningPref, type EveningPref } from "@/lib/view-pref";

const THEME: Record<string, string> = { morning: "#FAF6EE", day: "#F6F1E7", dusk: "#F1E1C6", night: "#1F1611" };

/** Sets <html data-look> from the sun, the Settings choice and the header's Evening button. */
export function LookController() {
  const now = useNow(60_000);
  const override = useSyncExternalStore(lookOverride.subscribe, lookOverride.get, () => null);
  // read the setting straight away (this renders nothing, so there's no markup to mismatch)
  const [pref, setPref] = useState<EveningPref>(() => (typeof window === "undefined" ? "auto" : readEveningPref()));
  const [mountedAt] = useState(() => Date.now());
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- per-device setting, read after mount
    setPref(readEveningPref());
    const onChange = () => {
      markFast();
      setPref(readEveningPref());
    };
    window.addEventListener(LOOK_CHANGED, onChange);
    return () => window.removeEventListener(LOOK_CHANGED, onChange);
  }, []);
  const look = resolveLook(pref, lookPhase(new Date(now)), override);
  useEffect(() => {
    const html = document.documentElement;
    // a tap (header button, Settings) changes the look quickly; the sun changes it slowly
    // the first look, and anything settling in the first seconds after opening, is applied at once
    const first = !html.dataset.look || Date.now() - mountedAt < 3000;
    html.style.setProperty("--look-fade", first ? "0s" : takeFast() ? "0.5s" : "60s");
    html.dataset.look = look;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME[look]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the look changes
  }, [look]);
  return null;
}
