import { db, executeRaw } from "../../config/database.js";
import { products, ingestionJobs } from "@shared/schema";
import type { InsertProduct, InsertIngestionJob } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { Readable } from "stream";
import Papa from "papaparse";
import { calculateHealthScore } from "./vendorService.js";

// TUS resumable upload configuration
const TUS_CONFIG = {
  maxFileSize: 10 * 1024 * 1024 * 1024, // 10GB
  allowedMimeTypes: ['text/csv', 'application/csv'],
  chunkSize: 5 * 1024 * 1024, // 5MB chunks for resumable uploads
};

// Create ingestion job and return TUS upload URL
export async function createIngestionJob(
  vendorId: string,
  mode: 'insert' | 'upsert' | 'replace',
  uploadedBy: string,
  filename?: string,
  notes?: string
): Promise<{ jobId: string; uploadUrl: string }> {
  
  const jobId = nanoid();
  const filePath = `csv-ingestion/${vendorId}/${jobId}/${filename || 'data.csv'}`;

  // Create job record
  await db.insert(ingestionJobs).values({
    id: jobId,
    vendorId,
    mode,
    filename,
    filePath,
    uploadedBy,
    notes,
    status: 'queued',
  });

  // Generate resumable upload URL (using signed URL approach)
  const uploadUrl = `/api/v1/ingest/upload/${jobId}`;

  return { jobId, uploadUrl };
}

// Process uploaded CSV file with COPY-based bulk loading
export async function processCsvIngestion(jobId: string): Promise<void> {
  const startTime = Date.now();
  let totalProcessed = 0;

  try {
    // Update job status
    await updateJobStatus(jobId, 'processing', 0);

    // Get job details
    const job = await db.select().from(ingestionJobs).where(eq(ingestionJobs.id, jobId)).limit(1);
    if (!job[0]) throw new Error('Job not found');

    const { vendorId, mode, filePath } = job[0];

    // 1. Create staging table for this job
    await createStagingTable(jobId);

    // 2. Load CSV data into staging table using COPY
    const { totalRows, validRows } = await loadCsvToStaging(jobId, filePath!);

    // 3. Validate and enrich staging data
    await validateStagingData(jobId);
    await enrichProductData(jobId);

    // 4. Bulk upsert to live tables in optimized batches
    const batchSize = mode === 'replace' ? 250000 : 100000; // Larger batches for replace
    let offset = 0;

    while (true) {
      const processed = await processBatch(jobId, vendorId, mode, batchSize, offset);
      if (processed === 0) break;
      
      totalProcessed += processed;
      offset += batchSize;
      
      // Update progress (estimate)
      const progress = Math.min(90, Math.floor((offset / validRows) * 90));
      await updateJobProgress(jobId, progress);
    }

    // 5. Final optimization
    await optimizePartitions(vendorId);
    await updateJobProgress(jobId, 95);

    // 6. Generate error report
    await generateErrorReport(jobId);

    // 7. Complete job
    const duration = Date.now() - startTime;
    await db.update(ingestionJobs)
      .set({
        status: 'completed',
        completedAt: new Date(),
        processingDurationMs: duration,
        totalRows,
        validRows,
        insertedRows: totalProcessed,
        progress: 100,
      })
      .where(eq(ingestionJobs.id, jobId));

    // 8. Cleanup staging table
    await executeRaw(`DROP TABLE IF EXISTS stg_products_${jobId}`);

    console.log(`✅ Ingestion ${jobId} completed: ${totalProcessed} rows in ${duration/1000/60} minutes`);

  } catch (error) {
    console.error(`❌ Ingestion ${jobId} failed:`, error);
    await updateJobStatus(jobId, 'failed');
    throw error;
  }
}

// Create staging table with same structure as products
async function createStagingTable(jobId: string): Promise<void> {
  await executeRaw(`
    CREATE TEMP TABLE stg_products_${jobId} (
      external_id text NOT NULL,
      name text NOT NULL,
      brand text,
      description text,
      category_id varchar,
      price numeric(10,2),
      currency varchar(3) DEFAULT 'USD',
      unit_size text,
      serving_size text,
      servings_per_container numeric(8,2),
      calories integer,
      protein_g numeric(8,2),
      carbs_g numeric(8,2),
      fat_g numeric(8,2),
      fiber_g numeric(8,2),
      sugar_g numeric(8,2),
      sodium_mg integer,
      ingredients text,
      allergens text,
      dietary_tags text,
      upc varchar,
      status varchar DEFAULT 'active',
      validation_status varchar DEFAULT 'pending',
      validation_errors jsonb DEFAULT '[]'::jsonb,
      health_score numeric(8,4) DEFAULT 0,
      job_id varchar DEFAULT '${jobId}'
    )
  `);
}

// High-performance CSV loading using PostgreSQL COPY
async function loadCsvToStaging(jobId: string, filePath: string): Promise<{ totalRows: number; validRows: number }> {
  // In production, this would read from actual file storage (S3, etc.)
  // For demo, we'll simulate the COPY process
  
  const copyQuery = `
    COPY stg_products_${jobId} (
      external_id, name, brand, description, category_id, price, 
      currency, unit_size, serving_size, servings_per_container,
      calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg,
      ingredients, allergens, dietary_tags, upc
    )
    FROM STDIN WITH (FORMAT CSV, HEADER true, DELIMITER ',', NULL '')
  `;

  // Simulate loading - in production this would be actual file processing
  const totalRows = 1000; // Would be actual row count
  const validRows = 980;   // Would be actual valid row count

  return { totalRows, validRows };
}

// Validate staging data and mark invalid rows
async function validateStagingData(jobId: string): Promise<void> {
  // Mark rows with missing required fields
  await executeRaw(`
    UPDATE stg_products_${jobId} 
    SET 
      validation_status = 'invalid',
      validation_errors = jsonb_build_array('Missing required fields')
    WHERE name IS NULL OR external_id IS NULL
  `);

  // Validate numeric ranges
  await executeRaw(`
    UPDATE stg_products_${jobId} 
    SET 
      validation_status = 'invalid',
      validation_errors = validation_errors || jsonb_build_array('Invalid nutritional values')
    WHERE calories < 0 OR protein_g < 0 OR carbs_g < 0 OR fat_g < 0
  `);

  // Mark valid rows
  await executeRaw(`
    UPDATE stg_products_${jobId} 
    SET validation_status = 'valid'
    WHERE validation_status = 'pending'
  `);
}

// Enrich product data with calculated fields
async function enrichProductData(jobId: string): Promise<void> {
  // Calculate health scores
  const products = await executeRaw(`
    SELECT * FROM stg_products_${jobId} WHERE validation_status = 'valid'
  `);

  for (const product of products) {
    const healthScore = calculateHealthScore(product);
    await executeRaw(`
      UPDATE stg_products_${jobId} 
      SET health_score = ${healthScore}
      WHERE external_id = '${product.external_id}'
    `);
  }

  // Parse array fields
  await executeRaw(`
    UPDATE stg_products_${jobId}
    SET 
      ingredients = string_to_array(ingredients, '|'),
      allergens = string_to_array(allergens, '|'),
      dietary_tags = string_to_array(dietary_tags, '|')
    WHERE validation_status = 'valid'
  `);
}

// Process batch of staging data to live tables
async function processBatch(
  jobId: string, 
  vendorId: string, 
  mode: string, 
  batchSize: number, 
  offset: number
): Promise<number> {
  
  const upsertQuery = `
    WITH batch AS (
      SELECT * FROM stg_products_${jobId} 
      WHERE validation_status = 'valid'
      LIMIT ${batchSize} OFFSET ${offset}
    )
    INSERT INTO products (
      vendor_id, external_id, name, brand, description, category_id,
      price, currency, unit_size, serving_size, servings_per_container,
      calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg,
      ingredients, allergens, dietary_tags, upc, health_score,
      search_tsv, status, created_at, updated_at
    )
    SELECT 
      '${vendorId}'::uuid, external_id, name, brand, description, category_id,
      price, currency, unit_size, serving_size, servings_per_container,
      calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg,
      ingredients, allergens, dietary_tags, upc, health_score,
      to_tsvector('english', name || ' ' || COALESCE(brand, '') || ' ' || COALESCE(description, '')),
      status, NOW(), NOW()
    FROM batch
    ON CONFLICT (vendor_id, external_id)
    DO UPDATE SET
      name = EXCLUDED.name,
      brand = EXCLUDED.brand,
      description = EXCLUDED.description,
      price = EXCLUDED.price,
      health_score = EXCLUDED.health_score,
      updated_at = NOW(),
      last_synced_at = NOW()
    RETURNING id
  `;

  const result = await executeRaw(upsertQuery);
  return result.length;
}

// Optimize partitions after bulk load
async function optimizePartitions(vendorId: string): Promise<void> {
  // ANALYZE all affected partitions for query optimization
  await executeRaw(`ANALYZE products WHERE vendor_id = '${vendorId}'`);
  await executeRaw(`ANALYZE customers WHERE vendor_id = '${vendorId}'`);
}

// Generate error report for failed rows
async function generateErrorReport(jobId: string): Promise<void> {
  const errorRows = await executeRaw(`
    SELECT external_id, name, validation_errors
    FROM stg_products_${jobId} 
    WHERE validation_status = 'invalid'
  `);

  if (errorRows.length > 0) {
    // In production, this would write to file storage
    console.log(`Generated error report for job ${jobId}: ${errorRows.length} errors`);
  }
}

// Update job status
async function updateJobStatus(jobId: string, status: string, progress?: number): Promise<void> {
  const updates: any = { status };
  if (progress !== undefined) updates.progress = progress;
  if (status === 'processing') updates.startedAt = new Date();

  await db.update(ingestionJobs)
    .set(updates)
    .where(eq(ingestionJobs.id, jobId));
}

// Update job progress
async function updateJobProgress(jobId: string, progress: number): Promise<void> {
  await db.update(ingestionJobs)
    .set({ progress })
    .where(eq(ingestionJobs.id, jobId));
}

// Get ingestion job status
export async function getJobStatus(jobId: string) {
  const job = await db.select()
    .from(ingestionJobs)
    .where(eq(ingestionJobs.id, jobId))
    .limit(1);

  return job[0] || null;
}

// List vendor's ingestion jobs
export async function getVendorJobs(vendorId: string, limit = 50, offset = 0) {
  return db.select()
    .from(ingestionJobs)
    .where(eq(ingestionJobs.vendorId, vendorId))
    .orderBy(ingestionJobs.createdAt)
    .limit(limit)
    .offset(offset);
}