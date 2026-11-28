"use client";

import { useEffect, useState } from "react";
import { FEEL_CHANGED, RAIN_CODES, primeAudio, setAmbience, soundsOn, type Ambience } from "@/lib/feel";
import { INSTANCE } from "@/lib/instance";
import { lookPhase } from "@/lib/look";
import { useNow } from "@/lib/lists/useNow";
import { sunTimes } from "@/lib/sun";
import { torontoDayKey, torontoToUtc } from "@/lib/time";

/**
 * Quiet background sounds while the house is open (Settings → Sounds): birds from sunrise to 10 am,
 * crickets after dark, rain when it's raining at home (Open-Meteo, free, checked every 30 minutes).
 */
export function AmbienceController() {
  const now = useNow(60_000);
  const [on, setOn] = useState(false);
  const [raining, setRaining] = useState(false);
  const [visible, setVisible] = useState(true);
  const [kick, setKick] = useState(0);
  useEffect(() => {
    const sync = () => setOn(soundsOn());
    sync();
    const vis = () => setVisible(document.visibilityState === "visible");
    // sound can only start after a tap, so try again on the first ones
    const tap = () => {
      primeAudio();
      setTimeout(() => setKick((k) => k + 1), 50);
    };
    window.addEventListener(FEEL_CHANGED, sync);
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("pointerdown", tap, { passive: true });
    return () => {
      window.removeEventListener(FEEL_CHANGED, sync);
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("pointerdown", tap);
      setAmbience([]);
    };
  }, []);
  // is it raining at home?
  useEffect(() => {
    if (!on) return;
    let stop = false;
    const check = () =>
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${INSTANCE.lat}&longitude=${INSTANCE.lng}&current=weather_code,precipitation`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { current?: { weather_code?: number; precipitation?: number } } | null) => {
          if (!stop && j?.current) setRaining(RAIN_CODES.has(j.current.weather_code ?? -1) || (j.current.precipitation ?? 0) > 0.1);
        })
        .catch(() => {});
    check();
    const t = setInterval(check, 30 * 60_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [on]);
  useEffect(() => {
    if (!on || !visible) return setAmbience([]);
    const d = new Date(now);
    const day = torontoDayKey(d);
    const [y, m, dd] = day.split("-").map(Number);
    const { sunrise } = sunTimes(day);
    const want: Ambience[] = [];
    if (raining) want.push("rain");
    else if (d >= sunrise && d < torontoToUtc(y, m, dd, 10, 0)) want.push("birds");
    if (lookPhase(d) === "night") want.push("crickets");
    setAmbience(want);
  }, [on, visible, raining, now, kick]);
  return null;
}
