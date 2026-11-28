/**
 * Touches that make the house feel like home (added after the prototype, so its random sequence is
 * unchanged; this module uses its own seeded RNG):
 *  - a brass nameplate on the gatepost
 *  - each person's chappals at the foot of the steps (on the days they've opened Veedu)
 *  - three framed photos on the living-room wall (tap to view)
 *  - a jasmine vine up a verandah pillar that grows with things done together
 *  - festivals, seasons and your dates: pookalam, konna tree, diyas, Kerala star, pumpkin, blossoms,
 *    fireflies, autumn leaves, snow, marigold garlands, balloons
 * Everything is built once and shown or hidden, so the frame rate doesn't change.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { keepSeparate } from "../builder";
import type { BuildCtx } from "../context";
import { P } from "../config";
import { Rng } from "../rng";
import { lampIntensity } from "../lighting";
import type { DecorState } from "@/lib/decor";

const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);

export interface Homey {
  setNameplate(text: string): void;
  setChappals(pairs: ({ color: number } | null)[]): void;
  frames: THREE.Mesh[];
  setPhoto(i: number, url: string | null): void;
  setJasmine(growth: number, bloom: number): void;
  setDecor(d: DecorState): void;
  /** A little shimmer through the jasmine (a chore or task just got done). */
  shimmer(): void;
  /** Per frame. evening = 0 (day) … 1 (evening). */
  update(t: number, evening: number, anim: boolean, wallScaleY: number): void;
  /** The roof tiles' material, frosted in winter. */
  roofTile?: THREE.MeshStandardMaterial;
  decor: DecorState;
}

/** Points along a curve, spaced by arc length: [t, point, tangent]. */
function along(curve: THREE.Curve<THREE.Vector3>, n: number, rnd: () => number) {
  const out: { t: number; p: THREE.Vector3; tan: THREE.Vector3 }[] = [];
  for (let i = 0; i < n; i++) {
    const t = Math.min(1, (i + 0.3 + rnd() * 0.4) / n);
    out.push({ t, p: curve.getPointAt(t), tan: curve.getTangentAt(t) });
  }
  return out;
}

export function buildHomey(ctx: BuildCtx, roofMats: THREE.Material[]): Homey {
  const { b, M, root } = ctx;
  const rng = new Rng(2026);
  const rnd = rng.next;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const e = new THREE.Euler();
  const group = (name: string) => {
    const g = keepSeparate(new THREE.Group());
    g.name = name;
    root.add(g);
    return g;
  };

  // ---------------- nameplate ----------------
  const plateCanvas = document.createElement("canvas");
  plateCanvas.width = 512;
  plateCanvas.height = 200;
  const plateTex = new THREE.CanvasTexture(plateCanvas);
  plateTex.colorSpace = THREE.SRGBColorSpace;
  plateTex.anisotropy = 4;
  const plateMat = std({ map: plateTex, metalness: 0.55, roughness: 0.35 });
  const plate = keepSeparate(b.mesh(new THREE.BoxGeometry(0.5, 0.2, 0.025), [M.brass.m, M.brass.m, M.brass.m, M.brass.m, plateMat, M.brass.m] as unknown as THREE.Material));
  plate.position.set(-1.6, 1.18, 12.72);
  const serif = () => {
    const f = typeof document !== "undefined" ? getComputedStyle(document.documentElement).getPropertyValue("--font-fraunces").trim() : "";
    return f ? `${f}, Georgia, serif` : "Georgia, serif";
  };
  let plateText = "";
  function setNameplate(text: string) {
    if (text === plateText) return;
    plateText = text;
    const g = plateCanvas.getContext("2d")!;
    const W = plateCanvas.width,
      H = plateCanvas.height;
    const gr = g.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, "#e9c879");
    gr.addColorStop(0.45, "#c99a45");
    gr.addColorStop(1, "#a9792c");
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "#7a5420";
    g.lineWidth = 6;
    g.strokeRect(12, 12, W - 24, H - 24);
    g.lineWidth = 2;
    g.strokeRect(22, 22, W - 44, H - 44);
    let size = 64;
    g.font = `600 ${size}px ${serif()}`;
    while (g.measureText(text).width > W - 70 && size > 26) g.font = `600 ${(size -= 2)}px ${serif()}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    // engraved: a light edge below, the dark letter on top
    g.fillStyle = "rgba(255,238,190,0.7)";
    g.fillText(text, W / 2, H / 2 + 6);
    g.fillStyle = "#4a2f14";
    g.fillText(text, W / 2, H / 2 + 4);
    plateTex.needsUpdate = true;
  }
  setNameplate("Our home");

  // ---------------- chappals ----------------
  const soleGeo = (() => {
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, 0.05, 0.125, 0, Math.PI * 2, false, 0);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.022, bevelEnabled: false, curveSegments: 18 });
    g.rotateX(-Math.PI / 2);
    g.clearGroups();
    return g;
  })();
  const strapGeo = new THREE.TorusGeometry(0.045, 0.011, 6, 14, Math.PI).toNonIndexed();
  const pairs: THREE.Group[] = [];
  const pairMats: THREE.MeshStandardMaterial[] = [];
  for (const [x, rot] of [
    [-0.12, 0.12],
    [0.64, -0.1],
  ] as const) {
    const pair = group("chappals");
    pair.position.set(x, 0.058, 7.3);
    pair.scale.setScalar(1.35);
    pair.rotation.y = rot;
    const sole = std({ color: 0x160d08, roughness: 0.9 });
    const strap = std({ color: 0x7a4527, roughness: 0.6 });
    pairMats.push(strap);
    // one mesh per pair (soles + straps merged; two materials)
    const soles: THREE.BufferGeometry[] = [],
      straps: THREE.BufferGeometry[] = [];
    for (const dx of [-0.065, 0.065]) {
      soles.push(soleGeo.clone().applyMatrix4(m4.compose(v.set(dx, 0, 0), q.setFromEuler(e.set(0, dx * 0.6, 0)), s.set(1, 1, 1))));
      straps.push(strapGeo.clone().applyMatrix4(m4.compose(v.set(dx, 0.022, -0.02), q.setFromEuler(e.set(0, Math.PI / 2, 0)), s.set(1, 0.7, 1))));
    }
    const geo = mergeGeometries([mergeGeometries(soles), mergeGeometries(straps)], true);
    b.mesh(geo, [sole, strap] as unknown as THREE.Material, pair);
    pair.visible = false;
    pairs.push(pair);
  }
  function setChappals(list: ({ color: number } | null)[]) {
    pairs.forEach((p, i) => {
      const c = list[i];
      p.visible = !!c;
      // the scene is lit brightly (prototype lighting), so plain colours are darkened to read true
      if (c) pairMats[i].color.setHex(c.color).multiplyScalar(0.6);
    });
  }

  // ---------------- photo frames (living-room wall, inside face of the left wall) ----------------
  const framesGroup = keepSeparate(new THREE.Group());
  framesGroup.name = "photo-frames";
  root.add(framesGroup);
  const frames: THREE.Mesh[] = [];
  const photoCanvases: HTMLCanvasElement[] = [];
  const photoTex: THREE.CanvasTexture[] = [];
  const FRAME = 0.38;
  // left to right as you face the wall from the room
  const frameZ = [-0.82, -1.27, -1.72];
  const blank = (c: HTMLCanvasElement) => {
    const g = c.getContext("2d")!;
    const gr = g.createLinearGradient(0, 0, 0, c.height);
    gr.addColorStop(0, "#f6efe2");
    gr.addColorStop(1, "#e9dcc4");
    g.fillStyle = gr;
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = "rgba(184,137,59,0.55)";
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(c.width / 2 - 26, c.height / 2);
    g.lineTo(c.width / 2 + 26, c.height / 2);
    g.moveTo(c.width / 2, c.height / 2 - 26);
    g.lineTo(c.width / 2, c.height / 2 + 26);
    g.stroke();
  };
  frameZ.forEach((z, i) => {
    const f = keepSeparate(new THREE.Group());
    f.position.set(-6.88, 0, z);
    framesGroup.add(f);
    b.box(M.teak, 0.03, FRAME + 0.06, FRAME + 0.06, 0, -(FRAME + 0.06) / 2, 0, f);
    b.box(M.brass, 0.034, FRAME + 0.005, FRAME + 0.005, 0.002, -(FRAME + 0.005) / 2, 0, f);
    const c = document.createElement("canvas");
    c.width = c.height = 384;
    blank(c);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const photo = new THREE.Mesh(new THREE.PlaneGeometry(FRAME - 0.03, FRAME - 0.03), std({ map: tex, roughness: 0.55 }));
    photo.rotation.y = Math.PI / 2;
    photo.position.x = 0.02;
    photo.userData.photo = i;
    photo.receiveShadow = true;
    f.add(photo);
    frames.push(photo);
    photoCanvases.push(c);
    photoTex.push(tex);
  });
  const loading: (string | null)[] = [null, null, null];
  function setPhoto(i: number, url: string | null) {
    const c = photoCanvases[i];
    if (!c) return;
    // the URL is signed and changes; compare without its query string
    const key = url?.split("?")[0] ?? null;
    if (loading[i] === key) return;
    loading[i] = key;
    if (!url) {
      blank(c);
      photoTex[i].needsUpdate = true;
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (loading[i] !== key) return;
      const g = c.getContext("2d")!;
      const k = Math.max(c.width / img.naturalWidth, c.height / img.naturalHeight);
      const w = img.naturalWidth * k,
        h = img.naturalHeight * k;
      g.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
      photoTex[i].needsUpdate = true;
    };
    img.src = url;
  }

  // ---------------- jasmine vine (verandah pillar right of the steps, then along the beam) ----------------
  const jas = group("jasmine");
  const PX = 1.15,
    PZ = 5.95;
  const helix: THREE.Vector3[] = [];
  const TURNS = 3.2,
    Y0 = P + 0.05,
    Y1 = 2.72;
  for (let i = 0; i <= 64; i++) {
    const k = i / 64;
    const a = k * TURNS * Math.PI * 2 + 1.2;
    helix.push(new THREE.Vector3(PX + Math.cos(a) * 0.14, Y0 + (Y1 - Y0) * k, PZ + Math.sin(a) * 0.14));
  }
  const last = helix[helix.length - 1];
  const beam: THREE.Vector3[] = [];
  for (let i = 1; i <= 40; i++) {
    const k = i / 40;
    const x = last.x + (6.8 - last.x) * k;
    beam.push(new THREE.Vector3(x, 2.84 + 0.05 * Math.sin(k * 23), 6.1 + 0.03 * Math.cos(k * 31)));
  }
  const vinePts = [...helix, ...beam];
  const vineCurve = new THREE.CatmullRomCurve3(vinePts);
  const TUBE_SEG = 420,
    TUBE_RAD = 5;
  const vineGeo = new THREE.TubeGeometry(vineCurve, TUBE_SEG, 0.014, TUBE_RAD, false);
  const vine = b.mesh(vineGeo, std({ color: 0x33461c, roughness: 0.8 }), jas);
  vine.castShadow = false;
  const leafGeo = (() => {
    const g = new THREE.SphereGeometry(0.045, 6, 4);
    g.scale(1, 0.25, 0.55);
    g.translate(0.04, 0, 0);
    return g;
  })();
  const leafSpots = along(vineCurve, 260, rnd);
  const leaves = new THREE.InstancedMesh(leafGeo, std({ color: 0x24461a, roughness: 0.75 }), leafSpots.length);
  leafSpots.forEach((sp, i) => {
    e.set(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28);
    q.setFromEuler(e);
    s.setScalar(0.7 + rnd() * 0.6);
    m4.compose(sp.p, q, s);
    leaves.setMatrixAt(i, m4);
  });
  leaves.castShadow = false;
  jas.add(leaves);
  const flowerGeo = (() => {
    const shape = new THREE.Shape();
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r = i % 2 ? 0.012 : 0.03;
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    return new THREE.ShapeGeometry(shape);
  })();
  const flowerSpots = along(vineCurve, 150, rnd).map((sp) => ({ ...sp, r: rnd(), out: new THREE.Vector3(rnd() - 0.5, rnd() - 0.2, rnd() - 0.5).normalize() }));
  const flowers = new THREE.InstancedMesh(flowerGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, side: THREE.DoubleSide, emissive: 0x222018 }), flowerSpots.length);
  flowers.castShadow = false;
  jas.add(flowers);
  const WHITE = new THREE.Color(0xfffdf4),
    BUD = new THREE.Color(0x9cb86a);
  let jasShown = -1,
    jasBloom = -1;
  function setJasmine(growth: number, bloom: number) {
    const frac = growth <= 0 ? 0.02 : Math.min(1, 0.06 + (growth / 8) * 0.94);
    if (Math.abs(frac - jasShown) < 1e-4 && Math.abs(bloom - jasBloom) < 1e-4) return;
    jasShown = frac;
    jasBloom = bloom;
    vineGeo.setDrawRange(0, Math.ceil(TUBE_SEG * frac) * TUBE_RAD * 6);
    leaves.count = leafSpots.filter((l) => l.t <= frac).length;
    let n = 0;
    for (const f of flowerSpots) {
      if (f.t > frac) continue;
      const open = f.r < bloom;
      q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), f.out);
      s.setScalar(open ? 1 : 0.45);
      v.copy(f.p).addScaledVector(f.out, 0.03);
      m4.compose(v, q, s);
      flowers.setMatrixAt(n, m4);
      flowers.setColorAt(n, open ? WHITE : BUD);
      n++;
    }
    flowers.count = n;
    flowers.instanceMatrix.needsUpdate = true;
    if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
  }
  setJasmine(0, 0);

  // ---------------- festive light (diyas, star, pumpkin) ----------------
  const festiveLight = new THREE.PointLight(0xffb35c, 0, 7, 2);
  festiveLight.position.set(0.25, 1.4, 6.6);
  root.add(festiveLight);
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffc04a });
  const flameGeo = new THREE.ConeGeometry(0.016, 0.05, 8);

  // ---------------- Onam: pookalam ----------------
  const onam = group("onam");
  {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const g = c.getContext("2d")!;
    const C = 256;
    const ring = (r0: number, r1: number, color: string) => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(C, C, r1, 0, Math.PI * 2);
      g.arc(C, C, r0, 0, Math.PI * 2, true);
      g.fill();
    };
    ring(0, 250, "#3f7a2a");
    ring(0, 238, "#f7c62f");
    ring(0, 206, "#e8761f");
    // petals
    for (let i = 0; i < 16; i++) {
      g.save();
      g.translate(C, C);
      g.rotate((i / 16) * Math.PI * 2);
      g.fillStyle = i % 2 ? "#c62a2a" : "#fff6e0";
      g.beginPath();
      g.ellipse(0, -150, 26, 52, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    ring(0, 100, "#8e44ad");
    ring(0, 82, "#fff6e0");
    for (let i = 0; i < 8; i++) {
      g.save();
      g.translate(C, C);
      g.rotate((i / 8) * Math.PI * 2 + 0.2);
      g.fillStyle = "#f7c62f";
      g.beginPath();
      g.ellipse(0, -48, 14, 30, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    ring(0, 18, "#c62a2a");
    // a little texture: scattered petals
    for (let i = 0; i < 900; i++) {
      const a = rnd() * 6.28,
        r = rnd() * 245;
      g.fillStyle = `rgba(255,255,255,${rnd() * 0.12})`;
      g.fillRect(C + Math.cos(a) * r, C + Math.sin(a) * r, 3, 3);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const pk = b.mesh(new THREE.CircleGeometry(1.15, 48), std({ map: tex, roughness: 0.95 }), onam);
    pk.rotation.x = -Math.PI / 2;
    pk.position.set(-4.2, 0.035, 8.9);
    pk.castShadow = false;
    // a brass nilavilakku beside it
    b.cyl(M.brass, 0.1, 0.13, 0.04, -2.75, 0, 8.6, onam);
    b.cyl(M.brass, 0.018, 0.026, 0.5, -2.75, 0.04, 8.6, onam);
    b.cyl(M.brass, 0.1, 0.035, 0.05, -2.75, 0.54, 8.6, onam);
  }

  // ---------------- Vishu: konna (golden shower) tree by the gate ----------------
  const vishu = group("vishu");
  {
    const x = 4.3,
      z = 10.1;
    b.cyl(M.trunk, 0.07, 0.11, 2.0, x, 0, z, vishu, 8);
    const green = std({ color: 0x4a6a1c, roughness: 0.85 });
    const gold = std({ color: 0xf7c600, roughness: 0.55, emissive: 0x4a3600 });
    for (let i = 0; i < 6; i++) {
      const crown = b.mesh(new THREE.IcosahedronGeometry(0.38 + rnd() * 0.18, 1), green, vishu);
      crown.position.set(x + (rnd() - 0.5) * 1.0, 2.05 + rnd() * 0.5, z + (rnd() - 0.5) * 1.0);
      crown.scale.y = 0.65;
    }
    // hanging chains of golden flowers (konna blooms in long drooping strings)
    const bead = new THREE.IcosahedronGeometry(0.035, 0);
    const chains = 130,
      per = 8;
    const hanging = new THREE.InstancedMesh(bead, gold, chains * per);
    let k = 0;
    for (let i = 0; i < chains; i++) {
      const a = rnd() * 6.28,
        r = 0.25 + rnd() * 0.7;
      const top = new THREE.Vector3(x + Math.cos(a) * r, 2.0 + rnd() * 0.65, z + Math.sin(a) * r);
      for (let j = 0; j < per; j++) {
        m4.compose(v.set(top.x + (rnd() - 0.5) * 0.03, top.y - j * 0.055, top.z + (rnd() - 0.5) * 0.03), q.identity(), s.setScalar(1 - j * 0.09));
        hanging.setMatrixAt(k++, m4);
      }
    }
    vishu.add(hanging);
  }

  // ---------------- Diwali: diyas ----------------
  const diwali = group("diwali");
  const diyaFlames: THREE.Mesh[] = [];
  const diyaHalo = glowSprite();
  {
    const clay = std({ color: 0xb8613d, roughness: 0.9 });
    const cup = new THREE.CylinderGeometry(0.045, 0.03, 0.035, 12);
    const spots: [number, number, number][] = [];
    for (const x of [-4.0, -3.2, -2.4, -1.6, -1.05, 1.55, 2.3, 3.1, 3.9, 4.7, 5.5, 6.3, 6.85]) spots.push([x, P, 6.12]);
    spots.push([-0.6, 0.3, 6.47], [1.1, 0.3, 6.47], [-0.62, 0.15, 6.86], [1.12, 0.15, 6.86]);
    // lining the front path to the gate, and on the gateposts
    for (let z = 7.5; z < 12.2; z += 0.75) spots.push([-0.95, 0.03, z], [1.45, 0.03, z]);
    spots.push([-1.6, 1.82, 12.4], [2.1, 1.82, 12.4]);
    for (const [x, y, z] of spots) {
      const c = b.mesh(cup, clay, diwali);
      c.position.set(x, y + 0.0175, z);
      c.scale.setScalar(1.4);
      const f = new THREE.Mesh(flameGeo, flameMat);
      f.position.set(x, y + 0.075, z);
      f.scale.setScalar(1.4);
      diwali.add(f);
      diyaFlames.push(f);
      const h = new THREE.Sprite(diyaHalo);
      h.position.set(x, y + 0.08, z);
      h.scale.setScalar(0.32);
      diwali.add(h);
    }
  }

  // ---------------- Christmas: Kerala paper star at the door ----------------
  const christmas = group("christmas");
  const star = keepSeparate(new THREE.Group());
  {
    star.position.set(0.25, 2.05, 6.0);
    star.scale.setScalar(1.25);
    christmas.add(star);
    b.cyl(M.teak, 0.004, 0.004, 0.6, 0, 0.13, 0, star, 4);
    const shape = new THREE.Shape();
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
      const r = i % 2 ? 0.1 : 0.24;
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.03, bevelSegments: 1 });
    geo.translate(0, 0, -0.04);
    const paper = std({ color: 0xd8282a, roughness: 0.7, emissive: 0x5a0606 });
    b.mesh(geo, paper, star);
    // paper tails
    const tail = std({ color: 0xf5d04a, roughness: 0.7, side: THREE.DoubleSide, emissive: 0x3a2a00 });
    for (const dx of [-0.08, 0, 0.08]) {
      const t = b.mesh(new THREE.PlaneGeometry(0.035, 0.32), tail, star);
      t.position.set(dx, -0.36, 0.03);
    }
  }
  const starPaper = (star.children[1] as THREE.Mesh).material as THREE.MeshStandardMaterial;

  // ---------------- Halloween: a carved pumpkin on the steps ----------------
  const halloween = group("halloween");
  let pumpkinFace!: THREE.MeshBasicMaterial;
  const pumpkinHalo = glowSprite();
  {
    const pg = new THREE.SphereGeometry(0.16, 18, 12);
    const p = pg.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const a = Math.atan2(v.z, v.x);
      const k = 1 + 0.07 * Math.cos(a * 8);
      p.setXYZ(i, v.x * k, v.y * 0.78, v.z * k);
    }
    pg.computeVertexNormals();
    const pumpkin = b.mesh(pg, std({ color: 0xe06a1a, roughness: 0.6 }), halloween);
    pumpkin.position.set(1.05, 0.15 + 0.125, 6.78);
    const p2 = b.mesh(pg, pumpkin.material as THREE.Material, halloween);
    p2.position.set(2.1, 0.12, 12.95);
    p2.scale.setScalar(1.1);
    b.cyl(color(ctx, 0x4f6a2a), 0.012, 0.018, 0.07, 1.05, 0.39, 6.78, halloween, 6);
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = "#ffb040";
    const tri = (x: number, y: number, w: number, up: boolean) => {
      g.beginPath();
      g.moveTo(x - w, y + (up ? w : -w) * 0.5);
      g.lineTo(x + w, y + (up ? w : -w) * 0.5);
      g.lineTo(x, y - (up ? w : -w) * 0.8);
      g.fill();
    };
    tri(42, 50, 14, true);
    tri(86, 50, 14, true);
    g.beginPath();
    g.moveTo(26, 78);
    for (let i = 0; i <= 8; i++) g.lineTo(26 + i * 9.5, 78 + (i % 2 ? 14 : 4));
    g.lineTo(102, 78);
    g.quadraticCurveTo(64, 112, 26, 78);
    g.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    pumpkinFace = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), pumpkinFace);
    face.position.set(1.05, 0.27, 6.78 + 0.165);
    halloween.add(face);
    for (const [hx, hy, hz] of [
      [1.05, 0.28, 6.98],
      [2.1, 0.14, 13.15],
    ]) {
      const h = new THREE.Sprite(pumpkinHalo);
      h.position.set(hx, hy, hz);
      h.scale.setScalar(0.7);
      halloween.add(h);
    }
  }

  // ---------------- spring: blossoms on the hedge, petals on the grass ----------------
  const spring = group("spring");
  {
    const pink = std({ color: 0xf4b6c8, roughness: 0.7, emissive: 0x2a1218 });
    const bloomGeo = new THREE.IcosahedronGeometry(0.035, 0);
    const n = 220;
    const bl = new THREE.InstancedMesh(bloomGeo, pink, n);
    for (let i = 0; i < n; i++) {
      let x = -12.5 + rnd() * 25;
      if (x > -2.6 && x < 3) x += 6;
      m4.compose(v.set(x, 0.35 + rnd() * 0.45, 11.0 + rnd() * 0.9), q.identity(), s.setScalar(0.7 + rnd() * 0.8));
      bl.setMatrixAt(i, m4);
    }
    spring.add(bl);
    const petalGeo = new THREE.CircleGeometry(0.035, 5);
    petalGeo.rotateX(-Math.PI / 2);
    const petals = new THREE.InstancedMesh(petalGeo, std({ color: 0xf7c6d4, roughness: 0.9 }), 200);
    for (let i = 0; i < 200; i++) {
      m4.compose(v.set(-12 + rnd() * 24, 0.02, 7 + rnd() * 4.6), q.setFromEuler(e.set(0, rnd() * 6.28, 0)), s.setScalar(0.6 + rnd()));
      petals.setMatrixAt(i, m4);
    }
    petals.receiveShadow = true;
    spring.add(petals);
  }

  // ---------------- summer: fireflies over the pond and the front yard (evenings) ----------------
  const summer = group("summer");
  const flies: { base: THREE.Vector3; ph: number }[] = [];
  const flyGeo = new THREE.BufferGeometry();
  {
    for (let i = 0; i < 64; i++) {
      const front = i % 2 === 0;
      flies.push({
        base: front ? new THREE.Vector3(-8 + rnd() * 16, 0.5 + rnd() * 1.2, 7 + rnd() * 4) : new THREE.Vector3(2.6 + (rnd() - 0.5) * 8, 0.4 + rnd() * 1.4, -11.6 + (rnd() - 0.5) * 6),
        ph: rnd() * 100,
      });
    }
    flyGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(flies.length * 3), 3));
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,200,1)");
    gr.addColorStop(0.3, "rgba(220,255,120,0.6)");
    gr.addColorStop(1, "rgba(200,255,100,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    const pts = new THREE.Points(
      flyGeo,
      new THREE.PointsMaterial({ map: new THREE.CanvasTexture(c), size: 0.42, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xe8ff9a }),
    );
    pts.frustumCulled = false;
    summer.add(pts);
  }

  // ---------------- autumn: maple leaves on the grass, a few drifting down ----------------
  const autumn = group("autumn");
  const drifting: { x: number; z: number; ph: number; speed: number }[] = [];
  let driftMesh!: THREE.InstancedMesh;
  {
    const leafShape = new THREE.Shape();
    const pts = [
      [0, 0.05],
      [0.012, 0.025],
      [0.04, 0.035],
      [0.026, 0.008],
      [0.045, -0.005],
      [0.012, -0.012],
      [0.008, -0.04],
      [0, -0.022],
      [-0.008, -0.04],
      [-0.012, -0.012],
      [-0.045, -0.005],
      [-0.026, 0.008],
      [-0.04, 0.035],
      [-0.012, 0.025],
    ];
    leafShape.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) leafShape.lineTo(x, y);
    const lg = new THREE.ShapeGeometry(leafShape);
    lg.scale(2.6, 2.6, 2.6);
    const ground = lg.clone();
    ground.rotateX(-Math.PI / 2);
    const colors = [0x7a200c, 0x9a3f08, 0x8f6206, 0x5e160a];
    const n = 320;
    const mat = std({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });
    const lv = new THREE.InstancedMesh(ground, mat, n);
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const x = -13.5 + rnd() * 27;
      let z = -17.5 + rnd() * 29.5;
      if (Math.abs(x) < 7.6 && z > -6.6 && z < 6.4) z = 7 + rnd() * 4.5; // not inside the house
      m4.compose(v.set(x, 0.02 + rnd() * 0.01, z), q.setFromEuler(e.set(0, rnd() * 6.28, 0)), s.setScalar(0.8 + rnd() * 0.7));
      lv.setMatrixAt(i, m4);
      lv.setColorAt(i, col.setHex(colors[i % colors.length]));
    }
    autumn.add(lv);
    // a few drifting down (one draw call for all of them)
    driftMesh = new THREE.InstancedMesh(lg, std({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide }), 18);
    for (let i = 0; i < 18; i++) {
      driftMesh.setColorAt(i, col.setHex(colors[i % colors.length]));
      drifting.push({ x: -9 + rnd() * 18, z: (rnd() < 0.5 ? -14 : 6.8) + rnd() * 5, ph: rnd() * 10, speed: 0.25 + rnd() * 0.2 });
    }
    driftMesh.frustumCulled = false;
    autumn.add(driftMesh);
  }

  // ---------------- winter: a dusting of snow ----------------
  const winter = group("winter");
  {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const g = c.getContext("2d")!;
    g.fillStyle = "rgba(255,255,255,0.8)";
    g.fillRect(0, 0, 512, 512);
    // soft drifts, and a few soft gaps where the grass shows through
    for (let i = 0; i < 900; i++) {
      const x = rnd() * 512,
        y = rnd() * 512,
        r = 4 + rnd() * 18;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(255,255,255,${0.15 + rnd() * 0.2})`);
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    g.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 70; i++) {
      const x = rnd() * 512,
        y = rnd() * 512,
        r = 6 + rnd() * 16;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, "rgba(0,0,0,0.55)");
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    g.globalCompositeOperation = "source-over";
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(10, 10);
    const snowMat = std({ color: 0xf6f8fb, roughness: 0.95, map: tex, transparent: true, depthWrite: false });
    const ground = b.mesh(new THREE.PlaneGeometry(90, 90), snowMat, winter);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.05;
    ground.castShadow = false;
    const capMat = std({ color: 0xf8fafc, roughness: 0.9 });
    // compound wall tops (same runs as the wall's coping)
    for (const [x0, x1, z] of [
      [-14, -1.8, 12.4],
      [2.3, 14.2, 12.4],
      [-14, 14.2, -18.2],
    ])
      b.box({ m: capMat }, x1 - x0, 0.05, 0.5, (x0 + x1) / 2, 1.18, z, winter);
    b.box({ m: capMat }, 0.5, 0.05, 30.6, -14.2, 1.18, -2.9, winter);
    b.box({ m: capMat }, 0.5, 0.05, 30.6, 14.2, 1.18, -2.9, winter);
    for (const x of [-1.6, 2.1]) b.box({ m: capMat }, 0.82, 0.06, 0.82, x, 1.82, 12.4, winter);
  }
  const roofTile = roofMats[0] as THREE.MeshStandardMaterial | undefined;

  // ---------------- marigold garlands (anniversaries, birthdays) ----------------
  const garlands = group("garlands");
  {
    const balls: THREE.Vector3[] = [];
    const swag = (a: THREE.Vector3, bb: THREE.Vector3, sag: number, n: number) => {
      for (let i = 0; i <= n; i++) {
        const k = i / n;
        balls.push(new THREE.Vector3(a.x + (bb.x - a.x) * k, a.y + (bb.y - a.y) * k - sag * 4 * k * (1 - k), a.z + (bb.z - a.z) * k));
      }
    };
    const VX = [-4.3, -2.4, -0.65, 1.15, 2.9, 4.9, 6.9];
    for (let i = 0; i + 1 < VX.length; i++) swag(new THREE.Vector3(VX[i], 2.72, 6.12), new THREE.Vector3(VX[i + 1], 2.72, 6.12), 0.32, 26);
    swag(new THREE.Vector3(-0.42, P + 2.38, 3.14), new THREE.Vector3(0.92, P + 2.38, 3.14), 0.18, 22);
    // spiralling down the verandah pillars
    for (const x of VX)
      for (let j = 0; j < 46; j++) {
        const a = j * 0.55;
        balls.push(new THREE.Vector3(x + Math.cos(a) * 0.14, 2.7 - j * 0.045, 5.95 + Math.sin(a) * 0.14));
      }
    // and across the gate, between the gateposts
    swag(new THREE.Vector3(-1.6, 1.72, 12.62), new THREE.Vector3(2.1, 1.72, 12.62), 0.45, 40);
    swag(new THREE.Vector3(-1.6, 1.72, 12.62), new THREE.Vector3(2.1, 1.72, 12.62), 0.3, 40);
    for (const gx of [-1.6, 2.1]) for (let j = 0; j < 10; j++) balls.push(new THREE.Vector3(gx, 1.7 - j * 0.07, 12.72));
    const mg = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.042, 0), std({ color: 0xffffff, roughness: 0.8 }), balls.length);
    const col = new THREE.Color();
    balls.forEach((p, i) => {
      m4.compose(p, q.identity(), s.setScalar(1));
      mg.setMatrixAt(i, m4);
      mg.setColorAt(i, col.setHex(i % 3 === 0 ? 0xf4b81d : 0xf07b12));
    });
    garlands.add(mg);
  }

  // ---------------- balloons (birthdays) ----------------
  const balloonsG = group("balloons");
  const balloons: { m: THREE.Group; ph: number }[] = [];
  {
    const colors = [0xd8282a, 0xf4b81d, 0x3c7dc4, 0xc98b8b, 0x4f7a3a, 0x8e44ad];
    let i = 0;
    for (const [px, dir] of [
      [-1.6, -1],
      [2.1, 1],
    ] as const)
      for (let j = 0; j < 3; j++) {
        const bgp = keepSeparate(new THREE.Group());
        bgp.position.set(px, 1.85, 12.45);
        balloonsG.add(bgp);
        const tip = new THREE.Vector3(dir * (0.1 + j * 0.2), 0.85 + j * 0.22, (j - 1) * 0.18);
        const ball = b.mesh(new THREE.SphereGeometry(0.17, 16, 12), std({ color: colors[i++ % colors.length], roughness: 0.35, metalness: 0.05 }), bgp);
        ball.scale.set(1, 1.18, 1);
        ball.position.copy(tip);
        const string = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), tip.clone().add(new THREE.Vector3(0, -0.14, 0))]),
          new THREE.LineBasicMaterial({ color: 0xf6f1e7 }),
        );
        bgp.add(string);
        balloons.push({ m: bgp, ph: rnd() * 6 });
      }
  }

  // small pieces don't cast shadows (keeps the draw calls down); the konna tree and balloons do
  for (const g of [plate, ...pairs, framesGroup, jas, onam, diwali, christmas, halloween, spring, summer, autumn, winter, garlands])
    g.traverse((o) => {
      o.castShadow = false;
    });
  const decorGroups = { onam, vishu, diwali, christmas, halloween, spring, summer, autumn, winter, garlands, balloons: balloonsG };
  for (const g of Object.values(decorGroups)) g.visible = false;
  let decor: DecorState = { onam: false, vishu: false, diwali: false, christmas: false, halloween: false, season: null, garlands: false, balloons: false };
  function setDecor(d: DecorState) {
    decor = d;
    api.decor = d;
    onam.visible = d.onam;
    vishu.visible = d.vishu;
    diwali.visible = d.diwali;
    christmas.visible = d.christmas;
    halloween.visible = d.halloween;
    spring.visible = d.season === "spring";
    summer.visible = d.season === "summer";
    autumn.visible = d.season === "autumn";
    winter.visible = d.season === "winter";
    garlands.visible = d.garlands;
    balloonsG.visible = d.balloons;
    if (roofTile) {
      roofTile.emissive.setHex(d.season === "winter" ? 0x5c636c : 0x000000);
      roofTile.emissiveIntensity = d.season === "winter" ? 0.45 : 1;
    }
  }

  let shimmerAt = -1,
    shimmerPending = false;
  const flowerMat = flowers.material as THREE.MeshStandardMaterial;
  function shimmer() {
    shimmerPending = true;
  }

  function update(t: number, evening: number, anim: boolean, wallScaleY: number) {
    if (shimmerPending) {
      shimmerPending = false;
      shimmerAt = t;
    }
    const sk = shimmerAt >= 0 ? (t - shimmerAt) / 1.6 : 1;
    if (sk < 1) {
      const pulse = Math.sin(sk * Math.PI);
      flowerMat.emissive.setRGB(0.13 + 0.7 * pulse, 0.12 + 0.62 * pulse, 0.09 + 0.35 * pulse);
      jas.scale.setScalar(anim ? 1 + 0.015 * Math.sin(sk * Math.PI * 6) * (1 - sk) : 1);
    } else if (shimmerAt >= 0) {
      shimmerAt = -1;
      flowerMat.emissive.setHex(0x222018);
      jas.scale.setScalar(1);
    }
    // frames ride down with the cut-away walls but keep their shape
    const y = P + 1.6 * wallScaleY;
    framesGroup.position.y = 0;
    for (const f of framesGroup.children) f.position.y = y + (FRAME + 0.06) / 2;

    let glow = 0;
    if (decor.diwali) {
      glow = Math.max(glow, 0.5 + 1.1 * evening);
      diyaHalo.opacity = (0.2 + 0.8 * evening) * (anim ? 0.85 + 0.15 * Math.sin(t * 7) : 1);
      diyaFlames.forEach((f, i) => {
        const k = anim ? 0.85 + 0.3 * Math.sin(t * 11 + i * 1.9) * Math.sin(t * 7.3 + i) : 1;
        f.scale.set(k, k * (anim ? 1 + 0.25 * Math.sin(t * 9 + i) : 1), k);
      });
    }
    if (decor.christmas) {
      glow = Math.max(glow, 0.3 + 0.9 * evening);
      if (anim) star.rotation.y = 0.25 * Math.sin(t * 0.7);
      starPaper.emissive.setHex(evening > 0.5 ? 0xb31414 : 0x5a0606);
    }
    if (decor.halloween) {
      glow = Math.max(glow, 0.2 + 0.6 * evening);
      pumpkinFace.opacity = 0.45 + 0.5 * evening * (anim ? 0.85 + 0.15 * Math.sin(t * 9) : 1);
      pumpkinHalo.opacity = evening * (anim ? 0.8 + 0.2 * Math.sin(t * 9) : 1);
    }
    festiveLight.intensity = lampIntensity(glow * (anim ? 0.92 + 0.08 * Math.sin(t * 8) : 1));

    if (decor.season === "summer") {
      const on = evening > 0.3;
      summer.visible = on;
      if (on) {
        const pos = flyGeo.attributes.position as THREE.BufferAttribute;
        flies.forEach((f, i) => {
          const tt = anim ? t : 0;
          pos.setXYZ(i, f.base.x + 0.6 * Math.sin(tt * 0.35 + f.ph), f.base.y + 0.25 * Math.sin(tt * 0.6 + f.ph * 2), f.base.z + 0.6 * Math.cos(tt * 0.3 + f.ph));
        });
        pos.needsUpdate = true;
        ((summer.children[0] as THREE.Points).material as THREE.PointsMaterial).opacity = anim ? 0.55 + 0.45 * Math.sin(t * 2.3) : 1;
      }
    }
    if (decor.season === "autumn" && anim) {
      drifting.forEach((d, i) => {
        const k = ((t * d.speed + d.ph) % 6) / 6; // 0 → 1 over ~6 s per fall
        v.set(d.x + 0.5 * Math.sin(t + d.ph), 4.5 * (1 - k), d.z + 0.3 * Math.cos(t * 0.8 + d.ph));
        q.setFromEuler(e.set(t * 1.3 + d.ph, t * 0.9, t * 0.7));
        driftMesh.setMatrixAt(i, m4.compose(v, q, s.setScalar(1)));
      });
      driftMesh.instanceMatrix.needsUpdate = true;
    }
    if (decor.season === "autumn") driftMesh.visible = anim;
    if (decor.balloons && anim) for (const bl of balloons) bl.m.rotation.z = 0.05 * Math.sin(t * 1.2 + bl.ph);
  }

  const api: Homey = { setNameplate, setChappals, frames, setPhoto, setJasmine, setDecor, shimmer, update, roofTile, decor };
  return api;
}

function glowSprite() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,200,110,0.9)");
  gr.addColorStop(0.35, "rgba(255,170,60,0.35)");
  gr.addColorStop(1, "rgba(255,150,40,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
}

function color(ctx: BuildCtx, hex: number) {
  return ctx.color({ color: hex, roughness: 0.8 });
}
