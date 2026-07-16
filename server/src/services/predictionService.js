import { ENGINE_VERSION, PREDICTABLE_STATUSES } from "../config.js";
import { predictMatch } from "../engine/transitionEngine.js";
import { dateRangeUtc } from "../utils/date.js";
import { fetchAllRows, throwIfSupabaseError } from "./supabaseHelpers.js";
import { hydrateProfilesForFixtures } from "./historyHydrationService.js";

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

function profileWeight(row, currentLeagueId, currentSeason) {
  if (
    Number(row.league_id) === Number(currentLeagueId) &&
    Number(row.season) === Number(currentSeason)
  ) return 1.5;
  if (Number(row.league_id) === Number(currentLeagueId)) return 1.1;
  if (Number(row.season) === Number(currentSeason)) return 0.9;
  return 0.65;
}

function aggregateHtftProfiles(rows, currentLeagueId, currentSeason) {
  const grouped = new Map();

  for (const row of rows || []) {
    const key = `${row.team_id}:${row.scope}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  const map = new Map();
  for (const [key, profileRows] of grouped.entries()) {
    const row = {
      team_id: profileRows[0].team_id,
      scope: profileRows[0].scope,
      matches_played: 0
    };
    for (const transition of TRANSITIONS) row[transition.toLowerCase()] = 0;

    for (const profile of profileRows) {
      const weight = profileWeight(profile, currentLeagueId, currentSeason);
      row.matches_played += Number(profile.matches_played || 0) * weight;
      for (const transition of TRANSITIONS) {
        row[transition.toLowerCase()] +=
          Number(profile[transition.toLowerCase()] || 0) * weight;
      }
    }
    map.set(key, row);
  }

  return map;
}

function aggregateGoalProfiles(rows, currentLeagueId, currentSeason) {
  const rateColumns = [
    "scoring_rate",
    "conceding_rate",
    "failed_to_score_rate",
    "clean_sheet_rate",
    "btts_rate",
    "over_15_rate",
    "over_25_rate",
    "under_35_rate",
    "scored_2plus_rate",
    "conceded_2plus_rate",
    "first_half_scoring_rate",
    "second_half_scoring_rate"
  ];
  const grouped = new Map();

  for (const row of rows || []) {
    const key = `${row.team_id}:${row.scope}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  const map = new Map();
  for (const [key, profileRows] of grouped.entries()) {
    const row = {
      team_id: profileRows[0].team_id,
      scope: profileRows[0].scope,
      matches_played: 0
    };
    const weightedTotals = Object.fromEntries(rateColumns.map((column) => [column, 0]));
    let totalWeight = 0;

    for (const profile of profileRows) {
      const matches = Number(profile.matches_played || 0);
      const weight = profileWeight(profile, currentLeagueId, currentSeason);
      const sampleWeight = matches * weight;
      row.matches_played += sampleWeight;
      totalWeight += sampleWeight;
      for (const column of rateColumns) {
        weightedTotals[column] += Number(profile[column] || 0) * sampleWeight;
      }
    }

    for (const column of rateColumns) {
      row[column] = totalWeight ? weightedTotals[column] / totalWeight : 0;
    }
    map.set(key, row);
  }

  return map;
}


function roundedSample(value) {
  return Number(Number(value || 0).toFixed(2));
}

function teamEvidence(team) {
  return {
    overall: roundedSample(team.htft?.overall?.matches),
    venue: roundedSample(team.htft?.venue?.matches),
    recent: roundedSample(team.htft?.recent?.matches),
    goalOverall: roundedSample(team.goals?.overall?.matches),
    goalVenue: roundedSample(team.goals?.venue?.matches)
  };
}

function hasIndividualEvidence(evidence) {
  return (
    evidence.overall >= 4 &&
    (evidence.venue >= 2 || evidence.recent >= 4)
  );
}

function simpleHash(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function teamProfileVector(team) {
  const htft = ["overall", "venue", "recent"].flatMap((scope) => {
    const row = team.htft?.[scope] || {};
    return [
      row.matches || 0,
      ...TRANSITIONS.map((transition) => row[transition] || 0)
    ];
  });

  const goals = ["overall", "venue", "recent"].flatMap((scope) => {
    const row = team.goals?.[scope] || {};
    return [
      row.matches || 0,
      row.scoreRate || 0,
      row.concedeRate || 0,
      row.bttsRate || 0,
      row.over15Rate || 0,
      row.over25Rate || 0,
      row.under35Rate || 0
    ];
  });

  return [...htft, ...goals].map((value) => Number(value || 0).toFixed(4));
}

function buildProfileAudit({
  fixture,
  homeTeam,
  awayTeam,
  home,
  away,
  hydrationByTeam
}) {
  const homeEvidence = teamEvidence(home);
  const awayEvidence = teamEvidence(away);
  const homeHydration = hydrationByTeam?.[String(fixture.home_team_id)] || null;
  const awayHydration = hydrationByTeam?.[String(fixture.away_team_id)] || null;

  const evidenceFingerprint = simpleHash(JSON.stringify({
    home: teamProfileVector(home),
    away: teamProfileVector(away)
  }));

  const analysisFingerprint = simpleHash(JSON.stringify({
    fixture: fixture.external_fixture_id,
    homeTeamId: homeTeam.external_team_id,
    awayTeamId: awayTeam.external_team_id,
    evidenceFingerprint
  }));

  return {
    minimums: {
      overall: 4,
      venueOrRecent: 2
    },
    home: {
      teamId: homeTeam.id,
      externalTeamId: homeTeam.external_team_id,
      teamName: homeTeam.name,
      evidence: homeEvidence,
      source: homeHydration?.source || "supabase-profile-cache",
      ready: hasIndividualEvidence(homeEvidence),
      hydration: homeHydration
    },
    away: {
      teamId: awayTeam.id,
      externalTeamId: awayTeam.external_team_id,
      teamName: awayTeam.name,
      evidence: awayEvidence,
      source: awayHydration?.source || "supabase-profile-cache",
      ready: hasIndividualEvidence(awayEvidence),
      hydration: awayHydration
    },
    evidenceFingerprint,
    analysisFingerprint,
    individuallyAnalysed:
      hasIndividualEvidence(homeEvidence) &&
      hasIndividualEvidence(awayEvidence)
  };
}

function requireIndividualEvidence(profileAudit) {
  if (profileAudit.individuallyAnalysed) return;

  const error = new Error(
    `Individual HT/FT history is insufficient after hydration. ` +
    `${profileAudit.home.teamName}: overall ${profileAudit.home.evidence.overall}, ` +
    `venue ${profileAudit.home.evidence.venue}, recent ${profileAudit.home.evidence.recent}; ` +
    `${profileAudit.away.teamName}: overall ${profileAudit.away.evidence.overall}, ` +
    `venue ${profileAudit.away.evidence.venue}, recent ${profileAudit.away.evidence.recent}.`
  );
  error.code = "INSUFFICIENT_INDIVIDUAL_HISTORY";
  throw error;
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

async function loadTeamHistoryProfiles(supabase, teamId, cache) {
  const key = `team-history:${teamId}`;
  if (cache.has(key)) return cache.get(key);

  const promise = Promise.all([
    fetchAllRows(() =>
      supabase
        .from("team_htft_profiles")
        .select("*")
        .eq("team_id", teamId)
        .order("season", { ascending: false })
    ),
    fetchAllRows(() =>
      supabase
        .from("team_goal_profiles")
        .select("*")
        .eq("team_id", teamId)
        .order("season", { ascending: false })
    )
  ]).then(([htftRows, goalRows]) => ({ htftRows, goalRows }));

  cache.set(key, promise);
  return promise;
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
      allHtftIndicators: prediction.decisionTrace?.allHtftIndicators || [],
      enginePicks: prediction.enginePicks,
      defaultEngine: prediction.defaultEngine,
      venuePattern: prediction.venuePattern,
      profileAudit: prediction.profileAudit,
      analysisFingerprint: prediction.analysisFingerprint
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

  const allTeams = cached.get("__teams");
  const teams = allTeams || await loadTeams(
    supabase,
    [fixture.home_team_id, fixture.away_team_id]
  );
  const homeTeam = teams.get(fixture.home_team_id);
  const awayTeam = teams.get(fixture.away_team_id);
  if (!homeTeam || !awayTeam) throw new Error(`Fixture ${fixture.id} has unresolved teams`);

  const [homeHistory, awayHistory] = await Promise.all([
    loadTeamHistoryProfiles(supabase, fixture.home_team_id, cached),
    loadTeamHistoryProfiles(supabase, fixture.away_team_id, cached)
  ]);

  const historyHtftRows = [
    ...(homeHistory.htftRows || []),
    ...(awayHistory.htftRows || [])
  ];
  const historyGoalRows = [
    ...(homeHistory.goalRows || []),
    ...(awayHistory.goalRows || [])
  ];

  const htftMap = aggregateHtftProfiles(
    historyHtftRows,
    fixture.league_id,
    fixture.season
  );
  const goalMap = aggregateGoalProfiles(
    historyGoalRows,
    fixture.league_id,
    fixture.season
  );

  const home = buildTeamInput(homeTeam, "home", htftMap, goalMap);
  const away = buildTeamInput(awayTeam, "away", htftMap, goalMap);

  const profileAudit = buildProfileAudit({
    fixture,
    homeTeam,
    awayTeam,
    home,
    away,
    hydrationByTeam: cached.get("__hydrationByTeam") || {}
  });
  requireIndividualEvidence(profileAudit);

  const input = {
    fixtureId: String(fixture.external_fixture_id),
    competition: `${context.league.country || ""} · ${context.league.name}`.replace(/^ · /, ""),
    kickoff: fixture.fixture_date,
    home,
    away,
    profileAudit,
    analysisFingerprint: profileAudit.analysisFingerprint,
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

  const teamIds = [...new Set(
    predictable.flatMap((fixture) => [
      fixture.home_team_id,
      fixture.away_team_id
    ])
  )];
  const teams = teamIds.length
    ? await loadTeams(supabase, teamIds)
    : new Map();

  const hydration = await hydrateProfilesForFixtures(
    supabase,
    predictable,
    teams
  );

  cached.set("__teams", teams);
  cached.set("__hydrationByTeam", hydration.byTeamId);

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
      skipped.push({
        fixtureId: fixture.id,
        externalFixtureId: fixture.external_fixture_id,
        code: error.code || "PREDICTION_ERROR",
        message: error.message || String(error)
      });
    }
  }

  return {
    date,
    fixturesFound: fixtures.length,
    predictableFixtures: predictable.length,
    generated: saved.length,
    published: saved.filter((item) => item.published).length,
    hydration,
    skipped,
    predictions: saved
  };
}
