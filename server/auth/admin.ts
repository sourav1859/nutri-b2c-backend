import type { Request } from "express";
import { UserContext } from "./jwt";
import { auditImpersonation } from "../services/admin";

export interface AdminContext extends UserContext {
  effectiveUserId: string;
  isImpersonating: boolean;
}

export async function handleAdminImpersonation(
  request: Request,
  userContext: UserContext
): Promise<AdminContext> {
  const actAsUser = request.headers['x-act-as-user'] as string;
  
  // Only allow impersonation for GET requests and admin users
  if (actAsUser && request.method === 'GET' && userContext.isAdmin) {
    // Audit the impersonation
    await auditImpersonation(
      userContext.userId,
      actAsUser,
      request.url,
      request.ip,
      request.headers['user-agent']
    );
    
    return {
      ...userContext,
      effectiveUserId: actAsUser,
      isImpersonating: true,
    };
  }
  
  return {
    ...userContext,
    effectiveUserId: userContext.userId,
    isImpersonating: false,
  };
}

export function requireAdmin(userContext: UserContext): void {
  if (!userContext.isAdmin) {
    throw new Error("Admin access required");
  }
}
