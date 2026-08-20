import {
  ATHENA_ENGINE_VERSION,
  ATHENA_PROFILE_STATUSES,
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
import { competitionPolicy } from "../engine/competitionPolicy.js";
import { fetchAllRows, throwIfSupabaseError } from "./supabaseHelpers.js";
import {
  applyLeagueScoringGuard,
  classifyLeagueScoringFromMatches
} from "../engine/leagueScoringPolicy.js";

const MIN_OVERALL_MATCHES = 8;
const MIN_VENUE_MATCHES = 5;
const MAX_OVERALL_MATCHES = 40;
const MAX_VENUE_MATCHES = 20;
const RECENT_MATCHES = 6;
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
  [MARKETS.AWAY_OVER_0_5, "AWAY"],
  [MARKETS.HOME_SECOND_HALF_OVER_0_5, "HOME"],
  [MARKETS.AWAY_SECOND_HALF_OVER_0_5, "AWAY"],
  [MARKETS.HOME_SECOND_HALF_DNB, "HOME"],
  [MARKETS.AWAY_SECOND_HALF_DNB, "AWAY"]
]);

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validFinishedFixture(fixture) {
  return (
    ATHENA_PROFILE_STATUSES.has(fixture?.status) &&
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

function eventPerspective(fixture, teamId, home) {
  const events = Array.isArray(fixture._athenaEvents) ? fixture._athenaEvents : [];
  const coverageComplete = fixture._athenaCoverage?.status === "COMPLETE";
  if (!coverageComplete) {
    return {
      eventCoverageComplete: false,
      goalsWhileTrailing: 0,
      equalisersScored: 0,
      winningGoalsAfterEqualising: 0,
      leadsSurrendered: 0,
      minute46To60For: 0,
      minute61To75For: 0,
      minute76To90For: 0
    };
  }

  let goalsWhileTrailing = 0;
  let equalisersScored = 0;
  let winningGoalsAfterEqualising = 0;
  let leadsSurrendered = 0;
  let minute46To60For = 0;
  let minute61To75For = 0;
  let minute76To90For = 0;

  for (const event of events) {
    const scorerIsTeam = Number(event.scoring_team_id) === Number(teamId);
    if (scorerIsTeam) {
      if (event.is_comeback_goal) goalsWhileTrailing += 1;
      if (event.is_equaliser) equalisersScored += 1;
      if (event.is_winning_goal_after_equalising) winningGoalsAfterEqualising += 1;
      const minute = Number(event.minute || 0) + Number(event.extra_minute || 0);
      if (minute >= 46 && minute <= 60) minute46To60For += 1;
      else if (minute >= 61 && minute <= 75) minute61To75For += 1;
      else if (minute >= 76) minute76To90For += 1;
      continue;
    }

    const beforeFor = Number(home ? event.home_score_before : event.away_score_before);
    const beforeAgainst = Number(home ? event.away_score_before : event.home_score_before);
    const afterFor = Number(home ? event.home_score_after : event.away_score_after);
    const afterAgainst = Number(home ? event.away_score_after : event.home_score_after);
    if (beforeFor > beforeAgainst && afterFor <= afterAgainst) leadsSurrendered += 1;
  }

  return {
    eventCoverageComplete: true,
    goalsWhileTrailing,
    equalisersScored,
    winningGoalsAfterEqualising,
    leadsSurrendered,
    minute46To60For,
    minute61To75For,
    minute76To90For
  };
}

function teamPerspective(fixture, teamId) {
  const home = Number(fixture.home_team_id) === Number(teamId);
  const htFor = Number(home ? fixture.halftime_home : fixture.halftime_away);
  const htAgainst = Number(home ? fixture.halftime_away : fixture.halftime_home);
  const ftFor = Number(home ? fixture.fulltime_home : fixture.fulltime_away);
  const ftAgainst = Number(home ? fixture.fulltime_away : fixture.fulltime_home);
  const secondHalfFor = Math.max(0, ftFor - htFor);
  const secondHalfAgainst = Math.max(0, ftAgainst - htAgainst);
  const eventMetrics = eventPerspective(fixture, teamId, home);

  return {
    date: fixture.fixture_date,
    venue: home ? "home" : "away",
    htFor,
    htAgainst,
    ftFor,
    ftAgainst,
    secondHalfFor,
    secondHalfAgainst,
    transition: `${resultLetter(htFor, htAgainst)}${resultLetter(ftFor, ftAgainst)}`,
    totalGoals: ftFor + ftAgainst,
    over15: ftFor + ftAgainst >= 2,
    over25: ftFor + ftAgainst >= 3,
    btts: ftFor > 0 && ftAgainst > 0,
    scored: ftFor > 0,
    conceded: ftAgainst > 0,
    failedToScore: ftFor === 0,
    cleanSheet: ftAgainst === 0,
    firstHalfScored: htFor > 0,
    firstHalfConceded: htAgainst > 0,
    secondHalfScored: secondHalfFor > 0,
    secondHalfConceded: secondHalfAgainst > 0,
    firstHalfOver05: htFor + htAgainst >= 1,
    firstHalfOver15: htFor + htAgainst >= 2,
    secondHalfOver05: secondHalfFor + secondHalfAgainst >= 1,
    secondHalfOver15: secondHalfFor + secondHalfAgainst >= 2,
    scoredBothHalves: htFor > 0 && secondHalfFor > 0,
    goalsBothHalves: htFor + htAgainst > 0 && secondHalfFor + secondHalfAgainst > 0,
    secondHalfWin: secondHalfFor > secondHalfAgainst,
    secondHalfDraw: secondHalfFor === secondHalfAgainst,
    ...eventMetrics
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
  const totals = {
    over15: 0,
    over25: 0,
    btts: 0,
    scoredMatches: 0,
    concededMatches: 0,
    failedToScoreMatches: 0,
    cleanSheetMatches: 0,
    totalGoals: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    firstHalfGoalsFor: 0,
    firstHalfGoalsAgainst: 0,
    secondHalfGoalsFor: 0,
    secondHalfGoalsAgainst: 0,
    firstHalfScoringMatches: 0,
    firstHalfConcedingMatches: 0,
    secondHalfScoringMatches: 0,
    secondHalfConcedingMatches: 0,
    firstHalfOver05: 0,
    firstHalfOver15: 0,
    secondHalfOver05: 0,
    secondHalfOver15: 0,
    scoredBothHalves: 0,
    goalsBothHalves: 0,
    secondHalfWins: 0,
    secondHalfDraws: 0,
    eventCoverageMatches: 0,
    goalsWhileTrailing: 0,
    equalisersScored: 0,
    winningGoalsAfterEqualising: 0,
    leadsSurrendered: 0,
    minute46To60For: 0,
    minute61To75For: 0,
    minute76To90For: 0
  };

  for (const match of matches) {
    htft[match.transition] += 1;
    totals.over15 += match.over15 ? 1 : 0;
    totals.over25 += match.over25 ? 1 : 0;
    totals.btts += match.btts ? 1 : 0;
    totals.scoredMatches += match.scored ? 1 : 0;
    totals.concededMatches += match.conceded ? 1 : 0;
    totals.failedToScoreMatches += match.failedToScore ? 1 : 0;
    totals.cleanSheetMatches += match.cleanSheet ? 1 : 0;
    totals.totalGoals += match.totalGoals;
    totals.goalsFor += match.ftFor;
    totals.goalsAgainst += match.ftAgainst;
    totals.firstHalfGoalsFor += match.htFor;
    totals.firstHalfGoalsAgainst += match.htAgainst;
    totals.secondHalfGoalsFor += match.secondHalfFor;
    totals.secondHalfGoalsAgainst += match.secondHalfAgainst;
    totals.firstHalfScoringMatches += match.firstHalfScored ? 1 : 0;
    totals.firstHalfConcedingMatches += match.firstHalfConceded ? 1 : 0;
    totals.secondHalfScoringMatches += match.secondHalfScored ? 1 : 0;
    totals.secondHalfConcedingMatches += match.secondHalfConceded ? 1 : 0;
    totals.firstHalfOver05 += match.firstHalfOver05 ? 1 : 0;
    totals.firstHalfOver15 += match.firstHalfOver15 ? 1 : 0;
    totals.secondHalfOver05 += match.secondHalfOver05 ? 1 : 0;
    totals.secondHalfOver15 += match.secondHalfOver15 ? 1 : 0;
    totals.scoredBothHalves += match.scoredBothHalves ? 1 : 0;
    totals.goalsBothHalves += match.goalsBothHalves ? 1 : 0;
    totals.secondHalfWins += match.secondHalfWin ? 1 : 0;
    totals.secondHalfDraws += match.secondHalfDraw ? 1 : 0;
    totals.eventCoverageMatches += match.eventCoverageComplete ? 1 : 0;
    totals.goalsWhileTrailing += match.goalsWhileTrailing;
    totals.equalisersScored += match.equalisersScored;
    totals.winningGoalsAfterEqualising += match.winningGoalsAfterEqualising;
    totals.leadsSurrendered += match.leadsSurrendered;
    totals.minute46To60For += match.minute46To60For;
    totals.minute61To75For += match.minute61To75For;
    totals.minute76To90For += match.minute76To90For;
  }

  const count = matches.length;
  const rate = (value) => count ? value / count : 0;
  return {
    name,
    matchesPlayed: count,
    htft,
    goals: {
      over15: totals.over15,
      over25: totals.over25,
      under25: count - totals.over25,
      btts: totals.btts,
      scoredMatches: totals.scoredMatches,
      concededMatches: totals.concededMatches,
      failedToScoreMatches: totals.failedToScoreMatches,
      cleanSheetMatches: totals.cleanSheetMatches,
      averageTotalGoals: count ? totals.totalGoals / count : 0,
      goalsFor: totals.goalsFor,
      goalsAgainst: totals.goalsAgainst,
      firstHalfGoalsFor: totals.firstHalfGoalsFor,
      firstHalfGoalsAgainst: totals.firstHalfGoalsAgainst,
      secondHalfGoalsFor: totals.secondHalfGoalsFor,
      secondHalfGoalsAgainst: totals.secondHalfGoalsAgainst,
      firstHalfScoringMatches: totals.firstHalfScoringMatches,
      firstHalfConcedingMatches: totals.firstHalfConcedingMatches,
      secondHalfScoringMatches: totals.secondHalfScoringMatches,
      secondHalfConcedingMatches: totals.secondHalfConcedingMatches,
      firstHalfOver05: totals.firstHalfOver05,
      firstHalfOver15: totals.firstHalfOver15,
      secondHalfOver05: totals.secondHalfOver05,
      secondHalfOver15: totals.secondHalfOver15,
      scoredBothHalves: totals.scoredBothHalves,
      goalsBothHalves: totals.goalsBothHalves,
      secondHalfWins: totals.secondHalfWins,
      secondHalfDraws: totals.secondHalfDraws,
      scoringRate: rate(totals.scoredMatches),
      concedingRate: rate(totals.concededMatches),
      failedToScoreRate: rate(totals.failedToScoreMatches),
      cleanSheetRate: rate(totals.cleanSheetMatches),
      firstHalfScoringRate: rate(totals.firstHalfScoringMatches),
      firstHalfConcedingRate: rate(totals.firstHalfConcedingMatches),
      secondHalfScoringRate: rate(totals.secondHalfScoringMatches),
      secondHalfConcedingRate: rate(totals.secondHalfConcedingMatches),
      firstHalfOver05Rate: rate(totals.firstHalfOver05),
      firstHalfOver15Rate: rate(totals.firstHalfOver15),
      secondHalfOver05Rate: rate(totals.secondHalfOver05),
      secondHalfOver15Rate: rate(totals.secondHalfOver15),
      scoredBothHalvesRate: rate(totals.scoredBothHalves),
      goalsBothHalvesRate: rate(totals.goalsBothHalves),
      secondHalfWinRate: rate(totals.secondHalfWins),
      secondHalfDrawRate: rate(totals.secondHalfDraws),
      eventCoverageMatches: totals.eventCoverageMatches,
      goalsWhileTrailing: totals.goalsWhileTrailing,
      equalisersScored: totals.equalisersScored,
      winningGoalsAfterEqualising: totals.winningGoalsAfterEqualising,
      leadsSurrendered: totals.leadsSurrendered,
      minute46To60For: totals.minute46To60For,
      minute61To75For: totals.minute61To75For,
      minute76To90For: totals.minute76To90For,
      last5Over25: matches.slice(0, 5).map((match) => match.over25)
    },
    venue: venueType
      ? { type: venueType.toUpperCase(), matchesPlayed: count, htft: { ...htft }, goals: null }
      : null
  };
}

function snapshot(team, type = null) {
  return {
    type,
    matchesPlayed: team?.matchesPlayed || 0,
    htft: team?.htft || emptyTransitions(),
    goals: team?.goals || null
  };
}

function withEvidenceSnapshots(team, venueTeam, recentTeam) {
  return {
    ...team,
    venue: snapshot(venueTeam, venueTeam?.venue?.type || null),
    recent: snapshot(recentTeam, "RECENT6")
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
  if ([
    MARKETS.HOME_DNB,
    MARKETS.AWAY_DNB,
    MARKETS.HOME_DOUBLE_CHANCE,
    MARKETS.AWAY_DOUBLE_CHANCE,
    MARKETS.FULL_TIME_DRAW
  ].includes(market)) {
    return "Match Result";
  }
  if ([MARKETS.HOME_OVER_0_5, MARKETS.AWAY_OVER_0_5].includes(market)) {
    return "Team Goals";
  }
  if ([MARKETS.HOME_SECOND_HALF_DNB, MARKETS.AWAY_SECOND_HALF_DNB].includes(market)) {
    return "Second Half Result";
  }
  if ([
    MARKETS.HOME_SECOND_HALF_OVER_0_5,
    MARKETS.AWAY_SECOND_HALF_OVER_0_5,
    MARKETS.SECOND_HALF_OVER_0_5,
    MARKETS.SECOND_HALF_OVER_1_5
  ].includes(market)) {
    return "Second Half";
  }
  if ([MARKETS.OVER_1_5, MARKETS.OVER_2_5, MARKETS.UNDER_2_5, MARKETS.UNDER_3_5].includes(market)) {
    return "Total Goals";
  }
  if ([MARKETS.FIRST_HALF_UNDER_1_5, MARKETS.FIRST_HALF_OVER_0_5, MARKETS.HALF_TIME_DRAW].includes(market)) {
    return "First Half";
  }
  if (market === MARKETS.GOALS_BOTH_HALVES) return "Goals in Both Halves";
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
    [MARKETS.HOME_SECOND_HALF_OVER_0_5]: `${homeName} to Score in the Second Half`,
    [MARKETS.AWAY_SECOND_HALF_OVER_0_5]: `${awayName} to Score in the Second Half`,
    [MARKETS.HOME_SECOND_HALF_DNB]: `${homeName} Second Half Draw No Bet`,
    [MARKETS.AWAY_SECOND_HALF_DNB]: `${awayName} Second Half Draw No Bet`,
    [MARKETS.OVER_1_5]: "Over 1.5 Match Goals",
    [MARKETS.OVER_2_5]: "Over 2.5 Match Goals",
    [MARKETS.UNDER_2_5]: "Under 2.5 Match Goals",
    [MARKETS.UNDER_3_5]: "Under 3.5 Match Goals",
    [MARKETS.FIRST_HALF_UNDER_1_5]: "First Half Under 1.5 Goals",
    [MARKETS.FIRST_HALF_OVER_0_5]: "First Half Over 0.5 Goals",
    [MARKETS.SECOND_HALF_OVER_0_5]: "Second Half Over 0.5 Goals",
    [MARKETS.SECOND_HALF_OVER_1_5]: "Second Half Over 1.5 Goals",
    [MARKETS.GOALS_BOTH_HALVES]: "Goals in Both Halves",
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
  if (!ATHENA_PROFILE_STATUSES.has(fixture.status)) {
    return {
      outcome: "REVIEW",
      reason: "Athena settles 90-minute markets only; this fixture finished after extra time, a shootout or an administrative decision.",
      persisted: false
    };
  }
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
    case MARKETS.SECOND_HALF_OVER_0_5:
      outcome = sh + sa >= 1 ? "WIN" : "LOSS";
      break;
    case MARKETS.SECOND_HALF_OVER_1_5:
      outcome = sh + sa >= 2 ? "WIN" : "LOSS";
      break;
    case MARKETS.HOME_SECOND_HALF_OVER_0_5:
      outcome = sh >= 1 ? "WIN" : "LOSS";
      break;
    case MARKETS.AWAY_SECOND_HALF_OVER_0_5:
      outcome = sa >= 1 ? "WIN" : "LOSS";
      break;
    case MARKETS.HOME_SECOND_HALF_DNB:
      outcome = sh > sa ? "WIN" : sh === sa ? "VOID" : "LOSS";
      break;
    case MARKETS.AWAY_SECOND_HALF_DNB:
      outcome = sa > sh ? "WIN" : sh === sa ? "VOID" : "LOSS";
      break;
    case MARKETS.GOALS_BOTH_HALVES:
      outcome = hh + ha >= 1 && sh + sa >= 1 ? "WIN" : "LOSS";
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
          .select("id,external_league_id,name,country,season,logo_url,competition_type,prediction_enabled,prediction_exclusion_reason")
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
  const select = "id,external_fixture_id,league_id,season,fixture_date,home_team_id,away_team_id,halftime_home,halftime_away,fulltime_home,fulltime_away,status";
  const [homeRows, awayRows] = await Promise.all([
    fetchAllRows(() =>
      supabase
        .from("fixtures")
        .select(select)
        .in("status", [...ATHENA_PROFILE_STATUSES])
        .in("home_team_id", teamIds)
        .order("fixture_date", { ascending: false })
    ),
    fetchAllRows(() =>
      supabase
        .from("fixtures")
        .select(select)
        .in("status", [...ATHENA_PROFILE_STATUSES])
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

function missingAthenaEventTable(error) {
  const message = String(error?.message || error || "");
  return error?.code === "42P01" ||
    /fixture_goal_events|fixture_event_coverage|relation .* does not exist/i.test(message);
}

async function fetchRowsInChunks(supabase, table, select, column, values, chunkSize = 400) {
  const rows = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    const chunk = values.slice(index, index + chunkSize);
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .in(column, chunk);
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
}

async function loadAthenaEventContext(supabase, fixtures) {
  const fixtureIds = [...new Set(fixtures.map((fixture) => Number(fixture.id)).filter(Boolean))];
  if (!fixtureIds.length) {
    return { coverageByFixture: new Map(), eventsByFixture: new Map(), available: false };
  }

  try {
    const [coverageRows, eventRows] = await Promise.all([
      fetchRowsInChunks(
        supabase,
        "fixture_event_coverage",
        "fixture_id,status,goals_expected,goals_recorded,last_attempted_at,error_message",
        "fixture_id",
        fixtureIds
      ),
      fetchRowsInChunks(
        supabase,
        "fixture_goal_events",
        "fixture_id,scoring_team_id,minute,extra_minute,home_score_before,away_score_before,home_score_after,away_score_after,is_equaliser,is_comeback_goal,is_winning_goal_after_equalising",
        "fixture_id",
        fixtureIds
      )
    ]);

    const coverageByFixture = new Map(
      coverageRows.map((row) => [Number(row.fixture_id), row])
    );
    const eventsByFixture = new Map();
    for (const row of eventRows) {
      const key = Number(row.fixture_id);
      if (!eventsByFixture.has(key)) eventsByFixture.set(key, []);
      eventsByFixture.get(key).push(row);
    }
    for (const rows of eventsByFixture.values()) {
      rows.sort((a, b) =>
        Number(a.minute || 0) - Number(b.minute || 0) ||
        Number(a.extra_minute || 0) - Number(b.extra_minute || 0)
      );
    }

    return { coverageByFixture, eventsByFixture, available: true };
  } catch (error) {
    if (!missingAthenaEventTable(error)) throw error;
    return {
      coverageByFixture: new Map(),
      eventsByFixture: new Map(),
      available: false,
      warning: "Athena event tables are not installed yet"
    };
  }
}

function attachAthenaEventContext(fixtures, context) {
  return fixtures.map((fixture) => ({
    ...fixture,
    _athenaCoverage: context.coverageByFixture.get(Number(fixture.id)) || null,
    _athenaEvents: context.eventsByFixture.get(Number(fixture.id)) || []
  }));
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

function roundedPercent(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) : null;
}

function percentageText(value) {
  const percent = roundedPercent(value);
  return percent === null ? "not available" : `${percent}%`;
}

function publicReasonsForMarket(result, primary) {
  const home = result.metrics?.home;
  const away = result.metrics?.away;
  const side = marketSide(primary?.market);
  const selected = side === "HOME" ? home : side === "AWAY" ? away : null;
  const opponent = side === "HOME" ? away : side === "AWAY" ? home : null;
  const reasons = [];

  switch (primary?.market) {
    case MARKETS.SECOND_HALF_OVER_0_5:
      reasons.push(
        `At least one second-half goal appeared in ${percentageText(home?.secondHalfOver05Rate)} of ${home?.name}'s matches and ${percentageText(away?.secondHalfOver05Rate)} of ${away?.name}'s.`
      );
      reasons.push("The HT/FT patterns also show that these teams often change the match after the break.");
      break;
    case MARKETS.SECOND_HALF_OVER_1_5:
      reasons.push(
        `Two or more second-half goals appeared in ${percentageText(home?.secondHalfOver15Rate)} of ${home?.name}'s matches and ${percentageText(away?.secondHalfOver15Rate)} of ${away?.name}'s.`
      );
      reasons.push("Athena only keeps this higher line when the second-half goal volume agrees with the swing pattern.");
      break;
    case MARKETS.HOME_SECOND_HALF_OVER_0_5:
    case MARKETS.AWAY_SECOND_HALF_OVER_0_5:
      reasons.push(
        `${selected?.name} scored after half-time in ${percentageText(selected?.secondHalfScoringRate)} of the sample.`
      );
      reasons.push(
        `${opponent?.name} conceded after half-time in ${percentageText(opponent?.secondHalfConcedingRate)} of the sample.`
      );
      break;
    case MARKETS.HOME_SECOND_HALF_DNB:
    case MARKETS.AWAY_SECOND_HALF_DNB:
      reasons.push(
        `${selected?.name} produced the stronger second-half score in ${percentageText(selected?.secondHalfWinRate)} of the sample.`
      );
      reasons.push("The draw is protected because Athena trusts the second-half direction more than a full-match winner.");
      break;
    case MARKETS.GOALS_BOTH_HALVES:
      reasons.push(
        `Goals appeared in both halves in ${percentageText(home?.goalsBothHalvesRate)} of ${home?.name}'s matches and ${percentageText(away?.goalsBothHalvesRate)} of ${away?.name}'s.`
      );
      reasons.push("Both the early and late goal records are active enough for this market.");
      break;
    case MARKETS.BTTS_YES:
      reasons.push(
        `${home?.name} scored in ${percentageText(home?.scoringRate)} of the sample, while ${away?.name} scored in ${percentageText(away?.scoringRate)}.`
      );
      reasons.push("Athena checked that the expected goals are not coming from only one team.");
      break;
    case MARKETS.OVER_1_5:
      reasons.push(
        `The two teams' matches average about ${Number(result.classification?.combinedAvgGoals || 0).toFixed(1)} goals.`
      );
      reasons.push("The HT/FT routes show enough movement for at least two goals, without forcing a winner.");
      break;
    case MARKETS.OVER_2_5:
      reasons.push(
        `The combined Over 2.5 record is about ${percentageText(result.classification?.combinedOver25)}.`
      );
      reasons.push("The match has more than one route to reach three goals.");
      break;
    case MARKETS.UNDER_2_5:
    case MARKETS.UNDER_3_5:
      reasons.push(
        `The teams' goal records and HT/FT structure point to a controlled scoring range.`
      );
      reasons.push("Athena checked that the visible swing risk was not strong enough to break the goal ceiling.");
      break;
    case MARKETS.FIRST_HALF_OVER_0_5:
      reasons.push(
        `A first-half goal appeared in ${percentageText(home?.firstHalfOver05Rate)} of ${home?.name}'s matches and ${percentageText(away?.firstHalfOver05Rate)} of ${away?.name}'s.`
      );
      break;
    case MARKETS.FIRST_HALF_UNDER_1_5:
      reasons.push(
        `The first half stayed below two goals in ${percentageText(Number.isFinite(home?.firstHalfOver15Rate) ? 1 - home.firstHalfOver15Rate : null)} of ${home?.name}'s matches and ${percentageText(Number.isFinite(away?.firstHalfOver15Rate) ? 1 - away.firstHalfOver15Rate : null)} of ${away?.name}'s.`
      );
      break;
    default:
      if (selected && opponent) {
        reasons.push(`${selected.name} has the clearer HT/FT route in the relevant home-and-away split.`);
        reasons.push(`${opponent.name}'s recovery and lead-protection record was checked before Athena kept the team direction.`);
      } else {
        reasons.push(result.story);
      }
  }

  return [...new Set(reasons.filter(Boolean))];
}

function explanationFor(result, venueResult, samples, arbitration) {
  const primary = arbitration?.primary || result.banker;
  const home = result.metrics?.home;
  const away = result.metrics?.away;
  const eventCoverageRate = Math.min(
    Number(home?.eventCoverageRate || 0),
    Number(away?.eventCoverageRate || 0)
  );
  const cautions = [];

  if (eventCoverageRate < 0.70) {
    cautions.push(
      "Exact goal timing is incomplete, so Athena used confirmed half-time and full-time scores and did not rely on missing event details."
    );
  } else if (result.classification?.eventConfirmation) {
    cautions.push("The available goal events also confirm the comeback or lead-surrender pattern seen in the half-time and full-time scores.");
  } else {
    cautions.push("Goal-event coverage is strong, but it did not add a separate comeback confirmation, so Athena relied on the confirmed goals-by-half picture only.");
  }
  if (result.oddsConflict?.conflict) {
    cautions.push("The bookmaker direction disagreed with the statistical direction, so Athena avoided forcing the conflicted team market.");
  }
  if (result.classification?.warnings?.includes("DIRECTIONAL_CONFLICT")) {
    cautions.push("Both teams still have credible routes, so Athena favoured a neutral goal market.");
  }
  cautions.push("The score measures how strongly the rules agree; it is not a guaranteed probability.");

  return {
    summary: result.story,
    whyPick: publicReasonsForMarket(result, primary),
    reasons: publicReasonsForMarket(result, primary),
    cautions: [...new Set(cautions)],
    samples,
    dataPicture: {
      home: {
        name: home?.name,
        firstHalfScoring: roundedPercent(home?.firstHalfScoringRate),
        secondHalfScoring: roundedPercent(home?.secondHalfScoringRate),
        secondHalfConceding: roundedPercent(home?.secondHalfConcedingRate),
        secondHalfOver05: roundedPercent(home?.secondHalfOver05Rate),
        secondHalfOver15: roundedPercent(home?.secondHalfOver15Rate),
        goalsBothHalves: roundedPercent(home?.goalsBothHalvesRate)
      },
      away: {
        name: away?.name,
        firstHalfScoring: roundedPercent(away?.firstHalfScoringRate),
        secondHalfScoring: roundedPercent(away?.secondHalfScoringRate),
        secondHalfConceding: roundedPercent(away?.secondHalfConcedingRate),
        secondHalfOver05: roundedPercent(away?.secondHalfOver05Rate),
        secondHalfOver15: roundedPercent(away?.secondHalfOver15Rate),
        goalsBothHalves: roundedPercent(away?.goalsBothHalvesRate)
      }
    },
    coverage: {
      halfTimeScores: "COMPLETE",
      eventDetail: eventCoverageRate >= 0.70 ? "FULL" : eventCoverageRate > 0 ? "PARTIAL" : "NOT_AVAILABLE",
      eventCoveragePercent: Math.round(eventCoverageRate * 100),
      swingConfirmedByEvents: Boolean(result.classification?.eventConfirmation)
    },
    matchType: String(result.classification?.type || "UNCLASSIFIED").replaceAll("_", " ").toLowerCase(),
    venueConfirmed: venueResult?.classification?.side
      ? venueResult.classification.side === result.classification?.side
      : null
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
      mode: "swing-half-goals-v3",
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
        halfGoalsEnabled: true,
        swingResolutionEnabled: true,
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
  const rawHistory = await loadTeamHistory(supabase, teamIds);
  const eventContext = await loadAthenaEventContext(supabase, rawHistory);
  const history = attachAthenaEventContext(rawHistory, eventContext);
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

    const policy = competitionPolicy(league);
    if (!policy.eligible) {
      rejected.push({
        fixtureId: fixture.external_fixture_id,
        reason: policy.reason,
        failures: ["COMPETITION_EXCLUDED", policy.type]
      });
      continue;
    }

    const kickoffTime = new Date(fixture.fixture_date).getTime();
    const sameCompetitionSeason = (row) =>
      Number(row.league_id) === Number(fixture.league_id) &&
      Number(row.season) === Number(fixture.season);
    const homeRows = newestFirst(historyByTeam.get(Number(fixture.home_team_id)) || [])
      .filter((row) => new Date(row.fixture_date).getTime() < kickoffTime)
      .filter(sameCompetitionSeason)
      .slice(0, MAX_OVERALL_MATCHES);
    const awayRows = newestFirst(historyByTeam.get(Number(fixture.away_team_id)) || [])
      .filter((row) => new Date(row.fixture_date).getTime() < kickoffTime)
      .filter(sameCompetitionSeason)
      .slice(0, MAX_OVERALL_MATCHES);

    const homeVenueRows = homeRows
      .filter((row) => Number(row.home_team_id) === Number(fixture.home_team_id))
      .slice(0, MAX_VENUE_MATCHES);
    const awayVenueRows = awayRows
      .filter((row) => Number(row.away_team_id) === Number(fixture.away_team_id))
      .slice(0, MAX_VENUE_MATCHES);
    const homeRecentRows = homeRows.slice(0, RECENT_MATCHES);
    const awayRecentRows = awayRows.slice(0, RECENT_MATCHES);

    const samples = {
      homeOverall: homeRows.length,
      homeVenue: homeVenueRows.length,
      homeRecent: homeRecentRows.length,
      awayOverall: awayRows.length,
      awayVenue: awayVenueRows.length,
      awayRecent: awayRecentRows.length
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
      const recentHome = buildAthenaTeamInput(home.name, homeRecentRows, fixture.home_team_id);
      const recentAway = buildAthenaTeamInput(away.name, awayRecentRows, fixture.away_team_id);
      const odds = extractAthenaOdds(fixture);

      const baseInput = {
        id: String(fixture.external_fixture_id),
        league: `${league.country || ""} · ${league.name || ""}`.replace(/^ · /, ""),
        kickoff: fixture.fixture_date,
        home: withEvidenceSnapshots(overallHome, venueHome, recentHome),
        away: withEvidenceSnapshots(overallAway, venueAway, recentAway),
        ...(odds ? { odds } : {})
      };

      const result = analyseFixture(baseInput);
      const venueResult = analyseFixture({
        ...baseInput,
        home: withEvidenceSnapshots(venueHome, venueHome, recentHome),
        away: withEvidenceSnapshots(venueAway, venueAway, recentAway)
      });
      const separation = evaluateAthenaSeparationV2(result);
      const arbitration = arbitrateAthenaV11({ result, venueResult, samples, separation });

      if (arbitration.primary?.market === MARKETS.NO_PICK) {
        const conflictHardStop = arbitration.rule === "CONFLICT_HARD_STOP";
        rejected.push({
          fixtureId: fixture.external_fixture_id,
          reason: conflictHardStop
            ? "Athena hard stop — no safe shared HT/FT and half-goal route"
            : arbitration.primary?.reasons?.[0] || "Athena v3 returned NO PICK",
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

      const leagueClimate = classifyLeagueScoringFromMatches([...homeRows, ...awayRows]);
      let chosen = arbitration.primary;
      const guarded = applyLeagueScoringGuard({
        available: true,
        key: chosen.market,
        marketId: chosen.market,
        market: marketGroup(chosen.market),
        selection: athenaSelectionLabel(chosen.market, home.name, away.name)
      }, leagueClimate);
      if (guarded?.available === false) {
        const fallback = (arbitration.alternatives || []).find((item) => {
          if (!item?.market || item.market === MARKETS.NO_PICK) return false;
          const next = applyLeagueScoringGuard({
            available: true,
            key: item.market,
            marketId: item.market,
            market: marketGroup(item.market),
            selection: athenaSelectionLabel(item.market, home.name, away.name)
          }, leagueClimate);
          return next?.available !== false;
        });
        if (!fallback) {
          rejected.push({
            fixtureId: fixture.external_fixture_id,
            reason: guarded.leagueGoalsFlag?.reason || "Athena totals pick contradicted the league scoring climate",
            failures: [guarded.leagueGoalsFlag?.code || "LEAGUE_GOALS"]
          });
          continue;
        }
        chosen = fallback;
      }

      const market = chosen.market;
      const settlement = settleAthenaMarket(fixture, market);
      const selection = athenaSelectionLabel(market, home.name, away.name);
      const grade = Number(chosen.score || 0) >= ATHENA_PRIME_SCORE ? "PRIME" : "QUALIFIED";

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
        mode: "swing-half-goals-v3",
        separationVersion: ATHENA_SEPARATION_VERSION,
        grade,
        score: Number(chosen.score || 0),
        marketId: market,
        market: marketGroup(market),
        selection,
        selected: chosen,
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
        explanation: explanationFor(result, venueResult, samples, arbitration),
        internalAudit: {
          classification: result.classification,
          routes: routeAudit(result.routes),
          separation,
          arbitration,
          oddsConflict: result.oddsConflict,
          metrics: result.metrics
        },
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
    mode: "swing-half-goals-v3",
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
      halfGoalsEnabled: true,
      swingResolutionEnabled: true,
      conflictNoPickHardStop: true,
      falseSwingHardStop: true,
      halfGoalsRequiredForSwingMarkets: true,
      eventClaimsRequireCoverage: true,
      eventTablesAvailable: eventContext.available,
      classifications: Object.values(CLASSIFICATIONS)
    },
    picks,
    rejections: rejectionCounter(rejected),
    dataCoverage: {
      halfTimeAndFullTimeScores: "REQUIRED",
      eventTablesAvailable: eventContext.available,
      eventCoverageNote: eventContext.available
        ? "Event-level comeback details are used only where fixture coverage is complete."
        : "Half-goal analysis is active. Run the v1.20.0 Supabase migration to unlock event-level comeback details."
    },
    status: picks.length
      ? `${picks.length} Athena v3 pick${picks.length === 1 ? "" : "s"} cleared swing, half-goal and safety checks.`
      : "NO ATHENA PICK — no fixture cleared Athena v3’s swing, half-goal and safety checks."
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
