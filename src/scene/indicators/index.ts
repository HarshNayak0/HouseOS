/**
 * In-scene indicators driven by real data (SPEC §3.3). Phase 1 wires the objects; phase 3+ feeds the data.
 */
import * as THREE from "three";
import { keepSeparate } from "../builder";
import type { BuildCtx } from "../context";
import { P } from "../config";

export { EMPTY_INDICATORS, type IndicatorState } from "./state";

export interface Badge {
  sprite: THREE.Sprite;
  draw: (n: number) => void;
}

function badgeSprite(root: THREE.Object3D, fontFamily: string): Badge {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = keepSeparate(new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })));
  s.scale.set(0.55, 0.55, 1);
  s.renderOrder = 10;
  root.add(s);
  let last = -1;
  const draw = (n: number) => {
    if (n === last) return;
    last = n;
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, 128, 128);
    if (!n) {
      s.visible = false;
      return;
    }
    s.visible = true;
    g.fillStyle = "#9C3B2A";
    g.beginPath();
    g.arc(64, 64, 54, 0, 7);
    g.fill();
    g.lineWidth = 7;
    g.strokeStyle = "#E2C27A";
    g.stroke();
    g.fillStyle = "#fff";
    g.font = `bold ${n > 9 ? 50 : 62}px ${fontFamily}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(n > 99 ? "99+" : String(n), 64, 68);
    t.needsUpdate = true;
  };
  return { sprite: s, draw };
}

export interface Indicators {
  fridgeBadge: Badge;
  choreBadge: Badge;
  bell: THREE.Group;
  pettiGlow: THREE.Mesh;
  pettiLight: THREE.PointLight;
}

export function buildIndicators(ctx: BuildCtx, fontFamily: string): Indicators {
  const fridgeBadge = badgeSprite(ctx.root, fontFamily);
  fridgeBadge.sprite.position.set(6.6, P + 2.15, -1.55);
  const choreBadge = badgeSprite(ctx.root, fontFamily);
  choreBadge.sprite.position.set(4.7, P + 1.05, 2.3);

  // NEW: small brass bell hanging at the closet doorway (renewal within 30 days)
  const bell = keepSeparate(new THREE.Group());
  bell.position.set(-5.75, P + 2.05, 3.16);
  ctx.root.add(bell);
  ctx.b.cyl(ctx.M.brass, 0.006, 0.006, 0.18, 0, 0, 0, bell, 4);
  const cup = ctx.b.mesh(
    new THREE.SphereGeometry(0.07, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xc8963e, metalness: 0.85, roughness: 0.28, side: THREE.DoubleSide }),
    bell,
  );
  cup.position.y = -0.05;
  cup.scale.y = 1.3;
  bell.visible = false;

  // NEW: soft glow over the bedroom petti (a date planned this week)
  const pettiGlow = keepSeparate(
    new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 1.0),
      new THREE.MeshBasicMaterial({
        map: glowTexture(),
        color: 0xffc46b,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    ),
  );
  pettiGlow.rotation.x = -Math.PI / 2;
  pettiGlow.position.set(0.25, P + 0.52, -3.4);
  ctx.root.add(pettiGlow);
  const pettiLight = new THREE.PointLight(0xffb35c, 0, 2.2, 2);
  pettiLight.position.set(0.25, P + 0.9, -3.4);
  ctx.root.add(pettiLight);

  return { fridgeBadge, choreBadge, bell, pettiGlow, pettiLight };
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
