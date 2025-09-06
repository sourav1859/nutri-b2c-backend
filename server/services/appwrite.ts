// server/services/appwrite.ts
import { Client, Users, Databases, Query } from "node-appwrite";

const {
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT_ID,
  APPWRITE_API_KEY,
  APPWRITE_DB_ID,
  APPWRITE_PROFILES_COLLECTION_ID,
  APPWRITE_HEALTH_COLLECTION_ID,
} = process.env;

function admin() {
  const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT!)
    .setProject(APPWRITE_PROJECT_ID!)
    .setKey(APPWRITE_API_KEY!);
  return {
    users: new Users(client),
    db: new Databases(client),
  };
}

/** Delete Appwrite DB documents keyed by the user's id (or fallback: query by $id). */
export async function deleteAppwriteDocuments(userId: string) {
  const { db } = admin();

  // Most projects use $id === userId for both docs; try direct delete first, then fallback to query.
  const tryDirectDelete = async (collectionId: string) => {
    try {
      await db.deleteDocument(APPWRITE_DB_ID!, collectionId, userId);
    } catch {
      // If ids don’t match, delete by query (best effort).
      const list = await db.listDocuments(APPWRITE_DB_ID!, collectionId, [Query.equal("$id", userId)]);
      await Promise.all(list.documents.map((d: any) => db.deleteDocument(APPWRITE_DB_ID!, collectionId, d.$id)));
    }
  };

  await Promise.all([
    tryDirectDelete(APPWRITE_PROFILES_COLLECTION_ID!),
    tryDirectDelete(APPWRITE_HEALTH_COLLECTION_ID!),
  ]);
}

/** Delete Appwrite auth user (admin) */
export async function deleteAppwriteUser(userId: string) {
  const { users } = admin();
  try {
    await users.delete(userId);
  } catch {
    // Ignore if already gone
  }
}
