/**
 * 3D vs 2D view preference. Per device for now (localStorage); moves to settings in phase 2.
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
