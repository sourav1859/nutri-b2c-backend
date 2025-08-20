import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { rateLimitMiddleware } from "../middleware/rateLimit";
import { getPersonalizedFeed, getFeedRecommendations, createOrUpdateUserProfile, getUserProfile } from "../services/feed";

const router = Router();

router.get("/", authMiddleware, rateLimitMiddleware, async (req, res, next) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
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
