-- Cron jobs setup for B2C Nutrition App
-- Requires pg_cron extension

-- Schedule materialized view refresh every 5 minutes
SELECT cron.schedule(
    'refresh-popularity-mv',
    '*/5 * * * *', -- Every 5 minutes
    'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_recipe_popularity_30d;'
);

-- Schedule user engagement view refresh every hour
SELECT cron.schedule(
    'refresh-user-engagement-mv',
    '0 * * * *', -- Every hour
    'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_user_engagement_7d;'
);

-- Schedule recipe metrics view refresh every 15 minutes
SELECT cron.schedule(
    'refresh-recipe-metrics-mv',
    '*/15 * * * *', -- Every 15 minutes
    'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_recipe_metrics_30d;'
);

-- Cleanup old idempotency keys daily at 2 AM
SELECT cron.schedule(
    'cleanup-idempotency',
    '0 2 * * *', -- Daily at 2 AM
    'DELETE FROM idempotency_keys WHERE created_at < NOW() - INTERVAL ''24 hours'';'
);

-- Cleanup old audit logs (keep 90 days) weekly
SELECT cron.schedule(
    'cleanup-audit-logs',
    '0 3 * * 0', -- Weekly on Sunday at 3 AM
    'DELETE FROM audit_log WHERE at < NOW() - INTERVAL ''90 days'';'
);

-- Cleanup old recipe history (keep 1 year for analytics) monthly
SELECT cron.schedule(
    'cleanup-recipe-history',
    '0 4 1 * *', -- Monthly on 1st at 4 AM
    'DELETE FROM recipe_history WHERE at < NOW() - INTERVAL ''1 year'';'
);

-- Update recipe search vectors for any recipes that may have missed triggers
SELECT cron.schedule(
    'update-search-vectors',
    '0 1 * * *', -- Daily at 1 AM
    'UPDATE recipes SET updated_at = NOW() WHERE tsv IS NULL AND status = ''published'';'
);
