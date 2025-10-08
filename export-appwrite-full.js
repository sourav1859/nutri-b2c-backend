// npm i node-appwrite p-limit
import fs from "node:fs";
import path from "node:path";
import pLimit from "p-limit";
import { setTimeout as sleep } from "node:timers/promises";
import {
  Client, Users, Teams, Databases, Query
} from "node-appwrite";

/**
 * ENV (source project):
 *  APPWRITE_ENDPOINT=https://<region>.cloud.appwrite.io/v1
 *  APPWRITE_PROJECT_ID=<SOURCE_PROJECT_ID>
 *  APPWRITE_API_KEY=<SOURCE_SERVER_API_KEY>  (scopes: users.read, teams.read, databases.read, documents.read, collections.read, attributes.read, indexes.read, memberships.read)
 *  DATABASE_ID=<DB_ID_TO_EXPORT>             (e.g., nutrition_db)
 *  OUT_DIR=./exports/appwrite
 */

const ENDPOINT   = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY    = process.env.APPWRITE_API_KEY;
const DATABASE_ID= process.env.DATABASE_ID ?? "nutrition_db";
const OUT_DIR    = process.env.OUT_DIR ?? "./exports/appwrite";
const CONCURRENCY= Number(process.env.CONCURRENCY ?? 2);

if (!ENDPOINT || !PROJECT_ID || !API_KEY) {
  console.error("Missing required env: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const users  = new Users(client);
const teams  = new Teams(client);
const db     = new Databases(client);

function ensureDir(p){ fs.mkdirSync(p,{recursive:true}); }
function writeJson(p, obj){ ensureDir(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(obj, null, 2)); }
function appendNDJSON(p, obj){ ensureDir(path.dirname(p)); fs.appendFileSync(p, JSON.stringify(obj) + "\n"); }

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

/* ---------- Auth: Users ---------- */
async function exportUsers(){
  console.log("Exporting users…");
  const file = path.join(OUT_DIR, "auth", "users.ndjson");
  if (fs.existsSync(file)) fs.unlinkSync(file);

  let cursor;
  const limit=100;
  let count=0;
  while (true) {
    const queries=[Query.limit(limit)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const page = await backoff(()=>users.list(queries));
    for (const u of page.users) {
      appendNDJSON(file, {
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
      });
      count++;
    }
    if (!page.users.length) break;
    cursor = page.users.at(-1).$id;
  }
  console.log(`Users: ${count}`);
}

/* ---------- Auth: Teams & Memberships ---------- */
async function exportTeams(){
  console.log("Exporting teams & memberships…");
  const teamsFile = path.join(OUT_DIR, "auth", "teams.ndjson");
  if (fs.existsSync(teamsFile)) fs.unlinkSync(teamsFile);

  let cursor;
  const limit=100;
  const teamList = [];
  while (true) {
    const queries=[Query.limit(limit)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const page = await backoff(()=>teams.list(queries));
    teamList.push(...page.teams);
    if (!page.teams.length) break;
    cursor = page.teams.at(-1).$id;
  }

  for (const t of teamList) {
    appendNDJSON(teamsFile, {
      $id: t.$id, name: t.name, prefs: t.prefs ?? {}, $createdAt: t.$createdAt, $updatedAt: t.$updatedAt
    });

    const mFile = path.join(OUT_DIR, "auth", "memberships", `${t.$id}.ndjson`);
    if (fs.existsSync(mFile)) fs.unlinkSync(mFile);

    let mCursor; let count=0;
    while (true) {
      const q=[Query.limit(100)];
      if (mCursor) q.push(Query.cursorAfter(mCursor));
      const page = await backoff(()=>teams.listMemberships(t.$id, q));
      const list = page.memberships ?? [];
      for (const m of list) {
        appendNDJSON(mFile, {
          $id: m.$id, teamId: t.$id, userId: m.userId,
          roles: Array.isArray(m.roles) ? m.roles : (m.roles ? [m.roles] : []),
          joined: m.joined, invited: m.invited, confirm: m.confirm,
          userName: m.userName, userEmail: m.userEmail,
          $createdAt: m.$createdAt, $updatedAt: m.$updatedAt,
        });
        count++;
      }
      if (!list.length) break;
      mCursor = list.at(-1).$id;
    }
    console.log(`Team ${t.name} (${t.$id}): memberships ${count}`);
  }
}

/* ---------- Database: Schema + Data ---------- */
async function exportDatabase(){
  console.log(`Exporting database "${DATABASE_ID}"…`);
  const base = path.join(OUT_DIR, "database");
  ensureDir(base);

  // Fetch DB to get its name (if API doesn’t provide, we still record id)
  // Appwrite may not expose getDatabase; we’ll at least record the id.
  writeJson(path.join(base, "database.json"), { $id: DATABASE_ID, name: DATABASE_ID });

  const cols = await backoff(()=>db.listCollections(DATABASE_ID));
  const limit = pLimit(CONCURRENCY);

  // Write manifest early
  writeJson(path.join(OUT_DIR, "manifest.json"), {
    source: { projectId: PROJECT_ID, databaseId: DATABASE_ID, endpoint: ENDPOINT },
    exportedAt: new Date().toISOString(),
    collections: cols.collections.map(c => c.$id)
  });

  await Promise.all(cols.collections.map(c => limit(async ()=>{
    const colDir = path.join(base, "collections", c.$id);
    ensureDir(colDir);

    const coll = await backoff(()=>db.getCollection(DATABASE_ID, c.$id));
    writeJson(path.join(colDir, "collection.json"), coll);

    const attrs = await backoff(()=>db.listAttributes(DATABASE_ID, c.$id));
    writeJson(path.join(colDir, "attributes.json"), attrs.attributes ?? attrs);

    // Indexes API is available on newer Appwrite versions; wrap safely
    try {
      const idx = await backoff(()=>db.listIndexes(DATABASE_ID, c.$id));
      writeJson(path.join(colDir, "indexes.json"), idx.indexes ?? idx);
    } catch {
      writeJson(path.join(colDir, "indexes.json"), []); // fallback
    }

    const docsFile = path.join(colDir, "documents.ndjson");
    if (fs.existsSync(docsFile)) fs.unlinkSync(docsFile);

    let cursor; let count=0;
    while (true) {
      const q=[Query.limit(100)];
      if (cursor) q.push(Query.cursorAfter(cursor));
      const page = await backoff(()=>db.listDocuments(DATABASE_ID, c.$id, q));
      for (const d of page.documents) {
        appendNDJSON(docsFile, d); // keep $id + $permissions
        count++;
      }
      if (!page.documents.length) break;
      cursor = page.documents.at(-1).$id;
    }
    console.log(`Collection ${c.$id}: ${count} docs`);
  })));
}

/* ---------- main ---------- */
(async ()=>{
  try {
    // Clean output dir to avoid stale files
    fs.rmSync(OUT_DIR, { recursive:true, force:true });
    ensureDir(OUT_DIR);

    await exportUsers();
    await exportTeams();
    await exportDatabase();

    console.log("✅ Export complete.");
  } catch (e) {
    console.error("❌ Export failed:", e.message);
    process.exit(1);
  }
})();
