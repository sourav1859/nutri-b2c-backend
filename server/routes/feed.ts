import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { rateLimitMiddleware } from "../middleware/rateLimit.js";
import { getPersonalizedFeed, getFeedRecommendations, createOrUpdateUserProfile, getUserProfile } from "../services/feed.js";

const router = Router();

router.get("/", authMiddleware, rateLimitMiddleware, async (req, res, next) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 200;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
    
    const results = await getPersonalizedFeed(req.user.effectiveUserId, limit, offset);
    res.json(results);
  } catch (error) {
    next(error);
  }
});

router.get("/recommendations", authMiddleware, rateLimitMiddleware, async (req, res, next) => {
  try {
    const recommendations = await getFeedRecommendations(req.user.effectiveUserId);
    res.json(recommendations);
  } catch (error) {
    next(error);
  }
});

export default router;
