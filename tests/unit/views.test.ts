import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { freeRegion, roomView, views } from "@/scene/camera/views";
import { P, ROOM_IDS, ROOMS } from "@/scene/config";
import { chooseView } from "@/lib/view-pref";

describe("camera views", () => {
  it("pulls the camera back further in portrait", () => {
    const land = views(1200, 800).ext.p.length();
    const port = views(375, 740).ext.p.length();
    expect(port).toBeGreaterThan(land * 1.5);
  });

  // Every room (including the 16 m backyard) must land fully inside the part of the screen
  // not covered by the panel: beside it on desktop, above the bottom sheet on phones.
  for (const [label, w, h] of [
    ["desktop", 1280, 800],
    ["laptop", 1440, 900],
    ["phone", 390, 844],
    ["small phone", 375, 667],
  ] as const) {
    it.each(ROOM_IDS)(`${label}: %s is framed in the free area`, (id) => {
      const v = roomView(id, w, h);
      const cam = new THREE.PerspectiveCamera(42, w / h, 0.5, 200);
      cam.position.copy(v.p);
      cam.lookAt(v.t);
      cam.updateMatrixWorld();
      const R = freeRegion(w, h);
      const [x0, x1, z0, z1] = ROOMS[id].bounds;
      const tol = 0.02;
      for (const x of [x0, x1])
        for (const z of [z0, z1]) {
          const n = new THREE.Vector3(x, P, z).project(cam);
          expect(n.x).toBeGreaterThanOrEqual(R.x0 - tol);
          expect(n.x).toBeLessThanOrEqual(R.x1 + tol);
          expect(n.y).toBeGreaterThanOrEqual(R.y0 - tol);
          expect(n.y).toBeLessThanOrEqual(R.y1 + tol);
        }
      // and the room's centre is near the middle of that area
      const centre = new THREE.Vector3((x0 + x1) / 2, P, (z0 + z1) / 2).project(cam);
      expect(Math.abs(centre.x - (R.x0 + R.x1) / 2)).toBeLessThan(0.25);
      expect(Math.abs(centre.y - (R.y0 + R.y1) / 2)).toBeLessThan(0.3);
    });
  }
});

describe("chooseView (SPEC §3.4 fallbacks)", () => {
  it("uses 2D without WebGL, whatever the preference", () => {
    expect(chooseView({ pref: "3d", webgl: false, reducedMotion: false }).view).toBe("2d");
  });
  it("uses 2D when reduced motion is preferred and no choice was made", () => {
    expect(chooseView({ pref: null, webgl: true, reducedMotion: true }).view).toBe("2d");
  });
  it("respects an explicit choice", () => {
    expect(chooseView({ pref: "3d", webgl: true, reducedMotion: true }).view).toBe("3d");
    expect(chooseView({ pref: "2d", webgl: true, reducedMotion: false }).view).toBe("2d");
  });
  it("defaults to 3D", () => {
    expect(chooseView({ pref: null, webgl: true, reducedMotion: false }).view).toBe("3d");
  });
});
