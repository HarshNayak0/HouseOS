/** Geometry helpers ported from the prototype (`box`, `cyl`, `flat`, `scaleBoxUV`). */
import * as THREE from "three";
import type { MatEntry } from "./materials";

export function scaleBoxUV(geo: THREE.BufferGeometry, w: number, h: number, d: number, tile: number) {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const dims = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++)
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * dims[f][0]) / tile, (uv.getY(k) * dims[f][1]) / tile);
    }
}

export class Builder {
  constructor(public root: THREE.Object3D) {}

  mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent?: THREE.Object3D) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    (parent ?? this.root).add(m);
    return m;
  }

  box(e: MatEntry, w: number, h: number, d: number, x: number, y: number, z: number, parent?: THREE.Object3D) {
    const geo = new THREE.BoxGeometry(w, h, d);
    if (e.tile) scaleBoxUV(geo, w, h, d, e.tile);
    const m = this.mesh(geo, e.m, parent);
    m.position.set(x, y + h / 2, z);
    return m;
  }

  cyl(
    e: MatEntry,
    rt: number,
    rb: number,
    h: number,
    x: number,
    y: number,
    z: number,
    parent?: THREE.Object3D | null,
    seg?: number,
    open?: boolean,
  ) {
    const m = this.mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 20, 1, !!open), e.m, parent ?? undefined);
    m.position.set(x, y + h / 2, z);
    return m;
  }

  flat(e: MatEntry, x0: number, x1: number, z0: number, z1: number, y: number, parent?: THREE.Object3D) {
    const w = x1 - x0,
      d = z1 - z0;
    const g = new THREE.PlaneGeometry(w, d);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / e.tile!, (uv.getY(i) * d) / e.tile!);
    const m = this.mesh(g, e.m, parent);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    m.castShadow = false;
    return m;
  }
}

/** Mark an object (and its children) so the static-geometry merge leaves it alone. */
export function keepSeparate<T extends THREE.Object3D>(o: T): T {
  o.userData.keep = true;
  return o;
}
