import { db, executeRaw } from "../config/database.js";
import { recipes } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

export interface SearchParams {
  q?: string;
  diets?: string[];
  cuisines?: string[];
  allergensExclude?: string[];
  majorConditions?: string[];
  calMin?: number;
  calMax?: number;
  proteinMin?: number;
  sugarMax?: number;
  sodiumMax?: number;
  fiberMin?: number;
  satfatMax?: number;
  timeMax?: number;
  difficulty?: string;
  mealType?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  recipe: any;
  score: number;
  reasons: string[];
}

export async function searchRecipes(params: SearchParams): Promise<SearchResult[]> {
  const {
    q,
    diets = [],
    cuisines = [],
    allergensExclude = [],
    calMin,
    calMax,
    proteinMin,
    sugarMax,
    sodiumMax,
    fiberMin,
    satfatMax,
    timeMax,
    difficulty,
    mealType,
    limit = 50,
    offset = 0
  } = params;
  
  try {
    const results = await executeRaw(`
      SELECT * FROM search_recipes(
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      )
    `, [
      q || null,
      diets,
      cuisines,
      allergensExclude,
      calMin || null,
      calMax || null,
      proteinMin || null,
      sugarMax || null,
      sodiumMax || null,
      fiberMin || null,
      satfatMax || null,
      timeMax || null,
      difficulty || null,
      mealType || null,
      limit,
      offset
    ]);
    
    return results.map((row: any) => ({
      recipe: row.recipe,
      score: parseFloat(row.score),
      reasons: row.reasons || []
    }));
  } catch (error) {
    console.error("Search error:", error);
    throw new Error("Recipe search failed");
  }
}

export async function getRecipeDetail(id: string): Promise<any> {
  const recipe = await db
    .select()
    .from(recipes)
    .where(and(
      eq(recipes.id, id),
      eq(recipes.status, "published"),
      eq(recipes.marketCountry, "US")
    ))
    .limit(1);
  
  if (recipe.length === 0) {
    throw new Error("Recipe not found");
  }
  
  return recipe[0];
}

export async function getPopularRecipes(limit: number = 20): Promise<any[]> {
  try {
    const results = await executeRaw(`
      SELECT r.*, COALESCE(mv.cooked_30d, 0) as popularity_score
      FROM recipes r
      LEFT JOIN mv_recipe_popularity_30d mv ON r.id = mv.recipe_id
      WHERE r.status = 'published' AND r.market_country = 'US'
      ORDER BY mv.cooked_30d DESC NULLS LAST, r.updated_at DESC
      LIMIT $1
    `, [limit]);
    
    return results;
  } catch (error) {
    console.error("Popular recipes error:", error);
    throw new Error("Failed to fetch popular recipes");
  }
}
