import { ATHENA_PROFILE_STATUSES } from "../config.js";
import { fetchFixtureEvents } from "../providers/apiFootball.js";
import { throwIfSupabaseError } from "./supabaseHelpers.js";

const DEFAULT_LIMIT = 20;
const EVENT_CONCURRENCY = 2;
const DEFAULT_RETRY_HOURS = 24;

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function eventLimit(value) {
  const parsed = Number(value ?? process.env.ATHENA_EVENT_HYDRATION_LIMIT ?? DEFAULT_LIMIT);
  return Math.max(1, Math.min(Number.isFinite(parsed) ? parsed : DEFAULT_LIMIT, 80));
}

function retryHours() {
  const parsed = Number(process.env.ATHENA_EVENT_RETRY_HOURS ?? DEFAULT_RETRY_HOURS);
  return Math.max(1, Math.min(Number.isFinite(parsed) ? parsed : DEFAULT_RETRY_HOURS, 168));
}

function retryIsDue(coverage) {
  if (!coverage || coverage.status === "COMPLETE") return !coverage;
  const lastAttempt = Date.parse(coverage.last_attempted_at || "");
  if (!Number.isFinite(lastAttempt)) return true;
  return Date.now() - lastAttempt >= retryHours() * 60 * 60 * 1000;
}

function matchState(home, away) {
  if (home > away) return "HOME_LEADING";
  if (away > home) return "AWAY_LEADING";
  return "LEVEL";
}

function timeBucket(minute) {
  if (minute <= 15) return "00_15";
  if (minute <= 30) return "16_30";
  if (minute <= 45) return "31_45_PLUS";
  if (minute <= 60) return "46_60";
  if (minute <= 75) return "61_75";
  return "76_90_PLUS";
}

function missingEventTables(error) {
  const message = String(error?.message || error || "");
  return error?.code === "42P01" ||
    /fixture_goal_events|fixture_event_coverage|relation .* does not exist/i.test(message);
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function run() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

function goalEvents(providerEvents) {
  return (providerEvents || [])
    .filter((event) => String(event?.type || "").toLowerCase() === "goal")
    .sort((a, b) =>
      Number(a?.time?.elapsed || 0) - Number(b?.time?.elapsed || 0) ||
      Number(a?.time?.extra || 0) - Number(b?.time?.extra || 0)
    );
}

function normalizeGoalEvents(fixture, providerEvents, teamMap) {
  const goals = goalEvents(providerEvents);
  let homeScore = 0;
  let awayScore = 0;
  const recoveredToLevel = { HOME: false, AWAY: false };
  const rows = [];

  goals.forEach((event, index) => {
    const providerTeamId = Number(event?.team?.id || 0);
    const scoringTeam = teamMap.get(providerTeamId);
    if (!scoringTeam) return;

    const scoringSide = Number(scoringTeam.internalId) === Number(fixture.home_team_id) ? "HOME" : "AWAY";
    const minute = Math.max(0, Number(event?.time?.elapsed || 0));
    const extraMinute = Math.max(0, Number(event?.time?.extra || 0));
    const beforeHome = homeScore;
    const beforeAway = awayScore;
    const wasTrailing = scoringSide === "HOME" ? beforeHome < beforeAway : beforeAway < beforeHome;
    const wasLevel = beforeHome === beforeAway;

    if (scoringSide === "HOME") homeScore += 1;
    else awayScore += 1;

    const nowLevel = homeScore === awayScore;
    const nowLeading = scoringSide === "HOME" ? homeScore > awayScore : awayScore > homeScore;
    const isEqualiser = wasTrailing && nowLevel;
    if (isEqualiser) recoveredToLevel[scoringSide] = true;
    const isWinningGoalAfterEqualising = wasLevel && nowLeading && recoveredToLevel[scoringSide];
    const detail = String(event?.detail || "Goal");

    rows.push({
      fixture_id: fixture.id,
      external_fixture_id: fixture.external_fixture_id,
      provider_event_key: [
        fixture.external_fixture_id,
        minute,
        extraMinute,
        providerTeamId,
        detail,
        index
      ].join(":"),
      scoring_team_id: scoringTeam.internalId,
      provider_team_id: providerTeamId,
      minute,
      extra_minute: extraMinute,
      half: minute <= 45 ? 1 : 2,
      time_bucket: timeBucket(minute),
      goal_type: detail,
      is_own_goal: /own goal/i.test(detail),
      is_penalty: /penalty/i.test(detail),
      home_score_before: beforeHome,
      away_score_before: beforeAway,
      home_score_after: homeScore,
      away_score_after: awayScore,
      match_state_before: matchState(beforeHome, beforeAway),
      match_state_after: matchState(homeScore, awayScore),
      is_equaliser: isEqualiser,
      is_lead_goal: wasLevel && nowLeading,
      is_comeback_goal: wasTrailing,
      is_winning_goal_after_equalising: isWinningGoalAfterEqualising,
      raw_event: event,
      updated_at: new Date().toISOString()
    });
  });

  return rows;
}

async function loadTeamMap(supabase, fixtures) {
  const ids = [...new Set(fixtures.flatMap((fixture) => [fixture.home_team_id, fixture.away_team_id]).filter(Boolean))];
  if (!ids.length) return new Map();
  const { data, error } = await supabase
    .from("teams")
    .select("id,external_team_id,name")
    .in("id", ids);
  throwIfSupabaseError(error, "Unable to load teams for Athena goal events");
  return new Map((data || []).map((team) => [Number(team.external_team_id), {
    internalId: Number(team.id),
    name: team.name
  }]));
}

async function loadCoverage(supabase, fixtureIds) {
  if (!fixtureIds.length) return new Map();
  const { data, error } = await supabase
    .from("fixture_event_coverage")
    .select("fixture_id,status,goals_expected,goals_recorded,last_attempted_at")
    .in("fixture_id", fixtureIds);
  if (error) throw error;
  return new Map((data || []).map((row) => [Number(row.fixture_id), row]));
}

async function saveCoverage(supabase, row) {
  const { error } = await supabase
    .from("fixture_event_coverage")
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "fixture_id" });
  if (error) throw error;
}

async function hydrateOne(supabase, fixture, teamMap) {
  const expected = Math.max(0, Number(fixture.fulltime_home || 0) + Number(fixture.fulltime_away || 0));
  const now = new Date().toISOString();

  if (expected === 0) {
    await saveCoverage(supabase, {
      fixture_id: fixture.id,
      external_fixture_id: fixture.external_fixture_id,
      status: "COMPLETE",
      goals_expected: 0,
      goals_recorded: 0,
      last_attempted_at: now,
      error_message: null
    });
    return { fixtureId: fixture.external_fixture_id, status: "COMPLETE", providerCalled: false, goals: 0 };
  }

  try {
    const provider = await fetchFixtureEvents(fixture.external_fixture_id);
    const rows = normalizeGoalEvents(fixture, provider.response, teamMap);

    const { error: deleteError } = await supabase
      .from("fixture_goal_events")
      .delete()
      .eq("fixture_id", fixture.id);
    if (deleteError) throw deleteError;

    if (rows.length) {
      const { error } = await supabase
        .from("fixture_goal_events")
        .upsert(rows, { onConflict: "fixture_id,provider_event_key" });
      if (error) throw error;
    }

    const finalEvent = rows.at(-1) || null;
    const scoreMatches = expected === 0 || (
      Number(finalEvent?.home_score_after) === Number(fixture.fulltime_home) &&
      Number(finalEvent?.away_score_after) === Number(fixture.fulltime_away)
    );
    const complete = rows.length === expected && scoreMatches;
    const status = complete ? "COMPLETE" : rows.length ? "PARTIAL" : "UNAVAILABLE";
    const errorMessage = status === "COMPLETE"
      ? null
      : !scoreMatches && rows.length
        ? `Goal events reconstructed ${finalEvent?.home_score_after ?? 0}-${finalEvent?.away_score_after ?? 0}, but the stored full-time score is ${fixture.fulltime_home}-${fixture.fulltime_away}. Event-based claims were blocked.`
        : `Expected ${expected} goals from the final score but received ${rows.length} usable goal events.`;

    await saveCoverage(supabase, {
      fixture_id: fixture.id,
      external_fixture_id: fixture.external_fixture_id,
      status,
      goals_expected: expected,
      goals_recorded: rows.length,
      last_attempted_at: now,
      error_message: errorMessage
    });

    return {
      fixtureId: fixture.external_fixture_id,
      status,
      providerCalled: true,
      goals: rows.length,
      expected,
      quota: provider.quota || null,
      warning: errorMessage
    };
  } catch (error) {
    await saveCoverage(supabase, {
      fixture_id: fixture.id,
      external_fixture_id: fixture.external_fixture_id,
      status: "UNAVAILABLE",
      goals_expected: expected,
      goals_recorded: 0,
      last_attempted_at: now,
      error_message: error.message || String(error)
    });
    return {
      fixtureId: fixture.external_fixture_id,
      status: "UNAVAILABLE",
      providerCalled: true,
      goals: 0,
      expected,
      error: error.message || String(error)
    };
  }
}

export async function hydrateFixtureGoalEvents(supabase, fixtures, { force = false, limit } = {}) {
  const eligible = (fixtures || []).filter((fixture) =>
    fixture?.id &&
    fixture?.external_fixture_id &&
    ATHENA_PROFILE_STATUSES.has(fixture.status) &&
    finite(fixture.fulltime_home) !== null &&
    finite(fixture.fulltime_away) !== null
  );

  if (!eligible.length) {
    return { available: true, fixturesChecked: 0, providerCalls: 0, complete: 0, partial: 0, unavailable: 0, results: [] };
  }

  try {
    const coverage = await loadCoverage(supabase, eligible.map((fixture) => fixture.id));
    const incomplete = eligible.filter((fixture) =>
      coverage.get(Number(fixture.id))?.status !== "COMPLETE"
    );
    const due = incomplete.filter((fixture) =>
      force || retryIsDue(coverage.get(Number(fixture.id)))
    );
    const pending = due.slice(0, eventLimit(limit));
    const teamMap = await loadTeamMap(supabase, pending);
    const results = await mapLimit(pending, EVENT_CONCURRENCY, (fixture) => hydrateOne(supabase, fixture, teamMap));

    return {
      available: true,
      fixturesChecked: eligible.length,
      fixturesHydrated: pending.length,
      skippedComplete: eligible.length - incomplete.length,
      skippedRecentFailures: incomplete.length - due.length,
      pendingAfterLimit: Math.max(0, due.length - pending.length),
      retryHours: retryHours(),
      providerCalls: results.filter((row) => row.providerCalled).length,
      complete: results.filter((row) => row.status === "COMPLETE").length,
      partial: results.filter((row) => row.status === "PARTIAL").length,
      unavailable: results.filter((row) => row.status === "UNAVAILABLE").length,
      lastQuota: [...results].reverse().find((row) => row.quota)?.quota || null,
      results
    };
  } catch (error) {
    if (!missingEventTables(error)) throw error;
    return {
      available: false,
      fixturesChecked: eligible.length,
      providerCalls: 0,
      complete: 0,
      partial: 0,
      unavailable: eligible.length,
      warning: "Run supabase/BETSPAPA_V1_20_0_ATHENA_V3.sql before event hydration.",
      results: []
    };
  }
}
