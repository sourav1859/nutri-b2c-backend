import express from "express";
import cors from "cors";
import { registerRoutes } from "./routes"; // your existing router

const app = express();

// Trust proxy if you’re behind Vercel/NGINX (safe in dev too)
app.set("trust proxy", 1);

// Configure allowed origins from env (fallback to local dev)
const WEB_ORIGINS = (process.env.WEB_ORIGINS ?? "http://127.0.0.1:3000,http://localhost:3000")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

// IMPORTANT: keep header names lowercase
const corsOptions: cors.CorsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);                 // allow server-to-server / curl
    if (WEB_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error(`Origin ${origin} not allowed by CORS`));
  },
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: [
    "content-type",
    "accept",
    "x-appwrite-jwt",   // <-- your frontend sends this
    "x-appwrite-user-id",
    "authorization",
    "idempotency-key",
    "if-none-match",
  ],
  credentials: true,
  maxAge: 86400,
};

// MUST be before any routes or auth middleware
app.use(cors(corsOptions));
// Ensure OPTIONS preflight succeeds on every path
app.options("*", cors(corsOptions));

// accept any header that *contains* application/json (even if accidental commas)
app.use(express.json({
  type: (req) => {
    const t = req.headers["content-type"];
    if (!t) return false;
    if (Array.isArray(t)) return t.some(v => String(v).includes("application/json"));
    return String(t).split(",").some(v => v.trim().startsWith("application/json"));
  },
}));
app.use(express.urlencoded({ extended: true }));

registerRoutes(app); // must include GET /feed

export default app;
