// npm i node-appwrite p-limit
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import pLimit from "p-limit";
import {
  Client,
  Users,
  Teams,
  Databases,
  Query,
} from "node-appwrite";

/**
 * ENV required:
 *  APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
 *  APPWRITE_PROJECT_ID=<project_id>
 *  APPWRITE_API_KEY=<server_api_key with read scopes>
 *
 * Optional:
 *  DATABASE_ID=nutrition_db
 *  COLLECTION_IDS=profiles,health_profiles      (comma-separated; empty => all)
 *  TEAM_IDS=admins,retailers                    (comma-separated; empty => all)
 *  OUT_DIR=./exports/appwrite
 */

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;

const DATABASE_ID = process.env.DATABASE_ID ?? "nutrition_db";
const COLLECTION_IDS = (process.env.COLLECTION_IDS ?? "")
  .split(",").map(s => s.trim()).filter(Boolean);
const TEAM_IDS = (process.env.TEAM_IDS ?? "")
  .split(",").map(s => s.trim()).filter(Boolean);

const OUT_DIR = process.env.OUT_DIR ?? "./exports/appwrite";
const CONCURRENCY = 2; // keep modest to avoid 429s

if (!ENDPOINT || !PROJECT_ID || !API_KEY) {
  console.error("Missing required env: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY");
  process.exit(1);
}

const client = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const users = new Users(client);
const teams = new Teams(client);
const db = new Databases(client);

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function appendNDJSON(filePath, obj) {
  fs.appendFileSync(filePath, JSON.stringify(obj) + "\n");
}

async function withBackoff(fn, opts = { retries: 6, baseMs: 500 }) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const code = err?.code || err?.response?.status;
      if ((code === 429 || (code >= 500 && code < 600)) && attempt < opts.retries) {
        const delay = opts.baseMs * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
        console.warn(`Rate limited/server error (${code}). Backing off ${delay}ms…`);
        await sleep(delay);
        attempt++;
        continue;
      }
      console.error("Export failed:", err?.message || err);
      throw err;
    }
  }
}

/* ---------------------- USERS ---------------------- */
async function exportUsers() {
  console.log("Exporting users…");
  const outFile = path.join(OUT_DIR, "users.ndjson");
  ensureDir(path.dirname(outFile));
  if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

  let cursor;
  const limit = 100;
  let count = 0;

  while (true) {
    const queries = [Query.limit(limit)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const page = await withBackoff(() => users.list(queries));

    for (const u of page.users) {
      const clean = {
        $id: u.$id,
        email: u.email,
        emailVerification: u.emailVerification,
        name: u.name,
        phone: u.phone,
        labels: u.labels,
        status: u.status,
        prefs: u.prefs ?? {},
        registration: u.registration,
        accessedAt: u.accessedAt,
      };
      appendNDJSON(outFile, clean);
      count++;
    }
    if (!page.users.length) break;
    cursor = page.users.at(-1).$id;
  }
  console.log(`Users exported: ${count} -> ${outFile}`);
}

/* ---------------------- TEAMS & MEMBERSHIPS ---------------------- */
async function exportTeams() {
  console.log("Exporting teams…");
  const baseDir = path.join(OUT_DIR, "teams");
  ensureDir(baseDir);

  const teamsFile = path.join(baseDir, "teams.ndjson");
  if (fs.existsSync(teamsFile)) fs.unlinkSync(teamsFile);

  // Determine which teams to export
  let targetTeams = [];
  if (TEAM_IDS.length) {
    // fetch each explicitly to verify existence
    for (const id of TEAM_IDS) {
      const t = await withBackoff(() => teams.get(id));
      targetTeams.push(t);
    }
  } else {
    // list all teams
    let cursor;
    const limit = 100;
    while (true) {
      const queries = [Query.limit(limit)];
      if (cursor) queries.push(Query.cursorAfter(cursor));
      const page = await withBackoff(() => teams.list(queries));
      targetTeams.push(...page.teams);
      if (!page.teams.length) break;
      cursor = page.teams.at(-1).$id;
    }
  }

  // Save team records and per-team memberships
  for (const t of targetTeams) {
    const teamMeta = {
      $id: t.$id,
      name: t.name,
      total: t.total ?? undefined,
      prefs: t.prefs ?? {},
      $createdAt: t.$createdAt,
      $updatedAt: t.$updatedAt,
    };
    appendNDJSON(teamsFile, teamMeta);

    // memberships
    const teamDir = path.join(baseDir, t.$id);
    ensureDir(teamDir);
    const mFile = path.join(teamDir, "memberships.ndjson");
    if (fs.existsSync(mFile)) fs.unlinkSync(mFile);

    let cursor;
    const limit = 100;
    let count = 0;

    while (true) {
      const queries = [Query.limit(limit)];
      if (cursor) queries.push(Query.cursorAfter(cursor));
      const page = await withBackoff(() => teams.listMemberships(t.$id, queries));

      for (const m of page.memberships ?? page.membership ?? []) {
        // Normalize fields across Appwrite versions
        const record = {
          $id: m.$id,
          teamId: t.$id,
          userId: m.userId,
          // roles can be null/[]; ensure array
          roles: Array.isArray(m.roles) ? m.roles : (m.roles ? [m.roles] : []),
          joined: m.joined,              // timestamp
          invited: m.invited,            // timestamp
          confirm: m.confirm,            // boolean
          userName: m.userName,
          userEmail: m.userEmail,
          // NOTE: secrets/invitation tokens are never exposed (by design)
          $createdAt: m.$createdAt,
          $updatedAt: m.$updatedAt,
        };
        appendNDJSON(mFile, record);
        count++;
      }

      // Some SDKs return .memberships; ensure termination condition:
      const last = (page.memberships ?? []).at?.(-1);
      if (!(page.memberships ?? []).length) break;
      cursor = last?.$id;
    }
    console.log(`Team ${t.name} (${t.$id}): memberships exported -> ${mFile}`);
  }

  console.log(`Teams exported: ${targetTeams.length} -> ${teamsFile}`);
}

/* ---------------------- DATABASE COLLECTIONS ---------------------- */
async function exportCollections() {
  let targets = COLLECTION_IDS;
  if (!targets.length) {
    console.log(`No COLLECTION_IDS provided; listing all collections in DB "${DATABASE_ID}"…`);
    const all = await withBackoff(() => db.listCollections(DATABASE_ID));
    targets = all.collections.map(c => c.$id);
  }

  const limit = pLimit(CONCURRENCY);
  await Promise.all(
    targets.map(colId =>
      limit(async () => {
        const colDir = path.join(OUT_DIR, "db", colId);
        ensureDir(colDir);

        // Schema
        const collection = await withBackoff(() => db.getCollection(DATABASE_ID, colId));
        const attributes = await withBackoff(() => db.listAttributes(DATABASE_ID, colId));
        fs.writeFileSync(
          path.join(colDir, "schema.json"),
          JSON.stringify({ collection, attributes }, null, 2)
        );

        // Data
        const dataFile = path.join(colDir, "data.ndjson");
        if (fs.existsSync(dataFile)) fs.unlinkSync(dataFile);

        let cursor;
        const pageSize = 100;
        let count = 0;

        while (true) {
          const queries = [Query.limit(pageSize)];
          if (cursor) queries.push(Query.cursorAfter(cursor));
          const page = await withBackoff(() => db.listDocuments(DATABASE_ID, colId, queries));

          for (const doc of page.documents) {
            appendNDJSON(dataFile, doc); // keep $id/$permissions for potential restore
            count++;
          }
          if (!page.documents.length) break;
          cursor = page.documents.at(-1).$id;
        }
        console.log(`Collection ${colId}: ${count} docs -> ${dataFile}`);
      })
    )
  );
}

/* ---------------------- MAIN ---------------------- */
(async () => {
  try {
    ensureDir(OUT_DIR);
    await exportUsers();
    await exportTeams();
    await exportCollections();
    console.log("✅ Export complete.");
  } catch (e) {
    console.error("❌ Export aborted.");
    process.exit(1);
  }
})();
