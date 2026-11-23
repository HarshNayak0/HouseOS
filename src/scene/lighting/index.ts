/**
 * Sun, sky light, fog, and day/evening blending.
 * three.js r155+ uses physically based light units; the prototype (r128) used legacy units.
 * LEGACY_SCALE converts the prototype's intensities so the scene looks the same.
 */
import * as THREE from "three";
import type { TextureSet } from "../textures";

export const LEGACY_SCALE = Math.PI;

export interface Lighting {
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  fog: THREE.Fog;
}

export const DAY = { h: 0.75, s: 1.55, l: 0, e: 1.05 };
export const EVE = { h: 0.28, s: 0.35, l: 1.6, e: 1.15 };

export function createLighting(scene: THREE.Object3D, shadowSize: number): Lighting {
  const hemi = new THREE.HemisphereLight(0xfff4e0, 0x5d6b3a, DAY.h * LEGACY_SCALE);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d6, DAY.s * LEGACY_SCALE);
  sun.position.set(14, 22, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 70 });
  scene.add(sun);
  const fog = new THREE.Fog(0xe9dfca, 45, 110);
  return { hemi, sun, fog };
}

const c = (hex: number) => new THREE.Color(hex);
const COLORS = {
  day: { sun: c(0xfff0d6), hemi: c(0xfff4e0), fog: c(0xe9dfca) },
  eve: { sun: c(0xff9a5a), hemi: c(0x9aa6d8), fog: c(0x3a3048) },
};

/** Point-light intensity for lamps (legacy value × scale). Point lights in r155+ also need ×PI. */
export const lampIntensity = (legacy: number) => legacy * LEGACY_SCALE;

/**
 * Apply a day→evening blend. k = 0 is day, 1 is evening.
 * Colours and sky switch at the start (as in the prototype); intensities blend.
 */
export function applyEvening(
  k: number,
  evening: boolean,
  L: Lighting,
  lamps: THREE.PointLight[],
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  T: TextureSet,
) {
  const col = evening ? COLORS.eve : COLORS.day;
  scene.background = evening ? T.skyEve : T.skyDay;
  L.sun.color.copy(col.sun);
  L.hemi.color.copy(col.hemi);
  L.fog.color.copy(col.fog);
  const lerp = (a: number, b: number) => a + (b - a) * k;
  L.hemi.intensity = lerp(DAY.h, EVE.h) * LEGACY_SCALE;
  L.sun.intensity = lerp(DAY.s, EVE.s) * LEGACY_SCALE;
  for (const l of lamps) l.intensity = lampIntensity(lerp(DAY.l, EVE.l));
  renderer.toneMappingExposure = lerp(DAY.e, EVE.e);
}
