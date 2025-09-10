import { db } from "../config/database.js";
import { userRecipes, recipes } from "../../shared/schema.js";
import { eq, and } from "drizzle-orm";
import type { InsertUserRecipe } from "../../shared/schema.js";
import { randomBytes } from "crypto";

export async function createUserRecipe(userId: string, recipeData: InsertUserRecipe) {
  const recipe = await db.insert(userRecipes).values({
    ...recipeData,
    ownerUserId: userId,
  }).returning();
  
  return recipe[0];
}

export async function updateUserRecipe(userId: string, recipeId: string, updates: Partial<InsertUserRecipe>) {
  const updated = await db
    .update(userRecipes)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(and(
      eq(userRecipes.id, recipeId),
      eq(userRecipes.ownerUserId, userId)
    ))
    .returning();
  
  if (updated.length === 0) {
    throw new Error("Recipe not found or access denied");
  }
  
  return updated[0];
}

export async function shareUserRecipe(userId: string, recipeId: string): Promise<{ shareSlug: string }> {
  // Generate unique share slug
  const shareSlug = randomBytes(8).toString('hex');
  
  const updated = await db
    .update(userRecipes)
    .set({
      visibility: 'shared',
      shareSlug,
      updatedAt: new Date(),
    })
    .where(and(
      eq(userRecipes.id, recipeId),
      eq(userRecipes.ownerUserId, userId)
    ))
    .returning();
  
  if (updated.length === 0) {
    throw new Error("Recipe not found or access denied");
  }
  
  return { shareSlug };
}

export async function unshareUserRecipe(userId: string, recipeId: string) {
  const updated = await db
    .update(userRecipes)
    .set({
      visibility: 'private',
      shareSlug: null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(userRecipes.id, recipeId),
      eq(userRecipes.ownerUserId, userId)
    ))
    .returning();
  
  if (updated.length === 0) {
    throw new Error("Recipe not found or access denied");
  }
  
  return updated[0];
}

export async function submitForReview(userId: string, recipeId: string) {
  const updated = await db
    .update(userRecipes)
    .set({
      visibility: 'submitted',
      submittedAt: new Date(),
      reviewStatus: 'pending',
      updatedAt: new Date(),
    })
    .where(and(
      eq(userRecipes.id, recipeId),
      eq(userRecipes.ownerUserId, userId)
    ))
    .returning();
  
  if (updated.length === 0) {
    throw new Error("Recipe not found or access denied");
  }
  
  return updated[0];
}

export async function getUserRecipes(userId: string, limit: number = 50, offset: number = 0) {
  const userRecipesList = await db
    .select()
    .from(userRecipes)
    .where(eq(userRecipes.ownerUserId, userId))
    .orderBy(userRecipes.updatedAt)
    .limit(limit)
    .offset(offset);
  
  return userRecipesList;
}

export async function approveUserRecipe(adminUserId: string, userRecipeId: string, reviewNotes?: string) {
  // Get the user recipe
  const userRecipe = await db
    .select()
    .from(userRecipes)
    .where(eq(userRecipes.id, userRecipeId))
    .limit(1);
  
  if (userRecipe.length === 0) {
    throw new Error("User recipe not found");
  }
  
  const recipe = userRecipe[0];
  
  // Create a new curated recipe
  const curatedRecipe = await db.insert(recipes).values({
    title: recipe.title,
    description: recipe.description,
    imageUrl: recipe.imageUrl,
    calories: recipe.calories,
    proteinG: recipe.proteinG,
    carbsG: recipe.carbsG,
    fatG: recipe.fatG,
    fiberG: recipe.fiberG,
    sugarG: recipe.sugarG,
    sodiumMg: recipe.sodiumMg,
    saturatedFatG: recipe.saturatedFatG,
    totalTimeMinutes: recipe.totalTimeMinutes,
    prepTimeMinutes: recipe.prepTimeMinutes,
    cookTimeMinutes: recipe.cookTimeMinutes,
    servings: recipe.servings,
    difficulty: recipe.difficulty,
    mealType: recipe.mealType,
    cuisines: recipe.cuisines,
    dietTags: recipe.dietTags,
    allergens: recipe.allergens,
    flags: recipe.flags,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    notes: recipe.notes,
    status: 'published',
    sourceType: 'user_generated',
    sourceUserId: recipe.ownerUserId,
    publishedAt: new Date(),
  }).returning();
  
  // Update user recipe status
  await db
    .update(userRecipes)
    .set({
      reviewStatus: 'approved',
      reviewedBy: adminUserId,
      reviewedAt: new Date(),
      reviewNotes,
      approvedRecipeId: curatedRecipe[0].id,
    })
    .where(eq(userRecipes.id, userRecipeId));
  
  return curatedRecipe[0];
}

export async function rejectUserRecipe(adminUserId: string, userRecipeId: string, reviewNotes: string) {
  const updated = await db
    .update(userRecipes)
    .set({
      reviewStatus: 'rejected',
      reviewedBy: adminUserId,
      reviewedAt: new Date(),
      reviewNotes,
      visibility: 'private', // Reset to private
    })
    .where(eq(userRecipes.id, userRecipeId))
    .returning();
  
  if (updated.length === 0) {
    throw new Error("User recipe not found");
  }
  
  return updated[0];
}
