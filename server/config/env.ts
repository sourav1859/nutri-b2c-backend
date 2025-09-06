import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().transform(Number).default("5000"),
  
  // Database
  DATABASE_URL: z.string().url(),
  
  // Appwrite
  APPWRITE_ENDPOINT: z.string().url(),
  APPWRITE_PROJECT_ID: z.string(),
  ADMINS_TEAM_ID: z.string().optional(),

  // Supabase (server-side)
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string(),
  
  // Rate limiting
  RATE_LIMITS_READ_RPM: z.string().transform(Number).default("60"),
  RATE_LIMITS_WRITE_RPM: z.string().transform(Number).default("6"),
});

function validateEnv() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    console.error("❌ Invalid environment variables:", error);
    process.exit(1);
  }
}

export const env = validateEnv();
