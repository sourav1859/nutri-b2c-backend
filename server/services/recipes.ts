import { db } from "../config/database";
import { recipes, savedRecipes, recipeHistory, userRecipes } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import type { InsertRecipeHistory } from "@shared/schema";
import { supabase } from "../config/supabase";

type AnyObj = Record<string, any>;

export type RecipePayload = {
  title: string;
  description?: string | null;
  image_url?: string | null;
  servings?: number | null;
  total_time_minutes?: number | null;
  prep_time_minutes?: number | null;
  cook_time_minutes?: number | null;
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  fiber_g?: number | null;
  sugar_g?: number | null;
  sodium_mg?: number | null;
  saturated_fat_g?: number | null;
  difficulty?: string | null;            // 'easy' | 'medium' | 'hard' (freeform in DB)
  meal_type?: string | null;             // 'breakfast' | 'lunch' | ...
  cuisines?: string[] | null;            // text[]
  diet_tags?: string[] | null;           // text[]
  allergens?: string[] | null;           // text[]
  flags?: string[] | null;               // text[]  (vegetarian, kid_friendly, etc)
  ingredients?: any[] | null;            // jsonb  [{qty, unit, name}]
  instructions?: any[] | null;           // jsonb  [ "step 1", "step 2", ... ]
  notes?: string | null;
  visibility?: string | null;            // 'private' | 'public' | 'unlisted'
};

export async function toggleSaveRecipe(userId: string, recipeId: string): Promise<{ saved: boolean }> {
  // Check if already saved
  const existing = await db
    .select()
    .from(savedRecipes)
    .where(and(
      eq(savedRecipes.userId, userId),
      eq(savedRecipes.recipeId, recipeId)
    ))
    .limit(1);
  
  if (existing.length > 0) {
    // Remove save
    await db
      .delete(savedRecipes)
      .where(and(
        eq(savedRecipes.userId, userId),
        eq(savedRecipes.recipeId, recipeId)
      ));
    return { saved: false };
  } else {
    // Add save
    await db.insert(savedRecipes).values({
      userId,
      recipeId,
    });
    return { saved: true };
  }
}

export async function getSavedRecipes(userId: string, limit: number = 50, offset: number = 0) {
  const saved = await db
    .select({
      recipe: recipes,
      savedAt: savedRecipes.savedAt,
    })
    .from(savedRecipes)
    .innerJoin(recipes, eq(savedRecipes.recipeId, recipes.id))
    .where(eq(savedRecipes.userId, userId))
    .orderBy(desc(savedRecipes.savedAt))
    .limit(limit)
    .offset(offset);
  
  return saved;
}

export async function logRecipeHistory(historyData: InsertRecipeHistory): Promise<void> {
  // Check for throttling on 'viewed' events (max 1 per hour per recipe/user)
  if (historyData.event === 'viewed') {
    const recentView = await db
      .select()
      .from(recipeHistory)
      .where(and(
        eq(recipeHistory.userId, historyData.userId),
        eq(recipeHistory.recipeId, historyData.recipeId),
        eq(recipeHistory.event, 'viewed')
      ))
      .orderBy(desc(recipeHistory.at))
      .limit(1);
    
      if (recentView.length > 0) {
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const last = recentView[0];
        // at may be nullable in the schema; guard it
        if (last?.at && last.at > hourAgo) {
          // Skip logging - too recent
          return;
        }
      }
  }
  
  await db.insert(recipeHistory).values(historyData);
}

export async function getRecipeHistory(
  userId: string,
  event?: string,
  limit: number = 50,
  offset: number = 0
) {
  let query = db
    .select({
      history: recipeHistory,
      recipe: recipes,
    })
    .from(recipeHistory)
    .innerJoin(recipes, eq(recipeHistory.recipeId, recipes.id))
    .where(eq(recipeHistory.userId, userId));
  
  if (event) {
    query = query.where(and(
      eq(recipeHistory.userId, userId),
      eq(recipeHistory.event, event)
    ));
  }
  
  const results = await query
    .orderBy(desc(recipeHistory.at))
    .limit(limit)
    .offset(offset);
  
  return results;
}

export async function getRecentlyViewed(userId: string, limit: number = 20) {
  return getRecipeHistory(userId, 'viewed', limit);
}

export async function getMostCooked(userId: string, limit: number = 20) {
  const results = await db
    .select({
      recipe: recipes,
      cookCount: recipeHistory.id, // Will be aggregated
    })
    .from(recipeHistory)
    .innerJoin(recipes, eq(recipeHistory.recipeId, recipes.id))
    .where(and(
      eq(recipeHistory.userId, userId),
      eq(recipeHistory.event, 'cooked')
    ))
    .groupBy(recipes.id)
    .orderBy(desc(recipeHistory.id))
    .limit(limit);
  
  return results;
}

export async function getSharedRecipe(shareSlug: string) {
  const shared = await db
    .select()
    .from(userRecipes)
    .where(and(
      eq(userRecipes.shareSlug, shareSlug),
      eq(userRecipes.visibility, 'shared')
    ))
    .limit(1);
  
  if (shared.length === 0) {
    throw new Error("Shared recipe not found");
  }
  
  return shared[0];
}


export async function listUserRecipes(ownerId: string, limit = 50, offset = 0) {
  const { data, error } = await supabase
    .from("user_recipes")
    .select("*")
    .eq("owner_user_id", ownerId)
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return data ?? [];
}

export async function getUserRecipe(ownerId: string, id: string) {
  const { data, error } = await supabase
    .from("user_recipes")
    .select("*")
    .eq("id", id)
    .eq("owner_user_id", ownerId)
    .single();

  if (error) throw error;
  return data;
}

function compactRecord(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function toArray(val: any): string[] {
  if (Array.isArray(val)) return val.filter(Boolean).map(String);
  if (val == null || val === "") return [];
  return [String(val)];
}

/** Strict column shaping for user_recipes */
function shapeUserRecipe(payload: AnyObj) {
  // Accept legacy single 'cuisine' and map to 'cuisines'
  const cuisines = Array.isArray(payload.cuisines)
    ? payload.cuisines
    : toArray(payload.cuisine);

  return {
    // recipe core
    title: payload.title,
    description: payload.description ?? null,
    image_url: payload.image_url ?? null,

    // times & servings
    total_time_minutes: payload.total_time_minutes ?? null,
    prep_time_minutes: payload.prep_time_minutes ?? null,
    cook_time_minutes: payload.cook_time_minutes ?? null,
    servings: payload.servings ?? null,

    // nutrition
    calories: payload.calories ?? null,
    protein_g: payload.protein_g ?? null,
    carbs_g: payload.carbs_g ?? null,
    fat_g: payload.fat_g ?? null,
    fiber_g: payload.fiber_g ?? null,
    sugar_g: payload.sugar_g ?? null,
    sodium_mg: payload.sodium_mg ?? null,
    saturated_fat_g: payload.saturated_fat_g ?? null,

    // taxonomy
    difficulty: payload.difficulty ?? null,
    meal_type: payload.meal_type ?? null,
    cuisines,                                  // <- always array
    diet_tags: Array.isArray(payload.diet_tags) ? payload.diet_tags : [],
    allergens: Array.isArray(payload.allergens) ? payload.allergens : [],
    flags: Array.isArray(payload.flags) ? payload.flags : [],

    // content
    ingredients: payload.ingredients ?? [],
    instructions: payload.instructions ?? [],
    notes: payload.notes ?? null,

    // visibility
    visibility: payload.visibility ?? "private",
    share_slug: payload.share_slug ?? null,
  };
}

export async function createUserRecipe(ownerId: string, payload: AnyObj) {
  const now = new Date().toISOString();
  const shaped = shapeUserRecipe(payload);

  const row = {
    owner_user_id: ownerId,
    ...shaped,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("user_recipes")
    .insert(row)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function updateUserRecipe(ownerId: string, id: string, patch: AnyObj) {
  const now = new Date().toISOString();
  const upd = compactRecord({ ...shapeUserRecipe(patch), updated_at: now });

  const { data, error } = await supabase
    .from("user_recipes")
    .update(upd)
    .eq("id", id)
    .eq("owner_user_id", ownerId)
    .select("*")
    .single();

  if (error || !data) throw error ?? new Error("Update failed");
  return data;
}

export async function deleteUserRecipe(ownerId: string, id: string) {
  const { error } = await supabase
    .from("user_recipes")
    .delete()
    .eq("id", id)
    .eq("owner_user_id", ownerId);

  if (error) throw error;
}