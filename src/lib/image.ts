"use client";

/**
 * Shrink a photo in the browser before upload (SPEC §5): longest side ≤ 1600 px, ~200 KB.
 * WebP where the browser can encode it; JPEG otherwise (Safari on iPhone can't encode WebP and
 * silently returns a full-size PNG, which is why the output type is always checked).
 */
async function encode(canvas: HTMLCanvasElement, type: string, q: number): Promise<Blob | null> {
  return new Promise((res) => canvas.toBlob(res, type, q));
}

export async function compressToWebp(input: Blob, maxSide = 1600, targetBytes = 200_000): Promise<Blob> {
  const bitmap = await createImageBitmap(input);
  let side = maxSide;
  let best: Blob | null = null;
  let type = "image/webp";
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff"; // JPEG has no transparency
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const q of [0.82, 0.72, 0.6, 0.5, 0.42]) {
        let out = await encode(canvas, type, q);
        if (out && out.type !== type) {
          // this browser can't make WebP: use JPEG from here on
          type = "image/jpeg";
          out = await encode(canvas, type, q);
        }
        if (!out) continue;
        if (!best || out.size < best.size) best = out;
        if (out.size <= targetBytes) return out;
      }
      side = Math.round(side * 0.75); // still too big: make it smaller and try again
    }
  } finally {
    bitmap.close();
  }
  if (!best) throw new Error("Couldn't process the image");
  return best;
}

export function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
