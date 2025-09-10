import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.js";
import { rateLimitMiddleware } from "../middleware/rateLimit.js";
import { searchRecipes, getRecipeDetail, getPopularRecipes } from "../services/search.js";
import { toggleSaveRecipe, getSavedRecipes, logRecipeHistory, getRecipeHistory, getRecentlyViewed, getMostCooked, getSharedRecipe } from "../services/recipes.js";
import { insertRecipeHistorySchema, insertRecipeReportSchema } from "../../shared/schema.js";
import { db } from "../config/database.js";
import { recipeReports } from "../../shared/schema.js";

const num = (v: any) =>
  v === undefined || v === null || v === "" || v === "undefined" || v === "null"
    ? undefined
    : Number(v);

const csv = (v?: any) =>
  typeof v === "string" && v.trim() ? v.split(",").map(s => s.trim()).filter(Boolean) : undefined;

const router = Router();

// Search and browsing
router.get("/", rateLimitMiddleware, async (req, res, next) => {
  try {
    const searchParams = {
      q: req.query.q as string,
      diets: req.query.diets ? (req.query.diets as string).split(',') : [],
      cuisines: req.query.cuisines ? (req.query.cuisines as string).split(',') : [],
      allergensExclude: req.query.allergens_exclude ? (req.query.allergens_exclude as string).split(',') : [],
      majorConditions: csv(req.query.major_conditions),
      calMin: req.query.cal_min ? parseInt(req.query.cal_min as string) : undefined,
      calMax: req.query.cal_max ? parseInt(req.query.cal_max as string) : undefined,
      proteinMin: req.query.protein_min ? parseFloat(req.query.protein_min as string) : undefined,
      sugarMax: num(req.query.sugar_max) ? parseFloat(req.query.sugar_max as string) : undefined,
      sodiumMax: num(req.query.sodium_max) ? parseInt(req.query.sodium_max as string) : undefined,
      fiberMin: req.query.fiber_min ? parseFloat(req.query.fiber_min as string) : undefined,
      satfatMax: req.query.satfat_max ? parseFloat(req.query.satfat_max as string) : undefined,
      timeMax: num(req.query.time_max) ? parseInt(req.query.time_max as string) : undefined,
      difficulty: req.query.difficulty as string,
      mealType: req.query.meal_type as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    };
    
    const results = await searchRecipes(searchParams);
    res.json(results);
  } catch (error) {
    next(error);
  }
});

router.get("/popular", rateLimitMiddleware, async (req, res, next) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const results = await getPopularRecipes(limit);
    res.json(results);
  } catch (error) {
    next(error);
  }
});

router.get("/:id", rateLimitMiddleware, async (req, res, next) => {
  try {
    const recipe = await getRecipeDetail(req.params.id);
    res.json(recipe);
  } catch (error) {
    next(error);
  }
});

// User interactions (require auth)
router.post("/:id/save", authMiddleware, rateLimitMiddleware, async (req, res, next) => {
  try {
    const result = await toggleSaveRecipe(req.user.effectiveUserId, req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/report", authMiddleware, rateLimitMiddleware, async (req, res, next) => {
  try {
    const reportData = insertRecipeReportSchema.parse({
      ...req.body,
      reporterUserId: req.user.effectiveUserId,
      recipeId: req.params.id,
    });
    
    const report = await db.insert(recipeReports).values(reportData).returning();
    res.status(201).json(report[0]);
  } catch (error) {
    next(error);
  }
});

// Shared recipe access (no auth required)
router.get("/r/:shareSlug", rateLimitMiddleware, async (req, res, next) => {
  try {
    const recipe = await getSharedRecipe(req.params.shareSlug);
    res.json(recipe);
  } catch (error) {
    next(error);
  }
});

export default router;
