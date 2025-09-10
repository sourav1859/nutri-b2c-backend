import { db, executeRaw, createVendorPartitions } from "../../config/database.js";
import { vendors, vendorUsers } from "../../../shared/schema.js";
import type { InsertVendor, InsertVendorUser } from "../../../shared/schema.js";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";

// Create a new vendor with partitioned tables
export async function createVendor(vendorData: InsertVendor): Promise<string> {
  try {
    // Create vendor record
    const vendor = await db.insert(vendors).values({
      ...vendorData,
      apiKey: `vnd_${nanoid(32)}`,
      webhookSecret: nanoid(64),
    }).returning();

    const vendorId = vendor[0].id;

    // Create partitions for the new vendor
    await createVendorPartitions(vendorId);

    // Mark partitions as created
    await db.update(vendors)
      .set({ 
        partitionsCreated: true, 
        updatedAt: new Date() 
      })
      .where(eq(vendors.id, vendorId));

    return vendorId;
  } catch (error) {
    console.error("Failed to create vendor:", error);
    throw new Error("Vendor creation failed");
  }
}

// Create vendor admin user
export async function createVendorUser(userData: InsertVendorUser & { password: string }): Promise<string> {
  const passwordHash = await bcrypt.hash(userData.password, 12);
  
  const user = await db.insert(vendorUsers).values({
    ...userData,
    passwordHash,
  }).returning();

  return user[0].id;
}

// Get vendor by domain for multi-tenant routing
export async function getVendorByDomain(domain: string) {
  const vendor = await db.select()
    .from(vendors)
    .where(eq(vendors.domain, domain))
    .limit(1);

  return vendor[0] || null;
}

// Get vendor statistics for admin dashboard
export async function getVendorStats(vendorId: string) {
  const [
    productCount,
    customerCount,
    recentIngestions,
    activeJobs,
  ] = await Promise.all([
    executeRaw(`
      SELECT COUNT(*) as count 
      FROM products 
      WHERE vendor_id = '${vendorId}' AND status = 'active'
    `),
    executeRaw(`
      SELECT COUNT(*) as count 
      FROM customers 
      WHERE vendor_id = '${vendorId}' AND status = 'active'
    `),
    executeRaw(`
      SELECT COUNT(*) as count 
      FROM ingestion_jobs 
      WHERE vendor_id = '${vendorId}' 
      AND created_at > NOW() - INTERVAL '30 days'
    `),
    executeRaw(`
      SELECT COUNT(*) as count 
      FROM ingestion_jobs 
      WHERE vendor_id = '${vendorId}' 
      AND status IN ('queued', 'processing')
    `),
  ]);

  return {
    products: productCount[0]?.count || 0,
    customers: customerCount[0]?.count || 0,
    recentIngestions: recentIngestions[0]?.count || 0,
    activeJobs: activeJobs[0]?.count || 0,
  };
}

// Validate vendor API key
export async function validateApiKey(apiKey: string) {
  const vendor = await db.select()
    .from(vendors)
    .where(eq(vendors.apiKey, apiKey))
    .limit(1);

  if (!vendor[0] || vendor[0].status !== 'active') {
    throw new Error('Invalid or inactive API key');
  }

  return vendor[0];
}

// Enterprise health scoring algorithm
export function calculateHealthScore(product: any): number {
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

  // Organic/health certifications bonus
  if (product.certifications?.includes('USDA Organic')) {
    score += 5;
  }
  if (product.healthClaims?.includes('heart-healthy')) {
    score += 3;
  }

  return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
}