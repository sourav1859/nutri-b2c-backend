import type { Request, Response, NextFunction } from "express";
import { createHash } from "crypto";
import { db } from "../config/database";
import { idempotencyKeys } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export async function idempotencyMiddleware(req: Request, res: Response, next: NextFunction) {
  const idempotencyKey = req.headers['idempotency-key'] as string;
  
  // Require idempotency key for state-changing operations
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && !idempotencyKey) {
    return res.status(400).json({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      detail: 'Idempotency-Key header required for state-changing operations',
      instance: req.url
    });
  }
  
  if (!idempotencyKey) {
    return next();
  }
  
  try {
    // Create request hash
    const requestHash = createHash('sha256')
      .update(JSON.stringify(req.body || {}))
      .digest('hex');
    
    // Check for existing request
    const existing = await db
      .select()
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.key, idempotencyKey),
          eq(idempotencyKeys.method, req.method),
          eq(idempotencyKeys.path, req.path)
        )
      )
      .limit(1);
    
    if (existing.length > 0) {
      const record = existing[0];
      
      // Check if request body is different
      if (record.requestHash !== requestHash) {
        return res.status(409).json({
          type: 'about:blank',
          title: 'Conflict',
          status: 409,
          detail: 'Idempotency key reused with different request body',
          instance: req.url
        });
      }
      
      // Return cached response if already processed
      if (record.responseStatus && record.responseBody) {
        return res.status(record.responseStatus).json(record.responseBody);
      }
    } else {
      // Store new idempotency key
      await db.insert(idempotencyKeys).values({
        key: idempotencyKey,
        method: req.method,
        path: req.path,
        requestHash,
      });
    }
    
    // Store idempotency info for response handling
    res.locals.idempotencyKey = idempotencyKey;
    
    next();
  } catch (error) {
    console.error("Idempotency middleware error:", error);
    next();
  }
}

// Middleware to store response for idempotency
export function storeIdempotentResponse(req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json;
  const idempotencyKey = res.locals.idempotencyKey;
  
  if (idempotencyKey && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
    res.json = function(body: any) {
      // Store the response
      db.update(idempotencyKeys)
        .set({
          responseStatus: res.statusCode,
          responseBody: body,
          processedAt: new Date(),
        })
        .where(eq(idempotencyKeys.key, idempotencyKey))
        .catch(err => console.error("Failed to store idempotent response:", err));
      
      return originalJson.call(this, body);
    };
  }
  
  next();
}
