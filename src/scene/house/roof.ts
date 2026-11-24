/** Tiered terracotta roof, jaali band, mukhappu gable and verandah lean-to. Lifts away on "Step inside". */
import * as THREE from "three";
import type { BuildCtx } from "../context";
import type { MatEntry } from "../materials";
import { COURT, P, WH } from "../config";
import { VERANDAH_X } from "./structure";

export interface RoofRefs {
  roof: THREE.Group;
  roofMats: THREE.Material[];
}

type XZ = [number, number];
/** Keep the part of a convex polygon (plan view, x/z) where a·x + b·z ≤ c (Sutherland–Hodgman). */
function clip(poly: XZ[], a: number, b: number, c: number): XZ[] {
  const out: XZ[] = [];
  const inside = (p: XZ) => a * p[0] + b * p[1] <= c + 1e-9;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i],
      q = poly[(i + 1) % poly.length];
    const pin = inside(p),
      qin = inside(q);
    if (pin) out.push(p);
    if (pin !== qin) {
      const t = (c - a * p[0] - b * p[1]) / (a * (q[0] - p[0]) + b * (q[1] - p[1]));
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  }
  return out;
}
const clipAll = (poly: XZ[], planes: [number, number, number][]) => planes.reduce((acc, [a, b, c]) => (acc.length ? clip(acc, a, b, c) : acc), poly);

/** The opening above the nadumuttam: both roof tiers are cut here, and an inner roof slopes down into it. */
const HOLE = { x0: COURT.x0 - 0.55, x1: COURT.x1 + 0.55, z0: COURT.z0 - 0.55, z1: 2.02 } as const;
/** Inner eave over the courtyard (just inside the pillars) and its height (on the courtyard beams). */
const INNER = { x0: COURT.x0 + 0.1, x1: COURT.x1 - 0.1, z0: COURT.z0 + 0.1, z1: COURT.z1 - 0.1 } as const;
const INNER_EAVE = 3.0;
const INNER_SLOPE = 0.8;
/** Pieces of the plan that lie outside the opening (each convex). */
const OUTSIDE_HOLE: [number, number, number][][] = [
  [[1, 0, HOLE.x0]],
  [[-1, 0, -HOLE.x1]],
  [[-1, 0, -HOLE.x0], [1, 0, HOLE.x1], [0, -1, -HOLE.z1]],
  [[-1, 0, -HOLE.x0], [1, 0, HOLE.x1], [0, 1, HOLE.z0]],
];
/** Inner roof height: rises from the inner eave, the same pitch all round (an inverted hip). */
const innerY = (x: number, z: number) =>
  INNER_EAVE + INNER_SLOPE * Math.max(0, x - INNER.x1, INNER.x0 - x, z - INNER.z1, INNER.z0 - z);

export function buildRoof(ctx: BuildCtx): RoofRefs {
  const { b, M } = ctx;
  const roof = new THREE.Group();
  roof.name = "roof";
  ctx.root.add(roof);
  const roofMats: THREE.Material[] = [];
  const rm = (e: MatEntry): MatEntry => {
    const m = e.m.clone();
    m.transparent = true;
    m.side = THREE.DoubleSide;
    roofMats.push(m);
    return { m, tile: e.tile };
  };
  const R = { tile: rm(M.roof), wood: rm(M.teak), lat: rm(M.lattice), brass: rm(M.brass) };

  /** Upward-facing triangles from a convex plan polygon, lifted by y(x,z), with uv(x,z). */
  function fan(poly: XZ[], y: (x: number, z: number) => number, uvOf: (x: number, z: number) => [number, number], pos: number[], uv: number[]) {
    for (let i = 1; i + 1 < poly.length; i++) {
      let tri = [poly[0], poly[i], poly[i + 1]];
      const [a, b2, c] = tri;
      // keep normals pointing up (plan-view winding)
      if ((b2[1] - a[1]) * (c[0] - a[0]) - (b2[0] - a[0]) * (c[1] - a[1]) < 0) tri = [a, c, b2];
      for (const [x, z] of tri) {
        pos.push(x, y(x, z), z);
        uv.push(...uvOf(x, z));
      }
    }
  }

  function hipRoof(x0: number, x1: number, z0: number, z1: number, yE: number, rise: number, e: MatEntry) {
    const hd = (z1 - z0) / 2,
      zc = (z0 + z1) / 2,
      yR = yE + rise,
      s = rise / hd,
      sl = Math.hypot(hd, rise) / hd,
      t = e.tile!;
    const A: XZ = [x0, z1],
      B: XZ = [x1, z1],
      C: XZ = [x1, z0],
      D: XZ = [x0, z0],
      R1: XZ = [x0 + hd, zc],
      R2: XZ = [x1 - hd, zc];
    // the four faces in plan, each with its height and texture mapping
    const faces: [XZ[], (x: number, z: number) => number, (x: number, z: number) => [number, number]][] = [
      [[A, B, R2, R1], (_x, z) => yE + s * (z1 - z), (x, z) => [x / t, ((z1 - z) * sl) / t]],
      [[C, D, R1, R2], (_x, z) => yE + s * (z - z0), (x, z) => [-x / t, ((z - z0) * sl) / t]],
      [[B, C, R2], (x) => yE + s * (x1 - x), (x, z) => [-z / t, ((x1 - x) * sl) / t]],
      [[D, A, R1], (x) => yE + s * (x - x0), (x, z) => [z / t, ((x - x0) * sl) / t]],
    ];
    const pos: number[] = [],
      uv: number[] = [];
    for (const [poly, y, uvOf] of faces) for (const piece of OUTSIDE_HOLE) fan(clipAll(poly, piece), y, uvOf, pos, uv);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    b.mesh(g, e.m, roof);
    const W = x1 - x0,
      Dd = z1 - z0;
    b.box(R.wood, W + 0.1, 0.2, 0.07, (x0 + x1) / 2, yE - 0.2, z1, roof);
    b.box(R.wood, W + 0.1, 0.2, 0.07, (x0 + x1) / 2, yE - 0.2, z0, roof);
    b.box(R.wood, 0.07, 0.2, Dd, x0, yE - 0.2, zc, roof);
    b.box(R.wood, 0.07, 0.2, Dd, x1, yE - 0.2, zc, roof);
    b.box(R.tile, Math.max(0.1, x1 - hd - (x0 + hd)) + 0.2, 0.16, 0.2, (x0 + x1) / 2, yR - 0.06, zc, roof);
    return (x: number, z: number) => yE + s * Math.max(0, Math.min(x - x0, x1 - x, z - z0, z1 - z));
  }

  /** The inner roof around the nadumuttam (sloping down into the courtyard) and the timber sides of the opening. */
  function innerRoof(upperY: (x: number, z: number) => number) {
    const H: XZ[] = [
      [HOLE.x0, HOLE.z0],
      [HOLE.x1, HOLE.z0],
      [HOLE.x1, HOLE.z1],
      [HOLE.x0, HOLE.z1],
    ];
    const t = R.tile.tile!,
      sl = Math.hypot(1, INNER_SLOPE);
    const { x0: ix0, x1: ix1, z0: iz0, z1: iz1 } = INNER;
    // each face is where its side is the nearest inner eave (45° hips at the corners)
    const faces: [[number, number, number][], (x: number, z: number) => [number, number]][] = [
      [[[1, -1, ix1 - iz1], [-1, -1, -ix0 - iz1], [0, -1, -iz1]], (x, z) => [x / t, ((z - iz1) * sl) / t]], // front
      [[[1, 1, ix1 + iz0], [-1, 1, -ix0 + iz0], [0, 1, iz0]], (x, z) => [-x / t, ((iz0 - z) * sl) / t]], // back
      [[[-1, 1, -ix1 + iz1], [-1, -1, -ix1 - iz0], [-1, 0, -ix1]], (x, z) => [-z / t, ((x - ix1) * sl) / t]], // right
      [[[1, 1, ix0 + iz1], [1, -1, ix0 - iz0], [1, 0, ix0]], (x, z) => [z / t, ((ix0 - x) * sl) / t]], // left
    ];
    const pos: number[] = [],
      uv: number[] = [];
    for (const [planes, uvOf] of faces) fan(clipAll(H, planes), innerY, uvOf, pos, uv);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    b.mesh(g, R.tile.m, roof);
    // eave boards along the inner edge
    b.box(R.wood, ix1 - ix0 + 0.1, 0.16, 0.06, (ix0 + ix1) / 2, INNER_EAVE - 0.12, iz0, roof);
    b.box(R.wood, ix1 - ix0 + 0.1, 0.16, 0.06, (ix0 + ix1) / 2, INNER_EAVE - 0.12, iz1, roof);
    b.box(R.wood, 0.06, 0.16, iz1 - iz0, ix0, INNER_EAVE - 0.12, (iz0 + iz1) / 2, roof);
    b.box(R.wood, 0.06, 0.16, iz1 - iz0, ix1, INNER_EAVE - 0.12, (iz0 + iz1) / 2, roof);
    // timber sides of the opening, from the inner roof up to the upper roof
    const wpos: number[] = [],
      wuv: number[] = [];
    const N = 24;
    for (let e = 0; e < 4; e++) {
      const [ax, az] = H[e],
        [bx, bz] = H[(e + 1) % 4];
      for (let i = 0; i < N; i++) {
        const p = (k: number): [number, number] => [ax + ((bx - ax) * k) / N, az + ((bz - az) * k) / N];
        const [x1, z1] = p(i),
          [x2, z2] = p(i + 1);
        const v = (x: number, y: number, z: number) => {
          wpos.push(x, y, z);
          wuv.push((x + z) / R.lat.tile!, y / R.lat.tile!);
        };
        // two triangles per strip (DoubleSide material, so winding doesn't hide them)
        v(x1, innerY(x1, z1), z1);
        v(x2, innerY(x2, z2), z2);
        v(x2, upperY(x2, z2) - 0.02, z2);
        v(x1, innerY(x1, z1), z1);
        v(x2, upperY(x2, z2) - 0.02, z2);
        v(x1, upperY(x1, z1) - 0.02, z1);
      }
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute("position", new THREE.Float32BufferAttribute(wpos, 3));
    wg.setAttribute("uv", new THREE.Float32BufferAttribute(wuv, 2));
    wg.computeVertexNormals();
    b.mesh(wg, R.lat.m, roof); // carved jaali sides: a timber light-well, like the gable
    // corner posts and a teak frame along the top of the light-well
    for (const [x, z] of H) b.box(R.wood, 0.12, upperY(x, z) - innerY(x, z), 0.12, x, innerY(x, z), z, roof);
    for (let e = 0; e < 4; e++) {
      const [ax, az] = H[e],
        [bx, bz] = H[(e + 1) % 4];
      const sx = ax === bx ? 0.1 : Math.abs(bx - ax),
        sz = az === bz ? 0.1 : Math.abs(bz - az);
      b.box(R.wood, sx, 0.12, sz, (ax + bx) / 2, innerY(ax, az) + 0.02, (az + bz) / 2, roof);
    }
  }

  hipRoof(-7.8, 7.8, -6.8, 3.8, P + WH, 2.2, R.tile); // lower tier
  // jaali band between tiers (the front one stops at the opening)
  b.box(R.lat, HOLE.x0 + 4.4, 0.5, 0.08, (-4.4 + HOLE.x0) / 2, 4.15, 1.45, roof);
  b.box(R.lat, 4.4 - HOLE.x1, 0.5, 0.08, (4.4 + HOLE.x1) / 2, 4.15, 1.45, roof);
  b.box(R.lat, 8.8, 0.5, 0.08, 0, 4.15, -4.45, roof);
  const upperY = hipRoof(-5.1, 5.1, -5.1, 2.1, 4.62, 2.0, R.tile); // upper tier
  innerRoof(upperY);
  // mukhappu — the carved front gable
  {
    const half = 1.7,
      y0 = 5.02,
      rise = 1.95,
      z0 = 1.95, // a pediment on the front slope, so the courtyard opening behind it stays open
      z1 = 2.65,
      slant = Math.hypot(half, rise),
      ang = Math.atan2(rise, half);
    for (const s of [-1, 1]) {
      const p = b.box(R.tile, slant + 0.25, 0.08, z1 - z0, (s * half) / 2, y0 + rise / 2 - 0.04, (z0 + z1) / 2, roof);
      p.rotation.z = -s * ang;
    }
    for (const s of [-1, 1]) {
      const bb = b.box(R.wood, slant + 0.25, 0.22, 0.1, (s * half) / 2, y0 + rise / 2 - 0.2, z1 + 0.02, roof);
      bb.rotation.z = -s * ang;
    }
    const sh = new THREE.Shape();
    sh.moveTo(-half + 0.08, 0);
    sh.lineTo(half - 0.08, 0);
    sh.lineTo(0, rise - 0.1);
    sh.closePath();
    const g = new THREE.ShapeGeometry(sh);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / R.lat.tile!, uv.getY(i) / R.lat.tile!);
    const tri = b.mesh(g, R.lat.m, roof);
    tri.position.set(0, y0, z1 - 0.05);
    // close the back of the gable (seen through the opening)
    const back = new THREE.Shape();
    back.moveTo(-half, 0);
    back.lineTo(half, 0);
    back.lineTo(0, rise);
    back.closePath();
    const bm = b.mesh(new THREE.ShapeGeometry(back), R.wood.m, roof);
    bm.position.set(0, y0 - 0.05, z0);
    b.box(R.wood, 2 * half + 0.2, 0.55, 0.12, 0, y0 - 0.5, z1 - 0.1, roof);
    const fin = b.mesh(new THREE.ConeGeometry(0.09, 0.45, 12), R.brass.m, roof);
    fin.position.set(0, y0 + rise + 0.2, z1 + 0.05);
    const knob = b.mesh(new THREE.SphereGeometry(0.09, 12, 10), R.brass.m, roof);
    knob.position.set(0, y0 + rise - 0.02, z1 + 0.05);
  }
  // verandah lean-to roof
  {
    const zA = 3.25,
      yA = 3.38,
      zB = 7.0,
      yB = 2.72,
      L = Math.hypot(zB - zA, yA - yB),
      ang = Math.atan2(yA - yB, zB - zA);
    const p = b.box(R.tile, 15.6, 0.07, L, 0, (yA + yB) / 2 - 0.035, (zA + zB) / 2, roof);
    p.rotation.x = ang;
    b.box(R.wood, 15.7, 0.2, 0.07, 0, yB - 0.2, zB, roof);
    b.box(R.wood, 0.07, 0.2, L, -7.8, (yA + yB) / 2 - 0.2, (zA + zB) / 2, roof).rotation.x = ang;
    b.box(R.wood, 0.07, 0.2, L, 7.8, (yA + yB) / 2 - 0.2, (zA + zB) / 2, roof).rotation.x = ang;
    for (const x of VERANDAH_X) {
      const r = b.box(R.wood, 0.08, 0.12, L, x, (yA + yB) / 2 - 0.16, (zA + zB) / 2, roof);
      r.rotation.x = ang;
    }
  }
  // hanging verandah lamps
  for (const x of [-1.6, 3.9]) {
    b.cyl(R.brass, 0.008, 0.008, 0.45, x, 2.5, 4.6, roof, 4);
    const l = b.mesh(new THREE.SphereGeometry(0.11, 12, 10), R.brass.m, roof);
    l.position.set(x, 2.45, 4.6);
    ctx.lampLight(x, 2.3, 4.6, 0xffb35c, 7);
  }
  return { roof, roofMats };
}
