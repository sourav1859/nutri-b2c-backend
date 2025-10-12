-- Strict recommendation helpers: profile safety gate and health reasons

-- Safety: if an earlier version exists with different parameter names, drop it first
DROP FUNCTION IF EXISTS recipe_is_safe_for_profile(recipes, text[], text[], text[], text[]);
DROP FUNCTION IF EXISTS build_health_reasons(recipes, text[], text[]);

-- Function: recipe_is_safe_for_profile
-- Ensures a recipe respects diets (subset), excludes allergens and disliked ingredients,
-- and applies conservative health-condition constraints.
CREATE OR REPLACE FUNCTION recipe_is_safe_for_profile(
  recipe recipes,
  diets TEXT[],
  allergens TEXT[],
  dislikes TEXT[],
  conditions TEXT[]
)
RETURNS BOOLEAN AS $$
DECLARE
  diet_ok BOOLEAN := TRUE;
  allergen_ok BOOLEAN := TRUE;
  dislike_ok BOOLEAN := TRUE;
  cond_ok BOOLEAN := TRUE;
  d TEXT;
  -- normalized (lower-cased) arrays for case-insensitive matching
  r_diets TEXT[] := '{}';
  r_allergens TEXT[] := '{}';
  ndiets TEXT[] := '{}';
  nallergens TEXT[] := '{}';
  ndislikes TEXT[] := '{}';
  nconditions TEXT[] := '{}';
  -- diets that imply hard dietary restrictions (exclusionary)
  strict_diet_selected TEXT[] := '{}';
BEGIN
  -- Lowercase normalize all arrays (recipe + inputs) for robust matching
  SELECT COALESCE(array_agg(lower(x)), '{}') INTO r_diets FROM unnest(COALESCE(recipe.diet_tags, '{}')) AS x;
  SELECT COALESCE(array_agg(lower(x)), '{}') INTO r_allergens FROM unnest(COALESCE(recipe.allergens, '{}')) AS x;
  SELECT COALESCE(array_agg(lower(x)), '{}') INTO ndiets FROM unnest(COALESCE(diets, '{}')) AS x;
  SELECT COALESCE(array_agg(lower(x)), '{}') INTO nallergens FROM unnest(COALESCE(allergens, '{}')) AS x;
  SELECT COALESCE(array_agg(lower(x)), '{}') INTO ndislikes FROM unnest(COALESCE(dislikes, '{}')) AS x;
  SELECT COALESCE(array_agg(lower(x)), '{}') INTO nconditions FROM unnest(COALESCE(conditions, '{}')) AS x;

  -- Diets: gate only on STRICT diets (vegetarian/vegan/etc.). Performance-friendly list inline.
  SELECT COALESCE(array_agg(x), '{}') INTO strict_diet_selected
  FROM unnest(ndiets) AS x
  WHERE x = ANY(ARRAY['vegetarian','vegan','pescatarian','lacto-vegetarian','ovo-vegetarian','lacto_ovo_vegetarian','lacto vegetarian','ovo vegetarian']);

  IF array_length(strict_diet_selected, 1) IS NOT NULL AND array_length(strict_diet_selected, 1) > 0 THEN
    diet_ok := (r_diets && strict_diet_selected);
  END IF;

  -- Allergens: if provided, recipe must NOT contain any
  IF array_length(nallergens, 1) IS NOT NULL AND array_length(nallergens, 1) > 0 THEN
    allergen_ok := NOT (r_allergens && nallergens);
  END IF;

  -- Disliked ingredients: basic contains check on ingredient names/text
  IF array_length(ndislikes, 1) IS NOT NULL AND array_length(ndislikes, 1) > 0 THEN
    IF recipe.ingredients IS NOT NULL THEN
      FOR d IN SELECT unnest(ndislikes) LOOP
        IF EXISTS (
          SELECT 1
          FROM jsonb_array_elements(recipe.ingredients) AS it
          WHERE lower(COALESCE(it->>'name', it::text)) LIKE '%' || d || '%'
        ) THEN
          dislike_ok := FALSE;
          EXIT;
        END IF;
      END LOOP;
    END IF;
  END IF;

  -- Health conditions: conservative defaults
  -- diabetes: cap sugar; hypertension: cap sodium; high_cholesterol: cap sat fat
  IF array_length(nconditions, 1) IS NOT NULL AND array_length(nconditions, 1) > 0 THEN
    IF 'diabetes' = ANY(nconditions) THEN
      IF recipe.sugar_g IS NOT NULL AND recipe.sugar_g > 10 THEN
        cond_ok := FALSE;
      END IF;
    END IF;
    IF 'hypertension' = ANY(nconditions) THEN
      IF recipe.sodium_mg IS NOT NULL AND recipe.sodium_mg > 600 THEN
        cond_ok := FALSE;
      END IF;
    END IF;
    IF 'high_cholesterol' = ANY(nconditions) OR 'hyperlipidemia' = ANY(nconditions) THEN
      IF recipe.saturated_fat_g IS NOT NULL AND recipe.saturated_fat_g > 8 THEN
        cond_ok := FALSE;
      END IF;
    END IF;
  END IF;

  RETURN diet_ok AND allergen_ok AND dislike_ok AND cond_ok;
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- Function: build_health_reasons
-- Adds human-readable reasons tied to allergens/conditions
CREATE OR REPLACE FUNCTION build_health_reasons(
  recipe recipes,
  allergens TEXT[],
  conditions TEXT[]
)
RETURNS TEXT[] AS $$
DECLARE
  reasons TEXT[] := '{}';
  nallergens TEXT[] := '{}';
  nconditions TEXT[] := '{}';
BEGIN
  SELECT COALESCE(array_agg(lower(x)), '{}') INTO nallergens FROM unnest(COALESCE(allergens, '{}')) AS x;
  SELECT COALESCE(array_agg(lower(x)), '{}') INTO nconditions FROM unnest(COALESCE(conditions, '{}')) AS x;

  IF array_length(nallergens, 1) IS NOT NULL AND array_length(nallergens, 1) > 0 THEN
    IF NOT (COALESCE((SELECT array_agg(lower(x)) FROM unnest(COALESCE(recipe.allergens,'{}')) AS x), '{}') && nallergens) THEN
      reasons := array_append(reasons, 'Avoids your allergens');
    END IF;
  END IF;

  IF array_length(nconditions, 1) IS NOT NULL AND array_length(nconditions, 1) > 0 THEN
    IF 'diabetes' = ANY(nconditions) AND recipe.sugar_g IS NOT NULL AND recipe.sugar_g <= 10 THEN
      reasons := array_append(reasons, 'Diabetes-friendly (low sugar)');
    END IF;
    IF 'hypertension' = ANY(nconditions) AND recipe.sodium_mg IS NOT NULL AND recipe.sodium_mg <= 600 THEN
      reasons := array_append(reasons, 'Lower sodium option');
    END IF;
    IF ('high_cholesterol' = ANY(nconditions) OR 'hyperlipidemia' = ANY(nconditions))
       AND recipe.saturated_fat_g IS NOT NULL AND recipe.saturated_fat_g <= 8 THEN
      reasons := array_append(reasons, 'Lower saturated fat');
    END IF;
  END IF;

  RETURN reasons;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
