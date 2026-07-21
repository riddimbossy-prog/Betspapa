import { ENGINE_VERSION, PREDICTABLE_STATUSES } from "../config.js";
import { predictMatch } from "../engine/transitionEngine.js";
import { dateRangeUtc } from "../utils/date.js";
import { fetchAllRows, throwIfSupabaseError } from "./supabaseHelpers.js";

const TRANSITIONS = ["WW", "WD", "WL", "DW", "DD", "DL", "LW", "LD", "LL"];

function htftProfile(row) {
  if (!row) return { matches: 0 };
  const output = { matches: Number(row.matches_played || 0) };
  for (const key of TRANSITIONS) output[key] = Number(row[key.toLowerCase()] || 0);
  return output;
}

function goalProfile(row) {
  if (!row) return { matches: 0 };
  return {
    matches: Number(row.matches_played || 0),
    scoreRate: Number(row.scoring_rate || 0),
    concedeRate: Number(row.conceding_rate || 0),
    failedToScoreRate: Number(row.failed_to_score_rate || 0),
    cleanSheetRate: Number(row.clean_sheet_rate || 0),
    bttsRate: Number(row.btts_rate || 0),
    over15Rate: Number(row.over_15_rate || 0),
    over25Rate: Number(row.over_25_rate || 0),
    under35Rate: Number(row.under_35_rate || 0),
    scored2PlusRate: Number(row.scored_2plus_rate || 0),
    conceded2PlusRate: Number(row.conceded_2plus_rate || 0),
    firstHalfScoringRate: Number(row.first_half_scoring_rate || 0),
    secondHalfScoringRate: Number(row.second_half_scoring_rate || 0)
  };
}

function indexProfiles(rows) {
  const map = new Map();
  for (const row of rows || []) map.set(`${row.team_id}:${row.scope}`, row);
  return map;
}

function deriveLeagueBaseline(profileRows) {
  const totals = Object.fromEntries(TRANSITIONS.map((key) => [key, 0]));
  let matches = 0;
  for (const row of profileRows.filter((item) => item.scope === "overall")) {
    matches += Number(row.matches_played || 0);
    for (const key of TRANSITIONS) totals[key] += Number(row[key.toLowerCase()] || 0);
  }
  if (!matches) return {};
  return Object.fromEntries(TRANSITIONS.map((key) => [key, totals[key] / matches]));
}

function weightedLeagueGoalRate(goalRows, column, fallback) {
  let weighted = 0;
  let matches = 0;
  for (const row of goalRows.filter((item) => item.scope === "overall")) {
    const sample = Number(row.matches_played || 0);
    weighted += Number(row[column] || 0) * sample;
    matches += sample;
  }
  return matches ? weighted / matches : fallback;
}

async function loadTeams(supabase, teamIds) {
  const { data, error } = await supabase
    .from("teams")
    .select("id,external_team_id,name,country,logo_url")
    .in("id", teamIds);
  throwIfSupabaseError(error, "Unable to load teams");
  return new Map((data || []).map((team) => [team.id, team]));
}

async function loadLeague(supabase, leagueId) {
  const { data, error } = await supabase
    .from("leagues")
    .select("id,external_league_id,name,country,season,logo_url")
    .eq("id", leagueId)
    .single();
  throwIfSupabaseError(error, "Unable to load league");
  return data;
}

async function loadProfiles(supabase, leagueId, season) {
  const [htftRows, goalRows] = await Promise.all([
    fetchAllRows(() =>
      supabase
        .from("team_htft_profiles")
        .select("*")
        .eq("league_id", leagueId)
        .eq("season", season)
    ),
    fetchAllRows(() =>
      supabase
        .from("team_goal_profiles")
        .select("*")
        .eq("league_id", leagueId)
        .eq("season", season)
    )
  ]);
  return { htftRows, goalRows };
}

function buildTeamInput(team, side, htftMap, goalMap) {
  const venueScope = side === "home" ? "home" : "away";
  return {
    name: team.name,
    short: team.name
      .split(/\s+/)
      .map((word) => word[0])
      .join("")
      .slice(0, 4)
      .toUpperCase(),
    logo: team.logo_url,
    htft: {
      overall: htftProfile(htftMap.get(`${team.id}:overall`)),
      venue: htftProfile(htftMap.get(`${team.id}:${venueScope}`)),
      recent: htftProfile(htftMap.get(`${team.id}:recent6`))
    },
    goals: {
      overall: goalProfile(goalMap.get(`${team.id}:overall`)),
      venue: goalProfile(goalMap.get(`${team.id}:${venueScope}`)),
      recent: goalProfile(goalMap.get(`${team.id}:recent6`))
    }
  };
}

function predictionRow(fixture, prediction) {
  const primary = prediction.primaryPrediction;
  const strongest = prediction.story?.topTransitions?.[0] || null;
  const reasons = prediction.decisionTrace?.whyChosen || primary?.reasons || [];
  const warnings = [
    ...(prediction.dataQuality?.label === "Small sample" ? ["Small profile sample"] : []),
    ...(primary?.blockers || []),
    ...(!primary?.qualified ? ["Directional pick — below the strong-pick threshold"] : [])
  ];

  return {
    fixture_id: fixture.id,
    engine_version: ENGINE_VERSION,
    primary_market: primary?.market || "No Bet",
    primary_selection: primary?.selection || "No Bet",
    probability: primary?.modelScore ?? null,
    confidence: primary ? Number((primary.safetyAdjustedScore * 100).toFixed(2)) : 0,
    confidence_tier: primary?.tier || "No Bet",
    strongest_transition: strongest?.code || null,
    transition_probability: strongest?.probability ?? null,
    home_goal_support: prediction.goalIntelligence?.metrics?.homeGoalSupport ?? null,
    away_goal_support: prediction.goalIntelligence?.metrics?.awayGoalSupport ?? null,
    gg_score: prediction.goalIntelligence?.scores?.ggYes ?? null,
    over_15_score: prediction.goalIntelligence?.scores?.over15 ?? null,
    over_25_score: prediction.goalIntelligence?.scores?.over25 ?? null,
    under_35_score: prediction.goalIntelligence?.scores?.under35 ?? null,
    market_scores: {
      primaryKey: primary?.key || null,
      primary,
      supporting: prediction.supportingPrediction,
      markets: prediction.markets,
      story: prediction.story,
      goalIntelligence: prediction.goalIntelligence,
      directProbabilities: prediction.directProbabilities,
      dataQuality: prediction.dataQuality,
      directionMode: prediction.directionMode,
      qualified: prediction.qualified,
      decisionTrace: prediction.decisionTrace,
      allHtftIndicators: prediction.decisionTrace?.allHtftIndicators || []
    },
    transition_matrix: prediction.transitionMatrix,
    reasons,
    warnings,
    rejected_markets: prediction.markets
      .filter((market) => market.key !== primary?.key && !market.qualified)
      .slice(0, 12)
      .map((market) => ({
        market: market.market,
        selection: market.selection,
        blockers: market.blockers,
        score: market.safetyAdjustedScore
      })),
    published: true,
    updated_at: new Date().toISOString()
  };
}

async function predictFixture(supabase, fixture, cached) {
  const cacheKey = `${fixture.league_id}:${fixture.season}`;
  let context = cached.get(cacheKey);

  if (!context) {
    const [league, profiles] = await Promise.all([
      loadLeague(supabase, fixture.league_id),
      loadProfiles(supabase, fixture.league_id, fixture.season)
    ]);
    context = { league, ...profiles };
    cached.set(cacheKey, context);
  }

  const teams = await loadTeams(supabase, [fixture.home_team_id, fixture.away_team_id]);
  const homeTeam = teams.get(fixture.home_team_id);
  const awayTeam = teams.get(fixture.away_team_id);
  if (!homeTeam || !awayTeam) throw new Error(`Fixture ${fixture.id} has unresolved teams`);

  const htftMap = indexProfiles(context.htftRows);
  const goalMap = indexProfiles(context.goalRows);
  const home = buildTeamInput(homeTeam, "home", htftMap, goalMap);
  const away = buildTeamInput(awayTeam, "away", htftMap, goalMap);

  const input = {
    fixtureId: String(fixture.external_fixture_id),
    competition: `${context.league.country || ""} · ${context.league.name}`.replace(/^ · /, ""),
    kickoff: fixture.fixture_date,
    home,
    away,
    league: {
      transitionBaseline: deriveLeagueBaseline(context.htftRows),
      goals: {
        bttsRate: weightedLeagueGoalRate(context.goalRows, "btts_rate", 0.5),
        under35Rate: weightedLeagueGoalRate(context.goalRows, "under_35_rate", 0.72)
      }
    }
  };

  return predictMatch(input);
}

export async function generatePredictionsForDate(supabase, date) {
  const { start, end } = dateRangeUtc(date);
  const fixtures = await fetchAllRows(() =>
    supabase
      .from("fixtures")
      .select("*")
      .gte("fixture_date", start)
      .lt("fixture_date", end)
      .order("fixture_date", { ascending: true })
  );

  const predictable = fixtures.filter((fixture) => PREDICTABLE_STATUSES.has(fixture.status));
  const cached = new Map();
  const saved = [];
  const skipped = [];

  for (const fixture of predictable) {
    try {
      const prediction = await predictFixture(supabase, fixture, cached);
      const row = predictionRow(fixture, prediction);
      const { data, error } = await supabase
        .from("predictions")
        .upsert(row, { onConflict: "fixture_id,engine_version" })
        .select("id,fixture_id,primary_market,primary_selection,confidence,confidence_tier,published")
        .single();
      throwIfSupabaseError(error, "Unable to save prediction");
      saved.push(data);
    } catch (error) {
      skipped.push({ fixtureId: fixture.id, message: error.message || String(error) });
    }
  }

  return {
    date,
    fixturesFound: fixtures.length,
    predictableFixtures: predictable.length,
    generated: saved.length,
    published: saved.filter((item) => item.published).length,
    skipped,
    predictions: saved
  };
}
