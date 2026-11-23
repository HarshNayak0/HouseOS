/**
 * Builds the whole house in the prototype's order, yielding between steps so the
 * loading screen can show real progress.
 */
import * as THREE from "three";
import { Builder } from "./builder";
import { ROOM_IDS, type RoomId } from "./config";
import type { BuildCtx } from "./context";
import { buildBackyard, type BackyardRefs } from "./garden/backyard";
import { buildCompound } from "./garden/compound";
import { buildPillarsAndVerandah, buildPlinth, buildWalls } from "./house/structure";
import { buildRoof, type RoofRefs } from "./house/roof";
import { buildIndicators, type Indicators } from "./indicators";
import { createLighting, type Lighting } from "./lighting";
import { colorMaterialCache, createMaterials } from "./materials";
import { mergeStatic } from "./merge";
import { buildDetails } from "./props/details";
import { buildFurniture, type FurnitureRefs } from "./props/furniture";
import { Rng } from "./rng";
import { buildFloors } from "./rooms/floors";
import { createTextures, TEXTURE_COUNT, type TextureSet } from "./textures";

export interface HouseModel extends RoofRefs, FurnitureRefs, BackyardRefs {
  root: THREE.Group;
  walls: THREE.Group;
  T: TextureSet;
  lighting: Lighting;
  lamps: THREE.PointLight[];
  pickables: THREE.Object3D[];
  roomMats: Record<RoomId, THREE.MeshStandardMaterial[]>;
  backyardOverlay?: THREE.MeshBasicMaterial;
  indicators: Indicators;
  stats: { meshesBefore: number; meshesAfter: number };
}

const BUILD_STEPS = 8;
export const TOTAL_STEPS = TEXTURE_COUNT + BUILD_STEPS;

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export interface BuildOptions {
  maxAnisotropy: number;
  shadowSize: number;
  fontFamily: string;
  onProgress?: (done: number, total: number, label: string) => void;
}

export async function buildHouse(opts: BuildOptions): Promise<HouseModel> {
  let done = 0;
  const step = async (label: string) => {
    done++;
    opts.onProgress?.(done, TOTAL_STEPS, label);
    await nextFrame();
  };
  const rng = new Rng(11);
  const T = await createTextures(rng, opts.maxAnisotropy, () => step("Mixing the plaster…"));
  const M = createMaterials(T);
  const root = new THREE.Group();
  root.name = "house";
  const lighting = createLighting(root, opts.shadowSize);
  const lamps: THREE.PointLight[] = [];
  const ctx: BuildCtx = {
    b: new Builder(root),
    root,
    T,
    M,
    rnd: rng.next,
    color: colorMaterialCache(),
    lamps,
    lampLight: (x, y, z, color = 0xffb35c, dist = 7) => {
      const l = new THREE.PointLight(color, 0, dist, 2);
      l.position.set(x, y, z);
      root.add(l);
      lamps.push(l);
      return l;
    },
    pickables: [],
    roomMats: Object.fromEntries(ROOM_IDS.map((id) => [id, []])) as unknown as BuildCtx["roomMats"],
  };

  buildCompound(ctx);
  buildPlinth(ctx);
  await step("Laying the plinth…");
  buildFloors(ctx);
  await step("Polishing red-oxide floors…");
  const walls = buildWalls(ctx);
  walls.userData.mergeRoot = true;
  buildPillarsAndVerandah(ctx);
  await step("Raising the walls…");
  const furniture = buildFurniture(ctx);
  await step("Bringing in the furniture…");
  const roofRefs = buildRoof(ctx);
  roofRefs.roof.userData.mergeRoot = true;
  await step("Tiling the roof…");
  const backyard = buildBackyard(ctx);
  await step("Planting coconut palms…");
  buildDetails(ctx); // extra detail beyond the prototype (after it, so its RNG sequence is unchanged)
  const indicators = buildIndicators(ctx, opts.fontFamily);
  await step("Lighting the lamps…");

  const a = mergeStatic(walls);
  const b = mergeStatic(roofRefs.roof);
  const c = mergeStatic(root);
  await step("Almost home…");

  return {
    root,
    walls,
    T,
    lighting,
    lamps,
    pickables: ctx.pickables,
    roomMats: ctx.roomMats,
    backyardOverlay: ctx.backyardOverlay,
    indicators,
    ...roofRefs,
    ...furniture,
    ...backyard,
    stats: { meshesBefore: a.before + b.before + c.before, meshesAfter: a.after + b.after + c.after },
  };
}
