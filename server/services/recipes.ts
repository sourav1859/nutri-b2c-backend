import { db } from "../config/database";
import { recipes, savedRecipes, recipeHistory, userRecipes } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import type { InsertRecipeHistory } from "@shared/schema";

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
      if (recentView[0].at > hourAgo) {
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
