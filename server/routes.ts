import type { Express } from "express";
import { createServer, type Server } from "http";
import recipesRouter from "./routes/recipes.js";
import feedRouter from "./routes/feed.js";
import userRouter from "./routes/user.js";
import adminRouter from "./routes/admin.js";
import b2bRouter from "./routes/b2b.js";
import healthRouter from "./routes/health.js";
import syncRouter from "./routes/sync.js"; 
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { idempotencyMiddleware, storeIdempotentResponse } from "./middleware/idempotency.js";
import userRecipesRouter from "./routes/userRecipes.js";

export async function registerRoutes(app: Express): Promise<Server> {
  // Global middleware
  app.use(idempotencyMiddleware);
  app.use(storeIdempotentResponse);
  
  // API routes
  app.use("/api/v1/recipes", recipesRouter);
  app.use("/api/v1/feed", feedRouter);
  app.use("/api/v1/me", userRouter);
  app.use("/api/v1/admin", adminRouter);
  app.use("/api/v1/b2b", b2bRouter);
  app.use("/api/v1/sync", syncRouter);
  app.use("/api/v1/user-recipes", userRecipesRouter);
  // Health checks (no /api prefix)
  app.use("/", healthRouter);
  
  // Error handling - Note: notFoundHandler will be added after Vite middleware in index.ts
  app.use(errorHandler);

  const httpServer = createServer(app);
  return httpServer;
}
