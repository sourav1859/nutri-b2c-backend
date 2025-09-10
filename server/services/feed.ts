import { db, executeRaw } from "../config/database.js";
import { userProfiles, recipes } from "../../shared/schema.js";
import { eq } from "drizzle-orm";

export interface FeedResult {
  recipe: any;
  score: number;
  reasons: string[];
}

export async function getPersonalizedFeed(
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<FeedResult[]> {
  try {
    const results = await executeRaw(`
      SELECT * FROM personalized_feed($1, $2, $3)
    `, [userId, limit, offset]);
    
    return results.map((row: any) => ({
      recipe: row.recipe,
      score: parseFloat(row.score),
      reasons: row.reasons || []
    }));
  } catch (error) {
    console.error("Personalized feed error:", error);
    throw new Error("Failed to generate personalized feed");
  }
}

export async function getUserProfile(userId: string) {
  const profile = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  
  return profile[0] || null;
}

export async function createOrUpdateUserProfile(userId: string, profileData: any) {
  const existing = await getUserProfile(userId);
  
  if (existing) {
    await db
      .update(userProfiles)
      .set({
        ...profileData,
        updatedAt: new Date(),
      })
      .where(eq(userProfiles.userId, userId));
  } else {
    await db.insert(userProfiles).values({
      userId,
      ...profileData,
    });
  }
  
  return getUserProfile(userId);
}

export async function getFeedRecommendations(userId: string): Promise<{
  trending: any[];
  forYou: FeedResult[];
  recent: any[];
}> {
  try {
    // Get trending recipes (popular in last 7 days)
    const trending = await executeRaw(`
      SELECT r.*, COUNT(rh.id) as recent_activity
      FROM recipes r
      LEFT JOIN recipe_history rh ON r.id = rh.recipe_id 
        AND rh.event = 'cooked' 
        AND rh.at > NOW() - INTERVAL '7 days'
      WHERE r.status = 'published' AND r.market_country = 'US'
      GROUP BY r.id
      ORDER BY recent_activity DESC, r.updated_at DESC
      LIMIT 10
    `);
    
    // Get personalized recommendations
    const forYou = await getPersonalizedFeed(userId, 20);
    
    // Get recently published recipes
    const recent = await db
      .select()
      .from(recipes)
      .where(eq(recipes.status, "published"))
      .orderBy(recipes.publishedAt)
      .limit(10);
    
    return {
      trending,
      forYou,
      recent,
    };
  } catch (error) {
    console.error("Feed recommendations error:", error);
    throw new Error("Failed to get feed recommendations");
  }
}
