import { db, executeRaw } from "../config/database.js";
import { userProfiles, recipes } from "../../shared/schema.js";
import { eq } from "drizzle-orm";

export interface FeedResult {
  recipe: any;
  score: number;
  reasons: string[];
}

type StrictPrefs = {
  diets: string[];
  allergens: string[];
  cuisines: string[];
  dislikes: string[];
  conditions: string[];
};

async function getStrictPrefs(userId: string): Promise<StrictPrefs> {
  // Fetch profile prefs (always exists in schema)
  const base = await executeRaw<Pick<StrictPrefs, 'diets' | 'allergens' | 'cuisines'>>(
    `
    select
      coalesce(profile_diets, '{}')      as diets,
      coalesce(profile_allergens, '{}')  as allergens,
      coalesce(preferred_cuisines, '{}') as cuisines
    from user_profiles
    where user_id = $1
    limit 1
    `,
    [userId]
  );

  const out: StrictPrefs = base[0] ?? { diets: [], allergens: [], cuisines: [], dislikes: [], conditions: [] };

  // Try to fetch health profile; if table/columns don’t exist, default silently
  try {
    const hp = await executeRaw<Pick<StrictPrefs, 'dislikes' | 'conditions'>>(
      `
      select
        coalesce(disliked_ingredients, '{}') as dislikes,
        coalesce(major_conditions, '{}')     as conditions
      from health_profiles
      where user_id = $1
      limit 1
      `,
      [userId]
    );
    if (hp[0]) {
      out.dislikes = hp[0].dislikes ?? [];
      out.conditions = hp[0].conditions ?? [];
    }
  } catch (_err) {
    // health_profiles may not exist in some deployments; proceed with defaults
    out.dislikes = out.dislikes ?? [];
    out.conditions = out.conditions ?? [];
  }

  return out;
}

export async function getPersonalizedFeed(
  userId: string,
  limit: number = 200,
  offset: number = 0
): Promise<FeedResult[]> {
  try {
    const prefs = await getStrictPrefs(userId);
    // Pass 1: strict (diets any-of, allergens/dislikes hard, condition caps hard)
    const strictRows = await executeRaw(
      `
      with prefs as (
        select
          $1::text[] as diets,
          $2::text[] as allergens,
          $3::text[] as cuisines,
          $4::text[] as dislikes,
          $5::text[] as conditions
      ),
      candidates as (
        select r.*
        from recipes r, prefs p
        where r.status = 'published'
          and r.market_country = 'US'
          and recipe_is_safe_for_profile(r, (select diets from prefs), (select allergens from prefs), (select dislikes from prefs), (select conditions from prefs))
          and not exists (
            select 1 from recipe_history rh
            where rh.user_id = $8
              and rh.recipe_id = r.id
              and rh.event = 'viewed'
              and rh.at > now() - interval '48 hours'
          )
      )
      select
        to_jsonb(c.*) as recipe,
        (
          0.25 * public.cuisine_preference_score(c.cuisines, (select cuisines from prefs)) +
          0.20 * public.macro_fit_score(c, $8) +
          0.20 * public.recency_score(c.updated_at) +
          0.20 * public.popularity_score(p.cooked_30d) +
          0.15 * public.health_nudge_score(c) -
          0.30 * public.recent_view_penalty(c.id, $8)
        ) as score,
        public.build_feed_reasons(c, (select diets from prefs), (select cuisines from prefs))
          || public.build_health_reasons(c, (select allergens from prefs), (select conditions from prefs))
          as reasons
      from candidates c
      left join lateral (
        select count(*)::int as cooked_30d
        from recipe_history rh
        where rh.recipe_id = c.id
          and rh.event = 'cooked'
          and rh.at > now() - interval '30 days'
      ) p on true
      order by score desc, c.updated_at desc, c.id asc
      limit $6 offset $7
      `,
      [
        prefs.diets,
        prefs.allergens,
        prefs.cuisines,
        prefs.dislikes,
        prefs.conditions,
        limit,
        offset,
        userId,
      ]
    );
    const strict = strictRows.map((row: any) => ({
      recipe: row.recipe,
      score: Number(row.score ?? 0),
      reasons: Array.isArray(row.reasons) ? row.reasons : [],
    }));

    if (strict.length >= limit) return strict;

    // Pass 2: balanced (only allergens/dislikes hard; conditions become soft via reasons; diets used for scoring only)
    const excludeIds = strict.map((r) => r.recipe.id);
    const balancedRows = await executeRaw(
      `
      with prefs as (
        select
          $1::text[] as diets,
          $2::text[] as allergens,
          $3::text[] as cuisines,
          $4::text[] as dislikes
      )
      select
        to_jsonb(r.*) as recipe,
        (
          0.20 * public.diet_match_score(r.diet_tags, (select diets from prefs)) +
          0.25 * public.cuisine_preference_score(r.cuisines, (select cuisines from prefs)) +
          0.15 * public.macro_fit_score(r, $7) +
          0.20 * public.recency_score(r.updated_at) +
          0.20 * public.popularity_score(p.cooked_30d)
        ) as score,
        public.build_feed_reasons(r, (select diets from prefs), (select cuisines from prefs)) as reasons
      from recipes r
      left join lateral (
        select count(*)::int as cooked_30d
        from recipe_history rh
        where rh.recipe_id = r.id
          and rh.event = 'cooked'
          and rh.at > now() - interval '30 days'
      ) p on true
      where r.status='published' and r.market_country='US'
        and recipe_is_safe_for_profile(r, (select diets from prefs), (select allergens from prefs), (select dislikes from prefs), '{}'::text[])
        and ($6::uuid[] is null or not (r.id = any($6::uuid[])))
      order by score desc, r.updated_at desc, r.id asc
      limit $5
      `,
      [
        prefs.diets,
        prefs.allergens,
        prefs.cuisines,
        prefs.dislikes,
        Math.max(limit * 2, 400), // overfetch to cover dedupe
        excludeIds.length ? excludeIds : null,
        userId,
      ]
    );
    const balanced = balancedRows
      .map((row: any) => ({ recipe: row.recipe, score: Number(row.score ?? 0), reasons: row.reasons ?? [] }))
      .filter((r: any) => !excludeIds.includes(r.recipe.id));

    const combined = [...strict, ...balanced].slice(0, limit);
    if (combined.length >= limit) return combined;

    // Pass 3: popularity fallback (allergens/dislikes hard only), exclude already chosen
    const exclude2 = combined.map((r) => r.recipe.id);
    const remaining = limit - combined.length;
    const fallbackRows = await executeRaw(
      `
      select to_jsonb(r.*) as recipe,
             coalesce(mv.cooked_30d,0) * 1.0 as score,
             ARRAY['Popular this month']::text[] as reasons
      from recipes r
      left join lateral (
        select count(*)::int as cooked_30d
        from recipe_history rh
        where rh.recipe_id = r.id
          and rh.event = 'cooked'
          and rh.at > now() - interval '30 days'
      ) mv on true
      where r.status='published' and r.market_country='US'
        and recipe_is_safe_for_profile(r, $1::text[], $2::text[], '{}'::text[], '{}'::text[])
        and ($3::uuid[] is null or not (r.id = any($3::uuid[])))
      order by mv.cooked_30d desc nulls last, r.updated_at desc, r.id asc
      limit $4
      `,
      [prefs.diets, prefs.allergens, exclude2.length ? exclude2 : null, Math.max(remaining * 2, remaining)]
    );
    const fallback = fallbackRows
      .map((row: any) => ({ recipe: row.recipe, score: Number(row.score ?? 0), reasons: row.reasons ?? [] }))
      .filter((r: any) => !exclude2.includes(r.recipe.id));

    return [...combined, ...fallback].slice(0, limit);
  } catch (error) {
    console.error("Personalized feed error:", error);
    throw new Error("Failed to generate personalized feed");
  }
}

export async function getUserProfile(userId: string) {
  const profile = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  
  return profile[0] || null;
}

export async function createOrUpdateUserProfile(userId: string, profileData: any) {
  const existing = await getUserProfile(userId);
  
  if (existing) {
    await db
      .update(userProfiles)
      .set({
        ...profileData,
        updatedAt: new Date(),
      })
      .where(eq(userProfiles.userId, userId));
  } else {
    await db.insert(userProfiles).values({
      userId,
      ...profileData,
    });
  }
  
  return getUserProfile(userId);
}

export async function getFeedRecommendations(userId: string): Promise<{
  trending: any[];
  forYou: FeedResult[];
  recent: any[];
}> {
  try {
    // Get trending recipes (popular in last 7 days)
    const trending = await executeRaw(`
      SELECT r.*, COUNT(rh.id) as recent_activity
      FROM recipes r
      LEFT JOIN recipe_history rh ON r.id = rh.recipe_id 
        AND rh.event = 'cooked' 
        AND rh.at > NOW() - INTERVAL '7 days'
      WHERE r.status = 'published' AND r.market_country = 'US'
      GROUP BY r.id
      ORDER BY recent_activity DESC, r.updated_at DESC
      LIMIT 10
    `);
    
    // Get personalized recommendations
    const forYou = await getPersonalizedFeed(userId, 20);
    
    // Get recently published recipes
    const recent = await db
      .select()
      .from(recipes)
      .where(eq(recipes.status, "published"))
      .orderBy(recipes.publishedAt)
      .limit(10);
    
    return {
      trending,
      forYou,
      recent,
    };
  } catch (error) {
    console.error("Feed recommendations error:", error);
    throw new Error("Failed to get feed recommendations");
  }
}
