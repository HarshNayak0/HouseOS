"use client";

/** Private file storage: uploads (images shrunk first) and short-lived signed links. */
import { useQuery } from "@tanstack/react-query";
import { compressToWebp } from "./image";
import { supabaseBrowser } from "./supabase/browser";

export const PHOTO_BUCKET = "recipe-photos";
export const FILES_BUCKET = "household-files";

const EXT: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" };

/** Photos are compressed (WebP, or JPEG on Safari); PDFs up to 5 MB go as they are. */
export async function prepareUpload(file: Blob): Promise<Blob> {
  const isImage = file.type.startsWith("image/");
  if (!isImage && file.type !== "application/pdf") throw new Error("Only photos and PDFs can be attached");
  const body = isImage ? await compressToWebp(file) : file;
  if (body.size > 5 * 1024 * 1024) throw new Error("Files can be up to 5 MB");
  return body;
}

async function upload(bucket: string, folder: string, file: Blob): Promise<string> {
  const body = await prepareUpload(file);
  const path = `${folder}/${crypto.randomUUID()}.${EXT[body.type] ?? "bin"}`;
  const { error } = (await supabaseBrowser()?.storage.from(bucket).upload(path, body, { contentType: body.type, upsert: false })) ?? {};
  if (error) throw new Error(error.message);
  return path;
}

/** A recipe photo, in the household's folder of the recipe-photos bucket. */
export const uploadRecipePhoto = (householdId: string, file: Blob) => upload(PHOTO_BUCKET, householdId, file);

/** A memory photo, trip cover or booking attachment, in the household's private folder. */
export const uploadHouseholdFile = (householdId: string, kind: "memories" | "trips" | "bookings" | "photos", file: Blob) =>
  upload(FILES_BUCKET, `${householdId}/${kind}`, file);

/** A short-lived (1 hour) signed link to a private file, cached for 50 minutes. */
export function useSignedUrl(bucket: string, path: string | null | undefined) {
  return useQuery({
    queryKey: ["signed", bucket, path],
    enabled: !!path,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data } = (await supabaseBrowser()?.storage.from(bucket).createSignedUrl(path!, 3600)) ?? { data: null };
      return data?.signedUrl ?? null;
    },
  });
}
