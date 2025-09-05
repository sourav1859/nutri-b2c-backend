import { Router } from "express";
import type { Request } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { rateLimitMiddleware } from "../middleware/rateLimit";
import { getSavedRecipes, logRecipeHistory, getRecipeHistory, getRecentlyViewed, getMostCooked } from "../services/recipes";
import { createUserRecipe, updateUserRecipe, shareUserRecipe, unshareUserRecipe, submitForReview, getUserRecipes } from "../services/userContent";
import { getUserProfile, createOrUpdateUserProfile } from "../services/feed";
import { insertRecipeHistorySchema, insertUserRecipeSchema, insertUserProfileSchema } from "@shared/schema";
import { AppError } from "../middleware/errorHandler";

const router = Router();

// Narrowing helper so TS knows we have a user and a string id
function getUserId(req: Request): string {
  // We only use a narrow cast here; runtime guard guarantees safety
  const id = (req as any).user?.effectiveUserId as string | undefined;
  if (!id) {
    throw new AppError(401, "Unauthorized", "Missing authenticated user");
  }
  return id;
}

// User profile
router.get("/profile", authMiddleware, rateLimitMiddleware, async (req, res, next) => {
  try {
    const profile = await getUserProfile(getUserId(req));
    res.json(profile);
  } catch (error) {
    next(error);
  }
});

router.put("/profile", authMiddleware, rateLimitMiddleware, async (req, res, next) => {
  try {
    const profileData = insertUserProfileSchema.parse(req.body);
    const profile = await createOrUpdateUserProfile(getUserId(req), profileData);
    res.json(profile);
  } catch (error) {
    next(error);
  }
});

// Saved recipes
router.get("/saved", authMiddleware, rateLimitMiddleware, async (req, res, next) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
    
    const saved = await getSavedRecipes(getUserId(req), limit, offset);
    res.json(saved);
  } catch (error) {
    next(error);
  }
});

// Recipe history
router.post("/history", authMiddleware, rateLimitMiddleware, async (req, res, next) => {
  try {
    const historyData = insertRecipeHistorySchema.parse({
      ...req.body,
      userId: getUserId(req),
    });
    
    await logRecipeHistory(historyData);
    res.status(201).json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.get("/history", authMiddleware, rateLimitMiddleware, async (req, res, next) => {
  try {
    const event = req.query.event as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
    
    const history = await getRecipeHistory(getUserId(req), event, limit, offset);
    res.json(history);
  } catch (error) {
    next(error);
  }
});

router.get("/recently-viewed", authMiddleware, rateLimitMiddleware, async (req, res, next) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const recent = await getRecentlyViewed(getUserId(req), limit);
    res.json(recent);
  } catch (error) {
    next(error);
  }
});

router.get("/most-cooked", authMiddleware, rateLimitMiddleware, async (req, res, next) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const cooked = await getMostCooked(getUserId(req), limit);
    res.json(cooked);
  } catch (error) {
    next(error);
  }
});

// User-generated recipes
router.post("/my-recipes", authMiddleware, rateLimitMiddleware, async (req, res, next) => {
  try {
    const recipeData = insertUserRecipeSchema.parse(req.body);
    const recipe = await createUserRecipe(getUserId(req), recipeData);
    res.status(201).json(recipe);
  } catch (error) {
    next(error);
  }
});

router.get("/my-recipes", authMiddleware, rateLimitMiddleware, async (req, res, next) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
    
    const recipes = await getUserRecipes(getUserId(req), limit, offset);
    res.json(recipes);
  } catch (error) {
    next(error);
  }
});

router.patch("/my-recipes/:id", authMiddleware, rateLimitMiddleware, async (req, res, next) => {
  try {
    const updates = insertUserRecipeSchema.partial().parse(req.body);
    const recipe = await updateUserRecipe(getUserId(req), req.params.id, updates);
    res.json(recipe);
  } catch (error) {
    next(error);
  }
});

router.post("/my-recipes/:id/share", authMiddleware, rateLimitMiddleware, async (req, res, next) => {
  try {
    const result = await shareUserRecipe(getUserId(req), req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/my-recipes/:id/unshare", authMiddleware, rateLimitMiddleware, async (req, res, next) => {
  try {
    const recipe = await unshareUserRecipe(getUserId(req), req.params.id);
    res.json(recipe);
  } catch (error) {
    next(error);
  }
});

router.post("/my-recipes/:id/submit", authMiddleware, rateLimitMiddleware, async (req, res, next) => {
  try {
    const recipe = await submitForReview(getUserId(req), req.params.id);
    res.json(recipe);
  } catch (error) {
    next(error);
  }
});

export default router;
