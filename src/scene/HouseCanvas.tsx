"use client";

/**
 * The 3D house, rendered with React Three Fiber. Lazy-loaded (next/dynamic) so three.js
 * isn't in the initial page JS.
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { buildHouse, type HouseModel } from "./build";
import { HouseController } from "./camera/controller";
import type { RoomId } from "./config";

// Match the prototype's (r128) colour handling: hex colours are used as-is.
THREE.ColorManagement.enabled = false;

export interface HouseCanvasProps {
  initialRoom: RoomId | null;
  reducedMotion: boolean;
  onProgress: (done: number, total: number, label: string) => void;
  onReady: (controller: HouseController) => void;
  /** Average frames per second over the first 3 s after loading. */
  onFps: (fps: number) => void;
  onError: (err: unknown) => void;
}

let modelPromise: Promise<HouseModel> | null = null;

function Scene(props: HouseCanvasProps) {
  const { gl, scene, camera } = useThree();
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const ctrlRef = useRef<HouseController | null>(null);
  const fps = useRef({ start: 0, frames: 0, reported: false });
  // ?debug=1: a small on-screen meter (frame rate, draw calls, triangles) for checking a real phone
  const meter = useRef<{ el: HTMLDivElement; t: number; frames: number } | null>(null);
  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });

  useEffect(() => {
    let cancelled = false;
    const mobile = Math.min(window.innerWidth, window.innerHeight) < 720;
    const fontFamily = getComputedStyle(document.body).fontFamily || "sans-serif";
    modelPromise ??= buildHouse({
      maxAnisotropy: Math.min(gl.capabilities.getMaxAnisotropy(), mobile ? 4 : 8),
      shadowSize: mobile ? 1024 : 2048,
      fontFamily,
      onProgress: (d, t, l) => propsRef.current.onProgress(d, t, l),
    });
    modelPromise
      .then((model) => {
        if (cancelled || !controlsRef.current) return;
        scene.add(model.root);
        scene.fog = model.lighting.fog;
        // Compile every shader now, so the first frames (and the first flight) don't stutter.
        gl.compile(scene, camera);
        const ctrl = new HouseController(
          model,
          camera as THREE.PerspectiveCamera,
          controlsRef.current,
          gl,
          scene,
          propsRef.current.reducedMotion,
        );
        ctrl.init(propsRef.current.initialRoom);
        ctrlRef.current = ctrl;
        fps.current = { start: 0, frames: 0, reported: false };
        propsRef.current.onReady(ctrl);
        // ?debug=1 exposes render stats for the performance pass.
        if (new URLSearchParams(location.search).has("debug")) {
          (window as unknown as { __veedu: unknown }).__veedu = {
            stats: model.stats,
            ctrl,
            cam: () => camera.position.toArray().map((v) => +v.toFixed(2)),
            dir: () => camera.getWorldDirection(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)),
            info: () => ({ calls: gl.info.render.calls, triangles: gl.info.render.triangles, textures: gl.info.memory.textures }),
          };
          const el = document.createElement("div");
          el.setAttribute("aria-hidden", "true");
          el.style.cssText =
            "position:fixed;left:8px;bottom:calc(8px + env(safe-area-inset-bottom));z-index:60;padding:4px 8px;border-radius:6px;background:rgba(31,22,17,.85);color:#fbf8f2;font:12px/1.3 ui-monospace,monospace;pointer-events:none";
          document.body.appendChild(el);
          meter.current = { el, t: performance.now(), frames: 0 };
        }
      })
      .catch((e) => propsRef.current.onError(e));
    return () => {
      cancelled = true;
      meter.current?.el.remove();
      meter.current = null;
      ctrlRef.current?.dispose();
      ctrlRef.current = null;
      modelPromise?.then((m) => scene.remove(m.root));
    };
  }, [gl, scene, camera]);

  // Tap vs drag (< 7 px = tap) and mouse hover, on the canvas element.
  useEffect(() => {
    const el = gl.domElement;
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 7) return;
      ctrlRef.current?.tap(e.clientX, e.clientY);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || down || !ctrlRef.current) return;
      const id = ctrlRef.current.hover(e.clientX, e.clientY);
      el.style.cursor = ctrlRef.current.mode === "outside" ? "pointer" : id ? "pointer" : "grab";
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointermove", onMove);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointermove", onMove);
    };
  }, [gl]);

  useFrame(() => {
    const ctrl = ctrlRef.current;
    if (!ctrl) return;
    const now = performance.now();
    ctrl.update(now);
    const m = meter.current;
    if (m) {
      m.frames++;
      if (now - m.t >= 1000) {
        m.el.textContent = `${Math.round((m.frames * 1000) / (now - m.t))} fps · ${gl.info.render.calls} calls · ${Math.round(gl.info.render.triangles / 1000)}k tris · dpr ${gl.getPixelRatio()}`;
        m.t = now;
        m.frames = 0;
      }
    }
    const f = fps.current;
    if (!f.reported) {
      // Skip the first second (one-off start-up work), then measure for 3 s.
      if (!f.start) f.start = now + 1000;
      if (now < f.start) return;
      f.frames++;
      if (now - f.start > 3000) {
        f.reported = true;
        propsRef.current.onFps((f.frames * 1000) / (now - f.start));
      }
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      maxPolarAngle={Math.PI * 0.47}
      minDistance={4}
      maxDistance={55}
      enablePan={false}
    />
  );
}

export default function HouseCanvas(props: HouseCanvasProps) {
  return (
    <Canvas
      className="!absolute inset-0 touch-none"
      legacy
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ fov: 42, near: 0.5, far: 200, position: [14, 8.9, 19] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
      aria-hidden="true"
    >
      <Scene {...props} />
    </Canvas>
  );
}
