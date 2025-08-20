import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@shared/schema";
import { env } from "./env";

if (!env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Connection for queries
export const queryClient = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

// Drizzle instance
export const db = drizzle(queryClient, { schema });

// Connection for migrations
export const migrationClient = postgres(env.DATABASE_URL, {
  max: 1,
});

// Set application name for easier debugging
queryClient`SET application_name = 'nutrition-app-api'`;

// Function to set current user for RLS
export async function setCurrentUser(userId: string) {
  // Use a simple approach for RLS - many systems don't need complex user context
  try {
    await executeRaw(`SET LOCAL app.current_user_id = '${userId}'`);
  } catch (error) {
    // If RLS isn't set up or fails, continue silently for development
    console.log(`[DB] RLS user context not available: ${error}`);
  }
}

// Function to execute raw SQL (for functions/procedures)
export async function executeRaw(sql: string, params: any[] = []) {
  return queryClient.unsafe(sql, params);
}

// Health check function
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await queryClient`SELECT 1`;
    return true;
  } catch (error) {
    console.error("Database health check failed:", error);
    return false;
  }
}

export default db;
