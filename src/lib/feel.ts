"use client";

/**
 * How the app feels: soft sounds and haptics, each switchable per phone in Settings.
 * Every sound is made in the browser with the Web Audio API (no audio files, nothing to download):
 * a brass bell, a soft tick, a paper rustle, and the background (morning birds, crickets after dark,
 * rain when it's raining at home).
 */

// ---------------- per-phone preferences ----------------
const SOUND_KEY = "veedu.sounds";
const HAPTIC_KEY = "veedu.haptics";
export const FEEL_CHANGED = "veedu:feel-changed";

const read = (k: string, fallback: boolean) => {
  try {
    const v = localStorage.getItem(k);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
};
const write = (k: string, v: boolean) => {
  try {
    localStorage.setItem(k, v ? "1" : "0");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(FEEL_CHANGED));
};
export const soundsOn = () => read(SOUND_KEY, false);
export const hapticsOn = () => read(HAPTIC_KEY, true);
export const setSoundsOn = (v: boolean) => write(SOUND_KEY, v);
export const setHapticsOn = (v: boolean) => write(HAPTIC_KEY, v);

// ---------------- haptics ----------------
type Buzz = "tick" | "done" | "delete";
const PATTERN: Record<Buzz, number | number[]> = { tick: 12, done: [14, 70, 22], delete: 28 };

let iosSwitch: HTMLLabelElement | null = null;
/**
 * iPhone Safari has no vibration API. Since iOS 18 a native switch (<input type="checkbox" switch>)
 * gives a light tap when toggled, including by a click on its label, so we keep a hidden one. If Apple
 * changes this, nothing breaks; there's just no tap.
 */
function iosTap() {
  if (!iosSwitch) {
    iosSwitch = document.createElement("label");
    iosSwitch.setAttribute("aria-hidden", "true");
    iosSwitch.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.tabIndex = -1;
    iosSwitch.appendChild(input);
    document.body.appendChild(iosSwitch);
  }
  iosSwitch.click();
}

export function buzz(kind: Buzz = "tick") {
  if (typeof window === "undefined" || !hapticsOn()) return;
  if (typeof navigator.vibrate === "function") {
    navigator.vibrate(PATTERN[kind]);
    return;
  }
  iosTap();
  if (kind === "done") setTimeout(iosTap, 90);
}

// ---------------- sounds ----------------
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}
/** Browsers (iPhone especially) only allow sound after a tap: call this inside a tap handler. */
export function primeAudio() {
  if (soundsOn()) audio();
}

let noiseBuf: AudioBuffer | null = null;
function noise(ac: AudioContext) {
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      // a little "pink-ish" noise: softer than white
      last = 0.97 * last + 0.03 * (Math.random() * 2 - 1);
      d[i] = (Math.random() * 2 - 1) * 0.5 + last * 4;
    }
  }
  return noiseBuf;
}

/** A small brass bell: a few inharmonic partials that ring out. */
function bell(ac: AudioContext, at = ac.currentTime, vol = 0.18) {
  const out = ac.createGain();
  out.gain.value = vol;
  out.connect(master!);
  for (const [ratio, amp, decay] of [
    [1, 1, 2.6],
    [2.76, 0.45, 1.6],
    [5.4, 0.25, 0.9],
    [8.93, 0.12, 0.5],
  ]) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine";
    o.frequency.value = 880 * ratio;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(amp, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + decay + 0.05);
  }
}

function tick(ac: AudioContext) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  const t = ac.currentTime;
  o.type = "triangle";
  o.frequency.setValueAtTime(1500, t);
  o.frequency.exponentialRampToValueAtTime(900, t + 0.05);
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + 0.08);
}

function rustle(ac: AudioContext) {
  const src = ac.createBufferSource();
  src.buffer = noise(ac);
  const f = ac.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 3200;
  f.Q.value = 0.7;
  const g = ac.createGain();
  const t = ac.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.09, t + 0.03);
  g.gain.linearRampToValueAtTime(0.05, t + 0.12);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
  src.connect(f).connect(g).connect(master!);
  src.start(t, Math.random());
  src.stop(t + 0.3);
}

export type Moment = "check" | "chore" | "task" | "note" | "delete";

/** A small moment: sound (if on) and a haptic (if on), plus an event the 3D house can react to. */
export function celebrate(kind: Moment) {
  if (typeof window === "undefined") return;
  buzz(kind === "chore" ? "done" : kind === "delete" ? "delete" : "tick");
  window.dispatchEvent(new CustomEvent("veedu:moment", { detail: kind }));
  if (!soundsOn()) return;
  const ac = audio();
  if (!ac) return;
  if (kind === "chore") bell(ac);
  else if (kind === "note") rustle(ac);
  else if (kind === "check" || kind === "task") tick(ac);
}

// ---------------- background sounds ----------------
export type Ambience = "birds" | "crickets" | "rain";

interface Layer {
  stop: () => void;
}

function rainLayer(ac: AudioContext): Layer {
  const src = ac.createBufferSource();
  src.buffer = noise(ac);
  src.loop = true;
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1400;
  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 250;
  const g = ac.createGain();
  g.gain.setValueAtTime(0, ac.currentTime);
  g.gain.linearRampToValueAtTime(0.05, ac.currentTime + 3);
  src.connect(lp).connect(hp).connect(g).connect(master!);
  src.start();
  // the odd heavier drop
  const drops = setInterval(() => {
    const d = ac.createBufferSource();
    d.buffer = noise(ac);
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2000 + Math.random() * 2500;
    const dg = ac.createGain();
    const t = ac.currentTime;
    dg.gain.setValueAtTime(0.03 + Math.random() * 0.03, t);
    dg.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    d.connect(bp).connect(dg).connect(master!);
    d.start(t, Math.random());
    d.stop(t + 0.06);
  }, 140);
  return {
    stop() {
      clearInterval(drops);
      g.gain.linearRampToValueAtTime(0, ac.currentTime + 1.5);
      src.stop(ac.currentTime + 1.6);
    },
  };
}

function cricketsLayer(ac: AudioContext): Layer {
  const out = ac.createGain();
  out.gain.value = 0.022;
  out.connect(master!);
  const chirp = (pitch: number) => {
    const t = ac.currentTime;
    for (let k = 0; k < 3; k++) {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.frequency.value = pitch;
      const s = t + k * 0.045;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(1, s + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.035);
      o.connect(g).connect(out);
      o.start(s);
      o.stop(s + 0.04);
    }
  };
  const a = setInterval(() => chirp(4300), 820);
  const b = setInterval(() => Math.random() < 0.7 && chirp(4700), 1130);
  return {
    stop() {
      clearInterval(a);
      clearInterval(b);
    },
  };
}

function birdsLayer(ac: AudioContext): Layer {
  const out = ac.createGain();
  out.gain.value = 0.035;
  out.connect(master!);
  const call = () => {
    const t = ac.currentTime;
    const base = 2200 + Math.random() * 1600;
    const notes = 2 + Math.floor(Math.random() * 4);
    for (let k = 0; k < notes; k++) {
      const o = ac.createOscillator();
      const g = ac.createGain();
      const s = t + k * (0.11 + Math.random() * 0.05);
      o.frequency.setValueAtTime(base * (1 + 0.15 * Math.random()), s);
      o.frequency.exponentialRampToValueAtTime(base * (1.25 + 0.3 * Math.random()), s + 0.07);
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(1, s + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.09);
      o.connect(g).connect(out);
      o.start(s);
      o.stop(s + 0.1);
    }
  };
  let timer: ReturnType<typeof setTimeout>;
  const loop = () => {
    call();
    timer = setTimeout(loop, 1500 + Math.random() * 4500);
  };
  timer = setTimeout(loop, 800);
  return { stop: () => clearTimeout(timer) };
}

const layers = new Map<Ambience, Layer>();
/** Play exactly these background sounds (quietly); everything else fades out. */
export function setAmbience(want: Ambience[]) {
  const on = soundsOn() && want.length > 0;
  for (const [k, l] of layers)
    if (!on || !want.includes(k)) {
      l.stop();
      layers.delete(k);
    }
  if (!on) return;
  const ac = ctx; // only once a tap has unlocked audio
  if (!ac) return;
  if (ac.state !== "running") {
    ac.resume()
      .then(() => ac.state === "running" && setAmbience(want))
      .catch(() => {});
    return;
  }
  for (const k of want)
    if (!layers.has(k)) layers.set(k, k === "rain" ? rainLayer(ac) : k === "crickets" ? cricketsLayer(ac) : birdsLayer(ac));
}

/** Weather codes that mean rain or showers (Open-Meteo / WMO). */
export const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
