import {
  ATHENA_ENGINE_VERSION,
  FINISHED_PROFILE_STATUSES
} from "../config.js";
import {
  analyseFixture,
  CLASSIFICATIONS,
  ENGINE_NAME as ATHENA_ENGINE_NAME,
  ENGINE_VERSION as ATHENA_RUNTIME_VERSION,
  MARKETS
} from "../engine/athena-transition-engine/src/index.js";
import {
  ATHENA_ARBITRATION_VERSION,
  ATHENA_PRIMARY_SCORE,
  ATHENA_PRIME_SCORE,
  arbitrateAthenaV11
} from "../engine/athenaV11Arbiter.js";
import { ATHENA_SEPARATION_VERSION, evaluateAthenaSeparationV2 } from "../engine/athenaSeparationEngineV2.js";
import { dateRangeUtc } from "../utils/date.js";
import { fixtureMatchState } from "./matchStateService.js";
import { fetchAllRows, throwIfSupabaseError } from "./supabaseHelpers.js";

const MIN_OVERALL_MATCHES = 8;
const MIN_VENUE_MATCHES = 5;
const MAX_OVERALL_MATCHES = 40;
const MAX_VENUE_MATCHES = 20;
const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map();

const ATHENA_VISIBLE_STATUSES = new Set([
  "NS", "TBD", "1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE",
  "FT", "AET", "PEN"
]);

const DIRECTIONAL_MARKETS = new Map([
  [MARKETS.HOME_WIN_EITHER_HALF, "HOME"],
  [MARKETS.AWAY_WIN_EITHER_HALF, "AWAY"],
  [MARKETS.HOME_DNB, "HOME"],
  [MARKETS.AWAY_DNB, "AWAY"],
  [MARKETS.HOME_DOUBLE_CHANCE, "HOME"],
  [MARKETS.AWAY_DOUBLE_CHANCE, "AWAY"],
  [MARKETS.HOME_OVER_0_5, "HOME"],
  [MARKETS.AWAY_OVER_0_5, "AWAY"]
]);

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validFinishedFixture(fixture) {
  return (
    FINISHED_PROFILE_STATUSES.has(fixture?.status) &&
    finite(fixture.halftime_home) !== null &&
    finite(fixture.halftime_away) !== null &&
    finite(fixture.fulltime_home) !== null &&
    finite(fixture.fulltime_away) !== null
  );
}

function newestFirst(rows) {
  return [...rows].sort((a, b) => new Date(b.fixture_date) - new Date(a.fixture_date));
}

function fixtureKey(fixture) {
  return Number(fixture.id || fixture.external_fixture_id || 0);
}

function resultLetter(goalsFor, goalsAgainst) {
  if (goalsFor > goalsAgainst) return "w";
  if (goalsFor < goalsAgainst) return "l";
  return "d";
}

function teamPerspective(fixture, teamId) {
  const home = Number(fixture.home_team_id) === Number(teamId);
  const htFor = Number(home ? fixture.halftime_home : fixture.halftime_away);
  const htAgainst = Number(home ? fixture.halftime_away : fixture.halftime_home);
  const ftFor = Number(home ? fixture.fulltime_home : fixture.fulltime_away);
  const ftAgainst = Number(home ? fixture.fulltime_away : fixture.fulltime_home);

  return {
    date: fixture.fixture_date,
    venue: home ? "home" : "away",
    htFor,
    htAgainst,
    ftFor,
    ftAgainst,
    transition: `${resultLetter(htFor, htAgainst)}${resultLetter(ftFor, ftAgainst)}`,
    totalGoals: ftFor + ftAgainst,
    over25: ftFor + ftAgainst >= 3
  };
}

function emptyTransitions() {
  return {
    ww: 0,
    wd: 0,
    wl: 0,
    dw: 0,
    dd: 0,
    dl: 0,
    lw: 0,
    ld: 0,
    ll: 0
  };
}

export function buildAthenaTeamInput(name, rows, teamId, venueType = null) {
  const matches = newestFirst(rows)
    .map((fixture) => teamPerspective(fixture, teamId))
    .filter((match) => !venueType || match.venue === venueType);

  const htft = emptyTransitions();
  let over25 = 0;
  let totalGoals = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;

  for (const match of matches) {
    htft[match.transition] += 1;
    over25 += match.over25 ? 1 : 0;
    totalGoals += match.totalGoals;
    goalsFor += match.ftFor;
    goalsAgainst += match.ftAgainst;
  }

  return {
    name,
    matchesPlayed: matches.length,
    htft,
    goals: {
      over25,
      under25: matches.length - over25,
      averageTotalGoals: matches.length ? totalGoals / matches.length : 0,
      goalsFor,
      goalsAgainst,
      last5Over25: matches.slice(0, 5).map((match) => match.over25)
    },
    venue: venueType
      ? { type: venueType.toUpperCase(), matchesPlayed: matches.length, htft: { ...htft } }
      : null
  };
}

function withVenueSnapshot(team, venueTeam) {
  return {
    ...team,
    venue: {
      type: venueTeam?.venue?.type || null,
      matchesPlayed: venueTeam?.matchesPlayed || 0,
      htft: venueTeam?.htft || emptyTransitions(),
      goals: venueTeam?.goals || null
    }
  };
}

function readObject(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function findNumber(object, keys) {
  if (!object || typeof object !== "object") return null;
  for (const key of keys) {
    const direct = finite(object[key]);
    if (direct !== null) return direct;
  }
  for (const value of Object.values(object)) {
    if (!value || typeof value !== "object") continue;
    const nested = findNumber(value, keys);
    if (nested !== null) return nested;
  }
  return null;
}

export function extractAthenaOdds(fixture) {
  const source = readObject(
    fixture?.market_odds || fixture?.odds || fixture?.bookmaker_odds
  );
  if (!source) return undefined;

  const home = findNumber(source, ["home", "1", "homeWin", "home_win"]);
  const draw = findNumber(source, ["draw", "x", "X", "drawOdds", "draw_odds"]);
  const away = findNumber(source, ["away", "2", "awayWin", "away_win"]);
  if ([home, draw, away].every((value) => value !== null && value > 1)) {
    return { home, draw, away };
  }
  return undefined;
}

function marketSide(market) {
  return DIRECTIONAL_MARKETS.get(market) || null;
}

function marketGroup(market) {
  if ([MARKETS.HOME_WIN_EITHER_HALF, MARKETS.AWAY_WIN_EITHER_HALF].includes(market)) {
    return "Win Either Half";
  }
  if ([MARKETS.HOME_DNB, MARKETS.AWAY_DNB, MARKETS.HOME_DOUBLE_CHANCE, MARKETS.AWAY_DOUBLE_CHANCE, MARKETS.FULL_TIME_DRAW].includes(market)) {
    return "Match Result";
  }
  if ([MARKETS.HOME_OVER_0_5, MARKETS.AWAY_OVER_0_5].includes(market)) {
    return "Team Goals";
  }
  if ([MARKETS.OVER_1_5, MARKETS.OVER_2_5, MARKETS.UNDER_2_5, MARKETS.UNDER_3_5].includes(market)) {
    return "Total Goals";
  }
  if ([MARKETS.FIRST_HALF_UNDER_1_5, MARKETS.FIRST_HALF_OVER_0_5, MARKETS.HALF_TIME_DRAW].includes(market)) {
    return "First Half";
  }
  if (market === MARKETS.BTTS_YES) return "Both Teams to Score";
  return "Athena Market";
}

export function athenaSelectionLabel(market, homeName, awayName) {
  const labels = {
    [MARKETS.HOME_WIN_EITHER_HALF]: `${homeName} to Win Either Half`,
    [MARKETS.AWAY_WIN_EITHER_HALF]: `${awayName} to Win Either Half`,
    [MARKETS.HOME_DNB]: `${homeName} Draw No Bet`,
    [MARKETS.AWAY_DNB]: `${awayName} Draw No Bet`,
    [MARKETS.HOME_DOUBLE_CHANCE]: `${homeName} or Draw`,
    [MARKETS.AWAY_DOUBLE_CHANCE]: `${awayName} or Draw`,
    [MARKETS.HOME_OVER_0_5]: `${homeName} Over 0.5 Team Goals`,
    [MARKETS.AWAY_OVER_0_5]: `${awayName} Over 0.5 Team Goals`,
    [MARKETS.OVER_1_5]: "Over 1.5 Match Goals",
    [MARKETS.OVER_2_5]: "Over 2.5 Match Goals",
    [MARKETS.UNDER_2_5]: "Under 2.5 Match Goals",
    [MARKETS.UNDER_3_5]: "Under 3.5 Match Goals",
    [MARKETS.FIRST_HALF_UNDER_1_5]: "First Half Under 1.5 Goals",
    [MARKETS.FIRST_HALF_OVER_0_5]: "First Half Over 0.5 Goals",
    [MARKETS.HALF_TIME_DRAW]: "Half-Time Draw",
    [MARKETS.FULL_TIME_DRAW]: "Full-Time Draw",
    [MARKETS.BTTS_YES]: "Both Teams to Score — Yes",
    [MARKETS.NO_PICK]: "No Pick"
  };
  return labels[market] || String(market || "No Pick").replaceAll("_", " ");
}

function scoreParts(fixture) {
  const h = finite(fixture.fulltime_home);
  const a = finite(fixture.fulltime_away);
  const hh = finite(fixture.halftime_home);
  const ha = finite(fixture.halftime_away);
  if ([h, a, hh, ha].some((value) => value === null)) return null;
  return { h, a, hh, ha, sh: h - hh, sa: a - ha };
}

export function settleAthenaMarket(fixture, market) {
  if (!FINISHED_PROFILE_STATUSES.has(fixture.status)) return null;
  const score = scoreParts(fixture);
  if (!score) {
    return { outcome: "REVIEW", reason: "Final or half-time score is incomplete", persisted: false };
  }

  const { h, a, hh, ha, sh, sa } = score;
  let outcome = "REVIEW";
  let reason = "Settled from confirmed half-time and full-time scores";

  switch (market) {
    case MARKETS.HOME_WIN_EITHER_HALF:
      outcome = hh > ha || sh > sa ? "WIN" : "LOSS";
      break;
    case MARKETS.AWAY_WIN_EITHER_HALF:
      outcome = ha > hh || sa > sh ? "WIN" : "LOSS";
      break;
    case MARKETS.HOME_DNB:
      outcome = h > a ? "WIN" : h === a ? "VOID" : "LOSS";
      break;
    case MARKETS.AWAY_DNB:
      outcome = a > h ? "WIN" : h === a ? "VOID" : "LOSS";
      break;
    case MARKETS.HOME_DOUBLE_CHANCE:
      outcome = h >= a ? "WIN" : "LOSS";
      break;
    case MARKETS.AWAY_DOUBLE_CHANCE:
      outcome = a >= h ? "WIN" : "LOSS";
      break;
    case MARKETS.HOME_OVER_0_5:
      outcome = h >= 1 ? "WIN" : "LOSS";
      break;
    case MARKETS.AWAY_OVER_0_5:
      outcome = a >= 1 ? "WIN" : "LOSS";
      break;
    case MARKETS.OVER_1_5:
      outcome = h + a >= 2 ? "WIN" : "LOSS";
      break;
    case MARKETS.OVER_2_5:
      outcome = h + a >= 3 ? "WIN" : "LOSS";
      break;
    case MARKETS.UNDER_2_5:
      outcome = h + a <= 2 ? "WIN" : "LOSS";
      break;
    case MARKETS.UNDER_3_5:
      outcome = h + a <= 3 ? "WIN" : "LOSS";
      break;
    case MARKETS.FIRST_HALF_UNDER_1_5:
      outcome = hh + ha <= 1 ? "WIN" : "LOSS";
      break;
    case MARKETS.FIRST_HALF_OVER_0_5:
      outcome = hh + ha >= 1 ? "WIN" : "LOSS";
      break;
    case MARKETS.HALF_TIME_DRAW:
      outcome = hh === ha ? "WIN" : "LOSS";
      break;
    case MARKETS.FULL_TIME_DRAW:
      outcome = h === a ? "WIN" : "LOSS";
      break;
    case MARKETS.BTTS_YES:
      outcome = h >= 1 && a >= 1 ? "WIN" : "LOSS";
      break;
    default:
      reason = "This Athena market requires manual review";
  }

  return {
    outcome,
    reason,
    fulltimeScore: `${h}-${a}`,
    halftimeScore: `${hh}-${ha}`,
    settledAt: outcome === "REVIEW" ? null : new Date().toISOString(),
    persisted: false
  };
}

async function loadDateFixtures(supabase, date) {
  const { start, end } = dateRangeUtc(date);
  return fetchAllRows(() =>
    supabase
      .from("fixtures")
      .select("*")
      .gte("fixture_date", start)
      .lt("fixture_date", end)
      .order("fixture_date", { ascending: true })
  );
}

async function loadEntities(supabase, fixtures) {
  const teamIds = [...new Set(fixtures.flatMap((fixture) => [
    fixture.home_team_id,
    fixture.away_team_id
  ]).filter(Boolean))];
  const leagueIds = [...new Set(fixtures.map((fixture) => fixture.league_id).filter(Boolean))];

  const [teamsResult, leaguesResult] = await Promise.all([
    teamIds.length
      ? supabase.from("teams")
          .select("id,external_team_id,name,country,logo_url")
          .in("id", teamIds)
      : Promise.resolve({ data: [], error: null }),
    leagueIds.length
      ? supabase.from("leagues")
          .select("id,external_league_id,name,country,season,logo_url")
          .in("id", leagueIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  throwIfSupabaseError(teamsResult.error, "Unable to load Athena teams");
  throwIfSupabaseError(leaguesResult.error, "Unable to load Athena leagues");

  return {
    teamMap: new Map((teamsResult.data || []).map((team) => [Number(team.id), team])),
    leagueMap: new Map((leaguesResult.data || []).map((league) => [Number(league.id), league]))
  };
}

async function loadTeamHistory(supabase, teamIds) {
  if (!teamIds.length) return [];
  const select = "id,league_id,season,fixture_date,home_team_id,away_team_id,halftime_home,halftime_away,fulltime_home,fulltime_away,status";
  const [homeRows, awayRows] = await Promise.all([
    fetchAllRows(() =>
      supabase
        .from("fixtures")
        .select(select)
        .in("status", [...FINISHED_PROFILE_STATUSES])
        .in("home_team_id", teamIds)
        .order("fixture_date", { ascending: false })
    ),
    fetchAllRows(() =>
      supabase
        .from("fixtures")
        .select(select)
        .in("status", [...FINISHED_PROFILE_STATUSES])
        .in("away_team_id", teamIds)
        .order("fixture_date", { ascending: false })
    )
  ]);

  const unique = new Map();
  for (const fixture of [...homeRows, ...awayRows]) {
    if (validFinishedFixture(fixture)) unique.set(fixtureKey(fixture), fixture);
  }
  return newestFirst([...unique.values()]);
}

function routeAudit(routes) {
  const labels = {
    homeWW: "Home W/W vs Away L/L",
    homeDW: "Home D/W vs Away D/L",
    homeLW: "Home L/W vs Away W/L",
    awayWW: "Away W/W vs Home L/L",
    awayDW: "Away D/W vs Home D/L",
    awayLW: "Away L/W vs Home W/L",
    dd: "D/D vs D/D"
  };
  return Object.entries(labels).map(([key, label]) => ({
    key,
    label,
    adjusted: Number(((routes?.[key]?.adjusted || 0) * 100).toFixed(1)),
    bottleneckCount: Number(routes?.[key]?.bottleneckCount || 0)
  })).sort((a, b) => b.adjusted - a.adjusted);
}

function explanationFor(result, venueResult, samples, arbitration, separation) {
  const primary = arbitration?.primary || result.banker;
  const switched = Boolean(arbitration?.switchedFromRc1);
  const original = arbitration?.originalRc1Banker;
  const bestGoal = arbitration?.bestGoal;
  const bestDirectional = arbitration?.bestDirectional;
  const safer = arbitration?.saferAlternative;

  const reasons = [
    result.story,
    ...(primary?.reasons || []),
    ...(arbitration?.rationale || []),
    `Athena classified the fixture as ${String(result.classification?.type || "CONFLICT").replaceAll("_", " ").toLowerCase()}.`,
    separation ? `Athena v2 separation timing: ${String(separation.type).replaceAll("_", " ").toLowerCase()} (${separation.confidence}/100).` : null,
    `The selected market reached ${Number(primary?.score || 0).toFixed(0)}/100 and cleared Athena v1.1.1's ${ATHENA_PRIMARY_SCORE}-point score-and-safety gate.`
  ].filter(Boolean);

  if (switched && original) {
    reasons.push(
      `Athena v1.1.1 replaced the RC1 priority pick (${String(original.market || "").replaceAll("_", " ")} · ${Number(original.score || 0).toFixed(0)}) because another safe market ranked stronger after classification-specific arbitration.`
    );
  }

  if (bestGoal) {
    reasons.push(`Best qualified goal market: ${String(bestGoal.market).replaceAll("_", " ")} · ${Number(bestGoal.score).toFixed(0)}/100.`);
  }
  if (bestDirectional) {
    reasons.push(`Best fully confirmed directional market: ${String(bestDirectional.market).replaceAll("_", " ")} · ${Number(bestDirectional.score).toFixed(0)}/100.`);
  }
  if (safer) {
    reasons.push(`Safer qualified alternative: ${String(safer.market).replaceAll("_", " ")} · ${Number(safer.score).toFixed(0)}/100.`);
  }

  const cautions = [
    ...(result.classification?.warnings || []),
    ...(primary?.warnings || []),
    ...(result.oddsConflict?.conflict ? ["Bookmaker direction disagreed with Athena's directional reading."] : []),
    "The Athena score is a rules-based strength score, not a guaranteed outcome probability.",
    "Athena v1.1.1 keeps the RC1 scoring model but replaces first-passing-market priority with score-and-safety arbitration."
  ];

  if (venueResult) {
    reasons.push(
      `Relevant venue split classified the match as ${String(venueResult.classification?.type || "CONFLICT").replaceAll("_", " ").toLowerCase()}.`
    );
  }

  return {
    summary: result.story,
    reasons: [...new Set(reasons.filter(Boolean))],
    cautions: [...new Set(cautions.filter(Boolean))],
    samples,
    classification: result.classification,
    oddsConflict: result.oddsConflict,
    routes: routeAudit(result.routes),
    venueClassification: venueResult?.classification || null,
    separation,
    arbitration: {
      version: arbitration?.version || ATHENA_ARBITRATION_VERSION,
      rule: arbitration?.rule || null,
      switchedFromRc1: switched,
      originalRc1Banker: original || null,
      bestOverall: arbitration?.bestOverall || null,
      bestDirectional: bestDirectional || null,
      bestGoal: bestGoal || null,
      saferAlternative: safer || null,
      scoreGapFromBest: arbitration?.scoreGapFromBest ?? null,
      eligibleCount: arbitration?.eligibleCount || 0,
      rejectedCount: arbitration?.rejectedCount || 0
    }
  };
}

function rejectionCounter(rows) {
  const counts = new Map();
  for (const row of rows) {
    const key = row.reason || "Athena returned no pick";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

export function rankAthenaPicks(rows) {
  return [...rows].sort((a, b) => {
    const gradeA = a.grade === "PRIME" ? 1 : 0;
    const gradeB = b.grade === "PRIME" ? 1 : 0;
    if (gradeB !== gradeA) return gradeB - gradeA;
    if (Number(b.score) !== Number(a.score)) return Number(b.score) - Number(a.score);
    return new Date(a.kickoff) - new Date(b.kickoff);
  });
}

function venueConflict(result, venueResult) {
  const selectedSide = marketSide(result?.banker?.market);
  if (!selectedSide) return null;

  const conflictSensitive =
    result?.oddsConflict?.conflict ||
    result?.classification?.warnings?.includes("DIRECTIONAL_CONFLICT");
  if (!conflictSensitive) return null;

  if (!venueResult) {
    return "Directional conflict requires a complete home/away venue split";
  }
  if (venueResult.classification?.side !== selectedSide) {
    return "Venue HT/FT direction does not confirm the conflicted overall direction";
  }
  return null;
}

async function buildAthenaPicks(supabase, date) {
  const allDateFixtures = await loadDateFixtures(supabase, date);
  const fixtures = allDateFixtures.filter((fixture) => ATHENA_VISIBLE_STATUSES.has(fixture.status));

  if (!fixtures.length) {
    return {
      date,
      generatedAt: new Date().toISOString(),
      engine: ATHENA_ENGINE_NAME,
      engineVersion: ATHENA_ENGINE_VERSION,
      runtimeEngineVersion: ATHENA_RUNTIME_VERSION,
      arbitrationVersion: ATHENA_ARBITRATION_VERSION,
      mode: "separation-v2",
      separationVersion: ATHENA_SEPARATION_VERSION,
      reviewedFixtures: 0,
      qualifiedCount: 0,
      primeCount: 0,
      rejectedCount: 0,
      criteria: {
        minimumOverallMatches: MIN_OVERALL_MATCHES,
        minimumVenueMatches: MIN_VENUE_MATCHES,
        qualifiedScore: ATHENA_PRIMARY_SCORE,
        primeScore: ATHENA_PRIME_SCORE,
        onePickOnly: true,
        frozenScoringCore: true,
        scoreSafetyArbitration: true,
        conflictNoPickHardStop: true
      },
      picks: [],
      rejections: [],
      status: "No scheduled fixtures were available for this date."
    };
  }

  const { teamMap, leagueMap } = await loadEntities(supabase, fixtures);
  const teamIds = [...new Set(fixtures.flatMap((fixture) => [
    Number(fixture.home_team_id),
    Number(fixture.away_team_id)
  ]))];
  const history = await loadTeamHistory(supabase, teamIds);
  const historyByTeam = new Map(teamIds.map((teamId) => [teamId, []]));

  for (const past of history) {
    if (historyByTeam.has(Number(past.home_team_id))) {
      historyByTeam.get(Number(past.home_team_id)).push(past);
    }
    if (historyByTeam.has(Number(past.away_team_id))) {
      historyByTeam.get(Number(past.away_team_id)).push(past);
    }
  }

  const accepted = [];
  const rejected = [];

  for (const fixture of fixtures) {
    const home = teamMap.get(Number(fixture.home_team_id));
    const away = teamMap.get(Number(fixture.away_team_id));
    const league = leagueMap.get(Number(fixture.league_id));

    if (!home || !away || !league) {
      rejected.push({ fixtureId: fixture.external_fixture_id, reason: "Team or league record is unresolved" });
      continue;
    }

    const kickoffTime = new Date(fixture.fixture_date).getTime();
    const homeRows = newestFirst(historyByTeam.get(Number(fixture.home_team_id)) || [])
      .filter((row) => new Date(row.fixture_date).getTime() < kickoffTime)
      .slice(0, MAX_OVERALL_MATCHES);
    const awayRows = newestFirst(historyByTeam.get(Number(fixture.away_team_id)) || [])
      .filter((row) => new Date(row.fixture_date).getTime() < kickoffTime)
      .slice(0, MAX_OVERALL_MATCHES);

    const homeVenueRows = homeRows
      .filter((row) => Number(row.home_team_id) === Number(fixture.home_team_id))
      .slice(0, MAX_VENUE_MATCHES);
    const awayVenueRows = awayRows
      .filter((row) => Number(row.away_team_id) === Number(fixture.away_team_id))
      .slice(0, MAX_VENUE_MATCHES);

    const samples = {
      homeOverall: homeRows.length,
      homeVenue: homeVenueRows.length,
      awayOverall: awayRows.length,
      awayVenue: awayVenueRows.length
    };

    const sampleFailures = [];
    if (homeRows.length < MIN_OVERALL_MATCHES) sampleFailures.push(`${home.name} has fewer than ${MIN_OVERALL_MATCHES} completed matches`);
    if (awayRows.length < MIN_OVERALL_MATCHES) sampleFailures.push(`${away.name} has fewer than ${MIN_OVERALL_MATCHES} completed matches`);
    if (homeVenueRows.length < MIN_VENUE_MATCHES) sampleFailures.push(`${home.name} has fewer than ${MIN_VENUE_MATCHES} home matches`);
    if (awayVenueRows.length < MIN_VENUE_MATCHES) sampleFailures.push(`${away.name} has fewer than ${MIN_VENUE_MATCHES} away matches`);

    if (sampleFailures.length) {
      rejected.push({
        fixtureId: fixture.external_fixture_id,
        reason: sampleFailures[0],
        failures: sampleFailures
      });
      continue;
    }

    try {
      const overallHome = buildAthenaTeamInput(home.name, homeRows, fixture.home_team_id);
      const overallAway = buildAthenaTeamInput(away.name, awayRows, fixture.away_team_id);
      const venueHome = buildAthenaTeamInput(home.name, homeVenueRows, fixture.home_team_id, "home");
      const venueAway = buildAthenaTeamInput(away.name, awayVenueRows, fixture.away_team_id, "away");
      const odds = extractAthenaOdds(fixture);

      const baseInput = {
        id: String(fixture.external_fixture_id),
        league: `${league.country || ""} · ${league.name || ""}`.replace(/^ · /, ""),
        kickoff: fixture.fixture_date,
        home: withVenueSnapshot(overallHome, venueHome),
        away: withVenueSnapshot(overallAway, venueAway),
        ...(odds ? { odds } : {})
      };

      const result = analyseFixture(baseInput);
      const venueResult = analyseFixture({
        ...baseInput,
        home: venueHome,
        away: venueAway
      });
      const separation = evaluateAthenaSeparationV2(result);
      const arbitration = arbitrateAthenaV11({ result, venueResult, samples, separation });

      if (arbitration.primary?.market === MARKETS.NO_PICK) {
        const conflictHardStop = arbitration.rule === "CONFLICT_HARD_STOP";
        rejected.push({
          fixtureId: fixture.external_fixture_id,
          reason: conflictHardStop
            ? "Athena conflict hard stop — no clear shared HT/FT market"
            : arbitration.primary?.reasons?.[0] || "Athena v1.1.1 returned NO PICK",
          failures: [
            ...(result.classification?.warnings || []),
            ...(result.oddsConflict?.conflict ? ["ODDS_DIRECTION_CONFLICT"] : []),
            ...(arbitration.primary?.warnings || [])
          ],
          observation: conflictHardStop
            ? {
                bestOverall: arbitration.bestOverall || null,
                bestGoal: arbitration.bestGoal || null,
                note: "Observation only — not an official Athena selection"
              }
            : null
        });
        continue;
      }

      const market = arbitration.primary.market;
      const settlement = settleAthenaMarket(fixture, market);
      const selection = athenaSelectionLabel(market, home.name, away.name);
      const grade = Number(arbitration.primary.score || 0) >= ATHENA_PRIME_SCORE ? "PRIME" : "QUALIFIED";

      accepted.push({
        fixtureId: fixture.external_fixture_id,
        internalFixtureId: fixture.id,
        kickoff: fixture.fixture_date,
        status: fixture.status,
        matchState: fixtureMatchState(fixture, settlement),
        settlement,
        home,
        away,
        league,
        engine: ATHENA_ENGINE_NAME,
        engineVersion: ATHENA_ENGINE_VERSION,
        runtimeEngineVersion: ATHENA_RUNTIME_VERSION,
        arbitrationVersion: ATHENA_ARBITRATION_VERSION,
        mode: "separation-v2",
        separationVersion: ATHENA_SEPARATION_VERSION,
        grade,
        score: Number(arbitration.primary.score || 0),
        marketId: market,
        market: marketGroup(market),
        selection,
        selected: arbitration.primary,
        classification: result.classification,
        separation,
        story: result.story,
        arbitration,
        alternatives: (arbitration.alternatives || []).map((item) => ({
          marketId: item.market,
          marketName: athenaSelectionLabel(item.market, home.name, away.name),
          score: item.score,
          role: item.role,
          warnings: item.warnings || []
        })),
        explanation: explanationFor(result, venueResult, samples, arbitration, separation),
        samples,
        oddsConflict: result.oddsConflict,
        routeAudit: routeAudit(result.routes)
      });
    } catch (error) {
      rejected.push({
        fixtureId: fixture.external_fixture_id,
        reason: error?.message || "Athena evaluation failed"
      });
    }
  }

  const picks = rankAthenaPicks(accepted);
  return {
    date,
    generatedAt: new Date().toISOString(),
    engine: ATHENA_ENGINE_NAME,
    engineVersion: ATHENA_ENGINE_VERSION,
    runtimeEngineVersion: ATHENA_RUNTIME_VERSION,
    arbitrationVersion: ATHENA_ARBITRATION_VERSION,
    mode: "score-safety-v1.1.1",
    reviewedFixtures: fixtures.length,
    qualifiedCount: picks.length,
    primeCount: picks.filter((pick) => pick.grade === "PRIME").length,
    rejectedCount: rejected.length,
    criteria: {
      minimumOverallMatches: MIN_OVERALL_MATCHES,
      minimumVenueMatches: MIN_VENUE_MATCHES,
      qualifiedScore: ATHENA_PRIMARY_SCORE,
      primeScore: ATHENA_PRIME_SCORE,
      onePickOnly: true,
      frozenScoringCore: true,
      scoreSafetyArbitration: true,
      conflictNoPickHardStop: true,
      classifications: Object.values(CLASSIFICATIONS)
    },
    picks,
    rejections: rejectionCounter(rejected),
    status: picks.length
      ? `${picks.length} Athena v1.1.1 pick${picks.length === 1 ? "" : "s"} cleared score-and-safety arbitration.`
      : "NO ATHENA PICK — no fixture cleared Athena v1.1.1 score-and-safety arbitration."
  };
}

export function invalidateAthenaPickCache(date = null) {
  if (!date) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (String(key).endsWith(`:${date}`)) cache.delete(key);
  }
}

export async function getAthenaPicks(supabase, date, { force = false } = {}) {
  const key = `${ATHENA_ENGINE_VERSION}:${date}`;
  if (force) cache.delete(key);
  const cached = cache.get(key);

  if (cached?.value && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return { ...cached.value, cached: true };
  }
  if (cached?.pending) return cached.pending;

  const pending = buildAthenaPicks(supabase, date)
    .then((value) => {
      cache.set(key, { createdAt: Date.now(), value });
      return { ...value, cached: false };
    })
    .catch((error) => {
      cache.delete(key);
      throw error;
    });

  cache.set(key, { createdAt: Date.now(), pending });
  return pending;
}
