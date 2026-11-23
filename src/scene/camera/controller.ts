/**
 * Scene behaviour from the prototype: exterior ↔ inside (roof lift + wall cutaway), camera flights,
 * room selection/highlight, tap picking, evening mode, idle drift, labels and animated indicators.
 * Framework-agnostic: the R3F component calls `update()` every frame.
 */
import * as THREE from "three";
import type { OrbitControls } from "three-stdlib";
import { CUT, P, ROOM_IDS, ROOMS, type RoomId } from "../config";
import type { HouseModel } from "../build";
import { EMPTY_INDICATORS, type IndicatorState } from "../indicators";
import { applyEvening, lampIntensity } from "../lighting";
import { ease, roomView, views, type View } from "./views";

type Mode = "outside" | "inside";

interface Tween {
  t0: number;
  ms: number;
  fn: (k: number) => void;
  done?: () => void;
}

const IDLE_DRIFT_AFTER_MS = 5000;
const LANTERN_ON = new THREE.Color(0xffc25a);
const LANTERN_OFF = new THREE.Color(0x5a4630);

export class HouseController {
  mode: Mode = "outside";
  selected: RoomId | null = null;
  hovered: RoomId | null = null;
  evening = false;
  private eveK = 0;
  private tweens: Tween[] = [];
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private proj = new THREE.Vector3();
  private lastInteraction = 0;
  private ind: IndicatorState = EMPTY_INDICATORS;
  private labelEls: Partial<Record<RoomId, HTMLElement>> = {};
  private labelAnchors = Object.fromEntries(
    ROOM_IDS.map((id) => {
      const [x0, x1, z0, z1] = ROOMS[id].bounds;
      const [lx, lz] = ROOMS[id].labelAt ?? [(x0 + x1) / 2, (z0 + z1) / 2];
      return [id, new THREE.Vector3(lx, id === "backyard" ? 1.8 : P + 1.5, lz)];
    }),
  ) as Record<RoomId, THREE.Vector3>;
  /** Called when the user taps the house from outside, or taps a room. */
  onTapRoom?: (id: RoomId) => void;
  onTapOutside?: () => void;
  /** Lets the page hide its hint etc. */
  onModeChange?: (mode: Mode) => void;

  constructor(
    public model: HouseModel,
    public camera: THREE.PerspectiveCamera,
    public controls: OrbitControls,
    public renderer: THREE.WebGLRenderer,
    public scene: THREE.Scene,
    private reducedMotion = false,
  ) {
    controls.addEventListener("start", this.markInteraction);
    applyEvening(0, false, model.lighting, model.lamps, renderer, scene, model.T);
  }

  setHandlers(h: { onTapRoom?: (id: RoomId) => void; onTapOutside?: () => void; onModeChange?: (mode: Mode) => void }) {
    Object.assign(this, h);
  }

  dispose() {
    this.controls.removeEventListener("start", this.markInteraction);
  }

  private markInteraction = () => {
    this.lastInteraction = performance.now();
    this.controls.autoRotate = false;
  };

  private size() {
    const el = this.renderer.domElement;
    return { w: el.clientWidth || window.innerWidth, h: el.clientHeight || window.innerHeight };
  }

  /* ---------- tweens & camera ---------- */
  private tween(ms: number, fn: (k: number) => void, done?: () => void) {
    if (this.reducedMotion) ms = 1;
    this.tweens.push({ t0: performance.now(), ms, fn, done });
  }

  private fly(v: View, ms = 1000) {
    const p0 = this.camera.position.clone(),
      t0 = this.controls.target.clone();
    this.controls.enabled = false;
    this.controls.autoRotate = false;
    this.tween(
      ms,
      (k) => {
        this.camera.position.lerpVectors(p0, v.p, k);
        this.controls.target.lerpVectors(t0, v.t, k);
      },
      () => {
        this.controls.enabled = true;
      },
    );
  }

  private jump(v: View) {
    this.camera.position.copy(v.p);
    this.controls.target.copy(v.t);
    this.controls.update();
  }

  /** Put the camera in place without animation (first load / deep link). */
  init(room: RoomId | null) {
    const { w, h } = this.size();
    if (room) {
      this.mode = "inside";
      this.setRoofWalls(true, true);
      this.selected = room;
      this.setHighlight(room, true, 1);
      this.jump(roomView(room, w, h));
    } else {
      this.jump(views(w, h).ext);
    }
    this.lastInteraction = performance.now();
  }

  private setRoofWalls(inside: boolean, instant = false) {
    const { roof, roofMats, walls } = this.model;
    const y0 = roof.position.y,
      y1 = inside ? 9 : 0,
      o0 = roofMats[0].opacity,
      o1 = inside ? 0 : 1,
      s0 = walls.scale.y,
      s1 = inside ? CUT : 1;
    roof.visible = true;
    const apply = (k: number) => {
      roof.position.y = y0 + (y1 - y0) * k;
      roofMats.forEach((m) => (m.opacity = o0 + (o1 - o0) * k));
      walls.scale.y = s0 + (s1 - s0) * k;
    };
    const done = () => {
      roof.visible = !inside;
      roofMats.forEach((m) => (m.depthWrite = !inside));
    };
    if (instant) {
      apply(1);
      done();
    } else this.tween(1100, apply, done);
  }

  goInside() {
    if (this.mode === "inside") return;
    this.mode = "inside";
    this.setRoofWalls(true);
    const { w, h } = this.size();
    this.fly(views(w, h).ins, 1300);
    this.onModeChange?.("inside");
  }

  goOutside() {
    this.clearSelection(true);
    if (this.mode === "outside") return;
    this.mode = "outside";
    this.setRoofWalls(false);
    const { w, h } = this.size();
    this.fly(views(w, h).ext, 1300);
    this.lastInteraction = performance.now();
    this.onModeChange?.("outside");
  }

  select(id: RoomId) {
    if (this.mode !== "inside") {
      this.mode = "inside";
      this.setRoofWalls(true);
      this.onModeChange?.("inside");
    }
    if (this.selected === id) return;
    if (this.selected) this.setHighlight(this.selected, false);
    this.selected = id;
    this.setHighlight(id, true, 1);
    const { w, h } = this.size();
    this.fly(roomView(id, w, h), 950);
  }

  clearSelection(silent = false) {
    if (!this.selected) return;
    this.setHighlight(this.selected, false);
    this.selected = null;
    if (!silent && this.mode === "inside") {
      const { w, h } = this.size();
      this.fly(views(w, h).ins, 950);
    }
  }

  /** Re-aim the camera after a resize/rotation (keeps the room beside the panel). */
  reframe() {
    const { w, h } = this.size();
    if (this.selected) this.fly(roomView(this.selected, w, h), 400);
    else this.fly(this.mode === "inside" ? views(w, h).ins : views(w, h).ext, 400);
  }

  setHighlight(id: RoomId | null, on: boolean, strength = 1) {
    if (!id) return;
    this.model.roomMats[id].forEach((m) => m.emissive.setHex(on ? (strength > 0.5 ? 0x1c0f03 : 0x120902) : 0));
    if (id === "backyard" && this.model.backyardOverlay)
      this.model.backyardOverlay.opacity = on ? (strength > 0.5 ? 0.2 : 0.1) : 0;
  }

  setEvening(on: boolean) {
    if (on === this.evening) return;
    this.evening = on;
    const from = this.eveK,
      to = on ? 1 : 0;
    this.tween(900, (k) => {
      this.eveK = from + (to - from) * k;
    });
  }

  setIndicators(s: IndicatorState) {
    this.ind = s;
    const { indicators, heap } = this.model;
    indicators.fridgeBadge.draw(s.shoppingOpen);
    indicators.choreBadge.draw(s.choresOverdue);
    const open = Math.min(s.choresOpen, 10);
    heap.scale.set(0.5 + open * 0.1, 0.25 + open * 0.12, 0.5 + open * 0.1);
    heap.visible = open > 0;
    indicators.bell.visible = s.renewalSoon;
    (this.model.lantern.material as THREE.MeshBasicMaterial).color.copy(s.tripSoon ? LANTERN_ON : LANTERN_OFF);
  }

  /* ---------- picking ---------- */
  pick(clientX: number, clientY: number): RoomId | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hit = this.ray.intersectObjects(this.model.pickables, false)[0];
    return (hit?.object.userData.room as RoomId | undefined) ?? null;
  }

  /** A tap (pointer moved < 7 px). */
  tap(clientX: number, clientY: number) {
    this.markInteraction();
    if (this.mode === "outside") {
      this.onTapOutside?.();
      return;
    }
    const id = this.pick(clientX, clientY);
    if (id) this.onTapRoom?.(id);
  }

  hover(clientX: number, clientY: number): RoomId | null {
    if (this.mode !== "inside") return null;
    const id = this.pick(clientX, clientY);
    if (id === this.hovered) return id;
    if (this.hovered && this.hovered !== this.selected) this.setHighlight(this.hovered, false);
    this.hovered = id;
    if (id && id !== this.selected) this.setHighlight(id, true, 0.3);
    return id;
  }

  /* ---------- labels ---------- */
  registerLabel(id: RoomId, el: HTMLElement | null) {
    if (el) this.labelEls[id] = el;
    else delete this.labelEls[id];
  }

  private updateLabels() {
    const { w, h } = this.size();
    const showL = this.mode === "inside";
    for (const id of ROOM_IDS) {
      const el = this.labelEls[id];
      if (!el) continue;
      this.proj.copy(this.labelAnchors[id]).project(this.camera);
      const vis =
        showL &&
        !this.selected &&
        this.proj.z < 1 &&
        Math.abs(this.proj.x) < 1.1 &&
        Math.abs(this.proj.y) < 1.1;
      el.style.opacity = vis ? "1" : "0";
      el.style.pointerEvents = vis ? "auto" : "none";
      el.tabIndex = vis ? 0 : -1;
      el.style.transform = `translate(${((this.proj.x + 1) / 2) * w}px, ${((1 - this.proj.y) / 2) * h}px) translate(-50%, -50%)`;
    }
  }

  /* ---------- per frame ---------- */
  update(now: number) {
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      const k = Math.min(1, (now - tw.t0) / tw.ms);
      tw.fn(ease(k));
      if (k >= 1) {
        this.tweens.splice(i, 1);
        tw.done?.();
      }
    }
    const m = this.model;
    applyEvening(this.eveK, this.evening, m.lighting, m.lamps, this.renderer, this.scene, m.T);

    const t = now / 1000;
    const anim = !this.reducedMotion;
    // nilavilakku: brighter after a new note from the other person
    const note = this.ind.newNoteFromPartner;
    m.flames.forEach((f, i) => {
      const s = (this.evening || note ? 1 : 0.55) * (anim ? 0.85 + 0.25 * Math.sin(t * 9 + i * 1.7) : 1);
      f.scale.set(s, s * (anim ? 1 + 0.3 * Math.sin(t * 7 + i) : 1), s);
    });
    if (note) m.lamps[0].intensity = Math.max(m.lamps[0].intensity, lampIntensity(1.3 * (0.85 + 0.15 * Math.sin(t * 8))));
    // boat lantern: only lit when a trip is coming up
    const boatLamp = m.lamps[3];
    if (boatLamp && !this.ind.tripSoon) boatLamp.intensity = 0;
    if (this.ind.tripSoon && anim) m.lantern.scale.setScalar(1 + 0.15 * Math.sin(t * 3));
    if (anim) {
      m.boat.position.y = 0.16 + 0.025 * Math.sin(t * 1.3);
      m.boat.rotation.z = 0.02 * Math.sin(t * 1.1);
    }
    // closet bell sways gently
    if (m.indicators.bell.visible && anim) m.indicators.bell.rotation.z = 0.12 * Math.sin(t * 2.2);
    // petti glow
    const glow = this.ind.dateThisWeek ? 0.45 + (anim ? 0.15 * Math.sin(t * 1.6) : 0) : 0;
    (m.indicators.pettiGlow.material as THREE.MeshBasicMaterial).opacity = glow;
    m.indicators.pettiLight.intensity = lampIntensity(glow * 1.2);
    // badges fade out while the roof is on
    const badgeOpacity = m.roof.visible ? 1 - (m.roofMats[0].opacity ?? 1) : 1;
    m.indicators.fridgeBadge.sprite.material.opacity = badgeOpacity;
    m.indicators.choreBadge.sprite.material.opacity = badgeOpacity;

    // gentle idle drift on the exterior view
    if (this.mode === "outside" && !this.tweens.length && anim && this.controls.enabled) {
      this.controls.autoRotate = now - this.lastInteraction > IDLE_DRIFT_AFTER_MS;
      this.controls.autoRotateSpeed = 0.35;
    } else if (this.controls.autoRotate) this.controls.autoRotate = false;

    this.updateLabels();
  }
}
