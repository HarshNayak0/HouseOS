"use client";

/**
 * Shrink a photo in the browser before upload (SPEC §5): WebP, longest side ≤ 1600 px, ~200 KB.
 */
export async function compressToWebp(input: Blob, maxSide = 1600, targetBytes = 200_000): Promise<Blob> {
  const bitmap = await createImageBitmap(input);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale)),
    h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  let out: Blob | null = null;
  for (const q of [0.82, 0.72, 0.6, 0.5, 0.4]) {
    out = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", q));
    if (!out) break;
    if (out.size <= targetBytes) return out;
  }
  if (out) return out;
  // very old browsers without WebP encoding
  return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't process the photo"))), "image/jpeg", 0.7));
}

export function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
