import type * as THREE from "three";
import type { Builder } from "./builder";
import type { RoomId } from "./config";
import type { MatEntry, Materials } from "./materials";
import type { TextureSet } from "./textures";

/** Shared state while building the house. */
export interface BuildCtx {
  b: Builder;
  root: THREE.Group;
  T: TextureSet;
  M: Materials;
  rnd: () => number;
  /** Shared plain-colour material (merges by colour). */
  color: (o: THREE.MeshStandardMaterialParameters & { color: number }) => MatEntry;
  /** Point lights that glow in evening mode, in prototype order. lamps[0] is the nilavilakku. */
  lamps: THREE.PointLight[];
  lampLight: (x: number, y: number, z: number, color?: number, dist?: number) => THREE.PointLight;
  /** Floor meshes that can be tapped, tagged with userData.room */
  pickables: THREE.Object3D[];
  /** Floor materials per room, for hover/selection highlight */
  roomMats: Record<RoomId, THREE.MeshStandardMaterial[]>;
  backyardOverlay?: THREE.MeshBasicMaterial;
}
