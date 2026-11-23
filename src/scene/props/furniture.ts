/** Furniture for every room. Ported in the prototype's exact order (it consumes the shared RNG). */
import * as THREE from "three";
import { keepSeparate } from "../builder";
import type { BuildCtx } from "../context";
import { COURT, P } from "../config";

export interface FurnitureRefs {
  flames: THREE.Mesh[];
  heap: THREE.Mesh;
}

export function buildFurniture(ctx: BuildCtx): FurnitureRefs {
  const { b, M, rnd, color } = ctx;
  const flames: THREE.Mesh[] = [];

  /* Living room */
  b.box(M.teak, 0.85, 0.32, 2.3, -6.5, P, 0.5);
  b.box(M.fabric, 0.75, 0.16, 2.1, -6.48, P + 0.32, 0.5);
  b.box(M.teak, 0.12, 0.55, 2.3, -6.86, P + 0.32, 0.5);
  b.box(M.fabric, 0.12, 0.4, 0.5, -6.72, P + 0.48, -0.05);
  b.box(M.fabric, 0.12, 0.4, 0.5, -6.72, P + 0.48, 1.05);
  b.box(M.teak, 0.85, 0.5, 0.1, -6.5, P, -0.65);
  b.box(M.teak, 0.85, 0.5, 0.1, -6.5, P, 1.65);
  b.box(M.teak, 0.7, 0.05, 1.1, -5.3, P + 0.36, 0.5);
  for (const [dx, dz] of [
    [-0.3, -0.5],
    [0.3, -0.5],
    [-0.3, 0.5],
    [0.3, 0.5],
  ])
    b.box(M.teak, 0.05, 0.36, 0.05, -5.3 + dx, P, 0.5 + dz);
  {
    const r = b.box(M.fabric, 2.2, 0.01, 2.8, -5.4, P, 0.5);
    r.receiveShadow = true;
    r.castShadow = false;
  }
  b.cyl(M.brass, 0.09, 0.07, 0.06, -5.3, P + 0.41, 0.3);
  // planter's easy chair (chaaru kasera)
  {
    const g = new THREE.Group();
    g.position.set(-4.3, P, 2.3);
    g.rotation.y = -2.4;
    ctx.root.add(g);
    b.box(M.teak, 0.06, 0.5, 1.2, -0.3, 0, 0, g);
    b.box(M.teak, 0.06, 0.5, 1.2, 0.3, 0, 0, g);
    const s = b.box(M.fabric, 0.56, 0.03, 1.15, 0, 0.3, 0.05, g);
    s.rotation.x = -0.45;
  }
  // notes board on an easel
  {
    const g = new THREE.Group();
    g.position.set(-3.5, P, -1.6);
    g.rotation.y = 0.35;
    ctx.root.add(g);
    b.box(M.teak, 0.05, 1.25, 0.05, -0.45, 0, -0.05, g);
    b.box(M.teak, 0.05, 1.25, 0.05, 0.45, 0, -0.05, g);
    const board = b.box(M.teak, 1.05, 0.72, 0.05, 0, 0.45, 0, g);
    board.rotation.x = -0.12;
    b.box(color({ color: 0xd9c39a, roughness: 1 }), 0.95, 0.62, 0.02, 0, 0.5, 0.03, g).rotation.x = -0.12;
    (
      [
        [0xfff1b8, -0.28, 0.92],
        [0xf6d0c8, 0.05, 0.95],
        [0xd8e8c4, 0.3, 0.86],
        [0xfff1b8, -0.12, 0.66],
        [0xf6d0c8, 0.24, 0.62],
      ] as const
    ).forEach(([c, x, y]) => {
      const n = b.box(color({ color: c, roughness: 1 }), 0.2, 0.18, 0.01, x, y, 0.06 - (y - 0.45) * 0.12, g);
      n.rotation.x = -0.12;
      n.rotation.z = (rnd() - 0.5) * 0.2;
    });
  }
  // nilavilakku (brass lamp) — lights when a new note lands
  {
    const x = -1.9,
      z = 2.45;
    b.cyl(M.brass, 0.16, 0.2, 0.05, x, P, z);
    b.cyl(M.brass, 0.025, 0.04, 0.7, x, P + 0.05, z);
    b.cyl(M.brass, 0.15, 0.05, 0.07, x, P + 0.74, z);
    b.cyl(M.brass, 0.02, 0.02, 0.18, x, P + 0.8, z);
    const finial = b.mesh(new THREE.ConeGeometry(0.05, 0.12, 12), M.brass.m);
    finial.position.set(x, P + 1.03, z);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffc04d });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const f = keepSeparate(new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 8), flameMat));
      f.position.set(x + Math.cos(a) * 0.12, P + 0.84, z + Math.sin(a) * 0.12);
      ctx.root.add(f);
      flames.push(f);
    }
    ctx.lampLight(x, P + 1.1, z, 0xffae55, 6);
  }
  // uruli with floating flowers
  {
    const x = 2.25,
      z = 2.35;
    const u = b.mesh(
      new THREE.SphereGeometry(0.42, 28, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xb87a3a, metalness: 0.85, roughness: 0.3, side: THREE.DoubleSide }),
    );
    u.scale.y = 0.42;
    u.position.set(x, P + 0.2, z);
    const wtr = b.mesh(new THREE.CircleGeometry(0.38, 24), new THREE.MeshStandardMaterial({ map: ctx.T.water, roughness: 0.15 }));
    wtr.rotation.x = -Math.PI / 2;
    wtr.position.set(x, P + 0.17, z);
    for (let i = 0; i < 9; i++) {
      const a = rnd() * 6.28,
        r = rnd() * 0.28;
      const f = b.mesh(new THREE.SphereGeometry(0.045, 8, 6), color({ color: [0xff8c1a, 0xffd23f, 0xe8473a][i % 3], roughness: 0.8 }).m);
      f.scale.y = 0.45;
      f.position.set(x + Math.cos(a) * r, P + 0.19, z + Math.sin(a) * r);
    }
  }
  // oonjal swing over the courtyard
  {
    const { x0: CX0, x1: CX1 } = COURT;
    const sx = (CX0 + CX1) / 2,
      sz = 0.5,
      sy = 0.62;
    b.box(M.teak, 1.9, 0.08, 0.8, sx, sy, sz);
    b.box(M.teak, 1.95, 0.05, 0.85, sx, sy - 0.05, sz);
    b.box(M.fabric, 1.7, 0.1, 0.65, sx, sy + 0.08, sz);
    b.box(M.fabric, 0.35, 0.22, 0.5, sx - 0.65, sy + 0.18, sz).rotation.z = 0.2;
    b.box(M.fabric, 0.35, 0.22, 0.5, sx + 0.65, sy + 0.18, sz).rotation.z = -0.2;
    for (const [dx, dz] of [
      [-0.85, -0.35],
      [0.85, -0.35],
      [-0.85, 0.35],
      [0.85, 0.35],
    ])
      b.cyl(M.brass, 0.014, 0.014, 2.57 - sy - 0.08, sx + dx, sy + 0.08, sz + dz, null, 6);
    for (const [x, z] of [
      [-0.85, -0.55],
      [1.35, 1.55],
      [-0.8, 1.6],
    ]) {
      b.cyl(M.pot, 0.13, 0.1, 0.22, x, 0.1, z);
      const bush = b.mesh(new THREE.IcosahedronGeometry(0.2, 0), M.leaf.m);
      bush.position.set(x, 0.42, z);
    }
  }

  /* Office */
  b.box(M.teak, 1.5, 0.05, 0.7, -4.75, P + 0.72, -5.5);
  for (const [dx, dz] of [
    [-0.7, -0.3],
    [0.7, -0.3],
    [-0.7, 0.3],
    [0.7, 0.3],
  ])
    b.box(M.teak, 0.05, 0.72, 0.05, -4.75 + dx, P, -5.5 + dz);
  b.box(M.dark, 0.36, 0.02, 0.25, -4.75, P + 0.77, -5.45);
  {
    const s = b.box(M.dark, 0.36, 0.24, 0.015, -4.75, P + 0.78, -5.6);
    s.rotation.x = -0.25;
  }
  b.box(M.teak, 0.5, 0.05, 0.5, -4.75, P + 0.45, -4.75);
  b.box(M.teak, 0.5, 0.5, 0.05, -4.75, P + 0.5, -4.5);
  for (const [dx, dz] of [
    [-0.22, -0.22],
    [0.22, -0.22],
    [-0.22, 0.22],
    [0.22, 0.22],
  ])
    b.box(M.teak, 0.04, 0.45, 0.04, -4.75 + dx, P, -4.75 + dz);
  b.box(M.teak, 0.38, 1.85, 1.3, -6.75, P, -3.6);
  for (let s = 0; s < 4; s++) {
    let z = -4.15;
    while (z < -3.05) {
      const w = 0.04 + rnd() * 0.05,
        hh = 0.24 + rnd() * 0.12;
      b.box(
        color({ color: [0x7a2f22, 0x2f4a5c, 0x4f7a3a, 0xb8893b, 0x3b2418, 0xe2d6bd][(rnd() * 6) | 0], roughness: 0.8 }),
        0.26,
        hh,
        w,
        -6.6,
        P + 0.12 + s * 0.43,
        z + w / 2,
      );
      z += w + 0.01;
    }
  }
  b.cyl(M.pot, 0.16, 0.12, 0.35, -3.0, P, -5.5);
  {
    const bush = b.mesh(new THREE.IcosahedronGeometry(0.3, 1), M.leaf.m);
    bush.position.set(-3.0, P + 0.65, -5.5);
  }

  /* Bedroom */
  b.box(M.teak, 1.75, 0.32, 2.15, 0.25, P, -4.9);
  b.box(M.cream, 1.62, 0.2, 2.0, 0.25, P + 0.32, -4.9);
  b.box(M.fabric, 1.66, 0.06, 1.25, 0.25, P + 0.5, -4.4);
  b.box(M.cream, 0.6, 0.12, 0.36, -0.1, P + 0.52, -5.65);
  b.box(M.cream, 0.6, 0.12, 0.36, 0.6, P + 0.52, -5.65);
  b.box(M.teak, 1.85, 1.05, 0.08, 0.25, P, -5.95);
  b.box(M.lattice, 1.5, 0.5, 0.1, 0.25, P + 0.45, -5.94);
  // petti (chest) at the foot of the bed
  b.box(M.teak, 1.05, 0.5, 0.5, 0.25, P, -3.4);
  b.box(M.brass, 1.07, 0.04, 0.52, 0.25, P + 0.38, -3.4);
  b.box(M.brass, 0.08, 0.06, 0.06, 0.25, P + 0.3, -3.13);
  for (const x of [-0.95, 1.45]) {
    b.box(M.teak, 0.45, 0.5, 0.4, x, P, -5.7);
    b.cyl(M.brass, 0.06, 0.09, 0.28, x, P + 0.5, -5.7);
  }
  {
    const r = b.box(color({ color: 0x6b2a20, roughness: 1 }), 2.4, 0.01, 1.4, 0.25, P, -3.1);
    r.castShadow = false;
  }

  /* Kitchen */
  b.box(M.teak, 3.6, 0.86, 0.6, 5.0, P, -5.65);
  b.box(M.granite, 3.7, 0.05, 0.66, 5.0, P + 0.86, -5.65);
  b.box(M.teak, 0.6, 0.86, 2.3, 6.65, P, -4.2);
  b.box(M.granite, 0.66, 0.05, 2.3, 6.65, P + 0.86, -4.2);
  b.box(M.dark, 0.7, 0.04, 0.48, 4.1, P + 0.91, -5.65);
  for (const dx of [-0.17, 0.17]) b.cyl(M.dark, 0.09, 0.09, 0.02, 4.1 + dx, P + 0.95, -5.65);
  b.cyl(M.copper, 0.13, 0.11, 0.18, 3.93, P + 0.97, -5.65);
  b.cyl(M.brass, 0.16, 0.12, 0.12, 4.27, P + 0.97, -5.65);
  b.box(M.teak, 2.2, 0.04, 0.26, 5.2, P + 1.55, -5.85);
  for (let i = 0; i < 6; i++)
    b.cyl(i % 2 ? M.brass : M.copper, 0.07 + rnd() * 0.04, 0.06, 0.16 + rnd() * 0.1, 4.3 + i * 0.36, P + 1.59, -5.85);
  b.cyl(M.dark, 0.035, 0.035, 0.3, 6.65, P + 0.91, -4.9);
  b.box(M.white, 0.72, 1.85, 0.7, 6.6, P, -1.55); // fridge
  b.box(M.teak, 1.2, 0.05, 0.75, 4.8, P + 0.74, -3.4);
  for (const [dx, dz] of [
    [-0.55, -0.32],
    [0.55, -0.32],
    [-0.55, 0.32],
    [0.55, 0.32],
  ])
    b.box(M.teak, 0.05, 0.74, 0.05, 4.8 + dx, P, -3.4 + dz);
  for (const x of [4.45, 5.15]) b.cyl(M.teak, 0.17, 0.15, 0.48, x, P, -2.75, null, 14);
  b.cyl(M.wicker, 0.2, 0.17, 0.2, 4.8, P + 0.79, -3.4, null, 16);
  for (let i = 0; i < 4; i++) {
    const f = b.mesh(new THREE.SphereGeometry(0.06, 10, 8), color({ color: [0xf2c230, 0x9bbf3a, 0xd9572b, 0xf2c230][i], roughness: 0.6 }).m);
    f.position.set(4.72 + i * 0.06, P + 1.0, -3.4 + (i % 2) * 0.06);
  }

  /* Wash area */
  b.box(M.white, 0.66, 0.86, 0.66, 6.6, P, 0.0);
  {
    const d = b.cyl(M.dark, 0.2, 0.2, 0.02, 6.26, P + 0.45, 0.0, null, 24);
    d.position.y = P + 0.48;
    d.rotation.z = Math.PI / 2;
  }
  b.box(M.laterite, 0.9, 0.55, 0.6, 6.55, P, 2.25);
  b.cyl(M.wicker, 0.32, 0.27, 0.45, 4.7, P, 2.3, null, 20);
  const heap = keepSeparate(b.mesh(new THREE.SphereGeometry(0.3, 14, 10), M.fabric.m));
  heap.position.set(4.7, P + 0.42, 2.3);
  for (const z of [-0.6, 2.6]) b.cyl(M.teak, 0.03, 0.03, 1.8, 3.6, P, z, null, 8);
  b.cyl(M.white, 0.006, 0.006, 3.2, 3.6, P + 1.75, 1.0, null, 4).rotation.x = Math.PI / 2;
  (
    [
      [0xa33a2a, -0.2],
      [0xefe3cb, 0.35],
      [0x2f4a5c, 0.9],
      [0xe2b85a, 1.45],
      [0xefe3cb, 2.0],
    ] as const
  ).forEach(([c, z]) => {
    const m = b.mesh(
      new THREE.PlaneGeometry(0.4, 0.55),
      new THREE.MeshStandardMaterial({ color: c, roughness: 1, side: THREE.DoubleSide }),
    );
    m.position.set(3.6, P + 1.47, z);
    m.rotation.y = Math.PI / 2;
  });

  /* Coat closet (the vault) */
  b.box(M.teak, 0.62, 2.0, 1.7, -6.65, P, 4.5);
  b.box(M.lattice, 0.03, 1.55, 0.72, -6.33, P + 0.25, 4.1);
  b.box(M.lattice, 0.03, 1.55, 0.72, -6.33, P + 0.25, 4.9);
  b.box(M.teak, 0.7, 0.12, 1.8, -6.65, P + 2.0, 4.5);
  b.box(M.brass, 0.05, 0.14, 0.1, -6.3, P + 1.0, 4.5);
  b.box(M.teak, 1.2, 0.08, 0.38, -5.4, P + 0.42, 5.7);
  for (const dx of [-0.5, 0.5]) b.box(M.teak, 0.06, 0.42, 0.32, -5.4 + dx, P, 5.7);
  b.cyl(M.brass, 0.12, 0.1, 0.5, -4.85, P, 3.35, null, 14);
  for (let i = 0; i < 3; i++) b.box(M.teak, 0.08, 0.06, 0.16, -6.93, P + 1.75, 3.4 + i * 0.25);

  return { flames, heap };
}
