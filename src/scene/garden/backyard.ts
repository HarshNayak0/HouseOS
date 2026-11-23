/** Thodi (backyard): coconut palms, banana plants, hedge, pond with kettuvallam, well, back path. */
import * as THREE from "three";
import { keepSeparate } from "../builder";
import type { BuildCtx } from "../context";

export interface BackyardRefs {
  boat: THREE.Group;
  lantern: THREE.Mesh;
}

/** Coconut palm and banana plant builders (shared by the garden and the logo). */
export function createPlants(ctx: BuildCtx) {
  const { b, M, T, rnd, color } = ctx;
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
  const frondGeo = (() => {
    const g = new THREE.PlaneGeometry(3.4, 0.85, 12, 1);
    g.translate(1.7, 0, 0);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      p.setY(i, 0.35 * x - 0.2 * x * x);
    }
    g.computeVertexNormals();
    return g;
  })();
  const frondMat = std({ map: T.frond, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 });
  const nutMats = [color({ color: 0x8a6a2a, roughness: 0.7 }).m, color({ color: 0x6e7b2c, roughness: 0.7 }).m];

  function palm(x: number, z: number, h: number, lean: number, dir: number) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    ctx.root.add(g);
    const N = 9;
    let px = 0,
      pz = 0;
    for (let i = 0; i < N; i++) {
      const t = i / N,
        seg = h / N;
      const r0 = 0.2 - 0.08 * t,
        r1 = 0.2 - 0.08 * (t + 1 / N);
      const nx = Math.cos(dir) * lean * (t + 1 / N) * (t + 1 / N),
        nz = Math.sin(dir) * lean * (t + 1 / N) * (t + 1 / N);
      const c = b.cyl(M.trunk, r1, r0, seg + 0.02, (px + nx) / 2, i * seg, (pz + nz) / 2, g, 10);
      c.rotation.z = (-(nx - px) / seg) * 0.9;
      c.rotation.x = ((nz - pz) / seg) * 0.9;
      px = nx;
      pz = nz;
    }
    const top = new THREE.Group();
    top.position.set(px, h, pz);
    g.add(top);
    for (let i = 0; i < 9; i++) {
      const f = new THREE.Mesh(frondGeo, frondMat);
      f.castShadow = true;
      f.rotation.y = (i / 9) * Math.PI * 2 + rnd() * 0.3;
      f.rotation.z = (rnd() - 0.3) * 0.25;
      f.scale.setScalar(0.85 + rnd() * 0.3);
      top.add(f);
    }
    for (let i = 0; i < 4; i++) {
      const n = b.mesh(new THREE.SphereGeometry(0.13, 10, 8), nutMats[i % 2], top);
      n.position.set(Math.cos(i * 1.6) * 0.18, -0.2, Math.sin(i * 1.6) * 0.18);
    }
  }

  const bananaMat = std({ map: T.banana, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 });
  const bananaStem = color({ color: 0x7d8f45, roughness: 0.9 });
  function banana(x: number, z: number) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    ctx.root.add(g);
    b.cyl(bananaStem, 0.09, 0.14, 1.6, 0, 0, 0, g, 10);
    for (let i = 0; i < 7; i++) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.6), bananaMat);
      l.geometry.translate(0.85, 0, 0);
      l.castShadow = true;
      l.position.y = 1.5 + rnd() * 0.3;
      l.rotation.set(0, (i / 7) * 6.28, 0.5 + rnd() * 0.3);
      l.rotateX((Math.PI / 2) * 0.9);
      g.add(l);
    }
  }

  const bushMat = color({ color: 0x163a0c, roughness: 0.9, flatShading: true }).m;
  function bush(x: number, z: number, r: number) {
    const h = b.mesh(new THREE.IcosahedronGeometry(r, 1), bushMat);
    h.position.set(x, r * 0.75, z);
    h.scale.y = 0.75;
  }

  return { palm, banana, bush };
}

export function buildBackyard(ctx: BuildCtx): BackyardRefs {
  const { b, M, T, rnd, color } = ctx;
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
  const { palm, banana } = createPlants(ctx);
  (
    [
      [-11, -14, 7.5, 1.2, 0.3],
      [5.8, -15.4, 8.2, 0.9, 2.2],
      [11.2, -9, 7.2, 1.4, 0.1],
      [-11.6, -3, 8, 1.0, 3.3],
      [11.5, 3.5, 7.6, 1.2, -0.4],
      [-11.2, 8.5, 7.2, 1.5, 2.6],
      [9.2, 9.6, 6.8, 1.1, -0.9],
      [-4.8, -16, 7.8, 0.8, 1.2],
      [12.3, -15.2, 6.5, 1.3, 0.6],
      [-12.5, -12, 6.2, 0.9, -1],
    ] as const
  ).forEach(([x, z, h, lean, dir]) => palm(x, z, h, lean, dir));
  (
    [
      [-9, -10],
      [8.8, -5.5],
      [-9.2, 1.5],
      [9.4, -12.5],
      [-2.6, -14.6],
    ] as const
  ).forEach(([x, z]) => banana(x, z));
  // hedge along the front wall
  for (let i = 0; i < 14; i++) {
    const x = -12.5 + i * 1.9 + rnd() * 0.4;
    if (x > -2.6 && x < 3) continue;
    const h = b.mesh(new THREE.IcosahedronGeometry(0.45 + rnd() * 0.3, 1), M.leaf.m);
    h.position.set(x, 0.35, 11.3 + rnd() * 0.4);
    h.scale.y = 0.75;
  }

  // pond with a little kettuvallam
  let boat!: THREE.Group, lantern!: THREE.Mesh;
  {
    const px = 2.6,
      pz = -11.6;
    const rimMat = M.laterite.m.clone();
    rimMat.side = THREE.DoubleSide;
    const rim = b.mesh(new THREE.CylinderGeometry(1, 1, 0.28, 40, 1, true), rimMat);
    rim.position.set(px, 0.14, pz);
    rim.scale.set(3.3, 1, 2.3);
    const cap = b.mesh(new THREE.TorusGeometry(1, 0.06, 6, 48), M.laterite.m);
    cap.rotation.x = Math.PI / 2;
    cap.scale.set(3.3, 2.3, 1);
    cap.position.set(px, 0.28, pz);
    const w = b.mesh(
      new THREE.CircleGeometry(1, 48),
      std({ map: T.water, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.92 }),
    );
    w.rotation.x = -Math.PI / 2;
    w.scale.set(3.25, 2.25, 1);
    w.position.set(px, 0.16, pz);
    w.castShadow = false;
    boat = keepSeparate(new THREE.Group());
    boat.position.set(px + 0.4, 0.16, pz + 0.2);
    boat.rotation.y = 0.45;
    ctx.root.add(boat);
    b.box(M.teak, 2.0, 0.28, 0.62, 0, -0.05, 0, boat);
    for (const s of [-1, 1]) {
      const c = b.mesh(new THREE.ConeGeometry(0.31, 0.7, 12), M.teak.m, boat);
      c.rotation.z = -s * (Math.PI / 2);
      c.position.set(s * 1.35, 0.12, 0);
    }
    const can = b.mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.3, 16, 1, true, 0, Math.PI), M.thatch.m, boat);
    can.rotation.z = Math.PI / 2;
    can.position.y = 0.23;
    lantern = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffc25a }));
    lantern.position.set(0.95, 0.55, 0);
    boat.add(lantern);
    b.cyl(M.teak, 0.01, 0.01, 0.35, 0.95, 0.23, 0, boat, 4);
    ctx.lampLight(px + 1.2, 0.9, pz + 0.6, 0xffb35c, 5);
    const pad = color({ color: 0x4f7a3a, roughness: 0.8 }).m;
    for (let i = 0; i < 7; i++) {
      const a = rnd() * 6.28;
      const lp = b.mesh(new THREE.CircleGeometry(0.16, 12), pad);
      lp.rotation.x = -Math.PI / 2;
      lp.position.set(px + Math.cos(a) * 2.3, 0.17, pz + Math.sin(a) * 1.5);
      lp.castShadow = false;
    }
  }
  // well
  {
    const x = -4.6,
      z = -10.2;
    const wellMat = M.laterite.m.clone();
    wellMat.side = THREE.DoubleSide;
    const wl = b.mesh(new THREE.CylinderGeometry(0.8, 0.85, 0.8, 28, 1, true), wellMat);
    wl.position.set(x, 0.4, z);
    const top = b.mesh(new THREE.TorusGeometry(0.8, 0.09, 8, 28), M.laterite.m);
    top.rotation.x = Math.PI / 2;
    top.position.set(x, 0.8, z);
    const wv = b.mesh(new THREE.CircleGeometry(0.76, 24), color({ color: 0x18303a, roughness: 0.2 }).m);
    wv.rotation.x = -Math.PI / 2;
    wv.position.set(x, 0.45, z);
    for (const dx of [-0.85, 0.85]) b.box(M.teak, 0.12, 1.9, 0.12, x + dx, 0, z);
    b.box(M.teak, 1.9, 0.12, 0.12, x, 1.9, z);
    const pul = b.cyl(M.teak, 0.12, 0.12, 0.08, x, 1.7, z, null, 14);
    pul.rotation.x = Math.PI / 2;
    pul.position.y = 1.75;
  }
  // back path
  b.flat(M.laterite, -0.3, 0.8, -15.5, -6.3, 0.022);
  return { boat, lantern };
}
