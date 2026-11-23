/** Camera views ported from the prototype: exterior 3/4, inside overview, and per-room views. */
import * as THREE from "three";
import { P, ROOMS, type RoomId } from "../config";

export interface View {
  p: THREE.Vector3;
  t: THREE.Vector3;
}

export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const isPortrait = (w: number, h: number) => w / h < 0.9;
/** Desktop layout: panel on the right. Mobile: bottom sheet. */
export const isWide = (w: number) => w > 720;

export function views(w: number, h: number) {
  const portrait = isPortrait(w, h);
  const k = portrait ? 1.75 : 1;
  const extT = new THREE.Vector3(0, 2.4, 0);
  const ext: View = { t: extT, p: extT.clone().add(new THREE.Vector3(14, 6.5, 19).multiplyScalar(k)) };
  const insT = new THREE.Vector3(portrait ? -0.6 : 0.5, 0.4, portrait ? -1.8 : -3.2);
  const ins: View = { t: insT, p: insT.clone().add(new THREE.Vector3(9, 15.5, 15).multiplyScalar(k)) };
  return { ext, ins };
}

export function roomCenter(id: RoomId) {
  const [x0, x1, z0, z1] = ROOMS[id].bounds;
  return new THREE.Vector3((x0 + x1) / 2, P, (z0 + z1) / 2);
}

/**
 * Camera for a selected room. The target is offset so the room stays visible beside the
 * desktop panel (right) or above the mobile bottom sheet.
 */
export function roomView(id: RoomId, w: number, h: number): View {
  const [x0, x1, z0, z1] = ROOMS[id].bounds;
  const s = Math.max(x1 - x0, z1 - z0);
  const t = roomCenter(id);
  t.y = P + 0.4;
  let off = new THREE.Vector3(s * 0.35, s * 0.95 + 2.6, s * 0.85 + 2.4);
  if (id === "backyard") off = new THREE.Vector3(3, 9, 11);
  if (isPortrait(w, h)) {
    off.multiplyScalar(1.45);
    t.z += s * 0.55 + 1.2;
  } else if (isWide(w)) {
    t.x += s * 0.32 + 0.8;
  }
  return { p: t.clone().add(off), t };
}
