/** Room floors (red-oxide with black border), the sunken nadumuttam and the backyard pick zone. */
import * as THREE from "three";
import { scaleBoxUV } from "../builder";
import type { BuildCtx } from "../context";
import { COURT, P, ROOMS, type RoomId } from "../config";

export function buildFloors(ctx: BuildCtx) {
  const { b, M } = ctx;
  function floorRect(x0: number, x1: number, z0: number, z1: number, room: RoomId | null, withBorder = true) {
    const w = x1 - x0,
      d = z1 - z0,
      cx = (x0 + x1) / 2,
      cz = (z0 + z1) / 2;
    if (withBorder) b.box(M.border, w, 0.03, d, cx, P - 0.035, cz);
    const inset = withBorder ? 0.28 : 0;
    const geo = new THREE.BoxGeometry(w - inset, 0.03, d - inset);
    scaleBoxUV(geo, w - inset, 0.03, d - inset, M.redOxide.tile);
    if (!room) {
      const m = b.mesh(geo, M.redOxide.m);
      m.position.set(cx, P - 0.015, cz);
      m.castShadow = false;
      return m;
    }
    const mat = (M.redOxide.m as THREE.MeshStandardMaterial).clone();
    mat.emissive = new THREE.Color(0);
    const m = b.mesh(geo, mat);
    m.position.set(cx, P - 0.015, cz);
    m.castShadow = false;
    m.userData.room = room;
    m.userData.keep = true;
    ctx.pickables.push(m);
    ctx.roomMats[room].push(mat);
    return m;
  }
  floorRect(-7, -2.5, -6, -2, "office");
  floorRect(-2.5, 3, -6, -2, "bedroom");
  floorRect(3, 7, -6, -1, "kitchen");
  floorRect(3, 7, -1, 3, "wash");
  floorRect(-7, -2.5, -2, 3, "living");
  floorRect(-7, -4.5, 3, 6, "closet");
  floorRect(-4.5, 7.2, 3, 6.2, null);
  // central hall around the sunken nadumuttam
  const { x0: CX0, x1: CX1, z0: CZ0, z1: CZ1 } = COURT;
  floorRect(-2.5, 3, CZ1, 3, "living", false);
  floorRect(-2.5, 3, -2, CZ0, "living", false);
  floorRect(-2.5, CX0, CZ0, CZ1, "living", false);
  floorRect(CX1, 3, CZ0, CZ1, "living", false);
  b.box(M.stone, CX1 - CX0, 0.05, CZ1 - CZ0, (CX0 + CX1) / 2, 0.05, (CZ0 + CZ1) / 2);
  b.box(M.stone, CX1 - CX0, P - 0.1, 0.14, (CX0 + CX1) / 2, 0.1, CZ0 + 0.07);
  b.box(M.stone, CX1 - CX0, P - 0.1, 0.14, (CX0 + CX1) / 2, 0.1, CZ1 - 0.07);
  b.box(M.stone, 0.14, P - 0.1, CZ1 - CZ0, CX0 + 0.07, 0.1, (CZ0 + CZ1) / 2);
  b.box(M.stone, 0.14, P - 0.1, CZ1 - CZ0, CX1 - 0.07, 0.1, (CZ0 + CZ1) / 2);
  // backyard pick zone (invisible until hovered)
  {
    const mat = new THREE.MeshBasicMaterial({ color: 0xe2b85a, transparent: true, opacity: 0, depthWrite: false });
    const [x0, x1, z0, z1] = ROOMS.backyard.bounds;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, 0.05, (z0 + z1) / 2);
    m.userData.room = "backyard";
    m.userData.keep = true;
    ctx.root.add(m);
    ctx.pickables.push(m);
    ctx.backyardOverlay = mat;
  }
}
