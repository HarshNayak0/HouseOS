/**
 * Draw-call reduction: merges static meshes that share a material into one mesh.
 * The prototype creates ~900 separate meshes; after merging the house renders in ~70 draw calls.
 * Objects tagged `userData.keep` (pickable floors, animated props, indicators) are left alone,
 * and groups tagged `userData.mergeRoot` (walls, roof) are merged separately so they can still move.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const ATTRS = ["position", "normal", "uv"] as const;

export function mergeStatic(container: THREE.Object3D): { before: number; after: number } {
  container.updateMatrixWorld(true);
  const inv = container.matrixWorld.clone().invert();
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; receive: boolean; geos: THREE.BufferGeometry[] }>();
  const remove: THREE.Mesh[] = [];
  let before = 0;

  const visit = (o: THREE.Object3D, isRoot: boolean) => {
    if (o.userData.keep) return;
    if (!isRoot && o.userData.mergeRoot) return;
    if ((o as THREE.Mesh).isMesh) {
      const m = o as THREE.Mesh;
      before++;
      if (Array.isArray(m.material)) return;
      const src = m.geometry;
      if (!ATTRS.every((a) => src.getAttribute(a))) return;
      let g = src.index ? src.toNonIndexed() : src.clone();
      for (const name of Object.keys(g.attributes)) {
        if (!(ATTRS as readonly string[]).includes(name)) g.deleteAttribute(name);
      }
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      g.morphAttributes = {};
      g.clearGroups();
      const key = `${m.material.uuid}|${m.castShadow}|${m.receiveShadow}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { mat: m.material, cast: m.castShadow, receive: m.receiveShadow, geos: [] };
        buckets.set(key, bucket);
      }
      bucket.geos.push(g);
      remove.push(m);
      g = undefined as never;
    }
    for (const c of o.children) visit(c, false);
  };
  visit(container, true);

  for (const m of remove) {
    m.removeFromParent();
    m.geometry.dispose();
  }
  let after = 0;
  for (const { mat, cast, receive, geos } of buckets.values()) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.matrixAutoUpdate = false;
    container.add(mesh);
    after++;
  }
  // drop groups that are now empty
  const prune = (o: THREE.Object3D) => {
    for (const c of [...o.children]) {
      prune(c);
      if (c.type === "Group" && c.children.length === 0 && !c.userData.keep && !c.userData.mergeRoot) c.removeFromParent();
    }
  };
  prune(container);
  return { before, after };
}
