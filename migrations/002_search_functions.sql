-- Search functions and procedures for B2C Nutrition App

-- Helper functions for search scoring
CREATE OR REPLACE FUNCTION diet_match_score(recipe_diets TEXT[], search_diets TEXT[])
RETURNS NUMERIC AS $$
BEGIN
    IF array_length(search_diets, 1) IS NULL OR array_length(search_diets, 1) = 0 THEN
        RETURN 0;
    END IF;
    
    -- Count matching diets
    RETURN (
        SELECT COUNT(*)::NUMERIC / array_length(search_diets, 1)
        FROM unnest(search_diets) AS diet
        WHERE diet = ANY(recipe_diets)
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION cuisine_match_score(recipe_cuisines TEXT[], search_cuisines TEXT[])
RETURNS NUMERIC AS $$
BEGIN
    IF array_length(search_cuisines, 1) IS NULL OR array_length(search_cuisines, 1) = 0 THEN
        RETURN 0;
    END IF;
    
    -- Check for any matching cuisine (OR semantics)
    RETURN CASE 
        WHEN recipe_cuisines && search_cuisines THEN 1.0
        ELSE 0.0
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION recency_score(updated_at TIMESTAMP)
RETURNS NUMERIC AS $$
DECLARE
    days_old NUMERIC;
BEGIN
    days_old := EXTRACT(EPOCH FROM (NOW() - updated_at)) / (24 * 3600);
    -- Exponential decay: newer recipes score higher
    RETURN EXP(-days_old / 30.0); -- Half-life of 30 days
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION popularity_score(cooked_30d INTEGER)
RETURNS NUMERIC AS $$
BEGIN
    -- Logarithmic scaling of popularity
    RETURN CASE 
        WHEN cooked_30d IS NULL OR cooked_30d = 0 THEN 0
        ELSE LN(1 + cooked_30d) / 10.0
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION repeat_penalty(recipe_id UUID)
RETURNS NUMERIC AS $$
BEGIN
    -- TODO: Implement based on current user's recent views
    -- For now, return 0 (no penalty)
    RETURN 0;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION build_reasons_array(
    recipe recipes,
    search_diets TEXT[],
    search_cuisines TEXT[],
    search_query TEXT
)
RETURNS TEXT[] AS $$
DECLARE
    reasons TEXT[] := '{}';
BEGIN
    -- Text match reason
    IF search_query IS NOT NULL AND search_query != '' THEN
        reasons := reasons || 'Matches your search terms';
    END IF;
    
    -- Diet match reasons
    IF array_length(search_diets, 1) > 0 AND recipe.diet_tags && search_diets THEN
        reasons := reasons || 'Matches your dietary preferences';
    END IF;
    
    -- Cuisine match reasons
    IF array_length(search_cuisines, 1) > 0 AND recipe.cuisines && search_cuisines THEN
        reasons := reasons || 'Matches your cuisine preferences';
    END IF;
    
    -- Nutrition highlights
    IF recipe.protein_g > 20 THEN
        reasons := reasons || 'High protein';
    END IF;
    
    IF recipe.fiber_g > 5 THEN
        reasons := reasons || 'High fiber';
    END IF;
    
    IF recipe.calories < 400 THEN
        reasons := reasons || 'Lower calorie option';
    END IF;
    
    RETURN reasons;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Main search function with deterministic ranking
CREATE OR REPLACE FUNCTION search_recipes(
    q TEXT DEFAULT NULL,
    diets TEXT[] DEFAULT '{}',
    cuisines TEXT[] DEFAULT '{}',
    allergens_exclude TEXT[] DEFAULT '{}',
    cal_min INTEGER DEFAULT NULL,
    cal_max INTEGER DEFAULT NULL,
    protein_min NUMERIC DEFAULT NULL,
    sugar_max NUMERIC DEFAULT NULL,
    sodium_max INTEGER DEFAULT NULL,
    fiber_min NUMERIC DEFAULT NULL,
    satfat_max NUMERIC DEFAULT NULL,
    time_max INTEGER DEFAULT NULL,
    difficulty TEXT DEFAULT NULL,
    meal_type TEXT DEFAULT NULL,
    lim INTEGER DEFAULT 50,
    offs INTEGER DEFAULT 0
)
RETURNS TABLE(
    recipe JSONB,
    score NUMERIC,
    reasons TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        to_jsonb(r.*) as recipe,
        (
            0.45 * COALESCE(ts_rank_cd(r.tsv, plainto_tsquery('english', q)), 0) +
            0.25 * diet_match_score(r.diet_tags, diets) +
            0.10 * cuisine_match_score(r.cuisines, cuisines) +
            0.10 * recency_score(r.updated_at) +
            0.10 * popularity_score(p.cooked_30d) -
            0.10 * repeat_penalty(r.id)
        ) as score,
        build_reasons_array(r.*, diets, cuisines, q) as reasons
    FROM recipes r
    LEFT JOIN mv_recipe_popularity_30d p ON r.id = p.recipe_id
    WHERE r.status = 'published'
        AND r.market_country = 'US'
        -- Hard constraints (NEVER relax these)
        AND (diets = '{}' OR r.diet_tags @> diets)
        AND (allergens_exclude = '{}' OR NOT r.allergens && allergens_exclude)
        -- Nutrition filters
        AND (cal_min IS NULL OR r.calories >= cal_min)
        AND (cal_max IS NULL OR r.calories <= cal_max)
        AND (protein_min IS NULL OR r.protein_g >= protein_min)
        AND (sugar_max IS NULL OR r.sugar_g <= sugar_max)
        AND (sodium_max IS NULL OR r.sodium_mg <= sodium_max)
        AND (fiber_min IS NULL OR r.fiber_g >= fiber_min)
        AND (satfat_max IS NULL OR r.saturated_fat_g <= satfat_max)
        -- Other filters
        AND (time_max IS NULL OR r.total_time_minutes <= time_max)
        AND (difficulty IS NULL OR r.difficulty = difficulty)
        AND (meal_type IS NULL OR r.meal_type = meal_type)
        -- FTS query if provided
        AND (q IS NULL OR r.tsv @@ plainto_tsquery('english', q))
    ORDER BY score DESC, r.updated_at DESC, r.id ASC
    LIMIT lim OFFSET offs;
END;
$$ LANGUAGE plpgsql;

-- Personalized feed helper functions
CREATE OR REPLACE FUNCTION cuisine_preference_score(recipe_cuisines TEXT[], user_cuisines TEXT[])
RETURNS NUMERIC AS $$
BEGIN
    IF array_length(user_cuisines, 1) IS NULL OR array_length(user_cuisines, 1) = 0 THEN
        RETURN 0;
    END IF;
    
    RETURN CASE 
        WHEN recipe_cuisines && user_cuisines THEN 1.0
        ELSE 0.0
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION macro_fit_score(recipe recipes, user_id_param TEXT)
RETURNS NUMERIC AS $$
DECLARE
    user_targets user_profiles%ROWTYPE;
    calorie_fit NUMERIC := 0;
    protein_fit NUMERIC := 0;
BEGIN
    -- Get user's macro targets
    SELECT * INTO user_targets FROM user_profiles WHERE user_profiles.user_id = user_id_param;
    
    IF user_targets IS NULL THEN
        RETURN 0;
    END IF;
    
    -- Score based on how well recipe fits targets
    IF user_targets.target_calories IS NOT NULL AND recipe.calories IS NOT NULL THEN
        calorie_fit := 1.0 - ABS(recipe.calories - user_targets.target_calories) / user_targets.target_calories::NUMERIC;
        calorie_fit := GREATEST(0, calorie_fit);
    END IF;
    
    IF user_targets.target_protein_g IS NOT NULL AND recipe.protein_g IS NOT NULL THEN
        protein_fit := 1.0 - ABS(recipe.protein_g - user_targets.target_protein_g) / user_targets.target_protein_g::NUMERIC;
        protein_fit := GREATEST(0, protein_fit);
    END IF;
    
    RETURN (calorie_fit + protein_fit) / 2.0;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION health_nudge_score(recipe recipes)
RETURNS NUMERIC AS $$
BEGIN
    RETURN CASE 
        WHEN recipe.fiber_g > 5 THEN 0.3
        WHEN recipe.protein_g > 20 THEN 0.2
        WHEN recipe.calories < 400 THEN 0.1
        ELSE 0
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION recent_view_penalty(recipe_id UUID, user_id_param TEXT)
RETURNS NUMERIC AS $$
DECLARE
    recent_view TIMESTAMP;
BEGIN
    -- Check if user viewed this recipe recently
    SELECT MAX(at) INTO recent_view 
    FROM recipe_history 
    WHERE recipe_history.user_id = user_id_param 
        AND recipe_history.recipe_id = recent_view_penalty.recipe_id
        AND event = 'viewed'
        AND at > NOW() - INTERVAL '7 days';
    
    IF recent_view IS NOT NULL THEN
        -- Penalty based on how recent the view was
        RETURN 0.5 * EXP(-EXTRACT(EPOCH FROM (NOW() - recent_view)) / (24 * 3600));
    END IF;
    
    RETURN 0;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION build_feed_reasons(
    recipe recipes,
    user_diets TEXT[],
    user_cuisines TEXT[]
)
RETURNS TEXT[] AS $$
DECLARE
    reasons TEXT[] := '{}';
BEGIN
    -- Diet match reasons
    IF array_length(user_diets, 1) > 0 AND recipe.diet_tags && user_diets THEN
        reasons := reasons || 'Matches your diet';
    END IF;
    
    -- Cuisine preferences
    IF array_length(user_cuisines, 1) > 0 AND recipe.cuisines && user_cuisines THEN
        reasons := reasons || 'One of your favorite cuisines';
    END IF;
    
    -- Health features
    IF recipe.protein_g > 20 THEN
        reasons := reasons || 'High protein';
    END IF;
    
    IF recipe.fiber_g > 5 THEN
        reasons := reasons || 'High fiber';
    END IF;
    
    -- Trending
    reasons := reasons || 'Popular this week';
    
    RETURN reasons;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Personalized feed function
CREATE OR REPLACE FUNCTION personalized_feed(
    user_id_param TEXT,
    lim INTEGER DEFAULT 50,
    offs INTEGER DEFAULT 0
)
RETURNS TABLE(
    recipe JSONB,
    score NUMERIC,
    reasons TEXT[]
) AS $$
DECLARE
    user_diets TEXT[];
    user_allergens TEXT[];
    user_cuisines TEXT[];
BEGIN
    -- Get user preferences
    SELECT profile_diets, profile_allergens, preferred_cuisines 
    INTO user_diets, user_allergens, user_cuisines
    FROM user_profiles WHERE user_profiles.user_id = user_id_param;
    
    -- Default to empty arrays if no profile
    user_diets := COALESCE(user_diets, '{}');
    user_allergens := COALESCE(user_allergens, '{}');
    user_cuisines := COALESCE(user_cuisines, '{}');
    
    RETURN QUERY
    SELECT 
        to_jsonb(r.*) as recipe,
        (
            0.25 * cuisine_preference_score(r.cuisines, user_cuisines) +
            0.20 * macro_fit_score(r.*, user_id_param) +
            0.20 * recency_score(r.updated_at) +
            0.20 * popularity_score(p.cooked_30d) +
            0.15 * health_nudge_score(r.*) -
            0.30 * recent_view_penalty(r.id, user_id_param)
        ) as score,
        build_feed_reasons(r.*, user_diets, user_cuisines) as reasons
    FROM recipes r
    LEFT JOIN mv_recipe_popularity_30d p ON r.id = p.recipe_id
    WHERE r.status = 'published'
        AND r.market_country = 'US'
        -- Hard constraints from user profile
        AND (user_diets = '{}' OR r.diet_tags @> user_diets)
        AND (user_allergens = '{}' OR NOT r.allergens && user_allergens)
        -- Not viewed in last 48 hours
        AND NOT EXISTS (
            SELECT 1 FROM recipe_history rh 
            WHERE rh.user_id = user_id_param 
                AND rh.recipe_id = r.id 
                AND rh.event = 'viewed'
                AND rh.at > NOW() - INTERVAL '48 hours'
        )
    ORDER BY score DESC, r.updated_at DESC, r.id ASC
    LIMIT lim OFFSET offs;
END;
$$ LANGUAGE plpgsql;
