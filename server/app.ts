// server/app.ts
import express from "express";
import cors from "cors";
import { registerRoutes } from "./routes";               // already present in repo
import { notFoundHandler } from "./middleware/errorHandler";

export const app = express();
app.set("trust proxy", (process.env.TRUST_PROXY ?? "1") === "1");

// CORS: allow your frontend + localhost
const WEB_ORIGINS = (process.env.WEB_ORIGINS ??
  "http://127.0.0.1:3000,http://localhost:3000,https://nutri-b2c-frontend.vercel.app")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const corsOptions: cors.CorsOptions = {
  origin(origin, cb) {
    if (!origin || WEB_ORIGINS.includes(origin) || process.env.CORS_ALLOW_ALL === "1") return cb(null, true);
    return cb(new Error("Not allowed by CORS"));
  },
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","X-Appwrite-JWT","x-appwrite-jwt","Accept","If-None-Match"],
  credentials: false,
  maxAge: 86400,
};

app.options("*", cors(corsOptions));
app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));

// Mount all existing routers under /api/v1/* (feed, recipes, user, admin, health)
registerRoutes(app);

// 404 AFTER routes
app.use(notFoundHandler);

export default app;
