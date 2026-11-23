"use client";

import { useQuery } from "@tanstack/react-query";
import type { DraftIngredient, RecipeDraft } from "../../supabase/functions/_shared/recipe";
import { base64ToBlob, compressToWebp } from "./image";
import type { BaseRow } from "./lists/rows";
import { supabaseBrowser } from "./supabase/browser";
import { SUPABASE_URL } from "./supabase/config";

export type { DraftIngredient, RecipeDraft };

export interface Recipe extends BaseRow {
  title: string;
  photo_path: string | null;
  prep_min: number | null;
  cook_min: number | null;
  servings: number | null;
  tags: string[];
  source_url: string | null;
  creator: string | null;
  notes: string | null;
}
export interface RecipeIngredient extends BaseRow {
  recipe_id: string;
  position: number;
  qty: number | null;
  unit: string | null;
  item: string;
  note: string | null;
}
export interface RecipeStep extends BaseRow {
  recipe_id: string;
  position: number;
  body: string;
}
export interface RecipeRating {
  household_id: string;
  recipe_id: string;
  member_id: string;
  rating: number | null;
  note: string | null;
  deleted_at: string | null;
  id?: string;
}

export const PHOTO_BUCKET = "recipe-photos";

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = (await supabaseBrowser()?.auth.getSession()) ?? { data: { session: null } };
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

export async function callRecipes<T>(path: "import" | "image", body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/recipes/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `Import error ${res.status}`);
  return j as T;
}

/** Compress and upload a photo into the household's private folder. Returns its storage path. */
export async function uploadRecipePhoto(householdId: string, file: Blob): Promise<string> {
  const webp = await compressToWebp(file);
  const ext = webp.type === "image/webp" ? "webp" : "jpg";
  const path = `${householdId}/${crypto.randomUUID()}.${ext}`;
  const { error } = (await supabaseBrowser()?.storage.from(PHOTO_BUCKET).upload(path, webp, { contentType: webp.type, upsert: false })) ?? {};
  if (error) throw new Error(error.message);
  return path;
}

/** Copy an imported recipe's photo into our storage (never hotlink the original). */
export async function importPhoto(householdId: string, imageUrl: string): Promise<string | null> {
  try {
    const { mime, data } = await callRecipes<{ mime: string; data: string }>("image", { url: imageUrl });
    return await uploadRecipePhoto(householdId, base64ToBlob(data, mime));
  } catch {
    return null; // the recipe is still worth saving without its photo
  }
}

/** A short-lived signed link to a private photo. */
export function usePhotoUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ["photo", path],
    enabled: !!path,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data } = (await supabaseBrowser()?.storage.from(PHOTO_BUCKET).createSignedUrl(path!, 3600)) ?? { data: null };
      return data?.signedUrl ?? null;
    },
  });
}

export interface RecipeInput {
  title: string;
  photo_path: string | null;
  prep_min: number | null;
  cook_min: number | null;
  servings: number | null;
  tags: string[];
  source_url: string | null;
  creator: string | null;
  notes: string | null;
  import_job_id?: string | null;
  ingredients: { qty: number | null; unit: string | null; item: string; note: string | null }[];
  steps: string[];
}

export async function saveRecipe(input: RecipeInput, id?: string): Promise<string> {
  const { data, error } = (await supabaseBrowser()?.rpc("save_recipe", { p: input, p_id: id ?? null })) ?? { data: null, error: null };
  if (error) throw new Error(error.message);
  return data as string;
}

export const totalMinutes = (r: { prep_min: number | null; cook_min: number | null }) =>
  r.prep_min === null && r.cook_min === null ? null : (r.prep_min ?? 0) + (r.cook_min ?? 0);
export const fmtMinutes = (m: number | null) => (m === null ? "" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`);
