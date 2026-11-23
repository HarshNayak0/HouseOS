/**
 * Renders the house model on its own (no garden) for the app logo and icons.
 * Used only by the dev page /dev/logo and scripts/render-logo.cjs.
 */
import * as THREE from "three";
import { Builder } from "./builder";
import { ROOM_IDS } from "./config";
import type { BuildCtx } from "./context";
import { buildPillarsAndVerandah, buildPlinth, buildWalls } from "./house/structure";
import { buildRoof } from "./house/roof";
import { createPlants } from "./garden/backyard";
import { LEGACY_SCALE } from "./lighting";
import { colorMaterialCache, createMaterials } from "./materials";
import { buildDetails } from "./props/details";
import { buildFurniture } from "./props/furniture";
import { Rng } from "./rng";
import { buildFloors } from "./rooms/floors";
import { createTextures } from "./textures";

export async function renderLogo(size: number, background: string | null): Promise<string> {
  THREE.ColorManagement.enabled = false;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const T = await createTextures(new Rng(11), 16, () => {});
  const M = createMaterials(T);
  const root = new THREE.Group();
  scene.add(root);
  const ctx: BuildCtx = {
    b: new Builder(root),
    root,
    T,
    M,
    rnd: new Rng(11).next,
    color: colorMaterialCache(),
    lamps: [],
    lampLight: (x, y, z, color = 0xffb35c, dist = 7) => {
      const l = new THREE.PointLight(color, 0, dist, 2);
      l.position.set(x, y, z);
      root.add(l);
      return l;
    },
    pickables: [],
    roomMats: Object.fromEntries(ROOM_IDS.map((id) => [id, []])) as unknown as BuildCtx["roomMats"],
  };
  buildPlinth(ctx);
  buildFloors(ctx);
  buildWalls(ctx);
  buildPillarsAndVerandah(ctx);
  buildFurniture(ctx);
  buildRoof(ctx);
  buildDetails(ctx);
  buildGarden(ctx);
  // the invisible backyard tap zone isn't wanted in a picture
  root.traverse((o) => {
    if (o.userData.room === "backyard") o.visible = false;
  });

  // warm late-afternoon light from the front-left, soft sky fill, gentle bounce from the ground
  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x8a6a48, 0.62 * LEGACY_SCALE));
  const sun = new THREE.DirectionalLight(0xffe2b8, 1.45 * LEGACY_SCALE);
  sun.position.set(-12, 20, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 80 });
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0xc9d8ff, 0.35 * LEGACY_SCALE);
  rim.position.set(14, 8, -10);
  scene.add(rim);

  // soft contact shadow on an invisible floor
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.16 }));
  catcher.rotation.x = -Math.PI / 2;
  catcher.position.y = -ISLAND_DEPTH;
  catcher.receiveShadow = true;
  scene.add(catcher);

  if (background) scene.background = new THREE.Color(background);

  // 3/4 view from the front-right, framed on the whole house
  const camera = new THREE.PerspectiveCamera(26, 1, 0.5, 200);
  const target = new THREE.Vector3(0.2, 2.2, 0.6);
  camera.position.copy(target).add(new THREE.Vector3(17, 10.5, 24).multiplyScalar(2.32));
  camera.lookAt(target);

  renderer.compile(scene, camera);
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL("image/png");
}

const ISLAND_R = 14;
const ISLAND_DEPTH = 0.7;

/** A round garden "island" under the house: grass, a laterite rim, the front muttam, palms and bananas. */
function buildGarden(ctx: BuildCtx) {
  const { b, M } = ctx;
  // grass top
  const top = new THREE.CircleGeometry(ISLAND_R, 72);
  const uv = top.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * ISLAND_R * 2) / M.grass.tile, (uv.getY(i) * ISLAND_R * 2) / M.grass.tile);
  const grass = b.mesh(top, M.grass.m);
  grass.rotation.x = -Math.PI / 2;
  grass.castShadow = false;
  // laterite soil edge
  const sideMat = (M.laterite.m as THREE.MeshStandardMaterial).clone();
  sideMat.side = THREE.DoubleSide;
  const side = b.mesh(new THREE.CylinderGeometry(ISLAND_R, ISLAND_R * 0.97, ISLAND_DEPTH, 72, 1, true), sideMat);
  side.position.y = -ISLAND_DEPTH / 2;
  // swept sand courtyard and laterite path at the front
  b.flat(M.sand, -8, 9, 6.2, 10.2, 0.012);
  b.flat(M.laterite, -0.8, 1.3, 6.9, 13.4, 0.024);
  // stepping stones round the side
  for (let i = 0; i < 5; i++) b.box(M.laterite, 0.6, 0.05, 0.45, 8.3 + i * 0.3, 0, 3.8 - i * 0.8);

  const { palm, banana, bush } = createPlants(ctx);
  (
    [
      [-10.6, -4.5, 7.8, 1.2, 3.0],
      [-11, 4.2, 7.0, 1.3, 2.7],
      [10.6, -6.2, 8.4, 0.9, -0.2],
      [11.3, 2.8, 6.8, 1.3, 0.3],
      [-4.2, -10.6, 7.6, 0.8, -1.7],
      [5.2, -11, 8.2, 0.9, -1.3],
      [-8.4, -9.6, 6.4, 1.0, -2.3],
    ] as const
  ).forEach(([x, z, h, lean, dir]) => palm(x, z, h, lean, dir));
  (
    [
      [-9.6, 8.6],
      [10.2, 8.2],
      [-12, 0],
      [9.6, -10.4],
      [0.5, -12.2],
    ] as const
  ).forEach(([x, z]) => banana(x, z));
  for (const x of [-11, -9.6, -8.2, -6.8, -5.4, -3.6, 3.6, 5.2, 6.8, 8.4, 9.9])
    bush(x, Math.sqrt(ISLAND_R ** 2 - x * x) - 1.4, 0.45 + Math.abs(Math.sin(x * 3.1)) * 0.25);
  for (const [x, z] of [
    [-7.6, 5.4],
    [7.8, 5.6],
    [-7.8, -6.6],
    [7.6, -6.8],
  ])
    bush(x, z, 0.4);
}
