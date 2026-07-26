import { ENGINE_VERSION } from "../config.js";
import { fetchAllRows, throwIfSupabaseError } from "./supabaseHelpers.js";

function isMissingCalibrationTable(error) {
  const message = String(error?.message || error || "");
  return /42P01|does not exist|schema cache/i.test(message) &&
    /engine_pick_results|engine_calibration_profiles/i.test(message);
}

function wilsonLowerBound(wins, total, z = 1.96) {
  if (!total) return 0;
  const p = wins / total;
  const z2 = z * z;
  const centre = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  return Math.max(0, (centre - margin) / (1 + z2 / total));
}

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

export async function saveEnginePickResults(supabase, rows = []) {
  if (!rows.length) {
    return { saved: 0, calibrationProfiles: 0, warning: null };
  }

  try {
    const { error } = await supabase
      .from("engine_pick_results")
      .upsert(rows, { onConflict: "prediction_id,engine_key" });
    throwIfSupabaseError(error, "Unable to save per-engine pick results");
  } catch (error) {
    if (isMissingCalibrationTable(error)) {
      return {
        saved: 0,
        calibrationProfiles: 0,
        warning: "Run supabase/BETSPAPA_V1_21_0_PAPASENSE_V2.sql to enable per-engine calibration."
      };
    }
    throw error;
  }

  const calibration = await refreshCalibrationProfiles(supabase);
  return {
    saved: rows.length,
    calibrationProfiles: calibration.profiles,
    warning: calibration.warning
  };
}

export async function refreshCalibrationProfiles(supabase) {
  let rows;
  try {
    rows = await fetchAllRows(() =>
      supabase
        .from("engine_pick_results")
        .select("engine_key,market_key,outcome,confidence,league_id")
        .eq("engine_version", ENGINE_VERSION)
    );
  } catch (error) {
    if (isMissingCalibrationTable(error)) {
      return {
        profiles: 0,
        warning: "Calibration tables are not installed."
      };
    }
    throw error;
  }

  const groups = new Map();
  const addToGroup = (row, scopeKey, leagueId = null) => {
    const key = `${row.engine_key}:${row.market_key}:${scopeKey}`;
    if (!groups.has(key)) {
      groups.set(key, {
        engineKey: row.engine_key,
        marketKey: row.market_key,
        scopeKey,
        leagueId,
        wins: 0,
        losses: 0,
        voids: 0,
        brierTotal: 0,
        brierCount: 0
      });
    }
    const group = groups.get(key);
    if (row.outcome === "WIN") group.wins += 1;
    else if (row.outcome === "LOSS") group.losses += 1;
    else if (row.outcome === "VOID") group.voids += 1;

    if (row.outcome === "WIN" || row.outcome === "LOSS") {
      const probability = Math.max(0, Math.min(1, Number(row.confidence || 0) / 100));
      const actual = row.outcome === "WIN" ? 1 : 0;
      group.brierTotal += (probability - actual) ** 2;
      group.brierCount += 1;
    }
  };

  for (const row of rows) {
    addToGroup(row, "GLOBAL", null);
    if (row.league_id !== null && row.league_id !== undefined) {
      addToGroup(row, `LEAGUE:${row.league_id}`, Number(row.league_id));
    }
  }

  const now = new Date().toISOString();
  const profiles = [...groups.values()].map((group) => {
    const sampleCount = group.wins + group.losses;
    const observed = sampleCount ? group.wins / sampleCount : 0;
    return {
      engine_version: ENGINE_VERSION,
      engine_key: group.engineKey,
      market_key: group.marketKey,
      scope_key: group.scopeKey,
      league_id: group.leagueId,
      sample_count: sampleCount,
      wins: group.wins,
      losses: group.losses,
      voids: group.voids,
      observed_hit_rate: round(observed),
      lower_bound: round(wilsonLowerBound(group.wins, sampleCount)),
      brier_score: group.brierCount
        ? round(group.brierTotal / group.brierCount)
        : null,
      last_calibrated_at: now,
      updated_at: now
    };
  });

  if (!profiles.length) return { profiles: 0, warning: null };

  try {
    const { error } = await supabase
      .from("engine_calibration_profiles")
      .upsert(profiles, {
        onConflict: "engine_version,engine_key,market_key,scope_key"
      });
    throwIfSupabaseError(error, "Unable to save calibration profiles");
  } catch (error) {
    if (isMissingCalibrationTable(error)) {
      return {
        profiles: 0,
        warning: "Calibration profile table is not installed."
      };
    }
    throw error;
  }

  return { profiles: profiles.length, warning: null };
}
