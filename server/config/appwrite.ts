import { Client, Account, Teams } from "appwrite";
import { env } from "./env.js";

if (!env.APPWRITE_ENDPOINT || !env.APPWRITE_PROJECT_ID) {
  throw new Error("Appwrite configuration is required");
}

export const appwriteClient = new Client()
  .setEndpoint(env.APPWRITE_ENDPOINT)
  .setProject(env.APPWRITE_PROJECT_ID);

export const account = new Account(appwriteClient);
export const teams = new Teams(appwriteClient);

// Admin verification functions
export async function isTeamMember(userId: string, teamId: string): Promise<boolean> {
  try {
    const memberships = await teams.listMemberships(teamId);
    return memberships.memberships.some(m => m.userId === userId);
  } catch (error) {
    console.error("Error checking team membership:", error);
    return false;
  }
}

export async function verifyAdminStatus(userId: string, userProfile?: any): Promise<boolean> {
  // Check if user has admin role in profile
  if (userProfile?.role === 'admin') {
    return true;
  }
  
  // Check if user is member of admin team
  if (env.ADMINS_TEAM_ID) {
    return await isTeamMember(userId, env.ADMINS_TEAM_ID);
  }
  
  return false;
}
