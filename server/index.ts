// server/index.ts
import express from "express";
import cors from "cors";
import { Pool } from "pg";
import 'dotenv/config';
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Request, Response, NextFunction } from "express";
import { AppError } from "./middleware/errorHandler";

// prefer .env.local, fallback to .env (works on Windows too)
const CWD = process.cwd();
const envFile =
  [".env.local", ".env"].map((f) => resolve(CWD, f)).find((p) => existsSync(p));

if (envFile) {
  loadEnv({ path: envFile }); // loads variables into process.env
  console.log(`[boot] env loaded: ${envFile}`);
} else {
  console.warn("[boot] no .env.local or .env found in", CWD);
}

const NODE_ENV = process.env.NODE_ENV ?? "development";
const PORT = Number(process.env.PORT ?? 5000);
const HOST = process.env.HOST ?? "127.0.0.1";
const WEB_ORIGINS = (process.env.WEB_ORIGINS ??
  "http://127.0.0.1:3000,http://localhost:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("[boot] DATABASE_URL is missing. Set it in .env.local");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
});

pool
  .query("select 1")
  .then(() => console.log("[db] connected"))
  .catch((err) => {
    console.error("[db] connection failed:", err);
    process.exit(1);
  });

const app = express();
app.set("trust proxy", (process.env.TRUST_PROXY ?? "1") === "1");

app.use(
  cors({
    origin: WEB_ORIGINS,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Appwrite-JWT", "Accept", "If-None-Match"],
  })
);
app.use(express.json({ limit: "1mb" }));

// tiny request log
app.use((req, res, next) => {
  const t = Date.now();
  res.on("finish", () =>
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - t}ms`)
  );
  next();
});

app.get("/healthz", (_req, res) => res.json({ ok: true }));

// ---- feed (home) ----
app.get("/api/v1/feed", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `select id, title, description, images, flag_tags, diet_tags,
              calories, protein_g, carbs_g, fat_g, fiber_g, time_minutes, updated_at
         from recipes order by updated_at desc nulls last limit 20`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ---- search ----
app.get("/api/v1/recipes", async (req, res, next) => {
  const q = String(req.query.q ?? "").trim();
  const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 50);

  try {
    if (!q) {
      const { rows } = await pool.query(
        `select id, title, description, images, flag_tags, diet_tags,
                calories, protein_g, carbs_g, fat_g, fiber_g, time_minutes, updated_at
           from recipes order by updated_at desc nulls last limit $1`,
        [limit]
      );
      return res.json(rows);
    }

    // Full-Text Search (safe parser for user text)
    const { rows } = await pool.query(
      `select id, title, description, images, flag_tags, diet_tags,
              calories, protein_g, carbs_g, fat_g, fiber_g, time_minutes, updated_at
         from recipes
        where to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,''))
              @@ plainto_tsquery('english', $1)
        order by updated_at desc nulls last
        limit $2`,
      [q, limit]
    );
    return res.json(rows);
  } catch (ftsErr) {
    console.warn("[/api/v1/recipes] FTS failed; falling back to ILIKE:", ftsErr);
    try {
      const { rows } = await pool.query(
        `select id, title, description, images, flag_tags, diet_tags,
                calories, protein_g, carbs_g, fat_g, fiber_g, time_minutes, updated_at
           from recipes
          where lower(title) like '%' || lower($1) || '%'
             or lower(description) like '%' || lower($1) || '%'
          order by updated_at desc nulls last
          limit $2`,
        [q, limit]
      );
      return res.json(rows);
    } catch (err) {
      return next(err);
    }
  }
});

// ---- detail ----
app.get("/api/v1/recipes/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `select r.id, r.title, r.description, r.images, r.flag_tags, r.diet_tags,
              r.calories, r.protein_g, r.carbs_g, r.fat_g, r.fiber_g, r.time_minutes, r.updated_at
         from recipes r
        where r.id = $1
        limit 1`,
      [String(req.params.id)]
    );
    if (!rows.length) return res.status(404).json({ error: "not_found" });
    res.json(rows[0]);
  } catch (err) {
    return next(err);
  }
});

// ---- errors (after routes) ----
app.use((err: any, _req: express.Request, res: express.Response) => {
  console.error("[error]", err);
  const status = Number(err?.status || err?.statusCode || 500);
  res.status(status).json({
    type: "about:blank",
    title: status === 500 ? "Internal Server Error" : "Error",
    status,
    detail: status === 500 ? "An unexpected error occurred" : String(err?.message ?? "Error"),
  });
});

// ---- 404 handler (must be (req, res, next) in this order)
app.use((req: Request, _res: Response, next: NextFunction) => {
  next(
    new AppError(
      404,
      "Not Found",
      `No route for ${req.method} ${req.originalUrl}`,
      req.originalUrl
    )
  );
});

// ---- Error handler (must have *4* params and in this exact order)
app.use((
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const status =
    typeof err?.status === "number" && err.status >= 400 && err.status < 600
      ? err.status
      : 500;

  const title =
    err?.title || (status === 500 ? "Internal Server Error" : "Error");

  const detail =
    err?.detail || err?.message || "An unexpected error occurred";

  // standard problem+json response
  res.status(status).json({
    type: "about:blank",
    title,
    status,
    detail,
    instance: req.originalUrl,
  });
});

app.listen(PORT, HOST, () => {
  console.log(`[express] 🚀 Nutrition Backend running on http://${HOST}:${PORT}`);
  console.log(`[express] Environment: ${NODE_ENV}`);
  console.log(`[express] CORS origins: ${WEB_ORIGINS.join(", ")}`);
});
