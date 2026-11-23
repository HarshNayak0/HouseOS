/**
 * Procedural textures, drawn in code (no image downloads). Ported verbatim from the prototype.
 * Each texture is generated once; `createTextures` is called once per page load and cached.
 */
import * as THREE from "three";
import type { Rng } from "../rng";

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;

export interface TextureSet {
  plaster: THREE.CanvasTexture;
  redOxide: THREE.CanvasTexture;
  border: THREE.CanvasTexture;
  teak: THREE.CanvasTexture;
  roof: THREE.CanvasTexture;
  laterite: THREE.CanvasTexture;
  grass: THREE.CanvasTexture;
  sand: THREE.CanvasTexture;
  stone: THREE.CanvasTexture;
  granite: THREE.CanvasTexture;
  lattice: THREE.CanvasTexture;
  fabric: THREE.CanvasTexture;
  water: THREE.CanvasTexture;
  thatch: THREE.CanvasTexture;
  trunk: THREE.CanvasTexture;
  wicker: THREE.CanvasTexture;
  frond: THREE.CanvasTexture;
  banana: THREE.CanvasTexture;
  skyDay: THREE.CanvasTexture;
  skyEve: THREE.CanvasTexture;
}

export const TEXTURE_COUNT = 20;

/**
 * Generates every texture, yielding between them so the loading screen can show progress.
 * `onStep` is called after each texture.
 */
export async function createTextures(
  rng: Rng,
  maxAniso: number,
  onStep: () => void | Promise<void>,
): Promise<TextureSet> {
  const rnd = rng.next;

  function canvasTex(w: number, h: number, draw: Draw): THREE.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d")!;
    draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    return t;
  }
  function speckle(
    g: CanvasRenderingContext2D,
    w: number,
    h: number,
    n: number,
    colors: string[],
    rMax: number,
    a: number,
  ) {
    for (let i = 0; i < n; i++) {
      g.globalAlpha = a * (0.4 + rnd() * 0.6);
      g.fillStyle = colors[(rnd() * colors.length) | 0];
      const r = 0.5 + rnd() * rMax;
      g.fillRect(rnd() * w, rnd() * h, r, r);
    }
    g.globalAlpha = 1;
  }
  function blotches(
    g: CanvasRenderingContext2D,
    w: number,
    h: number,
    n: number,
    color: string,
    rMax: number,
    a: number,
  ) {
    for (let i = 0; i < n; i++) {
      const x = rnd() * w,
        y = rnd() * h,
        r = rMax * (0.3 + rnd() * 0.7);
      for (const dx of [-w, 0, w])
        for (const dy of [-h, 0, h]) {
          const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
          gr.addColorStop(0, color.replace("A", String(a)));
          gr.addColorStop(1, color.replace("A", "0"));
          g.fillStyle = gr;
          g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
        }
    }
  }

  const out: Partial<TextureSet> = {};
  const add = async (key: keyof TextureSet, t: THREE.CanvasTexture) => {
    out[key] = t;
    await onStep();
  };

  await add(
    "plaster",
    canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = "#efe8da";
      g.fillRect(0, 0, w, h);
      blotches(g, w, h, 26, "rgba(190,170,140,A)", 120, 0.1);
      blotches(g, w, h, 14, "rgba(255,255,250,A)", 90, 0.25);
      speckle(g, w, h, 9000, ["#d9ceb9", "#fffaf0", "#cfc2a8"], 1.6, 0.35);
    }),
  );
  await add(
    "redOxide",
    canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = "#8f3323";
      g.fillRect(0, 0, w, h);
      blotches(g, w, h, 22, "rgba(60,14,8,A)", 130, 0.22);
      blotches(g, w, h, 18, "rgba(200,90,60,A)", 100, 0.16);
      speckle(g, w, h, 5000, ["#6d2216", "#a9473a", "#7b2a1d"], 1.4, 0.4);
    }),
  );
  await add(
    "border",
    canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#2f1510";
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 2500, ["#4a2219", "#21100b"], 1.4, 0.5);
    }),
  );
  await add(
    "teak",
    canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = "#74401f";
      g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 2) {
        const shade = rnd();
        g.strokeStyle =
          shade < 0.5
            ? "rgba(52,24,10," + (0.12 + rnd() * 0.25) + ")"
            : "rgba(170,105,60," + (0.08 + rnd() * 0.18) + ")";
        g.lineWidth = 1 + rnd() * 1.6;
        g.beginPath();
        const ph = rnd() * 6,
          amp = 1 + rnd() * 3;
        for (let x = 0; x <= w; x += 16) {
          const yy = y + Math.sin((x / w) * Math.PI * 2 * 2 + ph) * amp;
          if (x) g.lineTo(x, yy);
          else g.moveTo(x, yy);
        }
        g.stroke();
      }
      for (let i = 0; i < 4; i++) {
        const x = rnd() * w,
          y = rnd() * h;
        g.strokeStyle = "rgba(40,18,8,.35)";
        g.lineWidth = 1.2;
        for (let r = 3; r < 22; r += 4) {
          g.beginPath();
          g.ellipse(x, y, r * 2.4, r * 0.7, 0, 0, Math.PI * 2);
          g.stroke();
        }
      }
    }),
  );
  await add(
    "roof",
    canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = "#7d3a20";
      g.fillRect(0, 0, w, h);
      const rows = 8,
        cols = 8,
        tw = w / cols,
        th = h / rows;
      for (let r = 0; r < rows; r++) {
        const off = ((r % 2) * tw) / 2;
        for (let c = -1; c <= cols; c++) {
          const x = c * tw + off,
            y = r * th;
          const v = rnd();
          const col = ["#b65b35", "#c26a41", "#a9502e", "#c9774c", "#b4603a"][(v * 5) | 0];
          g.fillStyle = col;
          g.beginPath();
          g.moveTo(x + 2, y);
          g.lineTo(x + tw - 2, y);
          g.lineTo(x + tw - 2, y + th * 0.92);
          g.quadraticCurveTo(x + tw / 2, y + th * 1.05, x + 2, y + th * 0.92);
          g.closePath();
          g.fill();
          const gr = g.createLinearGradient(x, 0, x + tw, 0);
          gr.addColorStop(0, "rgba(60,20,8,.35)");
          gr.addColorStop(0.5, "rgba(255,210,170,.18)");
          gr.addColorStop(1, "rgba(60,20,8,.35)");
          g.fillStyle = gr;
          g.fillRect(x + 2, y, tw - 4, th * 0.92);
          g.fillStyle = "rgba(40,12,4,.45)";
          g.fillRect(x + 2, y, tw - 4, th * 0.12);
        }
      }
      speckle(g, w, h, 1800, ["#3b3a2a", "#5b5a3d", "#2a1a10"], 2.2, 0.25);
      blotches(g, w, h, 10, "rgba(40,45,30,A)", 70, 0.18);
    }),
  );
  await add(
    "laterite",
    canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = "#6f321a";
      g.fillRect(0, 0, w, h);
      const bw = w / 3,
        bh = h / 6;
      for (let r = 0; r < 6; r++) {
        const off = ((r % 2) * bw) / 2;
        for (let c = -1; c <= 3; c++) {
          const x = c * bw + off + 3,
            y = r * bh + 3;
          g.fillStyle = ["#a5552f", "#9a4b28", "#b0613a", "#93462a"][(rnd() * 4) | 0];
          g.fillRect(x, y, bw - 6, bh - 6);
        }
      }
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = "rgba(50,18,8," + (0.3 + rnd() * 0.5) + ")";
        g.beginPath();
        g.arc(rnd() * w, rnd() * h, 0.8 + rnd() * 3.2, 0, 7);
        g.fill();
      }
      speckle(g, w, h, 3000, ["#c7804f", "#5a2410"], 1.5, 0.35);
    }),
  );
  await add(
    "grass",
    canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = "#5a7a34";
      g.fillRect(0, 0, w, h);
      blotches(g, w, h, 20, "rgba(40,70,20,A)", 120, 0.3);
      blotches(g, w, h, 14, "rgba(150,170,70,A)", 90, 0.2);
      for (let i = 0; i < 9000; i++) {
        const x = rnd() * w,
          y = rnd() * h;
        g.strokeStyle = ["#4c6d2a", "#6f9142", "#86a650", "#3f5f22"][(rnd() * 4) | 0];
        g.globalAlpha = 0.5;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (rnd() - 0.5) * 3, y - 3 - rnd() * 5);
        g.stroke();
      }
      g.globalAlpha = 1;
    }),
  );
  await add(
    "sand",
    canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = "#d8c39c";
      g.fillRect(0, 0, w, h);
      blotches(g, w, h, 20, "rgba(170,140,100,A)", 110, 0.15);
      speckle(g, w, h, 12000, ["#c4ab80", "#eadbbd", "#a58d66"], 1.4, 0.5);
      g.strokeStyle = "rgba(150,120,85,.18)";
      g.lineWidth = 1.2;
      for (let i = 0; i < 40; i++) {
        const x = rnd() * w,
          y = rnd() * h;
        g.beginPath();
        g.arc(x, y, 40 + rnd() * 60, 0.2, 1.3);
        g.stroke();
      }
    }),
  );
  await add(
    "stone",
    canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = "#a89c87";
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 14000, ["#7d7366", "#d3c8b4", "#5e554b", "#c0b39b"], 1.6, 0.55);
      g.strokeStyle = "rgba(60,50,40,.55)";
      g.lineWidth = 3;
      g.strokeRect(0, 0, w / 2, h / 2);
      g.strokeRect(w / 2, 0, w / 2, h / 2);
      g.strokeRect(0, h / 2, w / 2, h / 2);
      g.strokeRect(w / 2, h / 2, w / 2, h / 2);
    }),
  );
  await add(
    "granite",
    canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#2e2a28";
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 5000, ["#6e6560", "#151312", "#8a7f74"], 1.5, 0.6);
    }),
  );
  await add(
    "lattice",
    canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#24130a";
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "#8a5530";
      g.lineWidth = 11;
      for (let i = -w; i <= w * 2; i += 64) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i + h, h);
        g.stroke();
        g.beginPath();
        g.moveTo(i, h);
        g.lineTo(i + h, 0);
        g.stroke();
      }
      g.strokeStyle = "rgba(30,12,4,.5)";
      g.lineWidth = 2;
      for (let i = -w; i <= w * 2; i += 64) {
        g.beginPath();
        g.moveTo(i + 5, 0);
        g.lineTo(i + 5 + h, h);
        g.stroke();
      }
      g.strokeStyle = "#6b3d1f";
      g.lineWidth = 14;
      g.strokeRect(0, 0, w, h);
    }),
  );
  await add(
    "fabric",
    canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#efe3cb";
      g.fillRect(0, 0, w, h);
      const bands: [number, number, string][] = [
        [20, 14, "#a33a2a"],
        [38, 4, "#b8893b"],
        [60, 14, "#a33a2a"],
        [150, 10, "#7a4527"],
        [168, 4, "#b8893b"],
        [200, 14, "#a33a2a"],
      ];
      for (const [y, hh, c] of bands) {
        g.fillStyle = c;
        g.fillRect(0, y, w, hh);
      }
      speckle(g, w, h, 3000, ["#ffffff", "#c9b796"], 1.2, 0.3);
      g.globalAlpha = 0.08;
      g.fillStyle = "#000";
      for (let x = 0; x < w; x += 3) g.fillRect(x, 0, 1, h);
      g.globalAlpha = 1;
    }),
  );
  await add(
    "water",
    canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = "#2f6b73";
      g.fillRect(0, 0, w, h);
      blotches(g, w, h, 16, "rgba(20,60,50,A)", 140, 0.35);
      g.strokeStyle = "rgba(210,240,235,.22)";
      g.lineWidth = 1.5;
      for (let i = 0; i < 90; i++) {
        const x = rnd() * w,
          y = rnd() * h;
        g.beginPath();
        g.ellipse(x, y, 8 + rnd() * 26, 2 + rnd() * 5, 0, 0, Math.PI);
        g.stroke();
      }
    }),
  );
  await add(
    "thatch",
    canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#8f7238";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2500; i++) {
        const x = rnd() * w,
          y = rnd() * h;
        g.strokeStyle = ["#c4a35c", "#7a5c2a", "#a88a48"][(rnd() * 3) | 0];
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (rnd() - 0.5) * 4, y + 10 + rnd() * 10);
        g.stroke();
      }
      g.fillStyle = "rgba(60,40,15,.5)";
      for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 3);
    }),
  );
  await add(
    "trunk",
    canvasTex(128, 256, (g, w, h) => {
      g.fillStyle = "#7d6a52";
      g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 10) {
        g.fillStyle = "rgba(50,38,26," + (0.3 + rnd() * 0.3) + ")";
        g.fillRect(0, y, w, 2 + rnd() * 2);
      }
      speckle(g, w, h, 1500, ["#a8957a", "#4d3e2e"], 1.5, 0.4);
    }),
  );
  await add(
    "wicker",
    canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = "#b38f55";
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "rgba(90,60,25,.6)";
      g.lineWidth = 2;
      for (let y = 0; y < h; y += 8) {
        for (let x = 0; x < w; x += 16) {
          g.beginPath();
          g.moveTo(x, y + ((x / 16) % 2 ? 0 : 4));
          g.lineTo(x + 16, y + ((x / 16) % 2 ? 4 : 0));
          g.stroke();
        }
      }
    }),
  );
  {
    const t = canvasTex(512, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      for (let x = 6; x < w - 10; x += 7) {
        const k = 1 - x / w;
        const len = 18 + 44 * Math.sin(Math.min(1, (x / w) * 1.4) * Math.PI * 0.9) * (0.6 + 0.4 * k);
        g.strokeStyle = ["#3f6b24", "#4f7f2c", "#5f8f33", "#3a5f1f"][(rnd() * 4) | 0];
        g.lineWidth = 3.2;
        g.lineCap = "round";
        g.beginPath();
        g.moveTo(x, h / 2);
        g.quadraticCurveTo(x + 10, h / 2 - len * 0.6, x + 18, h / 2 - len);
        g.stroke();
        g.beginPath();
        g.moveTo(x, h / 2);
        g.quadraticCurveTo(x + 10, h / 2 + len * 0.6, x + 18, h / 2 + len);
        g.stroke();
      }
      g.strokeStyle = "#7b6a3a";
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(0, h / 2);
      g.lineTo(w, h / 2);
      g.stroke();
    });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    await add("frond", t);
  }
  {
    const t = canvasTex(256, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = "#5f8f2f";
      g.beginPath();
      g.moveTo(0, h / 2);
      g.quadraticCurveTo(w * 0.5, -h * 0.15, w, h / 2);
      g.quadraticCurveTo(w * 0.5, h * 1.15, 0, h / 2);
      g.fill();
      g.strokeStyle = "rgba(40,70,20,.5)";
      g.lineWidth = 1;
      for (let x = 10; x < w; x += 6) {
        g.beginPath();
        g.moveTo(x, h / 2);
        g.lineTo(x + 8, 8);
        g.moveTo(x, h / 2);
        g.lineTo(x + 8, h - 8);
        g.stroke();
      }
      g.strokeStyle = "#c8d27a";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(0, h / 2);
      g.lineTo(w, h / 2);
      g.stroke();
    });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    await add("banana", t);
  }
  // Sky gradients (no randomness, so their position in the order doesn't matter).
  const skyTex = (top: string, bottom: string) =>
    canvasTex(4, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, top);
      gr.addColorStop(0.62, bottom);
      gr.addColorStop(1, bottom);
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    });
  await add("skyDay", skyTex("#8fb9cf", "#f2e4c8"));
  await add("skyEve", skyTex("#1c2645", "#c9774a"));

  return out as TextureSet;
}
