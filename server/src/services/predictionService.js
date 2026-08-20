import { ENGINE_VERSION, PREDICTABLE_STATUSES } from "../config.js";
import { predictMatch } from "../engine/transitionEngine.js";
import { toPerspectiveGame } from "../engine/splitFormEngine.js";
import { buildEarlySeasonFlag, playedBeforeKickoff } from "../engine/earlySeasonFlag.js";
import { classifyLeagueScoring } from "../engine/leagueScoringPolicy.js";
import { buildTopFiveClashFlag, rankLeagueTable } from "../engine/topFiveClashFlag.js";
import { collectRedFlags } from "./fixtureRiskService.js";
import { dateRangeUtc } from "../utils/date.js";
import { fetchAllRows, throwIfSupabaseError } from "./supabaseHelpers.js";
import { hydrateProfilesForFixtures } from "./historyHydrationService.js";
import { detectSuspiciousPredictionCandidates } from "./intelligenceService.js";
import { competitionPolicy } from "../engine/competitionPolicy.js";

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

function halfGoalProfile(row) {
  if (!row) return { matches: 0, eventCoverageRate: 0 };
  const matches = Number(row.matches_played || 0);
  const eventCoverageMatches = Number(row.event_coverage_matches || 0);
  return {
    matches,
    firstHalfGoalsFor: Number(row.first_half_goals_for || 0),
    firstHalfGoalsAgainst: Number(row.first_half_goals_against || 0),
    secondHalfGoalsFor: Number(row.second_half_goals_for || 0),
    secondHalfGoalsAgainst: Number(row.second_half_goals_against || 0),
    firstHalfScoringRate: Number(row.first_half_scoring_rate || 0),
    firstHalfConcedingRate: Number(row.first_half_conceding_rate || 0),
    secondHalfScoringRate: Number(row.second_half_scoring_rate || 0),
    secondHalfConcedingRate: Number(row.second_half_conceding_rate || 0),
    firstHalfOver05Rate: Number(row.first_half_over_05_rate || 0),
    firstHalfOver15Rate: Number(row.first_half_over_15_rate || 0),
    secondHalfOver05Rate: Number(row.second_half_over_05_rate || 0),
    secondHalfOver15Rate: Number(row.second_half_over_15_rate || 0),
    scoredBothHalvesRate: Number(row.scored_both_halves_rate || 0),
    goalsBothHalvesRate: Number(row.goals_both_halves_rate || 0),
    secondHalfWinRate: Number(row.second_half_win_rate || 0),
    secondHalfDrawRate: Number(row.second_half_draw_rate || 0),
    eventCoverageMatches,
    eventCoverageRate: matches ? eventCoverageMatches / matches : 0,
    goalsWhileTrailing: Number(row.goals_while_trailing || 0),
    equalisersScored: Number(row.equalisers_scored || 0),
    winningGoalsAfterEqualising: Number(row.winning_goals_after_equalising || 0),
    leadsSurrendered: Number(row.leads_surrendered || 0),
    minute46To60For: Number(row.minute_46_60_for || 0),
    minute46To60Against: Number(row.minute_46_60_against || 0),
    minute61To75For: Number(row.minute_61_75_for || 0),
    minute61To75Against: Number(row.minute_61_75_against || 0),
    minute76To90For: Number(row.minute_76_90_for || 0),
    minute76To90Against: Number(row.minute_76_90_against || 0)
  };
}

function profileWeight(row, currentLeagueId, currentSeason) {
  const rowLeague = Number(row.league_id);
  const rowSeason = Number(row.season);
  const leagueMatches = rowLeague === Number(currentLeagueId);
  const seasonMatches = rowSeason === Number(currentSeason);
  const seasonGap = Number.isFinite(rowSeason) && Number.isFinite(Number(currentSeason))
    ? Math.abs(Number(currentSeason) - rowSeason)
    : 3;

  // Old seasons decay instead of remaining permanently influential. A move to
  // another league is useful background only and can never outweigh current
  // league/season evidence.
  const ageDecay = Math.max(0.12, 0.72 ** seasonGap);
  if (leagueMatches && seasonMatches) return 1.5;
  if (leagueMatches) return 1.05 * ageDecay;
  if (seasonMatches) return 0.68;
  return 0.38 * ageDecay;
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


function aggregateHalfGoalProfiles(rows, currentLeagueId, currentSeason) {
  const rateColumns = [
    "first_half_scoring_rate",
    "first_half_conceding_rate",
    "second_half_scoring_rate",
    "second_half_conceding_rate",
    "first_half_over_05_rate",
    "first_half_over_15_rate",
    "second_half_over_05_rate",
    "second_half_over_15_rate",
    "scored_both_halves_rate",
    "goals_both_halves_rate",
    "second_half_win_rate",
    "second_half_draw_rate"
  ];
  const totalColumns = [
    "first_half_goals_for",
    "first_half_goals_against",
    "second_half_goals_for",
    "second_half_goals_against",
    "event_coverage_matches",
    "goals_while_trailing",
    "equalisers_scored",
    "winning_goals_after_equalising",
    "leads_surrendered",
    "minute_46_60_for",
    "minute_46_60_against",
    "minute_61_75_for",
    "minute_61_75_against",
    "minute_76_90_for",
    "minute_76_90_against"
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
    const weightedRates = Object.fromEntries(rateColumns.map((column) => [column, 0]));
    const weightedTotals = Object.fromEntries(totalColumns.map((column) => [column, 0]));
    let totalWeight = 0;

    for (const profile of profileRows) {
      const matches = Number(profile.matches_played || 0);
      const weight = profileWeight(profile, currentLeagueId, currentSeason);
      const sampleWeight = matches * weight;
      row.matches_played += sampleWeight;
      totalWeight += sampleWeight;
      for (const column of rateColumns) {
        weightedRates[column] += Number(profile[column] || 0) * sampleWeight;
      }
      for (const column of totalColumns) {
        weightedTotals[column] += Number(profile[column] || 0) * weight;
      }
    }

    for (const column of rateColumns) {
      row[column] = totalWeight ? weightedRates[column] / totalWeight : 0;
    }
    for (const column of totalColumns) row[column] = weightedTotals[column];
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
    goalVenue: roundedSample(team.goals?.venue?.matches),
    halfOverall: roundedSample(team.halfGoals?.overall?.matches),
    halfVenue: roundedSample(team.halfGoals?.venue?.matches),
    eventCoverageRate: roundedSample(
      team.halfGoals?.venue?.eventCoverageRate ||
      team.halfGoals?.overall?.eventCoverageRate ||
      0
    )
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

  const halfGoals = ["overall", "venue", "recent"].flatMap((scope) => {
    const row = team.halfGoals?.[scope] || {};
    return [
      row.matches || 0,
      row.firstHalfScoringRate || 0,
      row.firstHalfConcedingRate || 0,
      row.secondHalfScoringRate || 0,
      row.secondHalfConcedingRate || 0,
      row.firstHalfOver05Rate || 0,
      row.firstHalfOver15Rate || 0,
      row.secondHalfOver05Rate || 0,
      row.secondHalfOver15Rate || 0,
      row.scoredBothHalvesRate || 0,
      row.goalsBothHalvesRate || 0,
      row.eventCoverageRate || 0,
      row.goalsWhileTrailing || 0,
      row.equalisersScored || 0,
      row.leadsSurrendered || 0
    ];
  });

  return [...htft, ...goals, ...halfGoals].map((value) => Number(value || 0).toFixed(4));
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
      analysisFloor: {
        overall: 4,
        venueOrRecent: 2
      },
      publicMarketGates: {
        broadGoals: { overall: 8, venue: 5 },
        protection: { overall: 10, venue: 6 },
        straightResult: { overall: 12, venue: 7 },
        exactHtft: { overall: 14, venue: 8 },
        halfSpecific: { completeHalfTimeMatches: 5 },
        eventDependent: { minimumEventCoverageRate: 0.7 }
      }
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


function buildCalibrationMap(rows = []) {
  const output = {};
  for (const row of rows) {
    const engine = String(row.engine_key || "all");
    const market = String(row.market_key || "");
    if (!market) continue;
    if (!output[engine]) output[engine] = {};
    const current = output[engine][market];
    const sampleCount = Number(row.sample_count || 0);
    const isLeagueScope = row.league_id !== null && row.league_id !== undefined;
    // Prefer league-specific calibration only after it has enough settled
    // selections. Until then, a deeper global profile remains the safer base.
    const scopePriority = isLeagueScope ? (sampleCount >= 50 ? 2 : 0) : 1;
    const currentPriority = Number(current?.scopePriority ?? -1);
    const shouldReplace = !current ||
      scopePriority > currentPriority ||
      (scopePriority === currentPriority && sampleCount >= Number(current.sampleCount || 0));
    if (shouldReplace) {
      output[engine][market] = {
        sampleCount,
        observedHitRate: Number(row.observed_hit_rate || 0),
        lowerBound: Number(row.lower_bound || row.observed_hit_rate || 0),
        scopeKey: row.scope_key || (scopePriority === 2 ? `LEAGUE:${row.league_id}` : "GLOBAL"),
        leagueId: row.league_id ?? null,
        scopePriority
      };
    }
  }
  return output;
}

async function loadLeagueFinishedGames(supabase, leagueId, season, cached) {
  const key = `ft-games:${leagueId}:${season}`;
  if (cached.has(key)) return cached.get(key);

  const promise = fetchAllRows(() =>
    supabase
      .from("fixtures")
      .select("id,league_id,season,fixture_date,home_team_id,away_team_id,halftime_home,halftime_away,fulltime_home,fulltime_away,status")
      .eq("league_id", leagueId)
      .eq("season", season)
      .eq("status", "FT")
      .order("fixture_date", { ascending: false })
  ).then((rows) => {
    const byTeam = new Map();
    for (const row of rows || []) {
      for (const teamId of [row.home_team_id, row.away_team_id]) {
        const id = Number(teamId);
        if (!byTeam.has(id)) byTeam.set(id, []);
        byTeam.get(id).push(toPerspectiveGame(row, id));
      }
    }
    for (const games of byTeam.values()) {
      games.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    }
    return { byTeam, rows: rows || [] };
  });

  cached.set(key, promise);
  return promise;
}

function recentFiveForTeam(byTeam, teamId, kickoff) {
  const cutoff = new Date(kickoff || 0).getTime();
  return (byTeam.get(Number(teamId)) || [])
    .filter((game) => {
      const time = new Date(game.date || 0).getTime();
      return Number.isFinite(time) && time < cutoff;
    })
    .slice(0, 5);
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
    .select("id,external_league_id,name,country,season,logo_url,competition_type,prediction_enabled,prediction_exclusion_reason")
    .eq("id", leagueId)
    .single();
  throwIfSupabaseError(error, "Unable to load league");
  return data;
}



async function loadCompetitionMap(supabase, leagueIds) {
  if (!leagueIds.length) return new Map();
  const { data, error } = await supabase
    .from("leagues")
    .select("id,external_league_id,name,country,season,logo_url,competition_type,prediction_enabled,prediction_exclusion_reason")
    .in("id", leagueIds);
  throwIfSupabaseError(error, "Unable to load competition policy");
  return new Map((data || []).map((league) => [Number(league.id), {
    league,
    policy: competitionPolicy(league)
  }]));
}

function optionalTableMissing(error, tableName) {
  const message = String(error?.message || error || "");
  return /42P01|does not exist|schema cache/i.test(message) && message.includes(tableName);
}

async function loadOptionalRows(queryFactory, tableName) {
  try {
    return await fetchAllRows(queryFactory);
  } catch (error) {
    if (optionalTableMissing(error, tableName)) return [];
    throw error;
  }
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
    ),
    loadOptionalRows(() =>
      supabase
        .from("team_half_goal_profiles")
        .select("*")
        .eq("team_id", teamId)
        .order("season", { ascending: false }),
      "team_half_goal_profiles"
    )
  ]).then(([htftRows, goalRows, halfGoalRows]) => ({ htftRows, goalRows, halfGoalRows }));

  cache.set(key, promise);
  return promise;
}

async function loadProfiles(supabase, leagueId, season) {
  const [htftRows, goalRows, halfGoalRows, calibrationRows] = await Promise.all([
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
    ),
    loadOptionalRows(() =>
      supabase
        .from("team_half_goal_profiles")
        .select("*")
        .eq("league_id", leagueId)
        .eq("season", season),
      "team_half_goal_profiles"
    ),
    loadOptionalRows(() =>
      supabase
        .from("engine_calibration_profiles")
        .select("engine_key,market_key,scope_key,league_id,sample_count,observed_hit_rate,lower_bound")
        .eq("engine_version", ENGINE_VERSION)
        .or(`league_id.eq.${leagueId},league_id.is.null`),
      "engine_calibration_profiles"
    )
  ]);
  return { htftRows, goalRows, halfGoalRows, calibrationRows };
}

function buildTeamInput(team, side, htftMap, goalMap, halfGoalMap) {
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
    },
    halfGoals: {
      overall: halfGoalProfile(halfGoalMap?.get(`${team.id}:overall`)),
      venue: halfGoalProfile(halfGoalMap?.get(`${team.id}:${venueScope}`)),
      recent: halfGoalProfile(halfGoalMap?.get(`${team.id}:recent6`))
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
    ...(prediction.noBet
      ? ["NO PICK — no market cleared the story, sample and confidence gates"]
      : !primary?.qualified
        ? ["Directional pick — below the strong-pick threshold"]
        : []),
    ...(prediction.earlySeason ? [prediction.earlySeason.reason] : []),
    ...(prediction.topFiveClash ? [prediction.topFiveClash.reason] : []),
    ...Object.values(prediction.enginePicks || {})
      .flatMap((pick) => pick?.leagueGoalsFlag ? [pick.leagueGoalsFlag.reason] : [])
  ];

  return {
    fixture_id: fixture.id,
    engine_version: ENGINE_VERSION,
    primary_market: primary?.market || "No Bet",
    primary_selection: primary?.selection || "No Bet",
    probability: primary?.modelScore ?? null,
    confidence: primary
      ? Number(((primary.calibratedConfidence ?? primary.safetyAdjustedScore ?? 0) * 100).toFixed(2))
      : 0,
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
      analysisFingerprint: prediction.analysisFingerprint,
      papaSenseResolution: prediction.papaSenseResolution,
      noBet: prediction.noBet,
      earlySeason: prediction.earlySeason || null,
      topFiveClash: prediction.topFiveClash || null,
      redFlags: prediction.redFlags || [],
      leagueScoring: prediction.leagueScoring || null
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

  const policy = competitionPolicy(context.league);
  if (!policy.eligible) {
    const error = new Error(policy.reason);
    error.code = "COMPETITION_EXCLUDED";
    error.competitionType = policy.type;
    throw error;
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

  const sameCompetitionSeason = (row) =>
    Number(row.league_id) === Number(fixture.league_id) &&
    Number(row.season) === Number(fixture.season);
  const historyHtftRows = [
    ...(homeHistory.htftRows || []),
    ...(awayHistory.htftRows || [])
  ].filter(sameCompetitionSeason);
  const historyGoalRows = [
    ...(homeHistory.goalRows || []),
    ...(awayHistory.goalRows || [])
  ].filter(sameCompetitionSeason);
  const historyHalfGoalRows = [
    ...(homeHistory.halfGoalRows || []),
    ...(awayHistory.halfGoalRows || [])
  ].filter(sameCompetitionSeason);

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
  const halfGoalMap = aggregateHalfGoalProfiles(
    historyHalfGoalRows,
    fixture.league_id,
    fixture.season
  );

  const home = buildTeamInput(homeTeam, "home", htftMap, goalMap, halfGoalMap);
  const away = buildTeamInput(awayTeam, "away", htftMap, goalMap, halfGoalMap);
  const finished = await loadLeagueFinishedGames(
    supabase,
    fixture.league_id,
    fixture.season,
    cached
  );
  const recentByTeam = finished.byTeam;
  home.recentFive = recentFiveForTeam(recentByTeam, fixture.home_team_id, fixture.fixture_date);
  away.recentFive = recentFiveForTeam(recentByTeam, fixture.away_team_id, fixture.fixture_date);
  const homeGames = recentByTeam.get(Number(fixture.home_team_id)) || [];
  const awayGames = recentByTeam.get(Number(fixture.away_team_id)) || [];
  const earlySeason = buildEarlySeasonFlag({
    homePlayed: playedBeforeKickoff(homeGames, fixture.fixture_date),
    awayPlayed: playedBeforeKickoff(awayGames, fixture.fixture_date),
    homeName: homeTeam.name,
    awayName: awayTeam.name
  });
  const table = rankLeagueTable(finished.rows, {
    leagueId: fixture.league_id,
    season: fixture.season,
    cutoff: new Date(fixture.fixture_date).getTime()
  });
  const homeRow = table.find((row) => Number(row.teamId) === Number(fixture.home_team_id));
  const awayRow = table.find((row) => Number(row.teamId) === Number(fixture.away_team_id));
  const topFiveClash = buildTopFiveClashFlag({
    homeRank: homeRow?.rank,
    awayRank: awayRow?.rank,
    tableSize: table.length,
    homePlayed: homeRow?.played || 0,
    awayPlayed: awayRow?.played || 0,
    homeName: homeTeam.name,
    awayName: awayTeam.name
  });
  const redFlags = collectRedFlags(earlySeason, topFiveClash);

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
    odds: fixture.market_odds || fixture.odds || fixture.bookmaker_odds || null,
    calibration: buildCalibrationMap(context.calibrationRows || []),
    earlySeason,
    topFiveClash,
    redFlags,
    league: {
      transitionBaseline: deriveLeagueBaseline(context.htftRows),
      goals: {
        bttsRate: weightedLeagueGoalRate(context.goalRows, "btts_rate", 0.5),
        over15Rate: weightedLeagueGoalRate(context.goalRows, "over_15_rate", 0.7),
        over25Rate: weightedLeagueGoalRate(context.goalRows, "over_25_rate", 0.48),
        under35Rate: weightedLeagueGoalRate(context.goalRows, "under_35_rate", 0.72)
      }
    }
  };

  const result = predictMatch(input);
  result.earlySeason = earlySeason;
  result.topFiveClash = topFiveClash;
  result.redFlags = redFlags;
  result.leagueScoring = classifyLeagueScoring(input.league?.goals);
  if (redFlags.length) {
    for (const pick of Object.values(result.enginePicks || {})) {
      pick.redFlags = redFlags;
      pick.cautions = [...new Set([...(pick.cautions || []), ...redFlags.map((flag) => flag.reason)])];
    }
  }
  return result;
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

  const statusPredictable = fixtures.filter((fixture) =>
    PREDICTABLE_STATUSES.has(fixture.status)
  );
  const competitionMap = await loadCompetitionMap(
    supabase,
    [...new Set(statusPredictable.map((fixture) => Number(fixture.league_id)).filter(Boolean))]
  );
  const skipped = [];
  const predictable = statusPredictable.filter((fixture) => {
    const entry = competitionMap.get(Number(fixture.league_id));
    const policy = entry?.policy || { eligible: false, type: "UNKNOWN", reason: "Competition policy is unresolved" };
    if (policy.eligible) return true;
    skipped.push({
      fixtureId: fixture.id,
      externalFixtureId: fixture.external_fixture_id,
      code: "COMPETITION_EXCLUDED",
      competitionType: policy.type,
      message: policy.reason
    });
    return false;
  });
  const cached = new Map();
  const saved = [];
  const prepared = [];

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
      prepared.push({
        fixture,
        prediction,
        row: predictionRow(fixture, prediction)
      });
    } catch (error) {
      skipped.push({
        fixtureId: fixture.id,
        externalFixtureId: fixture.external_fixture_id,
        code: error.code || "PREDICTION_ERROR",
        message: error.message || String(error)
      });
    }
  }

  const similarityAudit = detectSuspiciousPredictionCandidates(prepared);

  for (const candidate of prepared) {
    const { fixture, row } = candidate;
    const suspicious = similarityAudit.withheldFixtureIds.has(Number(fixture.id));

    if (suspicious) {
      row.published = false;
      row.warnings = [
        ...(row.warnings || []),
        "Withheld by anti-zombie similarity detector: repeated profile and engine signature."
      ];
      row.market_scores = {
        ...(row.market_scores || {}),
        similarityAudit: {
          status: "withheld",
          reason: "Repeated evidence fingerprint and engine-score pattern",
          groupCount: similarityAudit.flaggedGroups.find((group) =>
            group.fixtureIds.includes(fixture.id)
          )?.count || null
        }
      };
    } else {
      row.market_scores = {
        ...(row.market_scores || {}),
        similarityAudit: {
          status: "clear"
        }
      };
    }

    try {
      const { data, error } = await supabase
        .from("predictions")
        .upsert(row, { onConflict: "fixture_id,engine_version" })
        .select("id,fixture_id,primary_market,primary_selection,confidence,confidence_tier,published")
        .single();
      throwIfSupabaseError(error, "Unable to save prediction");
      saved.push(data);

      if (suspicious) {
        skipped.push({
          fixtureId: fixture.id,
          externalFixtureId: fixture.external_fixture_id,
          code: "SIMILARITY_WITHHELD",
          message: "Prediction withheld because three or more fixtures shared the same evidence and engine-score signature."
        });
      }
    } catch (error) {
      skipped.push({
        fixtureId: fixture.id,
        externalFixtureId: fixture.external_fixture_id,
        code: error.code || "PREDICTION_SAVE_ERROR",
        message: error.message || String(error)
      });
    }
  }

  return {
    date,
    fixturesFound: fixtures.length,
    predictableFixtures: predictable.length,
    excludedCompetitions: skipped.filter((item) => item.code === "COMPETITION_EXCLUDED").length,
    generated: saved.length,
    published: saved.filter((item) => item.published).length,
    withheldBySimilarity: similarityAudit.withheld,
    similarityGroups: similarityAudit.flaggedGroups,
    hydration,
    skipped,
    predictions: saved
  };
}
