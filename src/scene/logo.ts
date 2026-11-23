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
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 70 });
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0xc9d8ff, 0.35 * LEGACY_SCALE);
  rim.position.set(14, 8, -10);
  scene.add(rim);

  // soft contact shadow on an invisible floor
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.28 }));
  catcher.rotation.x = -Math.PI / 2;
  catcher.receiveShadow = true;
  scene.add(catcher);

  if (background) scene.background = new THREE.Color(background);

  // 3/4 view from the front-right, framed on the whole house
  const camera = new THREE.PerspectiveCamera(26, 1, 0.5, 200);
  const target = new THREE.Vector3(0.3, 2.3, 0.4);
  camera.position.copy(target).add(new THREE.Vector3(17, 9, 24).multiplyScalar(1.68));
  camera.lookAt(target);

  renderer.compile(scene, camera);
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL("image/png");
}
