"use client";

import { useEffect, useState } from "react";
import { prefersReducedMotion, readMotionPref, readViewPref } from "@/lib/view-pref";

/** A short report about this device, to help diagnose 3D problems. */
export function DeviceReport() {
  const [rows, setRows] = useState<[string, string][]>([]);
  useEffect(() => {
    let renderer = "none";
    try {
      const gl = document.createElement("canvas").getContext("webgl2") ?? document.createElement("canvas").getContext("webgl");
      if (gl) {
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      }
    } catch {}
    let fps = "not measured yet";
    try {
      fps = localStorage.getItem("veedu.fps") ?? fps;
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser-only values after mount
    setRows([
      ["Version", process.env.NEXT_PUBLIC_BUILD ?? "?"],
      ["House view setting", readViewPref() ?? "automatic"],
      ["Reduce motion (system setting)", prefersReducedMotion() ? "on" : "off"],
      ["Camera animations", readMotionPref() === "always" ? "always" : "follow system"],
      ["3D frames per second", fps],
      ["Graphics", renderer],
      ["Screen", `${window.innerWidth} × ${window.innerHeight} @ ${window.devicePixelRatio}x`],
    ]);
  }, []);
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-ink-2">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-bold">{k}</dt>
          <dd className="m-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
