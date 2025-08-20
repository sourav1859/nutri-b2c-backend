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
    console.log(`[AUTH] Processing request: ${req.url}, NODE_ENV: ${process.env.NODE_ENV}, includes admin: ${req.url.includes('/admin')}`);
    
    // Development bypass for admin routes
    if (process.env.NODE_ENV === 'development' && req.url.includes('/admin')) {
      console.log(`[AUTH] Development bypass activated for: ${req.url}`);
      req.user = {
        userId: 'dev-admin-user',
        isAdmin: true,
        effectiveUserId: 'dev-admin-user',
        isImpersonating: false,
        profile: { role: 'admin' }
      };
      await setCurrentUser('dev-admin-user');
      return next();
    }
    
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
