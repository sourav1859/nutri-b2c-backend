import { Router } from "express";
import { z } from "zod";
import { db, getDbConnection, checkReplicationLag } from "../config/database.js";
import { vendors, vendorUsers, products, customers, ingestionJobs } from "@shared/schema";
import { 
  insertVendorSchema, 
  insertVendorUserSchema, 
  insertProductSchema,
  insertCustomerSchema,
  insertIngestionJobSchema 
} from "@shared/schema";
import { eq, and, desc, count } from "drizzle-orm";
import { 
  createVendor, 
  createVendorUser, 
  getVendorByDomain, 
  getVendorStats, 
  validateApiKey 
} from "../services/b2b/vendorService.js";
import {
  createIngestionJob,
  processCsvIngestion,
  getJobStatus,
  getVendorJobs
} from "../services/b2b/ingestionService.js";
import {
  findHealthAwareMatches,
  batchHealthMatching,
  clearCustomerCache,
  getMatchingMetrics
} from "../services/b2b/matchingService.js";

const router = Router();

// =============================================================================
// VENDOR MANAGEMENT
// =============================================================================

// Create new vendor (super admin only)
router.post("/vendors", async (req, res, next) => {
  try {
    const vendorData = insertVendorSchema.parse(req.body);
    const vendorId = await createVendor(vendorData);
    
    res.status(201).json({ 
      success: true, 
      vendorId,
      message: "Vendor created with partitioned tables" 
    });
  } catch (error) {
    next(error);
  }
});

// Get vendor by domain (for multi-tenant routing)
router.get("/vendors/by-domain/:domain", async (req, res, next) => {
  try {
    const { domain } = req.params;
    const vendor = await getVendorByDomain(domain);
    
    if (!vendor) {
      return res.status(404).json({ error: "Vendor not found" });
    }
    
    res.json(vendor);
  } catch (error) {
    next(error);
  }
});

// Get vendor statistics
router.get("/vendors/:vendorId/stats", async (req, res, next) => {
  try {
    const { vendorId } = req.params;
    const stats = await getVendorStats(vendorId);
    
    res.json({
      vendor_id: vendorId,
      statistics: stats,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// PRODUCT MANAGEMENT
// =============================================================================

// Get products for a vendor (with pagination and filtering)
router.get("/vendors/:vendorId/products", async (req, res, next) => {
  try {
    const { vendorId } = req.params;
    const { limit = 50, offset = 0, search, category, status = 'active' } = req.query;
    
    // Use read replica for heavy queries
    const dbConn = getDbConnection('read', req.path);
    const replicationLag = await checkReplicationLag();
    
    let whereConditions = [
      eq(products.vendorId, vendorId),
      eq(products.status, status as string),
    ];
    
    if (search) {
      whereConditions.push(
        sql`${products.searchTsv} @@ plainto_tsquery('english', ${search})`
      );
    }
    
    if (category) {
      whereConditions.push(eq(products.categoryId, category as string));
    }
    
    const [productResults, totalCount] = await Promise.all([
      dbConn
        .select()
        .from(products)
        .where(and(...whereConditions))
        .orderBy(desc(products.healthScore), desc(products.updatedAt))
        .limit(Number(limit))
        .offset(Number(offset)),
      
      dbConn
        .select({ count: count() })
        .from(products)
        .where(and(...whereConditions))
    ]);
    
    res.json({
      products: productResults,
      pagination: {
        total: totalCount[0].count,
        limit: Number(limit),
        offset: Number(offset),
        has_more: totalCount[0].count > Number(offset) + Number(limit),
      },
      freshness: replicationLag > 5 ? 'stale' : 'fresh',
      replica_lag_seconds: replicationLag,
    });
  } catch (error) {
    next(error);
  }
});

// Create product
router.post("/vendors/:vendorId/products", async (req, res, next) => {
  try {
    const { vendorId } = req.params;
    const productData = insertProductSchema.parse({
      ...req.body,
      vendorId,
    });
    
    const product = await db.insert(products).values({
      ...productData,
      searchTsv: sql`to_tsvector('english', ${productData.name} || ' ' || COALESCE(${productData.brand}, '') || ' ' || COALESCE(${productData.description}, ''))`,
      healthScore: calculateHealthScore(productData),
    }).returning();
    
    res.status(201).json(product[0]);
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// CUSTOMER MANAGEMENT 
// =============================================================================

// Get customers for a vendor
router.get("/vendors/:vendorId/customers", async (req, res, next) => {
  try {
    const { vendorId } = req.params;
    const { limit = 50, offset = 0, status = 'active' } = req.query;
    
    const dbConn = getDbConnection('read', req.path);
    
    const [customerResults, totalCount] = await Promise.all([
      dbConn
        .select()
        .from(customers)
        .where(and(
          eq(customers.vendorId, vendorId),
          eq(customers.status, status as string)
        ))
        .orderBy(desc(customers.createdAt))
        .limit(Number(limit))
        .offset(Number(offset)),
      
      dbConn
        .select({ count: count() })
        .from(customers)
        .where(and(
          eq(customers.vendorId, vendorId),
          eq(customers.status, status as string)
        ))
    ]);
    
    res.json({
      customers: customerResults,
      pagination: {
        total: totalCount[0].count,
        limit: Number(limit),
        offset: Number(offset),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Create customer
router.post("/vendors/:vendorId/customers", async (req, res, next) => {
  try {
    const { vendorId } = req.params;
    const customerData = insertCustomerSchema.parse({
      ...req.body,
      vendorId,
    });
    
    const customer = await db.insert(customers).values(customerData).returning();
    res.status(201).json(customer[0]);
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// HEALTH-AWARE MATCHING ENGINE
// =============================================================================

// Get health-aware product matches for a customer
router.get("/vendors/:vendorId/customers/:customerId/matches", async (req, res, next) => {
  try {
    const { vendorId, customerId } = req.params;
    const { k = 20 } = req.query;
    
    const matches = await findHealthAwareMatches(
      vendorId, 
      customerId, 
      Number(k),
      req
    );
    
    res.json({
      customer_id: customerId,
      vendor_id: vendorId,
      ...matches,
    });
  } catch (error) {
    next(error);
  }
});

// Batch matching for multiple customers
router.post("/vendors/:vendorId/batch-matching", async (req, res, next) => {
  try {
    const { vendorId } = req.params;
    const { customer_ids, limit = 10 } = req.body;
    
    if (!Array.isArray(customer_ids) || customer_ids.length === 0) {
      return res.status(400).json({ error: "customer_ids array is required" });
    }
    
    const results = await batchHealthMatching(vendorId, customer_ids, Number(limit));
    
    res.json({
      vendor_id: vendorId,
      batch_size: customer_ids.length,
      results: Object.fromEntries(results),
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// Clear customer matching cache
router.delete("/vendors/:vendorId/customers/:customerId/cache", async (req, res, next) => {
  try {
    const { vendorId, customerId } = req.params;
    await clearCustomerCache(vendorId, customerId);
    
    res.json({ 
      success: true, 
      message: "Customer matching cache cleared" 
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// CSV INGESTION SYSTEM
// =============================================================================

// Create TUS resumable upload for CSV ingestion
router.post("/vendors/:vendorId/ingest", async (req, res, next) => {
  try {
    const { vendorId } = req.params;
    const { mode = 'upsert', filename, notes } = req.body;
    const uploadedBy = req.user?.id || 'unknown';
    
    const { jobId, uploadUrl } = await createIngestionJob(
      vendorId,
      mode,
      uploadedBy,
      filename,
      notes
    );
    
    res.status(201).json({
      job_id: jobId,
      upload_url: uploadUrl,
      resumable: true,
      max_file_size: "10GB",
      supported_modes: ["insert", "upsert", "replace"],
    });
  } catch (error) {
    next(error);
  }
});

// Process uploaded CSV (triggered by webhook or manually)
router.post("/vendors/:vendorId/ingest/:jobId/process", async (req, res, next) => {
  try {
    const { vendorId, jobId } = req.params;
    
    // Start processing asynchronously
    processCsvIngestion(jobId).catch(error => {
      console.error(`Async processing failed for job ${jobId}:`, error);
    });
    
    res.json({
      success: true,
      job_id: jobId,
      message: "CSV processing started",
      sla: "2M rows ≤45min",
    });
  } catch (error) {
    next(error);
  }
});

// Get ingestion job status
router.get("/vendors/:vendorId/ingest/:jobId", async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const job = await getJobStatus(jobId);
    
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    res.json(job);
  } catch (error) {
    next(error);
  }
});

// List vendor's ingestion jobs
router.get("/vendors/:vendorId/ingest", async (req, res, next) => {
  try {
    const { vendorId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const jobs = await getVendorJobs(vendorId, Number(limit), Number(offset));
    
    res.json({
      jobs,
      vendor_id: vendorId,
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
      },
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// ANALYTICS & PERFORMANCE METRICS
// =============================================================================

// Get matching engine performance metrics
router.get("/vendors/:vendorId/metrics/matching", async (req, res, next) => {
  try {
    const { vendorId } = req.params;
    const metrics = await getMatchingMetrics(vendorId);
    
    res.json({
      vendor_id: vendorId,
      metrics,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// Health score calculation (used by product creation)
function calculateHealthScore(product: any): number {
  let score = 85; // Base score

  // Penalize high sodium (>20% DV = 480mg)
  if (product.sodiumMg > 480) {
    score -= Math.min(15, (product.sodiumMg - 480) / 40);
  }

  // Penalize high sugar (>25g per serving)
  if (product.sugarG > 25) {
    score -= Math.min(10, (product.sugarG - 25) / 5);
  }

  // Bonus for high fiber (>5g)
  if (product.fiberG > 5) {
    score += Math.min(10, product.fiberG - 5);
  }

  // Bonus for high protein (>15g)
  if (product.proteinG > 15) {
    score += Math.min(8, (product.proteinG - 15) / 3);
  }

  return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
}

export default router;