-- Initial schema migration for B2C Nutrition App

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- Taxonomy Tables
CREATE TABLE tax_allergens (
    id VARCHAR PRIMARY KEY,
    name TEXT NOT NULL,
    common_names TEXT[],
    is_top_9 BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE tax_diets (
    id VARCHAR PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category VARCHAR, -- 'primary', 'lifestyle', 'medical'
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE tax_cuisines (
    id VARCHAR PRIMARY KEY,
    name TEXT NOT NULL,
    region TEXT,
    parent_id VARCHAR REFERENCES tax_cuisines(id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE tax_flags (
    id VARCHAR PRIMARY KEY,
    name TEXT NOT NULL,
    category VARCHAR, -- 'health', 'preference', 'restriction'
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Core Recipe Tables
CREATE TABLE recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    source_url TEXT,
    
    -- Nutrition
    calories INTEGER,
    protein_g NUMERIC(8,2),
    carbs_g NUMERIC(8,2),
    fat_g NUMERIC(8,2),
    fiber_g NUMERIC(8,2),
    sugar_g NUMERIC(8,2),
    sodium_mg INTEGER,
    saturated_fat_g NUMERIC(8,2),
    
    -- Recipe metadata
    total_time_minutes INTEGER,
    prep_time_minutes INTEGER,
    cook_time_minutes INTEGER,
    servings INTEGER,
    difficulty VARCHAR, -- 'easy', 'medium', 'hard'
    meal_type VARCHAR, -- 'breakfast', 'lunch', 'dinner', 'snack'
    
    -- Taxonomy arrays
    cuisines TEXT[] DEFAULT '{}',
    diet_tags TEXT[] DEFAULT '{}',
    allergens TEXT[] DEFAULT '{}',
    flags TEXT[] DEFAULT '{}',
    
    -- Recipe content
    ingredients JSONB,
    instructions JSONB,
    notes TEXT,
    
    -- Search fields
    search_text TEXT,
    tsv TSVECTOR,
    
    -- Publishing
    status VARCHAR DEFAULT 'draft', -- 'draft', 'published', 'archived'
    market_country VARCHAR DEFAULT 'US',
    
    -- Tracking
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    published_at TIMESTAMP,
    
    -- Source tracking
    source_type VARCHAR DEFAULT 'curated', -- 'curated', 'user_generated'
    source_user_id VARCHAR
);

-- User-Generated Content
CREATE TABLE user_recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id VARCHAR NOT NULL,
    
    -- Recipe data (same structure as recipes)
    title TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    
    -- Nutrition
    calories INTEGER,
    protein_g NUMERIC(8,2),
    carbs_g NUMERIC(8,2),
    fat_g NUMERIC(8,2),
    fiber_g NUMERIC(8,2),
    sugar_g NUMERIC(8,2),
    sodium_mg INTEGER,
    saturated_fat_g NUMERIC(8,2),
    
    -- Recipe metadata
    total_time_minutes INTEGER,
    prep_time_minutes INTEGER,
    cook_time_minutes INTEGER,
    servings INTEGER,
    difficulty VARCHAR,
    meal_type VARCHAR,
    
    -- Taxonomy
    cuisines TEXT[] DEFAULT '{}',
    diet_tags TEXT[] DEFAULT '{}',
    allergens TEXT[] DEFAULT '{}',
    flags TEXT[] DEFAULT '{}',
    
    -- Content
    ingredients JSONB,
    instructions JSONB,
    notes TEXT,
    
    -- Sharing and visibility
    visibility VARCHAR DEFAULT 'private', -- 'private', 'shared', 'submitted'
    share_slug VARCHAR UNIQUE,
    
    -- Review workflow
    submitted_at TIMESTAMP,
    review_status VARCHAR DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    reviewed_by VARCHAR,
    reviewed_at TIMESTAMP,
    review_notes TEXT,
    approved_recipe_id UUID REFERENCES recipes(id),
    
    -- Tracking
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- User Interactions
CREATE TABLE saved_recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL,
    recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    saved_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, recipe_id)
);

CREATE TABLE recipe_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL,
    recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    event VARCHAR NOT NULL, -- 'viewed', 'cooked', 'shared'
    at TIMESTAMP DEFAULT NOW(),
    metadata JSONB
);

-- User Profiles
CREATE TABLE user_profiles (
    user_id VARCHAR PRIMARY KEY,
    profile_diets TEXT[] DEFAULT '{}',
    profile_allergens TEXT[] DEFAULT '{}',
    preferred_cuisines TEXT[] DEFAULT '{}',
    
    -- Macro targets
    target_calories INTEGER,
    target_protein_g NUMERIC(8,2),
    target_carbs_g NUMERIC(8,2),
    target_fat_g NUMERIC(8,2),
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Moderation System
CREATE TABLE recipe_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_user_id VARCHAR NOT NULL,
    recipe_id UUID REFERENCES recipes(id),
    user_recipe_id UUID REFERENCES user_recipes(id),
    
    category VARCHAR NOT NULL, -- 'inappropriate', 'copyright', 'nutrition', 'spam'
    reason TEXT NOT NULL,
    description TEXT,
    
    status VARCHAR DEFAULT 'open', -- 'open', 'investigating', 'resolved', 'dismissed'
    priority VARCHAR DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE recipe_report_resolutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES recipe_reports(id),
    resolved_by VARCHAR NOT NULL,
    action VARCHAR NOT NULL, -- 'dismiss', 'remove_content', 'warn_user', 'ban_user'
    reason TEXT NOT NULL,
    notes TEXT,
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Admin and Security
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    at TIMESTAMP DEFAULT NOW(),
    actor_user_id VARCHAR NOT NULL,
    action VARCHAR NOT NULL,
    target_table VARCHAR NOT NULL,
    target_id VARCHAR NOT NULL,
    diff JSONB, -- { before: {...}, after: {...} }
    reason TEXT,
    ip VARCHAR,
    ua TEXT -- User agent
);

CREATE TABLE idempotency_keys (
    key VARCHAR PRIMARY KEY,
    method VARCHAR NOT NULL,
    path TEXT NOT NULL,
    request_hash VARCHAR NOT NULL,
    response_status INTEGER,
    response_body JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP
);

-- Legacy users table (for compatibility)
CREATE TABLE users (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
);

-- Indexes for performance
CREATE INDEX idx_recipes_status ON recipes(status);
CREATE INDEX idx_recipes_market ON recipes(market_country);
CREATE INDEX idx_recipes_updated_at ON recipes(updated_at);
CREATE INDEX idx_recipes_cuisines ON recipes USING GIN(cuisines);
CREATE INDEX idx_recipes_diet_tags ON recipes USING GIN(diet_tags);
CREATE INDEX idx_recipes_allergens ON recipes USING GIN(allergens);

CREATE INDEX idx_user_recipes_owner ON user_recipes(owner_user_id);
CREATE INDEX idx_user_recipes_share_slug ON user_recipes(share_slug);
CREATE INDEX idx_user_recipes_review_status ON user_recipes(review_status);
CREATE INDEX idx_user_recipes_submitted_at ON user_recipes(submitted_at);

CREATE INDEX idx_saved_recipes_user ON saved_recipes(user_id);
CREATE INDEX idx_saved_recipes_saved_at ON saved_recipes(saved_at);

CREATE INDEX idx_recipe_history_user_recipe_event ON recipe_history(user_id, recipe_id, event);
CREATE INDEX idx_recipe_history_user_event_at ON recipe_history(user_id, event, at);
CREATE INDEX idx_recipe_history_recipe_event_at ON recipe_history(recipe_id, event, at);

CREATE INDEX idx_recipe_reports_status ON recipe_reports(status);
CREATE INDEX idx_recipe_reports_priority ON recipe_reports(priority);
CREATE INDEX idx_recipe_reports_created_at ON recipe_reports(created_at);

CREATE INDEX idx_report_resolutions_report ON recipe_report_resolutions(report_id);
CREATE INDEX idx_report_resolutions_resolved_by ON recipe_report_resolutions(resolved_by);

CREATE INDEX idx_audit_log_at ON audit_log(at);
CREATE INDEX idx_audit_log_actor ON audit_log(actor_user_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_target ON audit_log(target_table, target_id);

CREATE INDEX idx_idempotency_created_at ON idempotency_keys(created_at);
