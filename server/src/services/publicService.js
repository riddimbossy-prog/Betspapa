import { ENGINE_VERSION, PREDICTABLE_STATUSES } from "../config.js";
import { dateRangeUtc } from "../utils/date.js";
import { fetchAllRows, throwIfSupabaseError } from "./supabaseHelpers.js";
import { generatePredictionsForDate } from "./predictionService.js";


const generationLocks = new Map();
const generationAttempts = new Map();
const GENERATION_COOLDOWN_MS = 5 * 60 * 1000;

async function ensurePredictionsForDate(supabase, date, fixtures, predictions) {
  const existingFixtureIds = new Set(
    predictions.map((prediction) => Number(prediction.internalFixtureId))
  );

  const predictableFixtures = fixtures.filter((fixture) =>
    PREDICTABLE_STATUSES.has(fixture.status)
  );

  const missingFixtures = predictableFixtures.filter(
    (fixture) => !existingFixtureIds.has(Number(fixture.id))
  );

  if (!missingFixtures.length) {
    return {
      attempted: false,
      complete: true,
      predictableFixtures: predictableFixtures.length,
      missingBefore: 0,
      generated: 0,
      published: predictions.length,
      skipped: []
    };
  }

  const previousAttempt = generationAttempts.get(date) || 0;
  const coolingDown = Date.now() - previousAttempt < GENERATION_COOLDOWN_MS;

  if (coolingDown && !generationLocks.has(date)) {
    return {
      attempted: false,
      complete: false,
      cooldown: true,
      predictableFixtures: predictableFixtures.length,
      missingBefore: missingFixtures.length,
      generated: 0,
      published: predictions.length,
      skipped: []
    };
  }

  let lock = generationLocks.get(date);
  let waited = false;

  if (!lock) {
    generationAttempts.set(date, Date.now());
    lock = generatePredictionsForDate(supabase, date)
      .finally(() => generationLocks.delete(date));
    generationLocks.set(date, lock);
  } else {
    waited = true;
  }

  const result = await lock;

  return {
    attempted: !waited,
    waited,
    complete: Number(result.generated || 0) >= missingFixtures.length,
    predictableFixtures: predictableFixtures.length,
    missingBefore: missingFixtures.length,
    generated: Number(result.generated || 0),
    published: Number(result.published || 0),
    hydration: result.hydration || null,
    skipped: (result.skipped || []).map((item) => ({
      fixtureId: item.fixtureId,
      externalFixtureId: item.externalFixtureId,
      code: item.code,
      message: item.message
    }))
  };
}

function maxIso(values) {
  return values
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()))
    .sort((a, b) => b - a)[0]?.toISOString() || null;
}

async function loadEntityMaps(supabase, fixtures) {
  if (!fixtures.length) {
    return {
      teamMap: new Map(),
      leagueMap: new Map()
    };
  }

  const teamIds = [...new Set(fixtures.flatMap((fixture) => [
    fixture.home_team_id,
    fixture.away_team_id
  ]).filter(Boolean))];

  const leagueIds = [...new Set(fixtures
    .map((fixture) => fixture.league_id)
    .filter(Boolean))];

  const teamQuery = teamIds.length
    ? supabase
        .from("teams")
        .select("id,external_team_id,name,country,logo_url")
        .in("id", teamIds)
    : Promise.resolve({ data: [], error: null });

  const leagueQuery = leagueIds.length
    ? supabase
        .from("leagues")
        .select("id,external_league_id,name,country,season,logo_url")
        .in("id", leagueIds)
    : Promise.resolve({ data: [], error: null });

  const [
    { data: teams, error: teamError },
    { data: leagues, error: leagueError }
  ] = await Promise.all([teamQuery, leagueQuery]);

  throwIfSupabaseError(teamError, "Unable to load public teams");
  throwIfSupabaseError(leagueError, "Unable to load public leagues");

  return {
    teamMap: new Map((teams || []).map((team) => [team.id, team])),
    leagueMap: new Map((leagues || []).map((league) => [league.id, league]))
  };
}

function publicFixture(fixture, teamMap, leagueMap) {
  return {
    id: fixture.id,
    fixtureId: fixture.external_fixture_id,
    kickoff: fixture.fixture_date,
    status: fixture.status,
    venue: fixture.venue,
    season: fixture.season,
    halftime: {
      home: fixture.halftime_home,
      away: fixture.halftime_away
    },
    fulltime: {
      home: fixture.fulltime_home,
      away: fixture.fulltime_away
    },
    league: leagueMap.get(fixture.league_id) || null,
    home: teamMap.get(fixture.home_team_id) || null,
    away: teamMap.get(fixture.away_team_id) || null,
    createdAt: fixture.created_at,
    updatedAt: fixture.updated_at
  };
}

export async function listFixtures(supabase, date) {
  const { start, end } = dateRangeUtc(date);
  const fixtures = await fetchAllRows(() =>
    supabase
      .from("fixtures")
      .select("*")
      .gte("fixture_date", start)
      .lt("fixture_date", end)
      .order("fixture_date", { ascending: true })
  );

  const { teamMap, leagueMap } = await loadEntityMaps(supabase, fixtures);
  return fixtures.map((fixture) => publicFixture(fixture, teamMap, leagueMap));
}

export async function listPublicPredictions(supabase, date) {
  const { start, end } = dateRangeUtc(date);
  const fixtures = await fetchAllRows(() =>
    supabase
      .from("fixtures")
      .select("*")
      .gte("fixture_date", start)
      .lt("fixture_date", end)
      .order("fixture_date", { ascending: true })
  );

  if (!fixtures.length) return [];

  const fixtureIds = fixtures.map((fixture) => fixture.id);
  const { data: predictions, error } = await supabase
    .from("predictions")
    .select("*")
    .in("fixture_id", fixtureIds)
    .eq("engine_version", ENGINE_VERSION)
    .eq("published", true)
    .order("confidence", { ascending: false });

  throwIfSupabaseError(error, "Unable to load public predictions");

  const { teamMap, leagueMap } = await loadEntityMaps(supabase, fixtures);
  const fixtureMap = new Map(fixtures.map((fixture) => [fixture.id, fixture]));

  return (predictions || [])
    .map((prediction) => {
      const fixture = fixtureMap.get(prediction.fixture_id);
      if (!fixture) return null;

      const league = leagueMap.get(fixture.league_id);
      const home = teamMap.get(fixture.home_team_id);
      const away = teamMap.get(fixture.away_team_id);

      return {
        id: prediction.id,
        fixtureId: fixture.external_fixture_id,
        internalFixtureId: fixture.id,
        kickoff: fixture.fixture_date,
        status: fixture.status,
        venue: fixture.venue,
        league,
        home,
        away,
        defaultEngine: prediction.market_scores?.defaultEngine || "primary",
        engines: prediction.market_scores?.enginePicks || null,
        primary: {
          market: prediction.primary_market,
          selection: prediction.primary_selection,
          probability: prediction.probability,
          confidence: prediction.confidence,
          tier: prediction.confidence_tier,
          qualified: Boolean(prediction.market_scores?.qualified),
          mode: prediction.market_scores?.directionMode || "directional"
        },
        strongestTransition: {
          code: prediction.strongest_transition,
          probability: prediction.transition_probability
        },
        goalScores: {
          ggYes: prediction.gg_score,
          over15: prediction.over_15_score,
          over25: prediction.over_25_score,
          under35: prediction.under_35_score,
          homeGoalSupport: prediction.home_goal_support,
          awayGoalSupport: prediction.away_goal_support
        },
        transitionMatrix: prediction.transition_matrix,
        reasons: prediction.reasons,
        warnings: prediction.warnings,
        engine: prediction.market_scores,
        explanation: prediction.market_scores?.decisionTrace || null,
        allHtftIndicators:
          prediction.market_scores?.allHtftIndicators ||
          prediction.market_scores?.decisionTrace?.allHtftIndicators ||
          [],
        marketComparison:
          prediction.market_scores?.decisionTrace?.marketComparison ||
          [],
        selectionMethod:
          prediction.market_scores?.decisionTrace?.selectionMethod ||
          null,
        venuePattern:
          prediction.market_scores?.venuePattern ||
          prediction.market_scores?.decisionTrace?.venuePatternReview ||
          null,
        profileAudit:
          prediction.market_scores?.profileAudit ||
          null,
        analysisFingerprint:
          prediction.market_scores?.analysisFingerprint ||
          null,
        createdAt: prediction.created_at,
        updatedAt: prediction.updated_at
      };
    })
    .filter(Boolean);
}

export async function listRecentResults(supabase, limit = 12) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 12, 50));

  const { data: rows, error } = await supabase
    .from("prediction_results")
    .select("*")
    .in("outcome", ["WIN", "LOSS", "VOID"])
    .order("graded_at", { ascending: false })
    .limit(safeLimit);

  throwIfSupabaseError(error, "Unable to load recent prediction results");
  if (!rows?.length) return [];

  const predictionIds = [...new Set(rows.map((row) => row.prediction_id).filter(Boolean))];
  const fixtureIds = [...new Set(rows.map((row) => row.fixture_id).filter(Boolean))];

  const [
    { data: predictions, error: predictionError },
    { data: fixtures, error: fixtureError }
  ] = await Promise.all([
    predictionIds.length
      ? supabase
          .from("predictions")
          .select("id,fixture_id,engine_version,primary_market,primary_selection,confidence,confidence_tier,published")
          .in("id", predictionIds)
      : Promise.resolve({ data: [], error: null }),
    fixtureIds.length
      ? supabase
          .from("fixtures")
          .select("*")
          .in("id", fixtureIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  throwIfSupabaseError(predictionError, "Unable to load predictions for results");
  throwIfSupabaseError(fixtureError, "Unable to load fixtures for results");

  const fixtureList = fixtures || [];
  const { teamMap, leagueMap } = await loadEntityMaps(supabase, fixtureList);
  const predictionMap = new Map((predictions || []).map((prediction) => [prediction.id, prediction]));
  const fixtureMap = new Map(fixtureList.map((fixture) => [fixture.id, fixture]));

  return rows.map((row) => {
    const prediction = predictionMap.get(row.prediction_id);
    const fixture = fixtureMap.get(row.fixture_id);
    const league = fixture ? leagueMap.get(fixture.league_id) : null;
    const home = fixture ? teamMap.get(fixture.home_team_id) : null;
    const away = fixture ? teamMap.get(fixture.away_team_id) : null;

    return {
      id: row.id,
      predictionId: row.prediction_id,
      fixtureId: fixture?.external_fixture_id || null,
      kickoff: fixture?.fixture_date || row.graded_at,
      home,
      away,
      league,
      prediction: prediction?.primary_selection || prediction?.primary_market || "Prediction",
      market: prediction?.primary_market || null,
      confidence: Number(prediction?.confidence || 0),
      halftimeScore: row.halftime_score,
      fulltimeScore: row.fulltime_score,
      confirmedHtft: row.confirmed_htft,
      outcome: row.outcome,
      odd: null,
      gradedAt: row.graded_at,
      updatedAt: row.updated_at
    };
  });
}

export async function getDashboardStats(supabase, {
  predictionsToday = [],
  fixturesToday = [],
  recentResults = []
} = {}) {
  const [publishedPredictions, gradedResults] = await Promise.all([
    fetchAllRows(() =>
      supabase
        .from("predictions")
        .select("id,primary_market,primary_selection,confidence,market_scores,created_at,updated_at")
        .eq("engine_version", ENGINE_VERSION)
        .eq("published", true)
    ),
    fetchAllRows(() =>
      supabase
        .from("prediction_results")
        .select("id,outcome,graded_at,updated_at")
        .in("outcome", ["WIN", "LOSS", "VOID"])
    )
  ]);

  const wins = gradedResults.filter((result) => result.outcome === "WIN").length;
  const losses = gradedResults.filter((result) => result.outcome === "LOSS").length;
  const gradedDecisions = wins + losses;

  const ggSignals = publishedPredictions.filter((prediction) => {
    const value = `${prediction.primary_market || ""} ${prediction.primary_selection || ""}`;
    return /both teams|btts|\bgg\b/i.test(value);
  }).length;

  const under35Signals = publishedPredictions.filter((prediction) => {
    const value = `${prediction.primary_market || ""} ${prediction.primary_selection || ""}`;
    return /under\s*3[.,]5/i.test(value);
  }).length;

  const timestamps = [
    ...publishedPredictions.flatMap((row) => [row.updated_at, row.created_at]),
    ...gradedResults.flatMap((row) => [row.updated_at, row.graded_at]),
    ...predictionsToday.flatMap((row) => [row.updatedAt, row.createdAt]),
    ...fixturesToday.flatMap((row) => [row.updatedAt, row.createdAt]),
    ...recentResults.flatMap((row) => [row.updatedAt, row.gradedAt])
  ];

  return {
    engineVersion: ENGINE_VERSION,
    winRate: gradedDecisions ? Number(((wins / gradedDecisions) * 100).toFixed(1)) : null,
    wins,
    losses,
    voids: gradedResults.filter((result) => result.outcome === "VOID").length,
    graded: gradedResults.length,
    matchDirections: publishedPredictions.length,
    qualifiedPicks: publishedPredictions.filter(
      (prediction) => Boolean(prediction.market_scores?.qualified)
    ).length,
    directionalPicks: publishedPredictions.filter(
      (prediction) => !prediction.market_scores?.qualified
    ).length,
    ggSignals,
    under35Signals,
    today: {
      fixtures: fixturesToday.length,
      predictions: predictionsToday.length,
      topConfidence: predictionsToday.length
        ? Number(Math.max(...predictionsToday.map((prediction) => Number(prediction.primary?.confidence || 0))).toFixed(1))
        : null
    },
    lastUpdated: maxIso(timestamps)
  };
}

export async function getDashboardData(supabase, date) {
  const [fixtures, recentResults] = await Promise.all([
    listFixtures(supabase, date),
    listRecentResults(supabase, 12)
  ]);

  let predictions = await listPublicPredictions(supabase, date);
  const generation = await ensurePredictionsForDate(
    supabase,
    date,
    fixtures,
    predictions
  );

  if (generation.attempted || generation.waited) {
    predictions = await listPublicPredictions(supabase, date);
  }

  const stats = await getDashboardStats(supabase, {
    predictionsToday: predictions,
    fixturesToday: fixtures,
    recentResults
  });

  return {
    date,
    generatedAt: new Date().toISOString(),
    predictions,
    fixtures,
    recentResults,
    stats,
    generation
  };
}
