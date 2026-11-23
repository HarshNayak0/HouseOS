/** Tiered terracotta roof, jaali band, mukhappu gable and verandah lean-to. Lifts away on "Step inside". */
import * as THREE from "three";
import type { BuildCtx } from "../context";
import type { MatEntry } from "../materials";
import { P, WH } from "../config";
import { VERANDAH_X } from "./structure";

export interface RoofRefs {
  roof: THREE.Group;
  roofMats: THREE.Material[];
}

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

  function hipRoof(x0: number, x1: number, z0: number, z1: number, yE: number, rise: number, e: MatEntry) {
    const hd = (z1 - z0) / 2,
      zc = (z0 + z1) / 2,
      yR = yE + rise,
      sl = Math.hypot(hd, rise) / hd,
      t = e.tile!;
    type V = [number, number, number];
    const A: V = [x0, yE, z1],
      B: V = [x1, yE, z1],
      C: V = [x1, yE, z0],
      D: V = [x0, yE, z0],
      R1: V = [x0 + hd, yR, zc],
      R2: V = [x1 - hd, yR, zc];
    const pos: number[] = [],
      uv: number[] = [];
    const tri = (p: V, q: V, r: V, f: "f" | "b" | "r" | "l") => {
      for (const v of [p, q, r]) {
        pos.push(...v);
        let u: number, w: number;
        if (f === "f") {
          u = v[0];
          w = (z1 - v[2]) * sl;
        } else if (f === "b") {
          u = -v[0];
          w = (v[2] - z0) * sl;
        } else if (f === "r") {
          u = -v[2];
          w = (x1 - v[0]) * sl;
        } else {
          u = v[2];
          w = (v[0] - x0) * sl;
        }
        uv.push(u / t, w / t);
      }
    };
    tri(A, B, R2, "f");
    tri(A, R2, R1, "f");
    tri(C, D, R1, "b");
    tri(C, R1, R2, "b");
    tri(B, C, R2, "r");
    tri(D, A, R1, "l");
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
  }
  hipRoof(-7.8, 7.8, -6.8, 3.8, P + WH, 2.2, R.tile); // lower tier
  b.box(R.lat, 8.8, 0.5, 0.08, 0, 4.15, 1.45, roof);
  b.box(R.lat, 8.8, 0.5, 0.08, 0, 4.15, -4.45, roof); // jaali band between tiers
  hipRoof(-5.1, 5.1, -5.1, 2.1, 4.62, 2.0, R.tile); // upper tier
  // mukhappu — the carved front gable
  {
    const half = 1.7,
      y0 = 5.02,
      rise = 1.95,
      z0 = -1.5,
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
