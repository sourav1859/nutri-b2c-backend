import type { Request, Response, NextFunction } from "express";
import { verifyAppwriteJWT, extractJWTFromHeaders } from "../auth/jwt";
import { handleAdminImpersonation } from "../auth/admin";
import { setCurrentUser } from "../config/database";

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const jwt = extractJWTFromHeaders(req.headers);
    
    if (!jwt) {
      return res.status(401).json({
        type: 'about:blank',
        title: 'Unauthorized',
        status: 401,
        detail: 'X-Appwrite-JWT header required',
        instance: req.url
      });
    }
    
    // Verify JWT and get user context
    const userContext = await verifyAppwriteJWT(jwt);
    
    // Handle admin impersonation
    const adminContext = await handleAdminImpersonation(req, userContext);
    
    // Set current user for RLS
    await setCurrentUser(adminContext.effectiveUserId);
    
    // Attach to request
    req.user = adminContext;
    
    next();
  } catch (error: any) {
    res.status(401).json({
      type: 'about:blank',
      title: 'Unauthorized',
      status: 401,
      detail: error.message || 'Authentication failed',
      instance: req.url
    });
  }
}

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const jwt = extractJWTFromHeaders(req.headers);
  
  if (!jwt) {
    return next();
  }
  
  authMiddleware(req, res, next);
}
