import express from "express";
import cors from "cors";
import { registerRoutes } from "./routes"; // your existing router

const app = express();

const allowed = (process.env.WEB_ORIGINS ??
  "http://localhost:3000,https://nutri-b2c-frontend.vercel.app")
  .split(",").map(s => s.trim());

const corsOptions: cors.CorsOptions = {
  origin(origin, cb) {
    if (!origin || allowed.includes(origin)) return cb(null, true);
    cb(new Error("Not allowed by CORS"));
  },
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","X-Appwrite-JWT","x-appwrite-jwt"],
  maxAge: 86400,
};

app.options("*", cors(corsOptions));
app.use(cors(corsOptions));
app.use(express.json());

registerRoutes(app); // must include GET /feed

export default app;
