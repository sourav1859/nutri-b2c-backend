import { db, executeRaw } from "../config/database.js";
import { recipes, userRecipes, recipeReports, recipeReportResolutions, auditLog } from "../../shared/schema.js";
import { eq, desc, and } from "drizzle-orm";
import type { InsertRecipe } from "../../shared/schema.js";
import { auditLogEntry } from "../middleware/audit.js";

export async function createCuratedRecipe(adminUserId: string, recipeData: InsertRecipe, reason?: string) {
  const recipe = await db.insert(recipes).values({
    ...recipeData,
    status: 'published',
    publishedAt: new Date(),
  }).returning();
  
  await auditLogEntry(
    adminUserId,
    'CREATE_CURATED_RECIPE',
    'recipes',
    recipe[0].id,
    null,
    recipe[0],
    reason
  );
  
  return recipe[0];
}

export async function updateCuratedRecipe(
  adminUserId: string,
  recipeId: string,
  updates: Partial<InsertRecipe>,
  reason?: string
) {
  // Get before state
  const before = await db
    .select()
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .limit(1);
  
  if (before.length === 0) {
    throw new Error("Recipe not found");
  }
  
  const updated = await db
    .update(recipes)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(recipes.id, recipeId))
    .returning();
  
  await auditLogEntry(
    adminUserId,
    'UPDATE_CURATED_RECIPE',
    'recipes',
    recipeId,
    before[0],
    updated[0],
    reason
  );
  
  return updated[0];
}

export async function deleteCuratedRecipe(adminUserId: string, recipeId: string, reason: string) {
  // Get before state
  const before = await db
    .select()
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .limit(1);
  
  if (before.length === 0) {
    throw new Error("Recipe not found");
  }
  
  await db.delete(recipes).where(eq(recipes.id, recipeId));
  
  await auditLogEntry(
    adminUserId,
    'DELETE_CURATED_RECIPE',
    'recipes',
    recipeId,
    before[0],
    null,
    reason
  );
  
  return { success: true };
}

export async function getReports(status?: string, limit: number = 50, offset: number = 0) {
  let query = db
    .select({
      report: recipeReports,
      recipe: recipes,
      userRecipe: userRecipes,
    })
    .from(recipeReports)
    .leftJoin(recipes, eq(recipeReports.recipeId, recipes.id))
    .leftJoin(userRecipes, eq(recipeReports.userRecipeId, userRecipes.id));
  
  if (status) {
    query = query.where(eq(recipeReports.status, status));
  }
  
  const results = await query
    .orderBy(desc(recipeReports.createdAt))
    .limit(limit)
    .offset(offset);
  
  return results;
}

export async function resolveReport(
  adminUserId: string,
  reportId: string,
  action: string,
  reason: string,
  notes?: string
) {
  // Update report status
  await db
    .update(recipeReports)
    .set({
      status: 'resolved',
      updatedAt: new Date(),
    })
    .where(eq(recipeReports.id, reportId));
  
  // Create resolution record
  const resolution = await db.insert(recipeReportResolutions).values({
    reportId,
    resolvedBy: adminUserId,
    action,
    reason,
    notes,
  }).returning();
  
  await auditLogEntry(
    adminUserId,
    'RESOLVE_REPORT',
    'recipe_reports',
    reportId,
    null,
    { action, reason, notes }
  );
  
  return resolution[0];
}

export async function getAuditLog(limit: number = 100, offset: number = 0, actorUserId?: string) {
  let query = db.select().from(auditLog);
  
  if (actorUserId) {
    query = query.where(eq(auditLog.actorUserId, actorUserId));
  }
  
  const logs = await query
    .orderBy(desc(auditLog.at))
    .limit(limit)
    .offset(offset);
  
  return logs;
}

export async function auditImpersonation(
  adminUserId: string,
  targetUserId: string,
  url: string,
  ip?: string,
  userAgent?: string
) {
  await auditLogEntry(
    adminUserId,
    'USER_IMPERSONATION',
    'users',
    targetUserId,
    null,
    { url, ip, userAgent },
    'Admin impersonation for support/debugging'
  );
}

export async function refreshMaterializedViews(): Promise<{ success: boolean; duration: number }> {
  const start = Date.now();
  
  try {
    await executeRaw('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_recipe_popularity_30d');
    const duration = Date.now() - start;
    
    return { success: true, duration };
  } catch (error) {
    console.error("Failed to refresh materialized views:", error);
    throw new Error("Materialized view refresh failed");
  }
}

export async function getDashboardStats() {
  try {
    const [totalRecipes, activeUsers, searchQps, pendingReview] = await Promise.all([
      db.select().from(recipes).where(eq(recipes.status, 'published')),
      executeRaw('SELECT COUNT(DISTINCT user_id) as count FROM recipe_history WHERE at > NOW() - INTERVAL \'30 days\''),
      executeRaw('SELECT COUNT(*) as count FROM recipe_history WHERE event = \'viewed\' AND at > NOW() - INTERVAL \'1 minute\''),
      db.select().from(userRecipes).where(eq(userRecipes.reviewStatus, 'pending')),
    ]);
    
    return {
      totalRecipes: totalRecipes.length,
      activeUsers: activeUsers[0]?.count || 0,
      searchQps: searchQps[0]?.count || 0,
      pendingReview: pendingReview.length,
    };
  } catch (error) {
    console.error("Dashboard stats error:", error);
    throw new Error("Failed to get dashboard stats");
  }
}
