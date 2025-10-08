// npm i node-appwrite p-limit readline
import fs from "node:fs";
import path from "node:path";
import pLimit from "p-limit";
import readline from "node:readline";
import { setTimeout as sleep } from "node:timers/promises";
import {
  Client, ID, Users, Teams, Databases
} from "node-appwrite";

/**
 * ENV (target project):
 *  APPWRITE_ENDPOINT=https://<region>.cloud.appwrite.io/v1
 *  APPWRITE_PROJECT_ID=<TARGET_PROJECT_ID>
 *  APPWRITE_API_KEY=<TARGET_SERVER_API_KEY>
 *  DATABASE_ID=<DB_ID_TO_CREATE_OR_USE>       (same as exported, e.g., nutrition_db)
 *  IN_DIR=./exports/appwrite
 *  SEND_PASSWORD_RESET=true|false             (optional; requires SMTP + allowed redirect URL)
 *  PASSWORD_RESET_URL=https://your-frontend/reset
 *
 * API Key scopes (minimum):
 *  users.write, teams.write, memberships.write,
 *  databases.write, collections.write, attributes.write, indexes.write, documents.write
 *  mail.* (only if SEND_PASSWORD_RESET=true)
 */

const ENDPOINT   = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY    = process.env.APPWRITE_API_KEY;
const DATABASE_ID= process.env.DATABASE_ID ?? "nutrition_db";
const IN_DIR     = process.env.IN_DIR ?? "./exports/appwrite";
const SEND_RECOVERY = String(process.env.SEND_PASSWORD_RESET ?? "false").toLowerCase()==="true";
const RECOVERY_URL  = process.env.PASSWORD_RESET_URL ?? "";
const CONCURRENCY   = Number(process.env.CONCURRENCY ?? 2);

if (!ENDPOINT || !PROJECT_ID || !API_KEY) {
  console.error("Missing required env: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const users  = new Users(client);
const teams  = new Teams(client);
const db     = new Databases(client);

function exists(p){ return fs.existsSync(p); }
function ensureDir(p){ fs.mkdirSync(p,{recursive:true}); }
async function backoff(fn, {retries=6, base=500} = {}){
  for (let i=0;;i++){
    try { return await fn(); }
    catch (e) {
      const code = e?.code || e?.response?.status;
      if ((code===429 || (code>=500&&code<600)) && i<retries) {
        const d = base*Math.pow(2,i)+Math.floor(Math.random()*200);
        console.warn(`Backoff ${code} → ${d}ms`); await sleep(d); continue;
      }
      throw e;
    }
  }
}
async function readNDJSON(file, onItem){
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    await onItem(JSON.parse(line));
  }
}

/* ---------- Database bootstrap ---------- */
async function ensureDatabase(){
  const dbMetaFile = path.join(IN_DIR, "database", "database.json");
  let name = DATABASE_ID;
  if (exists(dbMetaFile)) {
    try {
      const meta = JSON.parse(fs.readFileSync(dbMetaFile,"utf-8"));
      name = meta.name || DATABASE_ID;
    } catch {}
  }
  try {
    // Create DB (ok if already exists)
    await backoff(()=>db.create(DATABASE_ID, name));
    console.log(`Database created: ${DATABASE_ID}`);
  } catch (e) {
    if (e.code === 409) {
      console.log(`Database exists: ${DATABASE_ID}`);
    } else {
      throw e;
    }
  }
}

/* ---------- Collections: create + attributes + indexes + documents ---------- */
async function createCollectionFromSchema(colId, colDir){
  const collFile = path.join(colDir, "collection.json");
  const attrsFile= path.join(colDir, "attributes.json");
  const idxFile  = path.join(colDir, "indexes.json");
  const docsFile = path.join(colDir, "documents.ndjson");

  if (!exists(collFile)) { console.warn(`Missing collection.json for ${colId}`); return; }

  const coll = JSON.parse(fs.readFileSync(collFile,"utf-8"));

  // Create collection
  try {
    await backoff(()=>db.createCollection(
      DATABASE_ID,
      colId,
      coll.name ?? colId,
      coll.$permissions ?? undefined,
      coll.documentSecurity ?? true,
      coll.enabled ?? true
    ));
    console.log(`Collection created: ${colId}`);
  } catch (e) {
    if (e.code !== 409) throw e;
    console.log(`Collection exists: ${colId}`);
  }

  // Attributes
  let attributes = [];
  if (exists(attrsFile)) {
    const raw = JSON.parse(fs.readFileSync(attrsFile,"utf-8"));
    attributes = raw.attributes ?? raw;
  }
  for (const a of attributes) {
    try {
      const common = { required: !!a.required, array: !!a.array };
      switch (a.type) {
        case "string":
          await backoff(()=>db.createStringAttribute(DATABASE_ID, colId, a.key, a.size ?? 255, common.required, a.default ?? undefined, common.array, a.encrypt ?? false));
          break;
        case "integer":
          await backoff(()=>db.createIntegerAttribute(DATABASE_ID, colId, a.key, common.required, a.min ?? undefined, a.max ?? undefined, a.default ?? undefined, common.array));
          break;
        case "double": // aka float
        case "float":
          await backoff(()=>db.createFloatAttribute(DATABASE_ID, colId, a.key, common.required, a.min ?? undefined, a.max ?? undefined, a.default ?? undefined, common.array));
          break;
        case "boolean":
          await backoff(()=>db.createBooleanAttribute(DATABASE_ID, colId, a.key, common.required, a.default ?? undefined, common.array));
          break;
        case "datetime":
          await backoff(()=>db.createDatetimeAttribute(DATABASE_ID, colId, a.key, common.required, a.default ?? undefined, common.array));
          break;
        case "email":
          await backoff(()=>db.createEmailAttribute(DATABASE_ID, colId, a.key, common.required, a.default ?? undefined, common.array));
          break;
        case "enum":
          await backoff(()=>db.createEnumAttribute(DATABASE_ID, colId, a.key, a.elements ?? [], common.required, a.default ?? undefined, common.array));
          break;
        default:
          console.warn(`Skip unsupported attribute type "${a.type}" for ${colId}.${a.key}`);
      }
    } catch (e) {
      if (e.code !== 409) console.warn(`Attribute failed ${colId}.${a.key}: ${e.message}`);
    }
  }

  // Indexes
  if (exists(idxFile)) {
    try {
      const raw = JSON.parse(fs.readFileSync(idxFile,"utf-8"));
      const indexes = raw.indexes ?? raw;
      for (const ix of indexes) {
        try {
          // createIndex(databaseId, collectionId, key, type, attributes, orders?)
          await backoff(()=>db.createIndex(
            DATABASE_ID,
            colId,
            ix.key ?? ix.$id ?? `${colId}_${(ix.attributes||[]).join("_")}`,
            ix.type ?? "key",
            ix.attributes ?? [],
            ix.orders ?? undefined
          ));
        } catch (e) {
          if (e.code !== 409) console.warn(`Index failed ${colId}/${ix.key || ix.$id}: ${e.message}`);
        }
      }
    } catch (e) {
      console.warn(`indexes.json parse failed for ${colId}: ${e.message}`);
    }
  }

  // Documents
  if (exists(docsFile)) {
    let count=0;
    await readNDJSON(docsFile, async (doc)=>{
      const id = doc.$id || ID.unique();
      const perms = doc.$permissions ?? undefined;
      const { $id, $databaseId, $collectionId, $createdAt, $updatedAt, $permissions, ...payload } = doc;
      try {
        await backoff(()=>db.createDocument(DATABASE_ID, colId, id, payload, perms));
        count++;
      } catch (e) {
        if (e.code === 409) {
          try {
            await backoff(()=>db.updateDocument(DATABASE_ID, colId, id, payload, perms));
            count++;
          } catch (e2) {
            console.warn(`Update failed ${colId}/${id}: ${e2.message}`);
          }
        } else {
          console.warn(`Create failed ${colId}/${id}: ${e.message}`);
        }
      }
    });
    console.log(`Collection ${colId}: imported ${count} docs`);
  }
}

async function importCollections(){
  const base = path.join(IN_DIR, "database", "collections");
  if (!exists(base)) { console.log("No collections directory. Skipping DB import."); return; }
  const dirs = fs.readdirSync(base, { withFileTypes:true }).filter(d=>d.isDirectory()).map(d=>d.name);
  const limit = pLimit(CONCURRENCY);
  await Promise.all(dirs.map(colId => limit(()=>createCollectionFromSchema(colId, path.join(base, colId)))));
}

/* ---------- Users ---------- */
async function importUsers(){
  const file = path.join(IN_DIR, "auth", "users.ndjson");
  if (!exists(file)) { console.log("No users.ndjson. Skipping users."); return; }
  let count=0;
  await readNDJSON(file, async (u)=>{
    const userId = u.$id || ID.unique();
    const email  = u.email || null;
    const phone  = u.phone || undefined;
    const name   = u.name  || undefined;
    const tempPassword = Math.random().toString(36).slice(2) + "Aa1!" + Math.random().toString(36).slice(2);

    try {
      await backoff(()=>users.create(userId, email, phone, tempPassword, name));
      if (Array.isArray(u.labels) && u.labels.length) {
        await backoff(()=>users.updateLabels(userId, u.labels));
      }
      if (u.prefs) {
        await backoff(()=>users.updatePrefs(userId, u.prefs));
      }
      if (SEND_RECOVERY && email && RECOVERY_URL) {
        try { await backoff(()=>users.createRecovery(userId, RECOVERY_URL)); }
        catch(e){ console.warn(`createRecovery failed for ${email}: ${e.message}`); }
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

/* ---------- Teams & Memberships ---------- */
async function importTeams(){
  const teamsFile = path.join(IN_DIR, "auth", "teams.ndjson");
  if (!exists(teamsFile)) { console.log("No teams.ndjson. Skipping teams."); return; }

  // Create teams first
  const teamsDir = path.join(IN_DIR, "auth", "memberships");
  await readNDJSON(teamsFile, async (t)=>{
    const id = t.$id || ID.unique();
    try {
      await backoff(()=>teams.create(id, t.name ?? id));
      if (t.prefs) {
        await backoff(()=>teams.updatePrefs(id, t.prefs));
      }
    } catch (e) {
      if (e.code !== 409) console.warn(`Team create failed (${id}): ${e.message}`);
    }

    // Then memberships for that team
    const mFile = path.join(teamsDir, `${id}.ndjson`);
    if (!exists(mFile)) return;

    await readNDJSON(mFile, async (m)=>{
      const roles  = Array.isArray(m.roles) ? m.roles : [];
      const userId = m.userId;
      // Attempt direct add (server-side); fallback to email invite if API requires it.
      try {
        await backoff(()=>teams.createMembership(id, roles, userId, RECOVERY_URL));
      } catch (e) {
        if (e.code === 400 && m.userEmail) {
          try {
            await backoff(()=>teams.createMembership(id, roles, undefined, RECOVERY_URL, m.userEmail, t.name ?? "team"));
          } catch (e2) {
            console.warn(`Membership invite failed team=${id} user=${userId||m.userEmail}: ${e2.message}`);
          }
        } else if (e.code !== 409) {
          console.warn(`Membership attach failed team=${id} user=${userId}: ${e.message}`);
        }
      }
    });
  });

  console.log("Teams & memberships import complete.");
}

/* ---------- main ---------- */
(async ()=>{
  try {
    // 1) DB (create if fresh)
    await ensureDatabase();

    // 2) Collections & data
    await importCollections();

    // 3) Users
    await importUsers();

    // 4) Teams + memberships (relies on user IDs in place)
    await importTeams();

    console.log("✅ Import complete.");
  } catch (e) {
    console.error("❌ Import aborted:", e.message);
    process.exit(1);
  }
})();
