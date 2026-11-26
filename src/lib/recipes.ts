"use client";

import type { DraftIngredient, RecipeDraft } from "../../supabase/functions/_shared/recipe";
import { uploadRecipePhoto } from "./files";
import { callFunction } from "./functions";
import { base64ToBlob } from "./image";
import type { BaseRow } from "./lists/rows";
import { supabaseBrowser } from "./supabase/browser";

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

/** Calls the `recipes` Edge Function (website, caption and screenshot imports; copying a photo in). */
export const callRecipes = <T,>(path: "import" | "image", body: Record<string, unknown>) => callFunction<T>("recipes", path, body);

/** Copy an imported recipe's photo into our storage (never hotlink the original). */
export async function importPhoto(householdId: string, imageUrl: string): Promise<string | null> {
  try {
    const { mime, data } = await callRecipes<{ mime: string; data: string }>("image", { url: imageUrl });
    return await uploadRecipePhoto(householdId, base64ToBlob(data, mime));
  } catch {
    return null; // the recipe is still worth saving without its photo
  }
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
