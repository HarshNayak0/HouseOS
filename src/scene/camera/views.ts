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

/** Screen area (in normalised device coords, -1..1, y up) not covered by the header or the panel. */
export function freeRegion(w: number, h: number) {
  if (isWide(w)) {
    // desktop: 370 px panel + 16 px margin on the right, ~70 px header on top
    return { x0: -1, x1: 1 - (2 * (370 + 32)) / w, y0: -1, y1: 1 - (2 * 70) / h };
  }
  // phone: bottom sheet covers 58% of the height (+8 px); the header can wrap to ~110 px
  const sheetTop = h * 0.42 - 8;
  return { x0: -1, x1: 1, y0: 1 - (2 * sheetTop) / h, y1: 1 - (2 * 110) / h };
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Camera for a selected room: looks at the room from the prototype's angle, and picks the
 * distance and a sideways shift so the whole room fits in the free part of the screen
 * (beside the desktop panel, or above the phone's bottom sheet).
 */
export function roomView(id: RoomId, w: number, h: number, fov = 42): View {
  const [x0, x1, z0, z1] = ROOMS[id].bounds;
  const s = Math.max(x1 - x0, z1 - z0);
  const yard = id === "backyard";
  const yLo = yard ? 0 : P,
    yHi = yard ? 1.5 : P + 1.2;
  const c = new THREE.Vector3((x0 + x1) / 2, (yLo + yHi) / 2, (z0 + z1) / 2);
  // viewing direction from the prototype (camera sits up and to the front-right)
  const dir = (yard ? new THREE.Vector3(3, 9, 11) : new THREE.Vector3(s * 0.35, s * 0.95 + 2.6, s * 0.85 + 2.4)).normalize();
  const f = dir.clone().negate();
  const r = new THREE.Vector3().crossVectors(f, UP).normalize();
  const u = new THREE.Vector3().crossVectors(r, f).normalize();
  const tanY = Math.tan(THREE.MathUtils.degToRad(fov / 2)),
    tanX = tanY * (w / h);

  const corners: THREE.Vector3[] = [];
  for (const x of [x0, x1]) for (const y of [yLo, yHi]) for (const z of [z0, z1]) corners.push(new THREE.Vector3(x, y, z).sub(c));
  // NDC extent of the room seen from distance d, looking at its centre
  const extent = (d: number) => {
    let nx0 = Infinity,
      nx1 = -Infinity,
      ny0 = Infinity,
      ny1 = -Infinity;
    for (const q of corners) {
      const depth = d + q.dot(f);
      const nx = q.dot(r) / (depth * tanX),
        ny = q.dot(u) / (depth * tanY);
      nx0 = Math.min(nx0, nx);
      nx1 = Math.max(nx1, nx);
      ny0 = Math.min(ny0, ny);
      ny1 = Math.max(ny1, ny);
    }
    return { nx0, nx1, ny0, ny1 };
  };
  const R = freeRegion(w, h);
  const fill = 0.86; // leave a little margin round the room
  const fits = (d: number) => {
    const e = extent(d);
    return e.nx1 - e.nx0 <= (R.x1 - R.x0) * fill && e.ny1 - e.ny0 <= (R.y1 - R.y0) * fill;
  };
  let lo = 4,
    hi = 55;
  if (fits(lo)) hi = lo;
  else for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  const d = hi;
  // shift sideways so the room's centre on screen lands in the centre of the free region
  const e = extent(d);
  const dx = (R.x0 + R.x1) / 2 - (e.nx0 + e.nx1) / 2,
    dy = (R.y0 + R.y1) / 2 - (e.ny0 + e.ny1) / 2;
  const t = c
    .clone()
    .addScaledVector(r, -dx * tanX * d)
    .addScaledVector(u, -dy * tanY * d);
  return { t, p: t.clone().addScaledVector(dir, d) };
}
