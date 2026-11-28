/**
 * The panels' look follows the sun at home: morning, day, dusk, night. Pure helpers (unit-tested) plus a
 * tiny store for the header's Evening/Daytime button, so the panels and the 3D house agree.
 */
import { sunTimes } from "./sun";
import { torontoDayKey, torontoToUtc } from "./time";
import type { EveningPref } from "./view-pref";

export type Look = "morning" | "day" | "dusk" | "night";

/** Morning: sunrise → 11:00. Day: → 40 min before sunset. Dusk: → 30 min after sunset. Night: until sunrise. */
export function lookPhase(now: Date = new Date()): Look {
  const day = torontoDayKey(now);
  const { sunrise, sunset } = sunTimes(day);
  const t = now.getTime();
  const [y, m, d] = day.split("-").map(Number);
  const eleven = torontoToUtc(y, m, d, 11, 0).getTime();
  if (t < sunrise.getTime()) return "night";
  if (t < Math.max(eleven, sunrise.getTime() + 60 * 60_000)) return "morning";
  if (t < sunset.getTime() - 40 * 60_000) return "day";
  if (t < sunset.getTime() + 30 * 60_000) return "dusk";
  return "night";
}

/** Apply the setting and the header button's override (true = evening) to the sun's phase. */
export function resolveLook(pref: EveningPref, phase: Look, override: boolean | null): Look {
  const evening = override ?? (pref === "evening" ? true : pref === "day" ? false : null);
  if (evening === null) return phase;
  if (evening) return phase === "dusk" ? "dusk" : "night";
  return phase === "morning" ? "morning" : "day";
}

// ---- the header button's override, shared with the look controller ----
let override: boolean | null = null;
let fastNext = false;
/** The next look change came from a tap (fade quickly), not from the sun (fade slowly). Read once. */
export function takeFast() {
  const f = fastNext;
  fastNext = false;
  return f;
}
export const markFast = () => {
  fastNext = true;
};
const listeners = new Set<() => void>();
export const lookOverride = {
  get: () => override,
  set(v: boolean | null) {
    if (v === override) return;
    override = v;
    fastNext = true;
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

/** Ask the controller to re-read the setting now (after a change in Settings). */
export const LOOK_CHANGED = "veedu:look-changed";
