import type { Express } from "express";
import { createServer, type Server } from "http";
import recipesRouter from "./routes/recipes";
import feedRouter from "./routes/feed";
import userRouter from "./routes/user";
import adminRouter from "./routes/admin";
import b2bRouter from "./routes/b2b";
import healthRouter from "./routes/health";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { idempotencyMiddleware, storeIdempotentResponse } from "./middleware/idempotency";

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
  
  // Health checks (no /api prefix)
  app.use("/", healthRouter);
  
  // Error handling - Note: notFoundHandler will be added after Vite middleware in index.ts
  app.use(errorHandler);

  const httpServer = createServer(app);
  return httpServer;
}
