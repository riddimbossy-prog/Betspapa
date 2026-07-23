import {
  ENGINE_VERSION,
  FINISHED_PROFILE_STATUSES,
  PREDICTABLE_STATUSES
} from "../config.js";
import { dateRangeUtc } from "../utils/date.js";
import { fetchAllRows, throwIfSupabaseError } from "./supabaseHelpers.js";
import { gradeEnginePick } from "./gradingService.js";
import { fixtureMatchState, summarizeMatchStates } from "./matchStateService.js";


export function getBackgroundProcessingStatus(date) {
  return {
    date,
    state: "scheduled",
    totalFixtures: 0,
    readyPredictions: 0,
    pending: 0,
    withheld: 0,
    startedAt: null,
    completedAt: null,
    generated: 0,
    published: 0,
    error: null,
    message: "Prediction preparation runs only through the scheduled admin workflows."
  };
}


export function buildEngineBoardItems({
  fixtures = [],
  predictions = [],
  engineKey = "primary",
  processing = null
} = {}) {
  const predictionByFixture = new Map(
    predictions.map((prediction) => [
      Number(prediction.internalFixtureId),
      prediction
    ])
  );

  const items = fixtures
    .filter((fixture) =>
      PREDICTABLE_STATUSES.has(fixture.status) ||
      predictionByFixture.has(Number(fixture.id))
    )
    .map((fixture) => {
      const prediction = predictionByFixture.get(Number(fixture.id)) || null;
      const pick = prediction?.engines?.[engineKey] || null;

      if (prediction && pick) {
        return {
          ...prediction,
          activeEngine: engineKey,
          processing: false,
          pick
        };
      }

      return {
        ...fixture,
        activeEngine: engineKey,
        processing: true,
        processingState: processing?.state || "idle",
        processingMessage:
          processing?.message ||
          "Papa is preparing this fixture with the current engine.",
        pick: null
      };
    })
    .sort((left, right) => {
      if (Boolean(left.pick) !== Boolean(right.pick)) {
        return left.pick ? -1 : 1;
      }

      if (left.pick && right.pick) {
        const leftConfidence = Number(
          left.pick?.confidence ?? left.pick?.score ?? 0
        );
        const rightConfidence = Number(
          right.pick?.confidence ?? right.pick?.score ?? 0
        );
        if (leftConfidence !== rightConfidence) {
          return rightConfidence - leftConfidence;
        }
      }

      return new Date(left.kickoff || 0) - new Date(right.kickoff || 0);
    });

  return items;
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

function publicFixture(fixture, teamMap, leagueMap, settlement = null) {
  return {
    id: fixture.id,
    fixtureId: fixture.external_fixture_id,
    kickoff: fixture.fixture_date,
    status: fixture.status,
    matchState: fixtureMatchState(fixture, settlement),
    settlement: settlement
      ? {
          outcome: settlement.outcome,
          halftimeScore: settlement.halftime_score,
          fulltimeScore: settlement.fulltime_score,
          gradedAt: settlement.graded_at,
          updatedAt: settlement.updated_at
        }
      : null,
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

function mapPublicPredictions({
  fixtures,
  predictions,
  resultRows,
  teamMap,
  leagueMap
}) {
  const resultMap = new Map(
    (resultRows || []).map((row) => [row.prediction_id, row])
  );
  const fixtureMap = new Map(fixtures.map((fixture) => [fixture.id, fixture]));

  return (predictions || [])
    .map((prediction) => {
      const fixture = fixtureMap.get(prediction.fixture_id);
      if (!fixture) return null;

      const league = leagueMap.get(fixture.league_id);
      const home = teamMap.get(fixture.home_team_id);
      const away = teamMap.get(fixture.away_team_id);
      const engines = prediction.market_scores?.enginePicks || null;
      const storedSettlement = resultMap.get(prediction.id) || null;
      const finished = FINISHED_PROFILE_STATUSES.has(fixture.status);

      const engineOutcomes = {};
      if (finished && engines) {
        for (const [key, pick] of Object.entries(engines)) {
          const outcome = gradeEnginePick(pick, fixture, home?.name, away?.name);
          if (outcome !== "UNABLE_TO_GRADE") engineOutcomes[key] = outcome;
        }
      }

      const computedPrimaryOutcome = finished
        ? gradeEnginePick(
            {
              key: prediction.market_scores?.primaryKey,
              selection: prediction.primary_selection
            },
            fixture,
            home?.name,
            away?.name
          )
        : null;
      const primaryOutcome =
        storedSettlement?.outcome ||
        (computedPrimaryOutcome !== "UNABLE_TO_GRADE"
          ? computedPrimaryOutcome
          : null);
      const settlement = primaryOutcome
        ? {
            outcome: primaryOutcome,
            halftimeScore:
              storedSettlement?.halftime_score ||
              `${fixture.halftime_home}-${fixture.halftime_away}`,
            fulltimeScore:
              storedSettlement?.fulltime_score ||
              `${fixture.fulltime_home}-${fixture.fulltime_away}`,
            gradedAt: storedSettlement?.graded_at || null,
            updatedAt: storedSettlement?.updated_at || fixture.updated_at,
            persisted: Boolean(storedSettlement)
          }
        : null;

      return {
        id: prediction.id,
        fixtureId: fixture.external_fixture_id,
        internalFixtureId: fixture.id,
        kickoff: fixture.fixture_date,
        status: fixture.status,
        matchState: fixtureMatchState(fixture, settlement),
        settlement,
        engineOutcomes,
        score: {
          halftime: {
            home: fixture.halftime_home,
            away: fixture.halftime_away
          },
          current: {
            home: fixture.fulltime_home,
            away: fixture.fulltime_away
          }
        },
        venue: fixture.venue,
        league,
        home,
        away,
        defaultEngine: prediction.market_scores?.defaultEngine || "primary",
        engines,
        primary: {
          market: prediction.primary_market,
          selection: prediction.primary_selection,
          probability: prediction.probability,
          confidence: prediction.confidence,
          tier: prediction.confidence_tier,
          qualified: Boolean(prediction.market_scores?.qualified),
          mode: prediction.market_scores?.directionMode || "directional",
          outcome: primaryOutcome
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

export async function loadPreparedBoardData(supabase, date) {
  const { start, end } = dateRangeUtc(date);
  const fixtures = await fetchAllRows(() =>
    supabase
      .from("fixtures")
      .select("*")
      .gte("fixture_date", start)
      .lt("fixture_date", end)
      .order("fixture_date", { ascending: true })
  );

  if (!fixtures.length) {
    return { fixtures: [], predictions: [] };
  }

  const fixtureIds = fixtures.map((fixture) => fixture.id);
  const predictionQuery = supabase
    .from("predictions")
    .select("*")
    .in("fixture_id", fixtureIds)
    .eq("engine_version", ENGINE_VERSION)
    .eq("published", true)
    .order("confidence", { ascending: false });

  const [{ data: predictions, error: predictionError }, entityMaps] = await Promise.all([
    predictionQuery,
    loadEntityMaps(supabase, fixtures)
  ]);
  throwIfSupabaseError(predictionError, "Unable to load prepared board predictions");

  const predictionIds = (predictions || []).map((prediction) => prediction.id);
  const { data: resultRows, error: resultError } = predictionIds.length
    ? await supabase
        .from("prediction_results")
        .select("*")
        .in("prediction_id", predictionIds)
    : { data: [], error: null };
  throwIfSupabaseError(resultError, "Unable to load prepared board settlements");

  return {
    fixtures: fixtures.map((fixture) =>
      publicFixture(fixture, entityMaps.teamMap, entityMaps.leagueMap)
    ),
    predictions: mapPublicPredictions({
      fixtures,
      predictions,
      resultRows,
      teamMap: entityMaps.teamMap,
      leagueMap: entityMaps.leagueMap
    })
  };
}

export async function listPublicPredictions(supabase, date) {
  const board = await loadPreparedBoardData(supabase, date);
  return board.predictions;
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


export function summarizeBoardPreparation({
  date,
  fixtures = [],
  predictions = []
} = {}) {
  const predictableFixtures = fixtures.filter((fixture) =>
    PREDICTABLE_STATUSES.has(fixture.status)
  );

  const readyFixtureIds = new Set(
    predictions
      .map((prediction) => Number(prediction.internalFixtureId))
      .filter(Number.isFinite)
  );

  const readyPredictions = predictableFixtures.filter((fixture) =>
    readyFixtureIds.has(Number(fixture.id))
  ).length;

  const waitingForHistory = Math.max(
    0,
    predictableFixtures.length - readyPredictions
  );

  const coveragePercent = predictableFixtures.length
    ? Number(((readyPredictions / predictableFixtures.length) * 100).toFixed(1))
    : 0;

  let state = "empty";
  if (predictableFixtures.length && waitingForHistory === 0) {
    state = "ready";
  } else if (readyPredictions > 0) {
    state = "partial";
  } else if (predictableFixtures.length) {
    state = "preparing";
  }

  return {
    date,
    engineVersion: ENGINE_VERSION,
    state,
    prepared: state === "ready",
    fixturesFound: predictableFixtures.length,
    readyPredictions,
    waitingForHistory,
    coveragePercent,
    message:
      state === "ready"
        ? "Tomorrow's board is fully prepared."
        : state === "partial"
          ? "Tomorrow's board is partially prepared; remaining teams need more history."
          : state === "preparing"
            ? "Fixtures are imported and Papa is preparing predictions."
            : "No predictable fixtures are available for this date."
  };
}

export async function getBoardPreparationStatus(supabase, date) {
  const [fixtures, predictions] = await Promise.all([
    listFixtures(supabase, date),
    listPublicPredictions(supabase, date)
  ]);

  return summarizeBoardPreparation({
    date,
    fixtures,
    predictions
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
        : null,
      matchStates: summarizeMatchStates(predictionsToday.length ? predictionsToday : fixturesToday)
    },
    lastUpdated: maxIso(timestamps)
  };
}

export async function getDashboardData(supabase, date) {
  const [board, recentResults] = await Promise.all([
    loadPreparedBoardData(supabase, date),
    listRecentResults(supabase, 12)
  ]);
  const { fixtures, predictions } = board;
  const predictable = fixtures.filter((fixture) =>
    PREDICTABLE_STATUSES.has(fixture.status)
  );
  const readyIds = new Set(
    predictions.map((prediction) => Number(prediction.internalFixtureId))
  );
  const pending = predictable.filter(
    (fixture) => !readyIds.has(Number(fixture.id))
  ).length;
  const processing = {
    state: pending ? "scheduled" : "complete",
    totalFixtures: predictable.length,
    readyPredictions: predictions.length,
    pending,
    message: pending
      ? "Remaining picks are waiting for the scheduled board-preparation workflow."
      : "The prepared board is ready."
  };
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
    processing
  };
}
