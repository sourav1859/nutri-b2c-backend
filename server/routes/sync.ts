import { Router } from "express";
import { upsertProfileFromAppwrite, upsertHealthFromAppwrite } from "../services/supabaseSync";

const router = Router();

// Temporary debug: leave for now; remove when stable
const dbg = (label: string, req: any) => {
  try {
    // eslint-disable-next-line no-console
    console.log(`[SYNC] ${label} content-type=${req.headers["content-type"]} typeof body=${typeof req.body}`);
  } catch {}
};

function getJsonBody(req: any) {
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body || {};
}

// extract user id robustly and coerce to non-empty string
function resolveUserId(b: any): string {
  const v =
    b?.appwriteUserId ??
    b?.userId ??
    b?.user?.$id ??
    b?.user?.id ??
    null;
  return (v == null ? "" : String(v)).trim();
}

/** POST /api/v1/sync/profile */
router.post("/profile", async (req, res, next) => {
  try {
    const body = getJsonBody(req);
    const userId = resolveUserId(body);
    const profile = body?.profile ?? null;

    // TEMP debug (keeps noise low but proves values)
    console.log(`[SYNC] /profile userId=${userId ? "present" : "missing"} profile=${profile ? "present" : "missing"}`);

    if (!userId || !profile) {
      return res.status(400).json({ error: "Missing appwriteUserId or profile" });
    }
    await upsertProfileFromAppwrite({ appwriteId: userId, profile, account: body?.account });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/** POST /api/v1/sync/health */
router.post("/health", async (req, res, next) => {
  try {
    const body = getJsonBody(req);
    const userId = resolveUserId(body);
    const health = body?.health ?? null;

    console.log(`[SYNC] /health userId=${userId ? "present" : "missing"} health=${health ? "present" : "missing"}`);

    if (!userId || !health) {
      return res.status(400).json({ error: "Missing appwriteUserId or health" });
    }
    await upsertHealthFromAppwrite({ appwriteId: userId, health });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
