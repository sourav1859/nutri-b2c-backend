-- Materialized views for B2C Nutrition App

-- Recipe popularity view (30-day window)
CREATE MATERIALIZED VIEW mv_recipe_popularity_30d AS
SELECT 
    recipe_id,
    COUNT(*) as cooked_30d,
    COUNT(DISTINCT user_id) as unique_users_30d,
    MAX(at) as last_cooked_at
FROM recipe_history 
WHERE event = 'cooked' 
    AND at > NOW() - INTERVAL '30 days'
GROUP BY recipe_id;

-- Create unique index required for concurrent refresh
CREATE UNIQUE INDEX idx_mv_recipe_popularity_recipe_id 
ON mv_recipe_popularity_30d (recipe_id);

-- Additional performance indexes
CREATE INDEX idx_mv_recipe_popularity_cooked_30d 
ON mv_recipe_popularity_30d (cooked_30d DESC);

-- User engagement summary view
CREATE MATERIALIZED VIEW mv_user_engagement_7d AS
SELECT 
    user_id,
    COUNT(*) as total_events,
    COUNT(DISTINCT recipe_id) as unique_recipes,
    COUNT(CASE WHEN event = 'viewed' THEN 1 END) as views,
    COUNT(CASE WHEN event = 'cooked' THEN 1 END) as cooks,
    COUNT(CASE WHEN event = 'shared' THEN 1 END) as shares,
    MAX(at) as last_activity_at
FROM recipe_history 
WHERE at > NOW() - INTERVAL '7 days'
GROUP BY user_id;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX idx_mv_user_engagement_user_id 
ON mv_user_engagement_7d (user_id);

-- Recipe performance metrics view
CREATE MATERIALIZED VIEW mv_recipe_metrics_30d AS
SELECT 
    r.id as recipe_id,
    r.title,
    r.status,
    r.published_at,
    COALESCE(rh_stats.total_views, 0) as total_views,
    COALESCE(rh_stats.total_cooks, 0) as total_cooks,
    COALESCE(rh_stats.unique_viewers, 0) as unique_viewers,
    COALESCE(sr_stats.total_saves, 0) as total_saves,
    -- Cook-to-view ratio (engagement metric)
    CASE 
        WHEN COALESCE(rh_stats.total_views, 0) > 0 
        THEN COALESCE(rh_stats.total_cooks, 0)::NUMERIC / rh_stats.total_views 
        ELSE 0 
    END as cook_rate,
    -- Save-to-view ratio
    CASE 
        WHEN COALESCE(rh_stats.total_views, 0) > 0 
        THEN COALESCE(sr_stats.total_saves, 0)::NUMERIC / rh_stats.total_views 
        ELSE 0 
    END as save_rate
FROM recipes r
LEFT JOIN (
    SELECT 
        recipe_id,
        COUNT(*) as total_views,
        COUNT(CASE WHEN event = 'cooked' THEN 1 END) as total_cooks,
        COUNT(DISTINCT user_id) as unique_viewers
    FROM recipe_history 
    WHERE at > NOW() - INTERVAL '30 days'
    GROUP BY recipe_id
) rh_stats ON r.id = rh_stats.recipe_id
LEFT JOIN (
    SELECT 
        recipe_id,
        COUNT(*) as total_saves
    FROM saved_recipes 
    WHERE saved_at > NOW() - INTERVAL '30 days'
    GROUP BY recipe_id
) sr_stats ON r.id = sr_stats.recipe_id
WHERE r.status = 'published';

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX idx_mv_recipe_metrics_recipe_id 
ON mv_recipe_metrics_30d (recipe_id);

-- Additional performance indexes
CREATE INDEX idx_mv_recipe_metrics_cook_rate 
ON mv_recipe_metrics_30d (cook_rate DESC);

CREATE INDEX idx_mv_recipe_metrics_save_rate 
ON mv_recipe_metrics_30d (save_rate DESC);

CREATE INDEX idx_mv_recipe_metrics_total_views 
ON mv_recipe_metrics_30d (total_views DESC);
