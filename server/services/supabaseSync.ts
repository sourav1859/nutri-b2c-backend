import { supabase } from "../config/supabase";

export async function upsertProfileFromAppwrite(params: {
  appwriteId: string;
  profile: { displayName?: string | null; imageUrl?: string | null; phone?: string | null; country?: string | null };
  account?: { email?: string | null; name?: string | null };
}) {
  const row = {
    user_id: params.appwriteId, // Option A
    email: params.account?.email ?? null,
    name: params.account?.name ?? null,
    display_name: params.profile.displayName ?? null,
    image_url: params.profile.imageUrl ?? null,
    phone: params.profile.phone ?? null,
    country: params.profile.country ?? null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("user_profiles").upsert(row, { onConflict: "user_id" });
  if (error) throw error;
}

export async function upsertHealthFromAppwrite(params: {
  appwriteId: string;
  health: any;
}) {
  const hw = normalizeHW(params.health);

  const row = {
    user_id: params.appwriteId, // Option A
    date_of_birth: params.health.dateOfBirth ?? null,
    sex: params.health.sex ?? null,
    activity_level: params.health.activityLevel ?? null,
    goal: params.health.goal ?? null,
    diets: params.health.diets ?? [],
    allergens: params.health.allergens ?? [],
    intolerances: params.health.intolerances ?? [],
    disliked_ingredients: params.health.dislikedIngredients ?? [],
    onboarding_complete: params.health.onboardingComplete ?? true,

    // Mirror strings to Supabase
    height_display: hw.height_display,
    weight_display: hw.weight_display,
    major_conditions: params.health.majorConditions ?? params.health.major_conditions ?? [],
    // Optional numerics if columns exist (see SQL below)
    // height_cm: hw.height_cm,
    // weight_kg: hw.weight_kg,

    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("health_profiles")
    .upsert(row, { onConflict: "user_id" });

  if (error) {
    // Better visibility while we finish the DB migration
    console.error("[SUPABASE] upsert health_profiles failed", {
      code: (error as any).code,
      details: (error as any).details,
      hint: (error as any).hint,
      message: (error as any).message,
    });
    throw error;
  }
}

function normalizeHW(h: any) {
  const parse = (v: any) => {
    if (!v) return { display: null, value: null, unit: null };
    if (typeof v === "string") {
      const m = v.trim().match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)$/);
      if (m) return { display: `${m[1]} ${m[2]}`, value: Number(m[1]), unit: m[2].toLowerCase() };
      return { display: v.trim(), value: null, unit: null };
    }
    if (typeof v === "object" && v.value != null && v.unit) {
      const num = Number(v.value); const unit = String(v.unit).toLowerCase();
      if (Number.isFinite(num)) return { display: `${num} ${unit}`, value: num, unit };
    }
    return { display: null, value: null, unit: null };
  };

  const hh = parse(h.height);
  const ww = parse(h.weight);

  const toCm = (val: number | null, unit: string | null) =>
    val == null ? null : unit === "ft" ? Math.round(val * 30.48 * 100) / 100 : unit === "cm" ? val : null;
  const toKg = (val: number | null, unit: string | null) =>
    val == null ? null : (unit === "lb" || unit === "lbs") ? Math.round(val * 0.45359237 * 1000) / 1000 : unit === "kg" ? val : null;

  return {
    height_display: hh.display,
    weight_display: ww.display,
    height_cm: toCm(hh.value, hh.unit),
    weight_kg: toKg(ww.value, ww.unit),
  };
}
