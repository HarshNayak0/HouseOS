/**
 * Per-device display preferences (localStorage): 3D vs 2D, camera animations, evening mode.
 * Every read/write is wrapped: storage can be unavailable (private mode, blocked).
 */
export type ViewPref = "3d" | "2d";
const KEY = "veedu.view";

export function readViewPref(): ViewPref | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "3d" || v === "2d" ? v : null;
  } catch {
    return null;
  }
}

export function writeViewPref(v: ViewPref | null) {
  try {
    if (v) localStorage.setItem(KEY, v);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Decide which view to show (SPEC §3.4). */
export function chooseView(opts: { pref: ViewPref | null; webgl: boolean; reducedMotion: boolean }): {
  view: ViewPref;
  reason: "no-webgl" | "pref" | "reduced-motion" | "default";
} {
  if (!opts.webgl) return { view: "2d", reason: "no-webgl" };
  if (opts.pref) return { view: opts.pref, reason: "pref" };
  if (opts.reducedMotion) return { view: "2d", reason: "reduced-motion" };
  return { view: "3d", reason: "default" };
}

/**
 * Camera animations: follow the system "reduce motion" setting (default), or always animate.
 */
export type MotionPref = "system" | "always";
const MOTION_KEY = "veedu.motion";

export function readMotionPref(): MotionPref {
  try {
    return localStorage.getItem(MOTION_KEY) === "always" ? "always" : "system";
  } catch {
    return "system";
  }
}

export function writeMotionPref(v: MotionPref) {
  try {
    if (v === "always") localStorage.setItem(MOTION_KEY, v);
    else localStorage.removeItem(MOTION_KEY);
  } catch {
    /* ignore */
  }
}

/** Reduced motion after applying the user's override. */
export function effectiveReducedMotion(): boolean {
  return prefersReducedMotion() && readMotionPref() !== "always";
}

/** Evening mode: follow Toronto's sunset (default), or stay day / evening. */
export type EveningPref = "auto" | "day" | "evening";
const EVENING_KEY = "veedu.evening";

export function readEveningPref(): EveningPref {
  try {
    const v = localStorage.getItem(EVENING_KEY);
    return v === "day" || v === "evening" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function writeEveningPref(v: EveningPref) {
  try {
    if (v === "auto") localStorage.removeItem(EVENING_KEY);
    else localStorage.setItem(EVENING_KEY, v);
  } catch {
    /* ignore */
  }
}

/**
 * Whether the house shows evening. A tap on the header button overrides it for this visit; in automatic
 * mode the override lapses at the next sunset or sunrise, so the house never gets stuck in the wrong mode.
 */
export function resolveEvening(pref: EveningPref, autoNow: boolean, override: { value: boolean; auto: boolean } | null): boolean {
  if (override && (pref !== "auto" || override.auto === autoNow)) return override.value;
  return pref === "day" ? false : pref === "evening" ? true : autoNow;
}
