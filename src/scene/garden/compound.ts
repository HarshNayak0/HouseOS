/** Ground, front muttam, paths and the laterite compound wall. */
import * as THREE from "three";
import type { BuildCtx } from "../context";

export function buildCompound({ b, M }: BuildCtx) {
  {
    const g = new THREE.PlaneGeometry(90, 90);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * 90) / M.grass.tile, (uv.getY(i) * 90) / M.grass.tile);
    const m = b.mesh(g, M.grass.m);
    m.rotation.x = -Math.PI / 2;
    m.castShadow = false;
  }
  b.flat(M.sand, -8.5, 9.5, 6.2, 11.6, 0.012); // swept front muttam
  b.flat(M.laterite, -0.8, 1.3, 6.9, 12.4, 0.024); // front path
  for (let i = 0; i < 6; i++) b.box(M.laterite, 0.7, 0.05, 0.5, 3.4 + i * 0.15, 0, -7.6 - i * 0.75); // stepping stones to pond
  // laterite boundary wall
  const BW = 1.1,
    BT = 0.35;
  b.box(M.laterite, 12.6, BW, BT, -7.7, 0, 12.4);
  b.box(M.laterite, 12.4, BW, BT, 8.2, 0, 12.4);
  b.box(M.laterite, 28.4, BW, BT, 0, 0, -18.2);
  b.box(M.laterite, BT, BW, 30.6, -14.2, 0, -2.9);
  b.box(M.laterite, BT, BW, 30.6, 14.2, 0, -2.9);
  for (const x of [-1.6, 2.1]) {
    b.box(M.laterite, 0.6, 1.7, 0.6, x, 0, 12.4);
    b.box(M.roof, 0.8, 0.12, 0.8, x, 1.7, 12.4);
  }
  for (const [x0, x1, z] of [
    [-14, -1.8, 12.4],
    [2.3, 14.2, 12.4],
    [-14, 14.2, -18.2],
  ])
    b.box(M.roof, x1 - x0, 0.08, BT + 0.12, (x0 + x1) / 2, BW, z);
}
