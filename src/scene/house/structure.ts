/** Plinth, walls with their openings, windows, pillars, verandah and charupadi seating. */
import * as THREE from "three";
import type { BuildCtx } from "../context";
import { COURT, P, WH } from "../config";

export function buildPlinth({ b, M }: BuildCtx) {
  const FX0 = -7.2,
    FX1 = 7.2,
    FZ0 = -6.2,
    FZ1 = 6.2;
  b.box(M.laterite, FX1 - FX0, 0.18, 0.25, 0, 0, FZ1 - 0.125);
  b.box(M.redOxide, FX1 - FX0, P - 0.18, 0.25, 0, 0.18, FZ1 - 0.125);
  b.box(M.laterite, FX1 - FX0, 0.18, 0.25, 0, 0, FZ0 + 0.125);
  b.box(M.redOxide, FX1 - FX0, P - 0.18, 0.25, 0, 0.18, FZ0 + 0.125);
  b.box(M.laterite, 0.25, 0.18, FZ1 - FZ0, FX0 + 0.125, 0, 0);
  b.box(M.redOxide, 0.25, P - 0.18, FZ1 - FZ0, FX0 + 0.125, 0.18, 0);
  b.box(M.laterite, 0.25, 0.18, FZ1 - FZ0, FX1 - 0.125, 0, 0);
  b.box(M.redOxide, 0.25, P - 0.18, FZ1 - FZ0, FX1 - 0.125, 0.18, 0);
  b.box(M.redOxide, 2.2, 0.3, 0.38, 0.25, 0, 6.39);
  b.box(M.redOxide, 2.2, 0.15, 0.38, 0.25, 0, 6.77); // steps
}

/** Builds the walls into their own group (scaled down for the cutaway view). */
export function buildWalls(ctx: BuildCtx): THREE.Group {
  const { b, M } = ctx;
  const walls = new THREE.Group();
  walls.name = "walls";
  walls.position.y = P;
  ctx.root.add(walls);
  const wp = (cx: number, cz: number, lx: number, lz: number) => b.box(M.plaster, lx, WH, lz, cx, 0, cz, walls);
  function runs(a: number, bb: number, gaps: [number, number][]) {
    a -= 0.1;
    bb += 0.1;
    const out: [number, number][] = [];
    let cur = a;
    for (const [c, w] of gaps.sort((p, q) => p[0] - q[0])) {
      const s = c - w / 2;
      if (s > cur) out.push([cur, s]);
      cur = c + w / 2;
    }
    if (bb > cur) out.push([cur, bb]);
    return out;
  }
  const wallX = (z: number, x1: number, x2: number, gaps: [number, number][] = []) =>
    runs(x1, x2, gaps).forEach(([a, c]) => wp((a + c) / 2, z, c - a, 0.2));
  const wallZ = (x: number, z1: number, z2: number, gaps: [number, number][] = []) =>
    runs(z1, z2, gaps).forEach(([a, c]) => wp(x, (a + c) / 2, 0.2, c - a));
  wallX(-6, -7, 7); // back
  wallZ(-7, -6, 3);
  wallZ(7, -6, 3); // sides
  wallX(3, -4.5, 7, [[0.25, 1.3]]); // front (main door)
  wallX(3, -7, -4.5, [[-5.75, 0.9]]); // living → closet
  // closet sits under the lower verandah roof, so its walls are shorter
  {
    const CH = 2.3;
    const cp = (cx: number, cz: number, lx: number, lz: number) => b.box(M.plaster, lx, CH, lz, cx, 0, cz, walls);
    cp(-7, 4.5, 0.2, 3.2);
    cp(-5.75, 6, 2.7, 0.2);
    cp(-4.5, 3.45, 0.2, 1.1);
    cp(-4.5, 5.55, 0.2, 1.1);
    b.box(M.teak, 2.7, 0.15, 0.26, -5.75, CH - 0.15 + 0.012, 6, walls);
  }
  wallX(-2, -7, 3, [
    [-4.75, 0.9],
    [0.25, 0.9],
  ]); // back rooms
  wallZ(-2.5, -6, -2); // office | bedroom
  wallZ(3, -6, 3, [
    [-1.5, 0.9],
    [1.0, 0.9],
  ]); // kitchen/laundry
  wallX(-1, 3, 7, [[5, 0.9]]); // kitchen | laundry
  b.box(M.plaster, 1.5, WH - 2.3, 0.2, 0.25, 2.3, 3, walls); // lintel over main door
  const doorL = b.box(M.teak, 0.62, 2.3, 0.08, -0.12, 0, 3.12, walls);
  doorL.rotation.y = 0.5;
  const doorR = b.box(M.teak, 0.62, 2.3, 0.08, 0.62, 0, 3.12, walls);
  doorR.rotation.y = -0.5;
  // lattice windows on outer walls
  const winX = (x: number, z: number) => {
    b.box(M.teak, 1.2, 1.4, 0.3, x, 0.9, z, walls);
    b.box(M.lattice, 1.0, 1.2, 0.34, x, 1.0, z, walls);
  };
  const winZ = (x: number, z: number) => {
    b.box(M.teak, 0.3, 1.4, 1.2, x, 0.9, z, walls);
    b.box(M.lattice, 0.34, 1.2, 1.0, x, 1.0, z, walls);
  };
  winX(-4.75, -6);
  winX(0.25, -6);
  winX(5, -6);
  winX(-3.3, 3);
  winX(2.4, 3);
  winX(5.2, 3);
  winZ(-7, -4);
  winZ(-7, 0.5);
  winZ(7, -3.5);
  winZ(7, 1.2);
  // teak wall-plate along the top of outer walls
  // (raised a hair above the wall top so the two surfaces don't z-fight / flicker)
  const PLATE = WH - 0.18 + 0.012;
  b.box(M.teak, 14.2, 0.18, 0.26, 0, PLATE, -6, walls);
  b.box(M.teak, 0.26, 0.18, 12.2, -7, PLATE, 0, walls);
  b.box(M.teak, 0.26, 0.18, 9.2, 7, PLATE, -1.5, walls);
  return walls;
}

export const VERANDAH_X = [-4.3, -2.4, -0.65, 1.15, 2.9, 4.9, 6.9];

export function buildPillarsAndVerandah({ b, M }: BuildCtx) {
  const { x0: CX0, x1: CX1, z0: CZ0, z1: CZ1 } = COURT;
  function pillar(x: number, z: number, top: number) {
    b.box(M.stone, 0.34, 0.14, 0.34, x, P, z);
    b.cyl(M.teak, 0.1, 0.12, top - P - 0.34, x, P + 0.14, z, null, 14);
    b.cyl(M.brass, 0.13, 0.13, 0.04, x, P + 0.5, z, null, 14);
    b.box(M.teak, 0.3, 0.2, 0.3, x, top - 0.2, z);
  }
  for (const [x, z] of [
    [CX0, CZ0],
    [CX1, CZ0],
    [CX0, CZ1],
    [CX1, CZ1],
  ])
    pillar(x, z, 2.75);
  b.box(M.teak, CX1 - CX0 + 0.3, 0.2, 0.22, (CX0 + CX1) / 2, 2.75, CZ0);
  b.box(M.teak, CX1 - CX0 + 0.3, 0.2, 0.22, (CX0 + CX1) / 2, 2.75, CZ1);
  b.box(M.teak, 0.22, 0.2, CZ1 - CZ0 + 0.3, CX0, 2.75, (CZ0 + CZ1) / 2);
  b.box(M.teak, 0.22, 0.2, CZ1 - CZ0 + 0.3, CX1, 2.75, (CZ0 + CZ1) / 2);
  for (const z of [0.15, 0.85]) b.box(M.teak, CX1 - CX0, 0.12, 0.12, (CX0 + CX1) / 2, 2.63, z);
  for (const [x, z] of [
    [-2.5, -2],
    [-2.5, 3],
  ])
    pillar(x, z, 2.9); // living ↔ hall open edge
  for (const x of VERANDAH_X) pillar(x, 5.95, 2.9);
  b.box(M.teak, 11.6, 0.2, 0.24, 1.3, 2.75, 5.95);
  // charupadi seating with sloped backrest
  for (const [x0, x1] of [
    [-4.3, -0.65],
    [1.15, 6.9],
  ]) {
    const w = x1 - x0,
      cx = (x0 + x1) / 2;
    b.box(M.teak, w, 0.07, 0.5, cx, P + 0.42, 5.75);
    b.box(M.redOxide, w, 0.42, 0.12, cx, P, 5.95);
    const back = b.box(M.teak, w, 0.55, 0.05, cx, P + 0.45, 6.05);
    back.rotation.x = -0.38;
    back.position.z += 0.08;
    for (let x = x0 + 0.15; x <= x1 - 0.1; x += 0.18) {
      const s = b.box(M.teak, 0.04, 0.5, 0.04, x, P + 0.46, 6.06);
      s.rotation.x = -0.38;
      s.position.z += 0.08;
    }
  }
}
