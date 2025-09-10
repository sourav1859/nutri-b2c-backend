import type { Request, Response, NextFunction } from "express";
import { auditLog } from "@shared/schema";
import { db } from "../config/database.js";

export async function auditLogEntry(
  actorUserId: string,
  action: string,
  targetTable: string,
  targetId: string,
  before?: any,
  after?: any,
  reason?: string,
  ip?: string,
  userAgent?: string
): Promise<void> {
  try {
    await db.insert(auditLog).values({
      actorUserId,
      action,
      targetTable,
      targetId,
      diff: before || after ? { before, after } : null,
      reason,
      ip,
      ua: userAgent,
    });
  } catch (error) {
    console.error("Failed to write audit log:", error);
    // Don't throw - audit logging should not break the main operation
  }
}

export function auditedRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    let before: any = null;
    let after: any = null;
    
    try {
      // Capture before state for updates/deletes
      if (['PUT', 'PATCH', 'DELETE'].includes(req.method) && req.params.id) {
        // This would need to be customized per route to get the correct "before" state
        // For now, we'll just log the action
      }
      
      // Execute the handler
      const result = await handler(req, res, next);
      
      // Capture after state
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        after = result;
      }
      
      // Log the action
      if (req.user) {
        await auditLogEntry(
          req.user.userId,
          `${req.method.toLowerCase()}_${req.route?.path || req.path}`,
          'various', // Would be specific to each route
          req.params.id || 'unknown',
          before,
          after,
          req.body?.reason,
          req.ip,
          req.headers['user-agent']
        );
      }
      
      return result;
    } catch (error) {
      next(error);
    }
  };
}
