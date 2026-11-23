"use client";

import { useEffect, useState } from "react";
import {
  prefersReducedMotion,
  readMotionPref,
  readViewPref,
  writeMotionPref,
  writeViewPref,
  type MotionPref,
  type ViewPref,
} from "@/lib/view-pref";

export function ViewSetting() {
  const [pref, setPref] = useState<ViewPref | "auto">("auto");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads per-device storage after mount
    setPref(readViewPref() ?? "auto");
  }, []);
  const choose = (v: ViewPref | "auto") => {
    setPref(v);
    writeViewPref(v === "auto" ? null : v);
  };
  const opts: { v: ViewPref | "auto"; label: string; hint: string }[] = [
    { v: "auto", label: "Automatic", hint: "3D, unless this device prefers reduced motion or can't run it" },
    { v: "3d", label: "3D house", hint: "Always show the 3D house" },
    { v: "2d", label: "2D floor plan", hint: "A flat map of the same rooms; lighter and faster" },
  ];
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="mb-2 font-bold">House view on this device</legend>
      {opts.map((o) => (
        <label key={o.v} className="flex min-h-11 cursor-pointer items-start gap-3 py-1.5">
          <input
            type="radio"
            name="view"
            checked={pref === o.v}
            onChange={() => choose(o.v)}
            className="mt-1 h-[18px] w-[18px] accent-red-oxide"
          />
          <span>
            <span className="block text-sm font-bold">{o.label}</span>
            <span className="block text-xs text-ink-2">{o.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function MotionSetting() {
  const [pref, setPref] = useState<MotionPref>("system");
  const [systemReduce, setSystemReduce] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads per-device storage after mount
    setPref(readMotionPref());
    setSystemReduce(prefersReducedMotion());
  }, []);
  const choose = (v: MotionPref) => {
    setPref(v);
    writeMotionPref(v);
  };
  const opts: { v: MotionPref; label: string; hint: string }[] = [
    {
      v: "system",
      label: "Follow this device's setting",
      hint: `Reduce motion is ${systemReduce ? "on" : "off"} here, so the camera ${systemReduce ? "jumps instead of flying" : "flies between rooms"}`,
    },
    { v: "always", label: "Always fly the camera", hint: "Smooth camera flights and the slow drift outside, even with reduce motion on" },
  ];
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="mb-2 font-bold">Camera animations</legend>
      {opts.map((o) => (
        <label key={o.v} className="flex min-h-11 cursor-pointer items-start gap-3 py-1.5">
          <input
            type="radio"
            name="motion"
            checked={pref === o.v}
            onChange={() => choose(o.v)}
            className="mt-1 h-[18px] w-[18px] accent-red-oxide"
          />
          <span>
            <span className="block text-sm font-bold">{o.label}</span>
            <span className="block text-xs text-ink-2">{o.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
