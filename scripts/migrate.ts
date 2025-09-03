// scripts/migrate.ts
import { config } from "dotenv";
import { promises as fs } from "fs";
import path from "path";
import { Client } from "pg";

config({ path: ".env.local" });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL missing. Put it in .env.local");
  process.exit(1);
}

const MIGRATIONS_DIR = path.join(process.cwd(), "migrations");

// run only 001..004 by default (005 needs pg_cron)
const ALLOWED = new Set([
  "001_initial_schema.sql",
  "002_search_functions.sql",
  "003_triggers.sql",
  "004_materialized_views.sql",
  // "005_cron_jobs.sql", // uncomment if your DB supports pg_cron
]);

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    const files = (await fs.readdir(MIGRATIONS_DIR))
      .filter((f) => /^\d{3}_.*\.sql$/.test(f) && ALLOWED.has(f))
      .sort();

    for (const file of files) {
      const full = path.join(MIGRATIONS_DIR, file);
      const sql = await fs.readFile(full, "utf8");
      console.log(`\n=== Applying ${file} ===`);
      await client.query(sql);
      console.log(`✅ Done ${file}`);
    }
    console.log("\nAll selected migrations applied successfully.");
  } catch (err: any) {
    console.error("\n❌ Migration failed:", err?.message || err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
