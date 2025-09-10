import { Router } from "express";
import { createUserRecipe, deleteUserRecipe, getUserRecipe, listUserRecipes, updateUserRecipe,  } from "../services/recipes.js";

// re-use the tolerant body + id resolver we used on sync routes
function getJsonBody(req: any) {
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body || {};
}

function resolveUserId(req: any): string {
    const b = getJsonBody(req);
    const headerId = (req.get?.("x-appwrite-user-id") ?? req.headers?.["x-appwrite-user-id"] ?? "").toString().trim();
  
    const v =
      req?.user?.$id ?? req?.user?.id ??                 // from verified JWT (preferred)
      headerId ??                                        // <-- accept header fallback
      b?.appwriteUserId ?? b?.userId ??                  // body fallbacks you already had
      b?.user?.$id ?? b?.user?.id ?? null;
  
    return (v == null ? "" : String(v)).trim();
  }

// ── Router
const router = Router();

/** GET /api/v1/user-recipes  (list current user's recipes) */
router.get("/", async (req, res, next) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 50)));
    const offset = Math.max(0, Number(req.query.offset ?? 0));
    const items = await listUserRecipes(userId, limit, offset);
    res.json({ items, limit, offset });
  } catch (err) { next(err); }
});

/** GET /api/v1/user-recipes/:id */
router.get("/:id", async (req, res, next) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const row = await getUserRecipe(userId, req.params.id);
    res.json(row);
  } catch (err) { next(err); }
});

/** POST /api/v1/user-recipes */
router.post("/", async (req, res, next) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const body = getJsonBody(req);
    const p = body?.recipe ?? body; // accept {recipe:{...}} or the object directly

    if (!p?.title || String(p.title).trim().length < 2) {
      return res.status(400).json({ error: "Title is required" });
    }
    if (!p?.ingredients || !Array.isArray(p.ingredients) || p.ingredients.length === 0) {
      return res.status(400).json({ error: "At least one ingredient is required" });
    }
    if (!p?.instructions || !Array.isArray(p.instructions) || p.instructions.length === 0) {
      return res.status(400).json({ error: "At least one instruction step is required" });
    }

    const row = await createUserRecipe(userId, p);
    res.status(201).json(row);
  } catch (err) { next(err); }
});

/** PATCH /api/v1/user-recipes/:id */
router.patch("/:id", async (req, res, next) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const patch = getJsonBody(req)?.recipe ?? getJsonBody(req);
    const row = await updateUserRecipe(userId, req.params.id, patch);
    res.json(row);
  } catch (err) { next(err); }
});

/** DELETE /api/v1/user-recipes/:id */
router.delete("/:id", async (req, res, next) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    await deleteUserRecipe(userId, req.params.id);
    res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
