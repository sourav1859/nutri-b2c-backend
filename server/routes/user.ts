import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { rateLimitMiddleware } from "../middleware/rateLimit";
import { getSavedRecipes, logRecipeHistory, getRecipeHistory, getRecentlyViewed, getMostCooked } from "../services/recipes";
import { createUserRecipe, updateUserRecipe, shareUserRecipe, unshareUserRecipe, submitForReview, getUserRecipes } from "../services/userContent";
import { getUserProfile, createOrUpdateUserProfile } from "../services/feed";
import { insertRecipeHistorySchema, insertUserRecipeSchema, insertUserProfileSchema } from "@shared/schema";

const router = Router();

// User profile
router.get("/profile", authMiddleware, rateLimitMiddleware, async (req, res, next) => {
  try {
    const profile = await getUserProfile(req.user.effectiveUserId);
    res.json(profile);
  } catch (error) {
    next(error);
  }
});

router.put("/profile", authMiddleware, rateLimitMiddleware, async (req, res, next) => {
  try {
    const profileData = insertUserProfileSchema.parse(req.body);
    const profile = await createOrUpdateUserProfile(req.user.effectiveUserId, profileData);
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
    
    const saved = await getSavedRecipes(req.user.effectiveUserId, limit, offset);
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
      userId: req.user.effectiveUserId,
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
    
    const history = await getRecipeHistory(req.user.effectiveUserId, event, limit, offset);
    res.json(history);
  } catch (error) {
    next(error);
  }
});

router.get("/recently-viewed", authMiddleware, rateLimitMiddleware, async (req, res, next) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const recent = await getRecentlyViewed(req.user.effectiveUserId, limit);
    res.json(recent);
  } catch (error) {
    next(error);
  }
});

router.get("/most-cooked", authMiddleware, rateLimitMiddleware, async (req, res, next) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const cooked = await getMostCooked(req.user.effectiveUserId, limit);
    res.json(cooked);
  } catch (error) {
    next(error);
  }
});

// User-generated recipes
router.post("/my-recipes", authMiddleware, rateLimitMiddleware, async (req, res, next) => {
  try {
    const recipeData = insertUserRecipeSchema.parse(req.body);
    const recipe = await createUserRecipe(req.user.effectiveUserId, recipeData);
    res.status(201).json(recipe);
  } catch (error) {
    next(error);
  }
});

router.get("/my-recipes", authMiddleware, rateLimitMiddleware, async (req, res, next) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
    
    const recipes = await getUserRecipes(req.user.effectiveUserId, limit, offset);
    res.json(recipes);
  } catch (error) {
    next(error);
  }
});

router.patch("/my-recipes/:id", authMiddleware, rateLimitMiddleware, async (req, res, next) => {
  try {
    const updates = insertUserRecipeSchema.partial().parse(req.body);
    const recipe = await updateUserRecipe(req.user.effectiveUserId, req.params.id, updates);
    res.json(recipe);
  } catch (error) {
    next(error);
  }
});

router.post("/my-recipes/:id/share", authMiddleware, rateLimitMiddleware, async (req, res, next) => {
  try {
    const result = await shareUserRecipe(req.user.effectiveUserId, req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/my-recipes/:id/unshare", authMiddleware, rateLimitMiddleware, async (req, res, next) => {
  try {
    const recipe = await unshareUserRecipe(req.user.effectiveUserId, req.params.id);
    res.json(recipe);
  } catch (error) {
    next(error);
  }
});

router.post("/my-recipes/:id/submit", authMiddleware, rateLimitMiddleware, async (req, res, next) => {
  try {
    const recipe = await submitForReview(req.user.effectiveUserId, req.params.id);
    res.json(recipe);
  } catch (error) {
    next(error);
  }
});

export default router;
