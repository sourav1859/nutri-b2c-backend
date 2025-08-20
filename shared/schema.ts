import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, numeric, boolean, timestamp, jsonb, uuid, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// Taxonomy Tables
export const taxAllergens = pgTable("tax_allergens", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  commonNames: text("common_names").array(),
  isTop9: boolean("is_top_9").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const taxDiets = pgTable("tax_diets", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: varchar("category"), // 'primary', 'lifestyle', 'medical'
  createdAt: timestamp("created_at").defaultNow(),
});

export const taxCuisines = pgTable("tax_cuisines", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  region: text("region"),
  parentId: varchar("parent_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const taxFlags = pgTable("tax_flags", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  category: varchar("category"), // 'health', 'preference', 'restriction'
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Core Recipe Tables
export const recipes = pgTable("recipes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  sourceUrl: text("source_url"),
  
  // Nutrition (required for search/filtering)
  calories: integer("calories"),
  proteinG: numeric("protein_g", { precision: 8, scale: 2 }),
  carbsG: numeric("carbs_g", { precision: 8, scale: 2 }),
  fatG: numeric("fat_g", { precision: 8, scale: 2 }),
  fiberG: numeric("fiber_g", { precision: 8, scale: 2 }),
  sugarG: numeric("sugar_g", { precision: 8, scale: 2 }),
  sodiumMg: integer("sodium_mg"),
  saturatedFatG: numeric("saturated_fat_g", { precision: 8, scale: 2 }),
  
  // Recipe metadata
  totalTimeMinutes: integer("total_time_minutes"),
  prepTimeMinutes: integer("prep_time_minutes"),
  cookTimeMinutes: integer("cook_time_minutes"),
  servings: integer("servings"),
  difficulty: varchar("difficulty"), // 'easy', 'medium', 'hard'
  mealType: varchar("meal_type"), // 'breakfast', 'lunch', 'dinner', 'snack'
  
  // Taxonomy arrays
  cuisines: text("cuisines").array().default([]),
  dietTags: text("diet_tags").array().default([]),
  allergens: text("allergens").array().default([]),
  flags: text("flags").array().default([]),
  
  // Recipe content
  ingredients: jsonb("ingredients"), // Array of ingredient objects
  instructions: jsonb("instructions"), // Array of instruction steps
  notes: text("notes"),
  
  // Search and categorization
  searchText: text("search_text"), // Trigger-maintained for FTS
  tsv: text("tsv"), // Full-text search vector (tsvector)
  
  // Publishing
  status: varchar("status").default("draft"), // 'draft', 'published', 'archived'
  marketCountry: varchar("market_country").default("US"),
  
  // Tracking
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  publishedAt: timestamp("published_at"),
  
  // Source tracking
  sourceType: varchar("source_type").default("curated"), // 'curated', 'user_generated'
  sourceUserId: varchar("source_user_id"), // For UGC approval tracking
}, (table) => ({
  cuisinesIdx: index("idx_recipes_cuisines").using("gin", table.cuisines),
  dietTagsIdx: index("idx_recipes_diet_tags").using("gin", table.dietTags),
  allergensIdx: index("idx_recipes_allergens").using("gin", table.allergens),
  statusIdx: index("idx_recipes_status").on(table.status),
  marketIdx: index("idx_recipes_market").on(table.marketCountry),
  updatedAtIdx: index("idx_recipes_updated_at").on(table.updatedAt),
}));

// User-Generated Content
export const userRecipes = pgTable("user_recipes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerUserId: varchar("owner_user_id").notNull(),
  
  // Recipe data (same structure as recipes)
  title: text("title").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  
  // Nutrition
  calories: integer("calories"),
  proteinG: numeric("protein_g", { precision: 8, scale: 2 }),
  carbsG: numeric("carbs_g", { precision: 8, scale: 2 }),
  fatG: numeric("fat_g", { precision: 8, scale: 2 }),
  fiberG: numeric("fiber_g", { precision: 8, scale: 2 }),
  sugarG: numeric("sugar_g", { precision: 8, scale: 2 }),
  sodiumMg: integer("sodium_mg"),
  saturatedFatG: numeric("saturated_fat_g", { precision: 8, scale: 2 }),
  
  // Recipe metadata
  totalTimeMinutes: integer("total_time_minutes"),
  prepTimeMinutes: integer("prep_time_minutes"),
  cookTimeMinutes: integer("cook_time_minutes"),
  servings: integer("servings"),
  difficulty: varchar("difficulty"),
  mealType: varchar("meal_type"),
  
  // Taxonomy
  cuisines: text("cuisines").array().default([]),
  dietTags: text("diet_tags").array().default([]),
  allergens: text("allergens").array().default([]),
  flags: text("flags").array().default([]),
  
  // Content
  ingredients: jsonb("ingredients"),
  instructions: jsonb("instructions"),
  notes: text("notes"),
  
  // Sharing and visibility
  visibility: varchar("visibility").default("private"), // 'private', 'shared', 'submitted'
  shareSlug: varchar("share_slug").unique(),
  
  // Review workflow
  submittedAt: timestamp("submitted_at"),
  reviewStatus: varchar("review_status").default("pending"), // 'pending', 'approved', 'rejected'
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  approvedRecipeId: uuid("approved_recipe_id").references(() => recipes.id),
  
  // Tracking
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  ownerIdx: index("idx_user_recipes_owner").on(table.ownerUserId),
  shareSlugIdx: index("idx_user_recipes_share_slug").on(table.shareSlug),
  reviewStatusIdx: index("idx_user_recipes_review_status").on(table.reviewStatus),
  submittedAtIdx: index("idx_user_recipes_submitted_at").on(table.submittedAt),
}));

// User Interactions
export const savedRecipes = pgTable("saved_recipes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  recipeId: uuid("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
  savedAt: timestamp("saved_at").defaultNow(),
}, (table) => ({
  userRecipeUnique: unique().on(table.userId, table.recipeId),
  userIdx: index("idx_saved_recipes_user").on(table.userId),
  savedAtIdx: index("idx_saved_recipes_saved_at").on(table.savedAt),
}));

export const recipeHistory = pgTable("recipe_history", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  recipeId: uuid("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
  event: varchar("event").notNull(), // 'viewed', 'cooked', 'shared'
  at: timestamp("at").defaultNow(),
  metadata: jsonb("metadata"), // Additional event data
}, (table) => ({
  userRecipeEventIdx: index("idx_recipe_history_user_recipe_event").on(table.userId, table.recipeId, table.event),
  userEventAtIdx: index("idx_recipe_history_user_event_at").on(table.userId, table.event, table.at),
  recipeEventAtIdx: index("idx_recipe_history_recipe_event_at").on(table.recipeId, table.event, table.at),
}));

// User Profiles
export const userProfiles = pgTable("user_profiles", {
  userId: varchar("user_id").primaryKey(),
  profileDiets: text("profile_diets").array().default([]),
  profileAllergens: text("profile_allergens").array().default([]),
  preferredCuisines: text("preferred_cuisines").array().default([]),
  
  // Macro targets (for personalized feed)
  targetCalories: integer("target_calories"),
  targetProteinG: numeric("target_protein_g", { precision: 8, scale: 2 }),
  targetCarbsG: numeric("target_carbs_g", { precision: 8, scale: 2 }),
  targetFatG: numeric("target_fat_g", { precision: 8, scale: 2 }),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Moderation System
export const recipeReports = pgTable("recipe_reports", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  reporterUserId: varchar("reporter_user_id").notNull(),
  recipeId: uuid("recipe_id").references(() => recipes.id),
  userRecipeId: uuid("user_recipe_id").references(() => userRecipes.id),
  
  category: varchar("category").notNull(), // 'inappropriate', 'copyright', 'nutrition', 'spam'
  reason: text("reason").notNull(),
  description: text("description"),
  
  status: varchar("status").default("open"), // 'open', 'investigating', 'resolved', 'dismissed'
  priority: varchar("priority").default("medium"), // 'low', 'medium', 'high', 'critical'
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  statusIdx: index("idx_recipe_reports_status").on(table.status),
  priorityIdx: index("idx_recipe_reports_priority").on(table.priority),
  createdAtIdx: index("idx_recipe_reports_created_at").on(table.createdAt),
}));

export const recipeReportResolutions = pgTable("recipe_report_resolutions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  reportId: uuid("report_id").notNull().references(() => recipeReports.id),
  resolvedBy: varchar("resolved_by").notNull(),
  action: varchar("action").notNull(), // 'dismiss', 'remove_content', 'warn_user', 'ban_user'
  reason: text("reason").notNull(),
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  reportIdx: index("idx_report_resolutions_report").on(table.reportId),
  resolvedByIdx: index("idx_report_resolutions_resolved_by").on(table.resolvedBy),
}));

// Admin and Security
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  at: timestamp("at").defaultNow(),
  actorUserId: varchar("actor_user_id").notNull(),
  action: varchar("action").notNull(),
  targetTable: varchar("target_table").notNull(),
  targetId: varchar("target_id").notNull(),
  diff: jsonb("diff"), // { before: {...}, after: {...} }
  reason: text("reason"),
  ip: varchar("ip"),
  ua: text("ua"), // User agent
}, (table) => ({
  atIdx: index("idx_audit_log_at").on(table.at),
  actorIdx: index("idx_audit_log_actor").on(table.actorUserId),
  actionIdx: index("idx_audit_log_action").on(table.action),
  targetIdx: index("idx_audit_log_target").on(table.targetTable, table.targetId),
}));

export const idempotencyKeys = pgTable("idempotency_keys", {
  key: varchar("key").primaryKey(),
  method: varchar("method").notNull(),
  path: text("path").notNull(),
  requestHash: varchar("request_hash").notNull(),
  responseStatus: integer("response_status"),
  responseBody: jsonb("response_body"),
  createdAt: timestamp("created_at").defaultNow(),
  processedAt: timestamp("processed_at"),
}, (table) => ({
  createdAtIdx: index("idx_idempotency_created_at").on(table.createdAt),
}));

// Insert/Select schemas
export const insertRecipeSchema = createInsertSchema(recipes).omit({
  id: true,
  searchText: true,
  tsv: true,
  createdAt: true,
  updatedAt: true,
  publishedAt: true,
});

export const insertUserRecipeSchema = createInsertSchema(userRecipes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  submittedAt: true,
  reviewedAt: true,
  approvedRecipeId: true,
});

export const insertSavedRecipeSchema = createInsertSchema(savedRecipes).omit({
  id: true,
  savedAt: true,
});

export const insertRecipeHistorySchema = createInsertSchema(recipeHistory).omit({
  id: true,
  at: true,
});

export const insertUserProfileSchema = createInsertSchema(userProfiles).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertRecipeReportSchema = createInsertSchema(recipeReports).omit({
  id: true,
  status: true,
  priority: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type Recipe = typeof recipes.$inferSelect;
export type InsertRecipe = z.infer<typeof insertRecipeSchema>;
export type UserRecipe = typeof userRecipes.$inferSelect;
export type InsertUserRecipe = z.infer<typeof insertUserRecipeSchema>;
export type SavedRecipe = typeof savedRecipes.$inferSelect;
export type InsertSavedRecipe = z.infer<typeof insertSavedRecipeSchema>;
export type RecipeHistory = typeof recipeHistory.$inferSelect;
export type InsertRecipeHistory = z.infer<typeof insertRecipeHistorySchema>;
export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type RecipeReport = typeof recipeReports.$inferSelect;
export type InsertRecipeReport = z.infer<typeof insertRecipeReportSchema>;
export type AuditLog = typeof auditLog.$inferSelect;

// Legacy user table (keeping for compatibility)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

// =============================================================================
// B2B ENTERPRISE MULTI-TENANT ARCHITECTURE
// =============================================================================

// Vendors (Tenants) - Root entity for multi-tenancy
export const vendors = pgTable("vendors", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  domain: varchar("domain").unique(), // subdomain.nutrition-platform.com
  tier: varchar("tier").notNull().default("starter"), // starter, professional, enterprise
  status: varchar("status").notNull().default("active"), // active, suspended, trial
  
  // Subscription & Billing
  subscriptionStatus: varchar("subscription_status").default("trial"),
  subscriptionEndDate: timestamp("subscription_end_date"),
  
  // API Configuration
  apiKey: varchar("api_key").unique(),
  webhookUrl: text("webhook_url"),
  webhookSecret: varchar("webhook_secret"),
  
  // Enterprise Features
  partitionsCreated: boolean("partitions_created").default(false),
  maxProducts: integer("max_products").default(10000),
  maxCustomers: integer("max_customers").default(1000),
  maxIngestionsPerMonth: integer("max_ingestions_per_month").default(10),
  
  // HIPAA Compliance
  hipaaEnabled: boolean("hipaa_enabled").default(false),
  auditRetentionDays: integer("audit_retention_days").default(2555), // 7 years
  
  // Contact & Support
  contactEmail: text("contact_email"),
  supportTier: varchar("support_tier").default("standard"), // standard, priority, white-glove
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  domainIdx: index("idx_vendors_domain").on(table.domain),
  statusIdx: index("idx_vendors_status").on(table.status),
  tierIdx: index("idx_vendors_tier").on(table.tier),
}));

// Vendor Users - Multi-tenant user management
export const vendorUsers = pgTable("vendor_users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  vendorId: uuid("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: varchar("role").notNull().default("user"), // admin, manager, user, readonly
  permissions: text("permissions").array().default([]),
  
  // Profile
  firstName: text("first_name"),
  lastName: text("last_name"),
  title: text("title"),
  department: text("department"),
  
  // Security
  mfaEnabled: boolean("mfa_enabled").default(false),
  mfaSecret: text("mfa_secret"),
  lastLoginAt: timestamp("last_login_at"),
  failedLoginAttempts: integer("failed_login_attempts").default(0),
  lockedUntil: timestamp("locked_until"),
  
  // Session Management
  sessionToken: varchar("session_token"),
  sessionExpiresAt: timestamp("session_expires_at"),
  
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  vendorEmailUnique: unique().on(table.vendorId, table.email),
  vendorIdIdx: index("idx_vendor_users_vendor_id").on(table.vendorId),
  emailIdx: index("idx_vendor_users_email").on(table.email),
  roleIdx: index("idx_vendor_users_role").on(table.role),
  sessionTokenIdx: index("idx_vendor_users_session_token").on(table.sessionToken),
}));

// Products - Partitioned by vendor_id (LIST) then HASH sub-partitioned
export const products = pgTable("products", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  vendorId: uuid("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  externalId: text("external_id").notNull(), // Vendor's product SKU/ID
  
  // Basic Product Info
  name: text("name").notNull(),
  brand: text("brand"),
  description: text("description"),
  categoryId: varchar("category_id"),
  subcategoryId: varchar("subcategory_id"),
  
  // Pricing
  price: numeric("price", { precision: 10, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  unitSize: text("unit_size"), // "12 oz", "1 lb", "500g"
  unitType: varchar("unit_type"), // "weight", "volume", "count"
  
  // Nutritional Information (per serving)
  servingSize: text("serving_size"),
  servingsPerContainer: numeric("servings_per_container", { precision: 8, scale: 2 }),
  calories: integer("calories"),
  proteinG: numeric("protein_g", { precision: 8, scale: 2 }),
  carbsG: numeric("carbs_g", { precision: 8, scale: 2 }),
  fatG: numeric("fat_g", { precision: 8, scale: 2 }),
  fiberG: numeric("fiber_g", { precision: 8, scale: 2 }),
  sugarG: numeric("sugar_g", { precision: 8, scale: 2 }),
  addedSugarG: numeric("added_sugar_g", { precision: 8, scale: 2 }),
  sodiumMg: integer("sodium_mg"),
  cholesterolMg: integer("cholesterol_mg"),
  saturatedFatG: numeric("saturated_fat_g", { precision: 8, scale: 2 }),
  transFatG: numeric("trans_fat_g", { precision: 8, scale: 2 }),
  potassiumMg: integer("potassium_mg"),
  vitaminAMcg: numeric("vitamin_a_mcg", { precision: 8, scale: 2 }),
  vitaminCMg: numeric("vitamin_c_mg", { precision: 8, scale: 2 }),
  calciumMg: integer("calcium_mg"),
  ironMg: numeric("iron_mg", { precision: 8, scale: 2 }),
  
  // Ingredients & Allergens
  ingredients: text("ingredients").array().default([]),
  allergens: text("allergens").array().default([]),
  allergenWarnings: text("allergen_warnings").array().default([]),
  
  // Dietary Classifications
  dietaryTags: text("dietary_tags").array().default([]), // vegan, gluten-free, keto, etc.
  healthClaims: text("health_claims").array().default([]), // "heart-healthy", "low-sodium"
  certifications: text("certifications").array().default([]), // "USDA Organic", "Non-GMO"
  
  // Product Metadata
  upc: varchar("upc"),
  ean: varchar("ean"),
  imageUrls: text("image_urls").array().default([]),
  availability: varchar("availability").default("in_stock"), // in_stock, out_of_stock, discontinued
  
  // Search & Discovery
  searchKeywords: text("search_keywords").array().default([]),
  searchTsv: text("search_tsv"), // Full-text search vector
  popularityScore: numeric("popularity_score", { precision: 8, scale: 4 }).default("0"),
  healthScore: numeric("health_score", { precision: 8, scale: 4 }).default("0"),
  
  // Tracking
  status: varchar("status").default("active"), // active, inactive, pending_review
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  lastSyncedAt: timestamp("last_synced_at"),
}, (table) => ({
  vendorExternalUnique: unique().on(table.vendorId, table.externalId),
  vendorIdIdx: index("idx_products_vendor_id").on(table.vendorId),
  categoryIdx: index("idx_products_category").on(table.categoryId),
  brandIdx: index("idx_products_brand").on(table.brand),
  statusIdx: index("idx_products_status").on(table.status),
  allergenIdx: index("idx_products_allergens").using("gin", table.allergens),
  dietaryTagsIdx: index("idx_products_dietary_tags").using("gin", table.dietaryTags),
  nameSearchIdx: index("idx_products_name_search").on(table.name),
  upcIdx: index("idx_products_upc").on(table.upc),
  updatedAtIdx: index("idx_products_updated_at").on(table.updatedAt),
}));

// Customers - Partitioned by vendor_id (LIST) then HASH sub-partitioned  
export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  vendorId: uuid("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  externalId: text("external_id").notNull(), // Vendor's customer ID
  
  // Basic Info
  email: text("email"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  dateOfBirth: timestamp("date_of_birth"),
  phone: text("phone"),
  
  // Demographics
  gender: varchar("gender"), // male, female, other, prefer_not_to_say
  zipCode: varchar("zip_code"),
  country: varchar("country").default("US"),
  
  // Account Status
  status: varchar("status").default("active"), // active, inactive, suspended
  consentDate: timestamp("consent_date"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  vendorExternalUnique: unique().on(table.vendorId, table.externalId),
  vendorIdIdx: index("idx_customers_vendor_id").on(table.vendorId),
  emailIdx: index("idx_customers_email").on(table.email),
  statusIdx: index("idx_customers_status").on(table.status),
  zipCodeIdx: index("idx_customers_zip_code").on(table.zipCode),
}));

// Customer Health Profiles - HIPAA-sensitive data
export const customerHealthProfiles = pgTable("customer_health_profiles", {
  customerId: uuid("customer_id").primaryKey().references(() => customers.id, { onDelete: "cascade" }),
  
  // Physical Characteristics
  heightCm: numeric("height_cm", { precision: 5, scale: 2 }),
  weightKg: numeric("weight_kg", { precision: 5, scale: 2 }),
  age: integer("age"),
  activityLevel: varchar("activity_level"), // sedentary, lightly_active, moderately_active, very_active, extremely_active
  
  // Health Conditions (HIPAA-sensitive)
  conditions: text("conditions").array().default([]), // diabetes, hypertension, heart_disease, etc.
  medications: text("medications").array().default([]),
  allergies: text("allergies").array().default([]),
  
  // Dietary Goals & Preferences
  dietGoals: text("diet_goals").array().default([]), // weight_loss, muscle_gain, maintenance
  dietaryRestrictions: text("dietary_restrictions").array().default([]), // vegetarian, vegan, keto, etc.
  avoidAllergens: text("avoid_allergens").array().default([]),
  
  // Calculated Health Metrics
  bmi: numeric("bmi", { precision: 5, scale: 2 }),
  bmr: integer("bmr"), // Basal Metabolic Rate
  tdee: integer("tdee"), // Total Daily Energy Expenditure
  
  // Nutritional Targets (calculated from goals + characteristics)
  targetCalories: integer("target_calories"),
  targetProteinG: numeric("target_protein_g", { precision: 8, scale: 2 }),
  targetCarbsG: numeric("target_carbs_g", { precision: 8, scale: 2 }),
  targetFatG: numeric("target_fat_g", { precision: 8, scale: 2 }),
  targetFiberG: numeric("target_fiber_g", { precision: 8, scale: 2 }),
  targetSodiumMg: integer("target_sodium_mg"),
  
  // Derived Constraints (JSON for flexible health rules)
  derivedLimits: jsonb("derived_limits"), // {"max_sugar": 25, "max_sodium": 2300, "min_protein": 50}
  
  // Tracking
  profileCompletePercent: integer("profile_complete_percent").default(0),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  conditionsIdx: index("idx_health_profiles_conditions").using("gin", table.conditions),
  allergiesIdx: index("idx_health_profiles_allergies").using("gin", table.allergies),
  dietGoalsIdx: index("idx_health_profiles_diet_goals").using("gin", table.dietGoals),
  lastUpdatedIdx: index("idx_health_profiles_last_updated").on(table.lastUpdatedAt),
}));

// CSV Ingestion Jobs - For bulk product uploads
export const ingestionJobs = pgTable("ingestion_jobs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  vendorId: uuid("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  
  // Job Configuration
  mode: varchar("mode").notNull(), // "insert", "upsert", "replace"
  filename: text("filename"),
  fileSize: integer("file_size"),
  filePath: text("file_path"), // Storage path for uploaded CSV
  
  // Status & Progress
  status: varchar("status").default("queued"), // queued, processing, completed, failed, cancelled
  progress: integer("progress").default(0), // 0-100 percentage
  
  // Results
  totalRows: integer("total_rows"),
  validRows: integer("valid_rows"),
  errorRows: integer("error_rows"),
  insertedRows: integer("inserted_rows"),
  updatedRows: integer("updated_rows"),
  skippedRows: integer("skipped_rows"),
  
  // Error Handling
  errorFilePath: text("error_file_path"), // Path to errors.csv file
  validationErrors: jsonb("validation_errors"), // Summary of validation issues
  
  // Performance Metrics
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  processingDurationMs: integer("processing_duration_ms"),
  
  // Metadata
  uploadedBy: uuid("uploaded_by").references(() => vendorUsers.id),
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  vendorIdIdx: index("idx_ingestion_jobs_vendor_id").on(table.vendorId),
  statusIdx: index("idx_ingestion_jobs_status").on(table.status),
  createdAtIdx: index("idx_ingestion_jobs_created_at").on(table.createdAt),
  uploadedByIdx: index("idx_ingestion_jobs_uploaded_by").on(table.uploadedBy),
}));

// Enterprise Audit Log - HIPAA-compliant auditing
export const enterpriseAuditLog = pgTable("enterprise_audit_log", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  vendorId: uuid("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  
  // Actor Information
  actorUserId: uuid("actor_user_id"),
  actorRole: varchar("actor_role"),
  actorEmail: text("actor_email"),
  
  // Action Details
  action: varchar("action").notNull(), // HIPAA actions: ACCESS_PHI, MODIFY_PHI, DELETE_PHI, etc.
  entity: varchar("entity").notNull(), // customer, health_profile, product, etc.
  entityId: varchar("entity_id").notNull(),
  
  // Data Changes
  before: jsonb("before"), // Previous state (for updates/deletes)
  after: jsonb("after"), // New state (for creates/updates)
  fieldChanges: text("field_changes").array(), // Specific fields that changed
  
  // Context & Justification
  reason: text("reason"), // Why was this action taken
  businessJustification: text("business_justification"), // Required for PHI access
  
  // Technical Context
  ip: varchar("ip"),
  userAgent: text("user_agent"),
  apiEndpoint: text("api_endpoint"),
  requestId: varchar("request_id"),
  sessionId: varchar("session_id"),
  
  // Compliance
  hipaaCategory: varchar("hipaa_category"), // administrative, physical, technical
  riskLevel: varchar("risk_level").default("low"), // low, medium, high, critical
  
  timestamp: timestamp("timestamp").defaultNow(),
}, (table) => ({
  vendorIdIdx: index("idx_enterprise_audit_vendor_id").on(table.vendorId),
  actorIdx: index("idx_enterprise_audit_actor").on(table.actorUserId),
  actionIdx: index("idx_enterprise_audit_action").on(table.action),
  entityIdx: index("idx_enterprise_audit_entity").on(table.entity, table.entityId),
  timestampIdx: index("idx_enterprise_audit_timestamp").on(table.timestamp),
  hipaaIdx: index("idx_enterprise_audit_hipaa").on(table.hipaaCategory),
  riskIdx: index("idx_enterprise_audit_risk").on(table.riskLevel),
}));

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

// B2B Schema Exports
export const insertVendorSchema = createInsertSchema(vendors).omit({
  id: true,
  partitionsCreated: true,
  createdAt: true,
  updatedAt: true,
});

export const insertVendorUserSchema = createInsertSchema(vendorUsers).omit({
  id: true,
  sessionToken: true,
  sessionExpiresAt: true,
  lastLoginAt: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  searchTsv: true,
  popularityScore: true,
  healthScore: true,
  createdAt: true,
  updatedAt: true,
  lastSyncedAt: true,
});

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCustomerHealthProfileSchema = createInsertSchema(customerHealthProfiles).omit({
  bmi: true,
  bmr: true,
  tdee: true,
  targetCalories: true,
  targetProteinG: true,
  targetCarbsG: true,
  targetFatG: true,
  targetFiberG: true,
  targetSodiumMg: true,
  derivedLimits: true,
  profileCompletePercent: true,
  lastUpdatedAt: true,
  createdAt: true,
});

export const insertIngestionJobSchema = createInsertSchema(ingestionJobs).pick({
  vendorId: true,
  mode: true,
  filename: true,
  fileSize: true,
  filePath: true,
  uploadedBy: true,
  notes: true,
});

// B2B Types
export type Vendor = typeof vendors.$inferSelect;
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type VendorUser = typeof vendorUsers.$inferSelect;
export type InsertVendorUser = z.infer<typeof insertVendorUserSchema>;
export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type CustomerHealthProfile = typeof customerHealthProfiles.$inferSelect;
export type InsertCustomerHealthProfile = z.infer<typeof insertCustomerHealthProfileSchema>;
export type IngestionJob = typeof ingestionJobs.$inferSelect;
export type InsertIngestionJob = z.infer<typeof insertIngestionJobSchema>;
export type EnterpriseAuditLog = typeof enterpriseAuditLog.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
