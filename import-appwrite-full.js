// npm i node-appwrite p-limit readline
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import pLimit from "p-limit";
import { setTimeout as sleep } from "node:timers/promises";
import {
  Client, ID, Query,
  Users, Teams, Databases
} from "node-appwrite";

/** ENV **/
const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;

const DATABASE_ID = process.env.DATABASE_ID ?? "nutrition_db";
const IN_DIR = process.env.IN_DIR ?? "./exports/appwrite";
const SEND_PASSWORD_RESET = String(process.env.SEND_PASSWORD_RESET ?? "false").toLowerCase() === "true";
const PASSWORD_RESET_URL = process.env.PASSWORD_RESET_URL ?? "";

if (!ENDPOINT || !PROJECT_ID || !API_KEY) {
  console.error("Missing env: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY");
  process.exit(1);
}

const client = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const users = new Users(client);
const teams = new Teams(client);
const db = new Databases(client);

const limit = pLimit(2); // modest concurrency

/* ----------------- helpers ----------------- */
function exists(p) { return fs.existsSync(p); }
function ensureDir(p){ fs.mkdirSync(p,{recursive:true}); }
async function backoff(fn, {retries=6, base=500} = {}) {
  for (let i=0;;i++){
    try { return await fn(); }
    catch (e){
      const code = e?.code || e?.response?.status;
      if ((code===429 || (code>=500 && code<600)) && i<retries) {
        const d = base*Math.pow(2,i)+Math.floor(Math.random()*200);
        console.warn(`Backoff for ${code} ${d}ms`); await sleep(d); continue;
      }
      throw e;
    }
  }
}

async function readNDJSON(file, onItem) {
  const rl = readline.createInterface({
    input: fs.createReadStream(file),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const obj = JSON.parse(line);
    await onItem(obj);
  }
}

/* -------- users -------- */
async function importUsers() {
  const file = path.join(IN_DIR, "users.ndjson");
  if (!exists(file)) { console.log("No users.ndjson – skipping users."); return; }

  console.log("Importing users…");
  let count = 0;

  await readNDJSON(file, async (u) => {
    const userId = u.$id || ID.unique();
    const email = u.email || null;
    const phone = u.phone || undefined;
    const name  = u.name || undefined;

    // Create with a random temp password; optionally send recovery email
    const tempPassword = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + "Aa1!";

    // Try to create; if already exists, skip
    try {
      await backoff(() => users.create(userId, email, phone, tempPassword, name));
      // labels & prefs after create
      if (Array.isArray(u.labels) && u.labels.length) {
        await backoff(() => users.updateLabels(userId, u.labels));
      }
      if (u.prefs) {
        await backoff(() => users.updatePrefs(userId, u.prefs));
      }

      if (SEND_PASSWORD_RESET && email && PASSWORD_RESET_URL) {
        // Triggers a recovery email to set a new password
        try {
          await backoff(() => users.createRecovery(userId, PASSWORD_RESET_URL));
        } catch (e) {
          console.warn(`createRecovery failed for ${email}: ${e.message}`);
        }
      }
      count++;
    } catch (e) {
      if (e.code === 409) {
        console.log(`User exists ${userId} – skipping`);
      } else {
        console.warn(`User create failed (${userId}): ${e.message}`);
      }
    }
  });

  console.log(`Users imported: ${count}`);
}

/* -------- teams & memberships -------- */
async function importTeams() {
  const base = path.join(IN_DIR, "teams");
  if (!exists(base)) { console.log("No teams export – skipping teams."); return; }

  const teamIndex = path.join(base, "teams.ndjson");
  if (!exists(teamIndex)) { console.log("teams.ndjson missing – skipping teams."); return; }

  console.log("Importing teams…");
  await readNDJSON(teamIndex, async (t) => {
    const id = t.$id || ID.unique();
    try {
      await backoff(() => teams.create(id, t.name ?? id));
    } catch (e) {
      if (e.code !== 409) { console.warn(`Team create failed (${id}): ${e.message}`); }
    }

    const mFile = path.join(base, id, "memberships.ndjson");
    if (!exists(mFile)) return;

    // Try direct attachments first (no email invite). If API disallows, fall back to invite (requires email).
    await readNDJSON(mFile, async (m) => {
      // roles
      const roles = Array.isArray(m.roles) ? m.roles : [];
      const userId = m.userId;

      // Some Appwrite versions support direct add via teams.createMembership with userId + roles + redirect URL.
      // We'll attempt direct; if it fails with 400, try invite using userEmail.
      try {
        await backoff(() => teams.createMembership(id, roles, userId, PASSWORD_RESET_URL));
      } catch (e) {
        if (e.code === 400 && m.userEmail) {
          // Invitation flow (sends email). Without email there is no fallback.
          try {
            await backoff(() => teams.createMembership(id, roles, undefined, PASSWORD_RESET_URL, m.userEmail, t.name ?? "team"));
          } catch (e2) {
            console.warn(`Membership invite failed team=${id} user=${userId||m.userEmail}: ${e2.message}`);
          }
        } else if (e.code !== 409) {
          console.warn(`Membership attach failed team=${id} user=${userId}: ${e.message}`);
        }
      }
    });
  });

  console.log("Teams & memberships import done.");
}

/* -------- collections & documents -------- */
async function ensureCollection(schema) {
  const c = schema.collection;
  const colId = c.$id;
  try {
    await backoff(() => db.createCollection(DATABASE_ID, colId, c.name ?? colId, c.$permissions ?? undefined, c.documentSecurity ?? true, c.enabled ?? true));
  } catch (e) {
    if (e.code !== 409) throw e; // already exists is fine
  }

  // attributes
  const attrs = schema.attributes?.attributes ?? schema.attributes ?? [];
  for (const a of attrs) {
    try {
      const common = { required: !!a.required, default: a.default ?? undefined, array: !!a.array };
      switch (a.type) {
        case "string":
          await backoff(() => db.createStringAttribute(DATABASE_ID, colId, a.key, a.size ?? 255, common.required, a.default ?? undefined, common.array, a.encrypt ?? false));
          break;
        case "integer":
          await backoff(() => db.createIntegerAttribute(DATABASE_ID, colId, a.key, common.required, a.min ?? undefined, a.max ?? undefined, a.default ?? undefined, common.array));
          break;
        case "double":
          await backoff(() => db.createFloatAttribute(DATABASE_ID, colId, a.key, common.required, a.min ?? undefined, a.max ?? undefined, a.default ?? undefined, common.array));
          break;
        case "boolean":
          await backoff(() => db.createBooleanAttribute(DATABASE_ID, colId, a.key, common.required, a.default ?? undefined, common.array));
          break;
        case "datetime":
          await backoff(() => db.createDatetimeAttribute(DATABASE_ID, colId, a.key, common.required, a.default ?? undefined, common.array));
          break;
        case "email":
          await backoff(() => db.createEmailAttribute(DATABASE_ID, colId, a.key, common.required, a.default ?? undefined, common.array));
          break;
        case "enum":
          await backoff(() => db.createEnumAttribute(DATABASE_ID, colId, a.key, a.elements ?? [], common.required, a.default ?? undefined, common.array));
          break;
        default:
          console.warn(`Skip unsupported attribute type "${a.type}" on ${colId}.${a.key}`);
      }
    } catch (e) {
      if (e.code !== 409) console.warn(`Attribute create failed ${colId}.${a.key}: ${e.message}`);
    }
  }
}

async function importOneCollection(colId, colDir) {
  // 1) Schema
  const schemaFile = path.join(colDir, "schema.json");
  if (!exists(schemaFile)) { console.warn(`No schema.json for ${colId}, skipping`); return; }
  const schema = JSON.parse(fs.readFileSync(schemaFile, "utf-8"));
  await ensureCollection(schema);

  // 2) Data
  const dataFile = path.join(colDir, "data.ndjson");
  if (!exists(dataFile)) { console.log(`No data.ndjson for ${colId}, skipping documents.`); return; }

  let docCount = 0;
  await readNDJSON(dataFile, async (doc) => {
    const id = doc.$id || ID.unique();
    // Keep permissions if any
    const permissions = doc.$permissions ?? undefined;

    // Remove read-only system fields before create
    const { $id, $collectionId, $databaseId, $createdAt, $updatedAt, $permissions, ...payload } = doc;

    try {
      await backoff(() => db.createDocument(DATABASE_ID, colId, id, payload, permissions));
      docCount++;
    } catch (e) {
      if (e.code === 409) {
        // Exists – try update to reflect latest contents/permissions
        try {
          await backoff(() => db.updateDocument(DATABASE_ID, colId, id, payload, permissions));
          docCount++;
        } catch (e2) {
          console.warn(`Update failed ${colId}/${id}: ${e2.message}`);
        }
      } else {
        console.warn(`Create failed ${colId}/${id}: ${e.message}`);
      }
    }
  });

  console.log(`Collection ${colId}: imported ${docCount} docs`);
}

async function importCollections() {
  const base = path.join(IN_DIR, "db");
  if (!exists(base)) { console.log("No db/* export – skipping collections."); return; }

  const dirs = fs.readdirSync(base, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
  for (const colId of dirs) {
    const colDir = path.join(base, colId);
    await importOneCollection(colId, colDir);
  }
}

/* -------- main -------- */
(async () => {
  try {
    await importUsers();
    await importTeams();
    await importCollections();
    console.log("✅ Import complete.");
  } catch (e) {
    console.error("❌ Import aborted:", e.message);
    process.exit(1);
  }
})();
