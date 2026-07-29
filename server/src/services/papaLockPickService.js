import { PAPALOCK_VERSION, buildPapaLockSlate } from "../engine/papaLockBankerEngine.js";
import { dateRangeUtc } from "../utils/date.js";
import { getAthenaPicks } from "./athenaPickService.js";
import { gradeEnginePick } from "./gradingService.js";
import { listPublicPredictions } from "./publicService.js";
import { fetchAllRows, throwIfSupabaseError } from "./supabaseHelpers.js";

const CACHE_TTL_MS = 60_000;
const cache = new Map();

function isMissingPapaLockTable(error) {
  const message = String(error?.message || error || "");
  return /42P01|does not exist|schema cache|PGRST205/i.test(message) &&
    /papalock_/i.test(message);
}

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function wilsonLowerBound(wins, total, z = 1.96) {
  if (!total) return 0;
  const p = wins / total;
  const z2 = z * z;
  const centre = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  return Math.max(0, (centre - margin) / (1 + z2 / total));
}

async function loadCalibrationProfiles(supabase) {
  try {
    return await fetchAllRows(() =>
      supabase
        .from("papalock_calibration_profiles")
        .select("story,league_id,sample_count,wins,losses,voids,observed_hit_rate,lower_bound,brier_score")
        .eq("engine_version", PAPALOCK_VERSION)
    );
  } catch (error) {
    if (isMissingPapaLockTable(error)) return [];
    throw error;
  }
}

async function persistPapaLockSlate(supabase, date, slate) {
  try {
    const now = new Date().toISOString();
    const { error: hideError } = await supabase
      .from("papalock_predictions")
      .update({ published: false, updated_at: now })
      .eq("prediction_date", date)
      .eq("engine_version", PAPALOCK_VERSION);
    throwIfSupabaseError(hideError, "Unable to reset the PapaLock slate");

    if (!slate.picks.length) {
      return { saved: 0, evidenceRows: 0, warning: null };
    }

    const rows = slate.picks.map((pick) => ({
      fixture_id: pick.internalFixtureId,
      external_fixture_id: String(pick.fixtureId),
      prediction_date: date,
      league_id: pick.league?.id || null,
      source_prediction_id: pick.sourcePredictionId || pick.id || null,
      engine_version: PAPALOCK_VERSION,
      market_key: pick.key,
      market: pick.market,
      selection: pick.selection,
      story: pick.internalAudit?.story || null,
      banker_score: Number(pick.bankerScore || 0),
      grade: pick.papaLockGrade,
      confirmation_families: Number(pick.confirmationFamilies || 0),
      status: "PENDING",
      published: true,
      public_explanation: pick.publicExplanation,
      evidence: pick.evidence || {},
      internal_audit: pick.internalAudit || {},
      created_at: now,
      updated_at: now
    }));

    const { data: savedRows, error } = await supabase
      .from("papalock_predictions")
      .upsert(rows, { onConflict: "fixture_id,engine_version" })
      .select("id,fixture_id");
    throwIfSupabaseError(error, "Unable to save PapaLock predictions");

    const idByFixture = new Map((savedRows || []).map((row) => [Number(row.fixture_id), row.id]));
    const predictionIds = [...idByFixture.values()];
    if (predictionIds.length) {
      const { error: deleteError } = await supabase
        .from("papalock_engine_evidence")
        .delete()
        .in("papalock_prediction_id", predictionIds);
      throwIfSupabaseError(deleteError, "Unable to replace PapaLock family evidence");
    }

    const evidenceRows = slate.picks.flatMap((pick) => {
      const papaLockId = idByFixture.get(Number(pick.internalFixtureId));
      if (!papaLockId) return [];
      return (pick.agreeingEngines || []).map((family) => ({
        papalock_prediction_id: papaLockId,
        family_key: family.engineKey,
        family_name: family.engineName,
        confidence: Number(family.confidence || 0),
        evidence_strength: Number(family.evidenceStrength || 0),
        contributing_picks: family.contributingEngines || [],
        created_at: now
      }));
    });

    if (evidenceRows.length) {
      const { error: evidenceError } = await supabase
        .from("papalock_engine_evidence")
        .insert(evidenceRows);
      throwIfSupabaseError(evidenceError, "Unable to save PapaLock evidence");
    }

    return { saved: rows.length, evidenceRows: evidenceRows.length, warning: null };
  } catch (error) {
    if (isMissingPapaLockTable(error)) {
      return {
        saved: 0,
        evidenceRows: 0,
        warning: "Run supabase/BETSPAPA_V1_25_0_PAPALOCK_BANKER_ENGINE.sql to persist PapaLock bankers."
      };
    }
    throw error;
  }
}

export async function buildPapaLockForDate(supabase, date, {
  limit = 3,
  persist = false
} = {}) {
  const [predictions, athena, calibrationProfiles] = await Promise.all([
    listPublicPredictions(supabase, date),
    getAthenaPicks(supabase, date),
    loadCalibrationProfiles(supabase)
  ]);

  const slate = buildPapaLockSlate(predictions, athena.picks || [], {
    limit,
    calibrationProfiles
  });
  const persistence = persist
    ? await persistPapaLockSlate(supabase, date, slate)
    : { saved: 0, evidenceRows: 0, warning: null };

  return {
    date,
    generatedAt: new Date().toISOString(),
    predictionsReviewed: predictions.length,
    athenaPicksReviewed: (athena.picks || []).length,
    calibrationProfiles: calibrationProfiles.length,
    persisted: Boolean(persist && !persistence.warning),
    persistence,
    ...slate
  };
}

export async function getPapaLockPicks(supabase, date, {
  force = false,
  limit = 3,
  persist = false
} = {}) {
  const key = `${PAPALOCK_VERSION}:${date}:${limit}`;
  if (force || persist) cache.delete(key);
  const existing = cache.get(key);
  if (!force && !persist && existing?.value && Date.now() - existing.createdAt < CACHE_TTL_MS) {
    return { ...existing.value, cached: true };
  }
  if (!force && !persist && existing?.pending) return existing.pending;

  const pending = buildPapaLockForDate(supabase, date, { limit, persist })
    .then((value) => {
      cache.set(key, { value, createdAt: Date.now() });
      return { ...value, cached: false };
    })
    .catch((error) => {
      cache.delete(key);
      throw error;
    });

  cache.set(key, { pending, createdAt: Date.now() });
  return pending;
}

export function invalidatePapaLockCache(date = null) {
  if (!date) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.includes(`:${date}:`)) cache.delete(key);
  }
}

export async function getPapaLockHistory(supabase, { limit = 30 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 30, 100));
  try {
    const rows = await fetchAllRows(() =>
      supabase
        .from("papalock_predictions")
        .select("id,fixture_id,external_fixture_id,prediction_date,league_id,engine_version,market_key,market,selection,story,banker_score,grade,confirmation_families,status,published,public_explanation,evidence,created_at,updated_at")
        .eq("engine_version", PAPALOCK_VERSION)
        .eq("published", true)
        .order("prediction_date", { ascending: false })
        .limit(safeLimit)
    );
    return { available: true, rows };
  } catch (error) {
    if (isMissingPapaLockTable(error)) {
      return {
        available: false,
        rows: [],
        warning: "PapaLock history is unavailable until the v1.25.0 Supabase migration is run."
      };
    }
    throw error;
  }
}

export async function refreshPapaLockCalibration(supabase) {
  let rows;
  try {
    rows = await fetchAllRows(() =>
      supabase
        .from("papalock_results")
        .select("story,league_id,outcome,banker_score")
        .eq("engine_version", PAPALOCK_VERSION)
    );
  } catch (error) {
    if (isMissingPapaLockTable(error)) return { profiles: 0, warning: "PapaLock tables are not installed." };
    throw error;
  }

  const groups = new Map();
  const add = (row, scopeKey, leagueId = null) => {
    const key = `${row.story}:${scopeKey}`;
    if (!groups.has(key)) {
      groups.set(key, {
        story: row.story,
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
    if (["WIN", "LOSS"].includes(row.outcome)) {
      const probability = Math.max(0, Math.min(1, Number(row.banker_score || 0) / 100));
      const actual = row.outcome === "WIN" ? 1 : 0;
      group.brierTotal += (probability - actual) ** 2;
      group.brierCount += 1;
    }
  };

  for (const row of rows) {
    add(row, "GLOBAL", null);
    if (row.league_id != null) add(row, `LEAGUE:${row.league_id}`, Number(row.league_id));
  }

  const now = new Date().toISOString();
  const profiles = [...groups.values()].map((group) => {
    const sampleCount = group.wins + group.losses;
    return {
      engine_version: PAPALOCK_VERSION,
      story: group.story,
      scope_key: group.scopeKey,
      league_id: group.leagueId,
      sample_count: sampleCount,
      wins: group.wins,
      losses: group.losses,
      voids: group.voids,
      observed_hit_rate: round(sampleCount ? group.wins / sampleCount : 0),
      lower_bound: round(wilsonLowerBound(group.wins, sampleCount)),
      brier_score: group.brierCount ? round(group.brierTotal / group.brierCount) : null,
      last_calibrated_at: now,
      updated_at: now
    };
  });

  if (!profiles.length) return { profiles: 0, warning: null };
  const { error } = await supabase
    .from("papalock_calibration_profiles")
    .upsert(profiles, { onConflict: "engine_version,story,scope_key" });
  throwIfSupabaseError(error, "Unable to save PapaLock calibration profiles");
  return { profiles: profiles.length, warning: null };
}

export async function settlePapaLockDate(supabase, date) {
  try {
    const predictionRows = await fetchAllRows(() =>
      supabase
        .from("papalock_predictions")
        .select("*")
        .eq("prediction_date", date)
        .eq("engine_version", PAPALOCK_VERSION)
        .eq("published", true)
    );
    if (!predictionRows.length) return { date, graded: 0, warning: null };

    const fixtureIds = [...new Set(predictionRows.map((row) => row.fixture_id).filter(Boolean))];
    const { data: fixtures, error: fixtureError } = await supabase
      .from("fixtures")
      .select("*")
      .in("id", fixtureIds)
      .eq("status", "FT");
    throwIfSupabaseError(fixtureError, "Unable to load finished PapaLock fixtures");
    if (!fixtures?.length) return { date, graded: 0, warning: null };

    const teamIds = [...new Set(fixtures.flatMap((fixture) => [fixture.home_team_id, fixture.away_team_id]).filter(Boolean))];
    const { data: teams, error: teamError } = await supabase
      .from("teams")
      .select("id,name")
      .in("id", teamIds);
    throwIfSupabaseError(teamError, "Unable to load PapaLock team names");
    const teamMap = new Map((teams || []).map((team) => [team.id, team.name]));
    const fixtureMap = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
    const now = new Date().toISOString();
    const results = [];

    for (const prediction of predictionRows) {
      const fixture = fixtureMap.get(prediction.fixture_id);
      if (!fixture) continue;
      const outcome = gradeEnginePick(
        { key: prediction.market_key, selection: prediction.selection },
        fixture,
        teamMap.get(fixture.home_team_id),
        teamMap.get(fixture.away_team_id)
      );
      if (!["WIN", "LOSS", "VOID"].includes(outcome)) continue;
      results.push({
        papalock_prediction_id: prediction.id,
        fixture_id: fixture.id,
        league_id: prediction.league_id || fixture.league_id || null,
        engine_version: PAPALOCK_VERSION,
        story: prediction.story,
        market_key: prediction.market_key,
        selection: prediction.selection,
        banker_score: Number(prediction.banker_score || 0),
        outcome,
        halftime_score: `${fixture.halftime_home}-${fixture.halftime_away}`,
        fulltime_score: `${fixture.fulltime_home}-${fixture.fulltime_away}`,
        graded_at: now,
        updated_at: now
      });
    }

    if (results.length) {
      const { error } = await supabase
        .from("papalock_results")
        .upsert(results, { onConflict: "papalock_prediction_id" });
      throwIfSupabaseError(error, "Unable to save PapaLock results");
      for (const result of results) {
        const { error: updateError } = await supabase
          .from("papalock_predictions")
          .update({ status: result.outcome, updated_at: now })
          .eq("id", result.papalock_prediction_id);
        throwIfSupabaseError(updateError, "Unable to update PapaLock prediction status");
      }
    }

    const calibration = await refreshPapaLockCalibration(supabase);
    invalidatePapaLockCache(date);
    return {
      date,
      graded: results.length,
      wins: results.filter((row) => row.outcome === "WIN").length,
      losses: results.filter((row) => row.outcome === "LOSS").length,
      voids: results.filter((row) => row.outcome === "VOID").length,
      calibrationProfiles: calibration.profiles,
      warning: calibration.warning,
      results
    };
  } catch (error) {
    if (isMissingPapaLockTable(error)) {
      return {
        date,
        graded: 0,
        warning: "Run the v1.25.0 PapaLock Supabase migration before settling bankers."
      };
    }
    throw error;
  }
}
