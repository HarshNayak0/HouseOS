/** Material table, ported from the prototype's `M`. `tile` is metres per texture repeat. */
import * as THREE from "three";
import type { TextureSet } from "../textures";

export interface MatEntry {
  m: THREE.Material;
  tile?: number;
}

const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);

export function createMaterials(T: TextureSet) {
  return {
    plaster: { m: std({ map: T.plaster, roughness: 0.95 }), tile: 2.2 },
    redOxide: { m: std({ map: T.redOxide, roughness: 0.32, metalness: 0.05 }), tile: 2.0 },
    border: { m: std({ map: T.border, roughness: 0.35 }), tile: 1.2 },
    teak: { m: std({ map: T.teak, roughness: 0.55 }), tile: 1.2 },
    roof: { m: std({ map: T.roof, roughness: 0.85 }), tile: 2.2 },
    laterite: { m: std({ map: T.laterite, roughness: 0.95 }), tile: 1.6 },
    grass: { m: std({ map: T.grass, roughness: 1 }), tile: 4 },
    sand: { m: std({ map: T.sand, roughness: 1 }), tile: 3 },
    stone: { m: std({ map: T.stone, roughness: 0.8 }), tile: 1.4 },
    granite: { m: std({ map: T.granite, roughness: 0.3 }), tile: 0.8 },
    lattice: { m: std({ map: T.lattice, roughness: 0.6 }), tile: 0.55 },
    fabric: { m: std({ map: T.fabric, roughness: 0.9 }), tile: 0.7 },
    thatch: { m: std({ map: T.thatch, roughness: 1, side: THREE.DoubleSide }), tile: 0.8 },
    trunk: { m: std({ map: T.trunk, roughness: 1 }), tile: 1 },
    wicker: { m: std({ map: T.wicker, roughness: 0.9 }), tile: 0.4 },
    cream: { m: std({ color: 0xf1e9d8, roughness: 0.9 }) },
    white: { m: std({ color: 0xf3f0ea, roughness: 0.4 }) },
    dark: { m: std({ color: 0x1f1712, roughness: 0.5 }) },
    brass: { m: std({ color: 0xc8963e, metalness: 0.85, roughness: 0.28 }) },
    copper: { m: std({ color: 0xb46a3c, metalness: 0.8, roughness: 0.32 }) },
    leaf: { m: std({ color: 0x4c7a2c, roughness: 0.9, flatShading: true }) },
    pot: { m: std({ color: 0xa8563a, roughness: 0.9 }) },
  } satisfies Record<string, MatEntry>;
}

export type Materials = ReturnType<typeof createMaterials>;

/**
 * Plain-colour materials are shared by colour so identical colours merge into one draw call.
 */
export function colorMaterialCache() {
  const cache = new Map<string, THREE.MeshStandardMaterial>();
  return (o: THREE.MeshStandardMaterialParameters & { color: number }): MatEntry => {
    const key = JSON.stringify(o);
    let m = cache.get(key);
    if (!m) {
      m = std(o);
      cache.set(key, m);
    }
    return { m };
  };
}
