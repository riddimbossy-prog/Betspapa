#!/usr/bin/env node
"use strict";

/**
 * OMNI HT/FT GATEKEEPER ENGINE v2.5.2
 * ---------------------------------
 * Deterministic, dependency-free Node.js engine.
 *
 * Core principle:
 *   1) HT/FT statistics create every candidate market.
 *   2) Market-specific statistics confirm or reject it.
 *   3) Team streaks adjust current confidence.
 *   4) Contradictions and data-quality gates can force NO BET.
 *
 * Supported markets:
 *   Match totals, team totals, BTTS, 1X2, DNB, double chance,
 *   first/second-half goals, win either half, score in both halves,
 *   lead at any time, clean sheet, and win to nil.
 *
 * Input:
 *   node omni_htft_engine.js input.json
 *
 * Module:
 *   const { runEngine } = require("./omni_htft_engine");
 *   const result = runEngine(input);
 *
 * Percentages in output are decimals in [0,1].
 *
 * v2.1 change (2026-07-19):
 *   HOME_SCORE_FIRST and AWAY_SCORE_FIRST removed as candidate markets.
 *   Backtest on 2025/26 top-5 leagues: they settled 17W-12L (58.6%), below
 *   typical market break-even, with anti-calibrated scores. Their fixtures
 *   now resolve to Lead At Any Time or No Bet (replacement record 9W-3L).
 *   The scoredFirst input field is retained and still feeds other markets'
 *   confirmation stats. v2.4 applies strict or market-specific availability gates.
 *
 * v2.2 change (2026-07-19):
 *   1) SECOND_HALF_OVER_0_5 gains a mandatory form-balance gate
 *      (homePpgEdge >= -0.20). Backtest: picks with a much stronger away
 *      side hit 75% (12W-4L, below break-even at this market's pricing);
 *      the remainder hit 96%. Failure script: away favourite leads early,
 *      then closes out a goalless second half.
 *   2) SECOND_HALF_OVER_1_5 acceptance floor raised to 85 via per-market
 *      minScore (superseded in v2.3).
 *
 * v2.3 change (2026-07-19):
 *   SECOND_HALF_OVER_1_5 removed as a candidate market. Across 2024/25
 *   and 2025/26 top-5-league backtests it settled 4W-7L (36%), far below
 *   break-even at typical pricing, and a score-based floor failed
 *   out-of-sample validation. Per-market minScore support is retained
 *   as infrastructure.
 *
 * v2.4 audit hardening (2026-07-20):
 *   1) HT/FT weighting now uses same-venue windows only, preventing home/away
 *      orientation leakage from the opposite venue.
 *   2) Missing xG, score-order, or lead-order data blocks only markets that
 *      require those fields in non-strict mode; strict mode remains global.
 *   3) Empty/short samples return a controlled NO_BET instead of crashing.
 *   4) Date parsing supports ISO and DD/MM/YYYY safely.
 *   5) Removed stale registry entries for retired candidate markets.
 *   6) Final selection checks every near-tied contender for contradictions.
  *
 * v2.5.0 (2026-07-20) — merge of the audited v2.4.0 infrastructure with the
 * selection policy described by the submitted source as four-season validated:
 *   - Form-balance gate on SECOND_HALF_OVER_0_5 removed (sign-unstable
 *     across 2022/23-2025/26; pooled ~+1pt for -25% volume).
 *   - Selection restricted to CORE_MARKETS (goal-occurrence and
 *     lead/half-win families). All markets still evaluated and reported;
 *     tail markets pooled 61.5% at 80+ scores in the audited build and
 *     50.0% in the pre-audit line — uncalibrated — and cannot be selected.
 *   - All audited-build improvements retained: relevant-venue HT/FT
 *     weighting, per-market data-availability gates, controlled short-sample
 *     NO_BET, robust date parsing, conflict-cluster checking.
 *
 * v2.5.1 audited reporting fix (2026-07-20):
 *   - Non-core accepted markets are now labelled as ineligible for final
 *     selection instead of being presented as rejected or silently ignored.
 *   - A NO_BET result now distinguishes "no core market qualified" from
 *     "no market qualified" and reports blocked non-core qualifiers.
 *   - The output exposes the core-only selection policy and eligibility flag.
 *
 * v2.5.2 market-value update (2026-07-20):
 *   - Full-match total Over 0.5 removed completely from the executable market registry,
 *     scoring rules, streak rules and final selection policy because its
 *     typical odds do not provide worthwhile value.
 *   - Team 0.5 markets and first/second-half 0.5 markets are unchanged.
 */

const fs = require("fs");

const ENGINE_NAME = "OMNI HT/FT GATEKEEPER ENGINE v2.5.2";
const ENGINE_VERSION = "2.5.2";

const EPS = 1e-9;
const MARKET_MIN_SCORE = 80;
const PRIME_MIN_SCORE = 87;
const HTFT_MAX_POINTS = 40;
const COMPONENT_MAX_POINTS = 35;
const STREAK_MAX_POINTS = 15;
const CONTEXT_MAX_POINTS = 10;
const MIN_TOP_MARGIN = 3;

const HTFT_KEYS = ["1/1", "X/1", "2/1", "1/X", "X/X", "2/X", "1/2", "X/2", "2/2"];

const MARKET_NAMES = Object.freeze({
  MATCH_OVER_1_5: "Match Over 1.5 Goals",
  MATCH_OVER_2_5: "Match Over 2.5 Goals",
  MATCH_OVER_3_5: "Match Over 3.5 Goals",
  MATCH_UNDER_1_5: "Match Under 1.5 Goals",
  MATCH_UNDER_2_5: "Match Under 2.5 Goals",
  MATCH_UNDER_3_5: "Match Under 3.5 Goals",
  MATCH_UNDER_4_5: "Match Under 4.5 Goals",

  HOME_OVER_0_5: "Home Team Over 0.5 Goals",
  HOME_OVER_1_5: "Home Team Over 1.5 Goals",
  HOME_OVER_2_5: "Home Team Over 2.5 Goals",
  AWAY_OVER_0_5: "Away Team Over 0.5 Goals",
  AWAY_OVER_1_5: "Away Team Over 1.5 Goals",
  AWAY_OVER_2_5: "Away Team Over 2.5 Goals",

  HOME_UNDER_0_5: "Home Team Under 0.5 Goals",
  HOME_UNDER_1_5: "Home Team Under 1.5 Goals",
  HOME_UNDER_2_5: "Home Team Under 2.5 Goals",
  AWAY_UNDER_0_5: "Away Team Under 0.5 Goals",
  AWAY_UNDER_1_5: "Away Team Under 1.5 Goals",
  AWAY_UNDER_2_5: "Away Team Under 2.5 Goals",

  BTTS_YES: "Both Teams to Score — Yes",
  BTTS_NO: "Both Teams to Score — No",

  HOME_WIN: "Home Win",
  AWAY_WIN: "Away Win",
  DRAW: "Draw",
  HOME_DNB: "Home Draw No Bet",
  AWAY_DNB: "Away Draw No Bet",
  DOUBLE_CHANCE_1X: "Double Chance 1X",
  DOUBLE_CHANCE_X2: "Double Chance X2",
  DOUBLE_CHANCE_12: "Double Chance 12",

  FIRST_HALF_OVER_0_5: "First Half Over 0.5 Goals",
  FIRST_HALF_OVER_1_5: "First Half Over 1.5 Goals",
  FIRST_HALF_UNDER_1_5: "First Half Under 1.5 Goals",
  SECOND_HALF_OVER_0_5: "Second Half Over 0.5 Goals",

  HOME_WIN_EITHER_HALF: "Home Team to Win Either Half",
  AWAY_WIN_EITHER_HALF: "Away Team to Win Either Half",
  HOME_SCORE_BOTH_HALVES: "Home Team to Score in Both Halves",
  AWAY_SCORE_BOTH_HALVES: "Away Team to Score in Both Halves",

  NO_GOAL: "No Goal",
  HOME_LEAD_ANYTIME: "Home Team to Lead at Any Time",
  AWAY_LEAD_ANYTIME: "Away Team to Lead at Any Time",

  HOME_CLEAN_SHEET: "Home Team Clean Sheet",
  AWAY_CLEAN_SHEET: "Away Team Clean Sheet",
  HOME_WIN_TO_NIL: "Home Win to Nil",
  AWAY_WIN_TO_NIL: "Away Win to Nil"
});

const SAFETY_RANK = Object.freeze({
  MATCH_UNDER_4_5: 100,
  HOME_OVER_0_5: 98,
  AWAY_OVER_0_5: 98,
  HOME_UNDER_2_5: 97,
  AWAY_UNDER_2_5: 97,
  MATCH_UNDER_3_5: 96,
  MATCH_OVER_1_5: 95,
  DOUBLE_CHANCE_1X: 94,
  DOUBLE_CHANCE_X2: 94,
  HOME_DNB: 93,
  AWAY_DNB: 93,
  FIRST_HALF_UNDER_1_5: 92,
  SECOND_HALF_OVER_0_5: 91,
  FIRST_HALF_OVER_0_5: 90,
  HOME_LEAD_ANYTIME: 89,
  AWAY_LEAD_ANYTIME: 89,
  HOME_WIN_EITHER_HALF: 88,
  AWAY_WIN_EITHER_HALF: 88,
  MATCH_UNDER_2_5: 87,
  MATCH_OVER_2_5: 86,
  BTTS_NO: 85,
  BTTS_YES: 84,
  HOME_UNDER_1_5: 83,
  AWAY_UNDER_1_5: 83,
  HOME_OVER_1_5: 82,
  AWAY_OVER_1_5: 82,
  HOME_WIN: 80,
  AWAY_WIN: 80,
  DRAW: 79,
  DOUBLE_CHANCE_12: 78,
  FIRST_HALF_OVER_1_5: 77,
  MATCH_OVER_3_5: 76,
  MATCH_UNDER_1_5: 75,
  HOME_CLEAN_SHEET: 74,
  AWAY_CLEAN_SHEET: 74,
  HOME_WIN_TO_NIL: 73,
  AWAY_WIN_TO_NIL: 73,
  HOME_SCORE_BOTH_HALVES: 72,
  AWAY_SCORE_BOTH_HALVES: 72,
  HOME_OVER_2_5: 71,
  AWAY_OVER_2_5: 71,
  HOME_UNDER_0_5: 70,
  AWAY_UNDER_0_5: 70,
  NO_GOAL: 60
});

const XG_REQUIRED_MARKETS = new Set([
  "HOME_OVER_0_5", "HOME_OVER_1_5", "HOME_OVER_2_5",
  "AWAY_OVER_0_5", "AWAY_OVER_1_5", "AWAY_OVER_2_5",
  "HOME_UNDER_0_5", "HOME_UNDER_1_5", "HOME_UNDER_2_5",
  "AWAY_UNDER_0_5", "AWAY_UNDER_1_5", "AWAY_UNDER_2_5",
  "HOME_WIN", "AWAY_WIN", "DRAW", "HOME_DNB", "AWAY_DNB",
  "DOUBLE_CHANCE_12", "NO_GOAL",
  "HOME_CLEAN_SHEET", "AWAY_CLEAN_SHEET",
  "HOME_WIN_TO_NIL", "AWAY_WIN_TO_NIL"
]);

const SCORE_ORDER_REQUIRED_MARKETS = new Set([
  "HOME_WIN", "AWAY_WIN", "DRAW",
  "DOUBLE_CHANCE_1X", "DOUBLE_CHANCE_X2",
  "HOME_LEAD_ANYTIME", "AWAY_LEAD_ANYTIME"
]);

const LEAD_ORDER_REQUIRED_MARKETS = new Set([
  "HOME_LEAD_ANYTIME", "AWAY_LEAD_ANYTIME"
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value, min = 0, max = 1) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function sum(values) {
  return values.reduce((acc, value) => acc + value, 0);
}

function mean(values) {
  const valid = values.filter(isFiniteNumber);
  return valid.length ? sum(valid) / valid.length : null;
}

function parseDateToTimestamp(value, name = "date") {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime();
  assert(typeof value === "string" && value.trim(), `${name} must be a non-empty date string.`);
  const text = value.trim();

  const iso = /^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(text);
  if (iso) {
    const y = Number(iso[1]), m = Number(iso[2]), d = Number(iso[3]);
    const dateOnlyStamp = Date.UTC(y, m - 1, d);
    const check = new Date(dateOnlyStamp);
    assert(check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d,
      `${name} is not a valid calendar date: ${value}`);
    if (!iso[4]) return dateOnlyStamp;
    const fullStamp = Date.parse(text);
    assert(Number.isFinite(fullStamp), `${name} is not a supported ISO timestamp: ${value}`);
    return fullStamp;
  }

  const dmy = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(text);
  if (dmy) {
    const [, d, m, y] = dmy.map(Number);
    const stamp = Date.UTC(y, m - 1, d);
    const check = new Date(stamp);
    assert(check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d,
      `${name} is not a valid calendar date: ${value}`);
    return stamp;
  }

  const stamp = Date.parse(text);
  assert(Number.isFinite(stamp), `${name} is not a supported date: ${value}`);
  return stamp;
}

function safeDiv(a, b, fallback = 0) {
  return Math.abs(b) > EPS ? a / b : fallback;
}

function rate(items, predicate) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return items.filter(predicate).length / items.length;
}

function avg(items, selector) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const values = items.map(selector).filter(isFiniteNumber);
  return values.length ? mean(values) : null;
}

function newestFirst(matches) {
  return [...matches].sort((a, b) =>
    (b._timestamp ?? parseDateToTimestamp(b.date)) -
    (a._timestamp ?? parseDateToTimestamp(a.date))
  );
}

function lastN(matches, n) {
  return newestFirst(matches).slice(0, n);
}

function normalizeRisk(value, name) {
  if (value == null) return 0;
  assert(isFiniteNumber(value), `${name} must be a number in [0,1].`);
  return clamp(value);
}

function rampUp(value, floor, ceiling) {
  if (!isFiniteNumber(value)) return 0;
  if (ceiling <= floor) return value >= floor ? 1 : 0;
  return clamp((value - floor) / (ceiling - floor));
}

function rampDown(value, ceiling, floor) {
  if (!isFiniteNumber(value)) return 0;
  if (floor >= ceiling) return value <= ceiling ? 1 : 0;
  return clamp((floor - value) / (floor - ceiling));
}

function scaledWeightedScore(parts, maxPoints) {
  const totalWeight = sum(parts.map(p => p.weight));
  if (totalWeight <= 0) return 0;
  const weighted = sum(parts.map(p => clamp(p.value) * p.weight));
  return maxPoints * weighted / totalWeight;
}

function all(values) {
  return values.every(Boolean);
}

function any(values) {
  return values.some(Boolean);
}

function opponentResult(result) {
  if (result === "W") return "L";
  if (result === "L") return "W";
  return "D";
}

function deriveTeamMatch(raw, index) {
  assert(raw && typeof raw === "object", `Team match at index ${index} must be an object.`);
  assert(raw.date, `Team match at index ${index} is missing date.`);
  const _timestamp = parseDateToTimestamp(raw.date, `Team match ${index} date`);
  assert(raw.venue === "home" || raw.venue === "away",
    `Team match at index ${index} venue must be "home" or "away".`);

  const requiredNumbers = [
    "goalsFor", "goalsAgainst", "halfTimeGoalsFor", "halfTimeGoalsAgainst"
  ];
  for (const key of requiredNumbers) {
    assert(Number.isInteger(raw[key]) && raw[key] >= 0,
      `Team match ${raw.date}: ${key} must be a non-negative integer.`);
  }

  if (raw.xgFor != null) {
    assert(isFiniteNumber(raw.xgFor) && raw.xgFor >= 0,
      `Team match ${raw.date}: xgFor must be a non-negative number.`);
  }
  if (raw.xgAgainst != null) {
    assert(isFiniteNumber(raw.xgAgainst) && raw.xgAgainst >= 0,
      `Team match ${raw.date}: xgAgainst must be a non-negative number.`);
  }

  assert(raw.halfTimeGoalsFor <= raw.goalsFor,
    `Team match ${raw.date}: halfTimeGoalsFor cannot exceed goalsFor.`);
  assert(raw.halfTimeGoalsAgainst <= raw.goalsAgainst,
    `Team match ${raw.date}: halfTimeGoalsAgainst cannot exceed goalsAgainst.`);

  const secondHalfGoalsFor = raw.goalsFor - raw.halfTimeGoalsFor;
  const secondHalfGoalsAgainst = raw.goalsAgainst - raw.halfTimeGoalsAgainst;

  const result = raw.goalsFor > raw.goalsAgainst ? "W"
    : raw.goalsFor < raw.goalsAgainst ? "L" : "D";
  const halfTimeResult = raw.halfTimeGoalsFor > raw.halfTimeGoalsAgainst ? "W"
    : raw.halfTimeGoalsFor < raw.halfTimeGoalsAgainst ? "L" : "D";
  const secondHalfResult = secondHalfGoalsFor > secondHalfGoalsAgainst ? "W"
    : secondHalfGoalsFor < secondHalfGoalsAgainst ? "L" : "D";

  const homeHalf = raw.venue === "home"
    ? (halfTimeResult === "W" ? "1" : halfTimeResult === "D" ? "X" : "2")
    : (halfTimeResult === "L" ? "1" : halfTimeResult === "D" ? "X" : "2");

  const homeFull = raw.venue === "home"
    ? (result === "W" ? "1" : result === "D" ? "X" : "2")
    : (result === "L" ? "1" : result === "D" ? "X" : "2");

  const htft = `${homeHalf}/${homeFull}`;
  assert(HTFT_KEYS.includes(htft), `Derived invalid HT/FT category: ${htft}.`);

  if (raw.scoredFirst != null) {
    assert(typeof raw.scoredFirst === "boolean",
      `Team match ${raw.date}: scoredFirst must be boolean or null.`);
  }
  if (raw.ledAnyTime != null) {
    assert(typeof raw.ledAnyTime === "boolean",
      `Team match ${raw.date}: ledAnyTime must be boolean or null.`);
  }
  if (raw.trailedAnyTime != null) {
    assert(typeof raw.trailedAnyTime === "boolean",
      `Team match ${raw.date}: trailedAnyTime must be boolean or null.`);
  }

  const noGoal = raw.goalsFor === 0 && raw.goalsAgainst === 0;
  const scoredFirstProvided = noGoal || typeof raw.scoredFirst === "boolean";
  const ledAnyTimeProvided = typeof raw.ledAnyTime === "boolean";
  const trailedAnyTimeProvided = typeof raw.trailedAnyTime === "boolean";

  const scoredFirst = noGoal ? null : raw.scoredFirst;
  const concededFirst = noGoal || scoredFirst == null ? null : !scoredFirst;

  const ledAnyTime = raw.ledAnyTime != null
    ? raw.ledAnyTime
    : (scoredFirst === true || result === "W");

  const trailedAnyTime = raw.trailedAnyTime != null
    ? raw.trailedAnyTime
    : (concededFirst === true || result === "L");

  return {
    ...raw,
    _timestamp,
    secondHalfGoalsFor,
    secondHalfGoalsAgainst,
    totalGoals: raw.goalsFor + raw.goalsAgainst,
    result,
    halfTimeResult,
    secondHalfResult,
    htft,
    noGoal,
    scoredFirstProvided,
    ledAnyTimeProvided,
    trailedAnyTimeProvided,
    scoredFirst,
    concededFirst,
    ledAnyTime,
    trailedAnyTime,
    wonEitherHalf: halfTimeResult === "W" || secondHalfResult === "W",
    lostEitherHalf: halfTimeResult === "L" || secondHalfResult === "L",
    scoredBothHalves: raw.halfTimeGoalsFor > 0 && secondHalfGoalsFor > 0,
    concededBothHalves: raw.halfTimeGoalsAgainst > 0 && secondHalfGoalsAgainst > 0,
    oneGoalMargin: Math.abs(raw.goalsFor - raw.goalsAgainst) === 1
  };
}

function deriveLeagueMatch(raw, index) {
  assert(raw && typeof raw === "object", `League match at index ${index} must be an object.`);
  assert(raw.date, `League match at index ${index} is missing date.`);
  const _timestamp = parseDateToTimestamp(raw.date, `League match ${index} date`);

  const required = ["homeGoals", "awayGoals", "halfTimeHomeGoals", "halfTimeAwayGoals"];
  for (const key of required) {
    assert(Number.isInteger(raw[key]) && raw[key] >= 0,
      `League match ${raw.date}: ${key} must be a non-negative integer.`);
  }

  assert(raw.halfTimeHomeGoals <= raw.homeGoals,
    `League match ${raw.date}: halfTimeHomeGoals cannot exceed homeGoals.`);
  assert(raw.halfTimeAwayGoals <= raw.awayGoals,
    `League match ${raw.date}: halfTimeAwayGoals cannot exceed awayGoals.`);

  const totalGoals = raw.homeGoals + raw.awayGoals;
  const firstHalfGoals = raw.halfTimeHomeGoals + raw.halfTimeAwayGoals;
  const secondHalfGoals = totalGoals - firstHalfGoals;

  return {
    ...raw,
    _timestamp,
    totalGoals,
    firstHalfGoals,
    secondHalfGoals,
    homeResult: raw.homeGoals > raw.awayGoals ? "W"
      : raw.homeGoals < raw.awayGoals ? "L" : "D"
  };
}

function summarizeTeamWindow(matches) {
  assert(matches.length > 0, "Cannot summarize an empty team window.");

  const scoredFirstKnown = matches.filter(m => typeof m.scoredFirst === "boolean");
  const ledKnown = matches.filter(m => typeof m.ledAnyTime === "boolean");
  const trailedKnown = matches.filter(m => typeof m.trailedAnyTime === "boolean");
  const xgForKnown = matches.filter(m => isFiniteNumber(m.xgFor));
  const xgAgainstKnown = matches.filter(m => isFiniteNumber(m.xgAgainst));

  const htft = {};
  for (const key of HTFT_KEYS) htft[key] = rate(matches, m => m.htft === key);

  return {
    sampleSize: matches.length,

    avgGoalsFor: avg(matches, m => m.goalsFor),
    avgGoalsAgainst: avg(matches, m => m.goalsAgainst),
    avgTotalGoals: avg(matches, m => m.totalGoals),
    avgFirstHalfGoalsFor: avg(matches, m => m.halfTimeGoalsFor),
    avgFirstHalfGoalsAgainst: avg(matches, m => m.halfTimeGoalsAgainst),
    avgSecondHalfGoalsFor: avg(matches, m => m.secondHalfGoalsFor),
    avgSecondHalfGoalsAgainst: avg(matches, m => m.secondHalfGoalsAgainst),
    avgXgFor: xgForKnown.length ? avg(xgForKnown, m => m.xgFor) : null,
    avgXgAgainst: xgAgainstKnown.length ? avg(xgAgainstKnown, m => m.xgAgainst) : null,

    ppg: avg(matches, m => m.result === "W" ? 3 : m.result === "D" ? 1 : 0),
    goalDifferencePerMatch: avg(matches, m => m.goalsFor - m.goalsAgainst),

    win: rate(matches, m => m.result === "W"),
    draw: rate(matches, m => m.result === "D"),
    loss: rate(matches, m => m.result === "L"),
    unbeaten: rate(matches, m => m.result !== "L"),

    over05: rate(matches, m => m.totalGoals >= 1),
    over15: rate(matches, m => m.totalGoals >= 2),
    over25: rate(matches, m => m.totalGoals >= 3),
    over35: rate(matches, m => m.totalGoals >= 4),
    under15: rate(matches, m => m.totalGoals <= 1),
    under25: rate(matches, m => m.totalGoals <= 2),
    under35: rate(matches, m => m.totalGoals <= 3),
    under45: rate(matches, m => m.totalGoals <= 4),

    btts: rate(matches, m => m.goalsFor > 0 && m.goalsAgainst > 0),
    bttsNo: rate(matches, m => !(m.goalsFor > 0 && m.goalsAgainst > 0)),
    zeroZero: rate(matches, m => m.noGoal),

    scored: rate(matches, m => m.goalsFor > 0),
    failedToScore: rate(matches, m => m.goalsFor === 0),
    cleanSheet: rate(matches, m => m.goalsAgainst === 0),
    conceded: rate(matches, m => m.goalsAgainst > 0),

    scored2Plus: rate(matches, m => m.goalsFor >= 2),
    scored3Plus: rate(matches, m => m.goalsFor >= 3),
    scored4Plus: rate(matches, m => m.goalsFor >= 4),
    conceded2Plus: rate(matches, m => m.goalsAgainst >= 2),
    conceded3Plus: rate(matches, m => m.goalsAgainst >= 3),

    firstHalfGoal: rate(matches, m => m.halfTimeGoalsFor + m.halfTimeGoalsAgainst >= 1),
    firstHalfOver15: rate(matches, m => m.halfTimeGoalsFor + m.halfTimeGoalsAgainst >= 2),
    firstHalfUnder15: rate(matches, m => m.halfTimeGoalsFor + m.halfTimeGoalsAgainst <= 1),
    halfTimeZeroZero: rate(matches, m => m.halfTimeGoalsFor === 0 && m.halfTimeGoalsAgainst === 0),
    firstHalfScored: rate(matches, m => m.halfTimeGoalsFor > 0),
    firstHalfConceded: rate(matches, m => m.halfTimeGoalsAgainst > 0),

    secondHalfGoal: rate(matches, m => m.secondHalfGoalsFor + m.secondHalfGoalsAgainst >= 1),
    secondHalfOver15: rate(matches, m => m.secondHalfGoalsFor + m.secondHalfGoalsAgainst >= 2),
    secondHalfScored: rate(matches, m => m.secondHalfGoalsFor > 0),
    secondHalfConceded: rate(matches, m => m.secondHalfGoalsAgainst > 0),

    scoredFirst: scoredFirstKnown.length
      ? rate(scoredFirstKnown, m => m.scoredFirst === true) : null,
    concededFirst: scoredFirstKnown.length
      ? rate(scoredFirstKnown, m => m.scoredFirst === false) : null,
    ledAnyTime: ledKnown.length
      ? rate(ledKnown, m => m.ledAnyTime === true) : null,
    trailedAnyTime: trailedKnown.length
      ? rate(trailedKnown, m => m.trailedAnyTime === true) : null,

    wonEitherHalf: rate(matches, m => m.wonEitherHalf),
    lostEitherHalf: rate(matches, m => m.lostEitherHalf),
    scoredBothHalves: rate(matches, m => m.scoredBothHalves),
    concededBothHalves: rate(matches, m => m.concededBothHalves),
    oneGoalMargin: rate(matches, m => m.oneGoalMargin),

    htft
  };
}

function summarizeLeague(matches) {
  if (matches.length === 0) {
    return {
      sampleSize: 0,
      avgTotalGoals: null, avgHomeGoals: null, avgAwayGoals: null,
      over05: null, over15: null, over25: null, over35: null,
      under15: null, under25: null, under35: null, under45: null,
      btts: null, bttsNo: null, zeroZero: null,
      firstHalfGoal: null, firstHalfOver15: null, firstHalfUnder15: null,
      secondHalfGoal: null, secondHalfOver15: null,
      homeWin: null, draw: null, awayWin: null
    };
  }

  return {
    sampleSize: matches.length,
    avgTotalGoals: avg(matches, m => m.totalGoals),
    avgHomeGoals: avg(matches, m => m.homeGoals),
    avgAwayGoals: avg(matches, m => m.awayGoals),
    over05: rate(matches, m => m.totalGoals >= 1),
    over15: rate(matches, m => m.totalGoals >= 2),
    over25: rate(matches, m => m.totalGoals >= 3),
    over35: rate(matches, m => m.totalGoals >= 4),
    under15: rate(matches, m => m.totalGoals <= 1),
    under25: rate(matches, m => m.totalGoals <= 2),
    under35: rate(matches, m => m.totalGoals <= 3),
    under45: rate(matches, m => m.totalGoals <= 4),
    btts: rate(matches, m => m.homeGoals > 0 && m.awayGoals > 0),
    bttsNo: rate(matches, m => !(m.homeGoals > 0 && m.awayGoals > 0)),
    zeroZero: rate(matches, m => m.homeGoals === 0 && m.awayGoals === 0),
    firstHalfGoal: rate(matches, m => m.firstHalfGoals >= 1),
    firstHalfOver15: rate(matches, m => m.firstHalfGoals >= 2),
    firstHalfUnder15: rate(matches, m => m.firstHalfGoals <= 1),
    secondHalfGoal: rate(matches, m => m.secondHalfGoals >= 1),
    secondHalfOver15: rate(matches, m => m.secondHalfGoals >= 2),
    homeWin: rate(matches, m => m.homeResult === "W"),
    draw: rate(matches, m => m.homeResult === "D"),
    awayWin: rate(matches, m => m.homeResult === "L")
  };
}

const PROFILE_METRICS = [
  "avgGoalsFor", "avgGoalsAgainst", "avgTotalGoals",
  "avgFirstHalfGoalsFor", "avgFirstHalfGoalsAgainst",
  "avgSecondHalfGoalsFor", "avgSecondHalfGoalsAgainst",
  "avgXgFor", "avgXgAgainst",
  "ppg", "goalDifferencePerMatch",
  "win", "draw", "loss", "unbeaten",
  "over05", "over15", "over25", "over35",
  "under15", "under25", "under35", "under45",
  "btts", "bttsNo", "zeroZero",
  "scored", "failedToScore", "cleanSheet", "conceded",
  "scored2Plus", "scored3Plus", "scored4Plus",
  "conceded2Plus", "conceded3Plus",
  "firstHalfGoal", "firstHalfOver15", "firstHalfUnder15",
  "halfTimeZeroZero", "firstHalfScored", "firstHalfConceded",
  "secondHalfGoal", "secondHalfOver15", "secondHalfScored", "secondHalfConceded",
  "scoredFirst", "concededFirst", "ledAnyTime", "trailedAnyTime",
  "wonEitherHalf", "lostEitherHalf", "scoredBothHalves", "concededBothHalves",
  "oneGoalMargin"
];

function weightedValue(parts, weights) {
  const pairs = parts
    .map((value, index) => ({ value, weight: weights[index] }))
    .filter(p => isFiniteNumber(p.value));
  if (!pairs.length) return null;
  const totalWeight = sum(pairs.map(p => p.weight));
  return sum(pairs.map(p => p.value * p.weight)) / totalWeight;
}

function emptyTeamWindowSummary() {
  const summary = { sampleSize: 0, htft: {} };
  for (const metric of PROFILE_METRICS) summary[metric] = null;
  for (const key of HTFT_KEYS) summary.htft[key] = null;
  return summary;
}

function summarizeTeamWindowSafe(matches) {
  return matches.length ? summarizeTeamWindow(matches) : emptyTeamWindowSummary();
}

function buildWeightedTeamProfile(allMatches, currentVenue) {
  const venueMatches = allMatches.filter(m => m.venue === currentVenue);
  const seasonVenue = summarizeTeamWindowSafe(venueMatches);
  const recent10 = summarizeTeamWindowSafe(lastN(allMatches, Math.min(10, allMatches.length)));
  const recentVenue6Matches = lastN(venueMatches, Math.min(6, venueMatches.length));
  const recentVenue6 = summarizeTeamWindowSafe(recentVenue6Matches);

  // General team metrics may safely blend overall form with venue form.
  const weights = [0.50, 0.30, 0.20];
  const weighted = {};

  for (const metric of PROFILE_METRICS) {
    weighted[metric] = weightedValue(
      [seasonVenue[metric], recent10[metric], recentVenue6[metric]],
      weights
    );
  }

  // HT/FT categories are home/away oriented. Mixing opposite-venue matches
  // without reorientation corrupts 1/1, X/1, 2/2 and X/2 probabilities.
  weighted.htft = {};
  const htftWeights = [0.65, 0.35];
  for (const key of HTFT_KEYS) {
    weighted.htft[key] = weightedValue(
      [seasonVenue.htft[key], recentVenue6.htft[key]],
      htftWeights
    );
  }

  weighted.sampleSizeVenue = venueMatches.length;
  weighted.sampleSizeOverall = allMatches.length;
  weighted.sampleSizeRecent10 = recent10.sampleSize;
  weighted.sampleSizeRecentVenue6 = recentVenue6.sampleSize;
  weighted.windows = { seasonVenue, recent10, recentVenue6 };
  weighted.matches = newestFirst(allMatches);
  weighted.venueMatches = newestFirst(venueMatches);

  return weighted;
}

function combineHTFT(homeProfile, awayProfile) {
  const out = {};
  for (const key of HTFT_KEYS) {
    out[key] = mean([homeProfile.htft[key], awayProfile.htft[key]]);
  }

  out.dynamic = sum(["X/1", "X/2", "1/X", "2/X", "1/2", "2/1"].map(k => out[k]));
  out.reversal = out["1/2"] + out["2/1"];
  out.equalizer = out["1/X"] + out["2/X"];
  out.reversalEqualizer = out.reversal + out.equalizer;
  out.static = out["1/1"] + out["X/X"] + out["2/2"];
  out.halfTimeDraw = out["X/1"] + out["X/X"] + out["X/2"];
  out.firstHalfNonDraw = 1 - out.halfTimeDraw;
  out.fullTimeHomeWin = out["1/1"] + out["X/1"] + out["2/1"];
  out.fullTimeDraw = out["1/X"] + out["X/X"] + out["2/X"];
  out.fullTimeAwayWin = out["2/2"] + out["X/2"] + out["1/2"];
  out.homeLedAtHalf = out["1/1"] + out["1/X"] + out["1/2"];
  out.awayLedAtHalf = out["2/2"] + out["2/X"] + out["2/1"];
  out.homeGuaranteedScored =
    out["1/1"] + out["X/1"] + out["2/1"] + out["1/X"] + out["1/2"];
  out.awayGuaranteedScored =
    out["2/2"] + out["X/2"] + out["1/2"] + out["2/X"] + out["2/1"];
  out.homeGuaranteedLedAnyTime = out.homeGuaranteedScored;
  out.awayGuaranteedLedAnyTime = out.awayGuaranteedScored;
  out.bttsGuaranteed = out.reversalEqualizer;
  out.secondHalfGoalGuaranteed = out.dynamic;

  return out;
}

function buildContext(input) {
  assert(input && typeof input === "object", "Input must be an object.");
  assert(input.match && typeof input.match === "object", "Input.match is required.");
  assert(typeof input.match.homeTeam === "string" && input.match.homeTeam.trim(),
    "match.homeTeam is required.");
  assert(typeof input.match.awayTeam === "string" && input.match.awayTeam.trim(),
    "match.awayTeam is required.");

  assert(Array.isArray(input.homeMatches), "homeMatches must be an array.");
  assert(Array.isArray(input.awayMatches), "awayMatches must be an array.");
  assert(Array.isArray(input.leagueMatches), "leagueMatches must be an array.");

  const homeMatches = input.homeMatches.map(deriveTeamMatch);
  const awayMatches = input.awayMatches.map(deriveTeamMatch);
  const leagueMatches = input.leagueMatches.map(deriveLeagueMatch);

  const home = buildWeightedTeamProfile(homeMatches, "home");
  const away = buildWeightedTeamProfile(awayMatches, "away");
  const league = summarizeLeague(leagueMatches);
  const htft = combineHTFT(home, away);

  const context = input.context || {};
  const risks = {
    weather: normalizeRisk(context.weatherRisk, "context.weatherRisk"),
    lineup: normalizeRisk(context.lineupRisk, "context.lineupRisk"),
    motivation: normalizeRisk(context.motivationRisk, "context.motivationRisk"),
    pitch: normalizeRisk(context.pitchRisk, "context.pitchRisk"),
    rotation: normalizeRisk(context.rotationRisk, "context.rotationRisk")
  };

  const goalEnvironmentMean = mean([
    home.avgGoalsFor,
    home.avgGoalsAgainst,
    away.avgGoalsFor,
    away.avgGoalsAgainst
  ]);
  const expectedGoalEnvironment = isFiniteNumber(goalEnvironmentMean)
    ? goalEnvironmentMean * 2 : null;

  const combined = {
    over05: mean([home.over05, away.over05]),
    over15: mean([home.over15, away.over15]),
    over25: mean([home.over25, away.over25]),
    over35: mean([home.over35, away.over35]),
    under15: mean([home.under15, away.under15]),
    under25: mean([home.under25, away.under25]),
    under35: mean([home.under35, away.under35]),
    under45: mean([home.under45, away.under45]),
    btts: mean([home.btts, away.btts]),
    bttsNo: mean([home.bttsNo, away.bttsNo]),
    zeroZero: mean([home.zeroZero, away.zeroZero]),
    failedToScore: mean([home.failedToScore, away.failedToScore]),
    cleanSheet: mean([home.cleanSheet, away.cleanSheet]),
    firstHalfGoal: mean([home.firstHalfGoal, away.firstHalfGoal]),
    firstHalfOver15: mean([home.firstHalfOver15, away.firstHalfOver15]),
    firstHalfUnder15: mean([home.firstHalfUnder15, away.firstHalfUnder15]),
    halfTimeZeroZero: mean([home.halfTimeZeroZero, away.halfTimeZeroZero]),
    secondHalfGoal: mean([home.secondHalfGoal, away.secondHalfGoal]),
    secondHalfOver15: mean([home.secondHalfOver15, away.secondHalfOver15]),
    draw: mean([home.draw, away.draw]),
    oneGoalMargin: mean([home.oneGoalMargin, away.oneGoalMargin])
  };

  const scoringAveragesKnown = isFiniteNumber(home.avgGoalsFor) && isFiniteNumber(away.avgGoalsFor);
  const combinedScoringAverage = scoringAveragesKnown ? home.avgGoalsFor + away.avgGoalsFor : null;
  const strongerScoringAverage = scoringAveragesKnown ? Math.max(home.avgGoalsFor, away.avgGoalsFor) : null;
  const goalDependencyRatio = scoringAveragesKnown
    ? safeDiv(strongerScoringAverage, combinedScoringAverage, 1) : null;

  const xgDifference = isFiniteNumber(home.avgXgFor) && isFiniteNumber(home.avgXgAgainst)
    && isFiniteNumber(away.avgXgFor) && isFiniteNumber(away.avgXgAgainst)
    ? (home.avgXgFor - home.avgXgAgainst) - (away.avgXgFor - away.avgXgAgainst)
    : null;

  const homeScoreOrderComplete = home.matches.every(m => m.scoredFirstProvided);
  const awayScoreOrderComplete = away.matches.every(m => m.scoredFirstProvided);
  const homeLeadOrderComplete = home.matches.every(m => m.ledAnyTimeProvided && m.trailedAnyTimeProvided);
  const awayLeadOrderComplete = away.matches.every(m => m.ledAnyTimeProvided && m.trailedAnyTimeProvided);
  const homeXgComplete = home.matches.every(m => isFiniteNumber(m.xgFor) && isFiniteNumber(m.xgAgainst));
  const awayXgComplete = away.matches.every(m => isFiniteNumber(m.xgFor) && isFiniteNumber(m.xgAgainst));
  const xgKnown = homeXgComplete && awayXgComplete;

  return {
    match: input.match,
    home,
    away,
    league,
    htft,
    combined,
    risks,
    expectedGoalEnvironment,
    combinedScoringAverage,
    goalDependencyRatio,

    homePpgEdge: isFiniteNumber(home.ppg) && isFiniteNumber(away.ppg)
      ? home.ppg - away.ppg : null,
    homeGoalDifferenceEdge: isFiniteNumber(home.goalDifferencePerMatch) && isFiniteNumber(away.goalDifferencePerMatch)
      ? home.goalDifferencePerMatch - away.goalDifferencePerMatch : null,
    homeXgEdge: xgDifference,
    homeFirstScoreEdge: isFiniteNumber(home.scoredFirst) && isFiniteNumber(away.scoredFirst)
      ? home.scoredFirst - away.scoredFirst : null,

    availability: {
      xg: xgKnown,
      scoreOrder: homeScoreOrderComplete && awayScoreOrderComplete,
      leadOrder: homeLeadOrderComplete && awayLeadOrderComplete
    },
    strict: input.strict !== false,
    metadata: input.metadata || {}
  };
}

function dataQualityGate(ctx) {
  const failures = [];

  if (ctx.home.sampleSizeOverall < 8) failures.push("Home team has fewer than 8 overall matches.");
  if (ctx.away.sampleSizeOverall < 8) failures.push("Away team has fewer than 8 overall matches.");
  if (ctx.home.sampleSizeVenue < 6) failures.push("Home team has fewer than 6 home matches.");
  if (ctx.away.sampleSizeVenue < 6) failures.push("Away team has fewer than 6 away matches.");
  if (ctx.league.sampleSize < 30) failures.push("League sample has fewer than 30 matches.");

  if (ctx.strict && !ctx.availability.scoreOrder) {
    failures.push("Strict mode requires complete scored-first data for both teams.");
  }
  if (ctx.strict && !ctx.availability.leadOrder) {
    failures.push("Strict mode requires explicit ledAnyTime and trailedAnyTime data for both teams.");
  }
  if (ctx.strict && !ctx.availability.xg) {
    failures.push("Strict mode requires xG and xGA for both teams.");
  }

  const riskValues = Object.values(ctx.risks);
  if (Math.max(...riskValues) >= 0.80) failures.push("At least one context risk is 0.80 or higher.");

  return {
    passed: failures.length === 0,
    failures,
    xgKnown: ctx.availability.xg,
    availability: ctx.availability
  };
}

function consecutiveStreak(matches, predicate) {
  let length = 0;
  for (const match of newestFirst(matches)) {
    if (predicate(match)) length += 1;
    else break;
  }
  return length;
}

function streakBandPoints(length) {
  if (length <= 2) return 0;
  if (length === 3) return 2;
  if (length === 4) return 4;
  if (length === 5) return 6;
  return 8;
}

function directSeasonRate(profile, predicate) {
  return rate(profile.venueMatches, predicate);
}

function streakSignalForTeam(profile, predicate, seasonThreshold = 0.50) {
  const positiveVenue = consecutiveStreak(profile.venueMatches, predicate);
  const negativeVenue = consecutiveStreak(profile.venueMatches, m => !predicate(m));
  const positiveOverall = consecutiveStreak(profile.matches, predicate);
  const negativeOverall = consecutiveStreak(profile.matches, m => !predicate(m));

  const seasonRate = directSeasonRate(profile, predicate);
  const consistency = isFiniteNumber(seasonRate) && seasonRate >= seasonThreshold ? 1 : 0.5;

  const positiveRaw =
    streakBandPoints(positiveVenue) +
    0.5 * streakBandPoints(positiveOverall);

  const negativeRaw =
    streakBandPoints(negativeVenue) +
    0.5 * streakBandPoints(negativeOverall);

  const raw = clamp((positiveRaw - negativeRaw) * consistency, -15, 15);

  return {
    raw,
    positiveVenue,
    negativeVenue,
    positiveOverall,
    negativeOverall,
    seasonRate
  };
}

function combineStreakSignals(signals) {
  if (!signals.length) {
    return { raw: 0, points: 7.5, signals: [] };
  }
  const raw = clamp(mean(signals.map(s => s.raw)), -15, 15);
  const points = clamp(7.5 + raw / 2, 0, STREAK_MAX_POINTS);
  return { raw, points, signals };
}

function contextPoints(ctx) {
  const averageRisk = mean(Object.values(ctx.risks));
  return CONTEXT_MAX_POINTS * (1 - averageRisk);
}

function htftScoreOver(ctx, thresholds) {
  return scaledWeightedScore([
    { value: rampUp(ctx.htft.dynamic, thresholds.dynamicFloor, thresholds.dynamicCeiling), weight: 0.45 },
    { value: rampUp(ctx.htft.reversalEqualizer, thresholds.reFloor, thresholds.reCeiling), weight: 0.35 },
    { value: rampDown(ctx.htft["X/X"], thresholds.xxCeiling, thresholds.xxFloor), weight: 0.20 }
  ], HTFT_MAX_POINTS);
}

function htftScoreUnder(ctx, thresholds) {
  return scaledWeightedScore([
    { value: rampUp(ctx.htft.static, thresholds.staticFloor, thresholds.staticCeiling), weight: 0.35 },
    { value: rampUp(ctx.htft["X/X"], thresholds.xxFloor, thresholds.xxCeiling), weight: 0.25 },
    { value: rampDown(ctx.htft.dynamic, thresholds.dynamicCeiling, thresholds.dynamicFloor), weight: 0.25 },
    { value: rampDown(ctx.htft.reversalEqualizer, thresholds.reCeiling, thresholds.reFloor), weight: 0.15 }
  ], HTFT_MAX_POINTS);
}

function htftScoreHomeResult(ctx) {
  return scaledWeightedScore([
    { value: rampUp(ctx.htft.fullTimeHomeWin, 0.42, 0.65), weight: 0.50 },
    { value: rampUp(ctx.htft.homeLedAtHalf, 0.28, 0.50), weight: 0.25 },
    { value: rampDown(ctx.htft.reversal, 0.16, 0.04), weight: 0.15 },
    { value: rampDown(ctx.htft.fullTimeDraw, 0.32, 0.18), weight: 0.10 }
  ], HTFT_MAX_POINTS);
}

function htftScoreAwayResult(ctx) {
  return scaledWeightedScore([
    { value: rampUp(ctx.htft.fullTimeAwayWin, 0.40, 0.62), weight: 0.50 },
    { value: rampUp(ctx.htft.awayLedAtHalf, 0.26, 0.48), weight: 0.25 },
    { value: rampDown(ctx.htft.reversal, 0.16, 0.04), weight: 0.15 },
    { value: rampDown(ctx.htft.fullTimeDraw, 0.32, 0.18), weight: 0.10 }
  ], HTFT_MAX_POINTS);
}

function htftScoreDraw(ctx) {
  return scaledWeightedScore([
    { value: rampUp(ctx.htft.fullTimeDraw, 0.27, 0.42), weight: 0.45 },
    { value: rampUp(ctx.htft["X/X"], 0.24, 0.38), weight: 0.30 },
    { value: rampDown(ctx.htft.reversal, 0.16, 0.04), weight: 0.15 },
    { value: rampUp(ctx.htft.halfTimeDraw, 0.42, 0.62), weight: 0.10 }
  ], HTFT_MAX_POINTS);
}

function htftScoreHomeScoring(ctx) {
  return scaledWeightedScore([
    { value: rampUp(ctx.htft.homeGuaranteedScored, 0.45, 0.68), weight: 0.45 },
    { value: rampUp(ctx.htft.fullTimeHomeWin, 0.38, 0.60), weight: 0.25 },
    { value: rampUp(ctx.htft["X/1"] + ctx.htft["2/1"], 0.15, 0.30), weight: 0.20 },
    { value: rampDown(ctx.htft["X/X"] + ctx.htft["2/2"], 0.50, 0.30), weight: 0.10 }
  ], HTFT_MAX_POINTS);
}

function htftScoreAwayScoring(ctx) {
  return scaledWeightedScore([
    { value: rampUp(ctx.htft.awayGuaranteedScored, 0.42, 0.65), weight: 0.45 },
    { value: rampUp(ctx.htft.fullTimeAwayWin, 0.36, 0.58), weight: 0.25 },
    { value: rampUp(ctx.htft["X/2"] + ctx.htft["1/2"], 0.14, 0.28), weight: 0.20 },
    { value: rampDown(ctx.htft["X/X"] + ctx.htft["1/1"], 0.52, 0.32), weight: 0.10 }
  ], HTFT_MAX_POINTS);
}

function htftScoreBttsYes(ctx) {
  return scaledWeightedScore([
    { value: rampUp(ctx.htft.bttsGuaranteed, 0.10, 0.24), weight: 0.50 },
    { value: rampUp(ctx.htft.equalizer, 0.06, 0.16), weight: 0.25 },
    { value: rampUp(ctx.htft.reversal, 0.04, 0.12), weight: 0.15 },
    { value: rampDown(ctx.htft["X/X"], 0.34, 0.18), weight: 0.10 }
  ], HTFT_MAX_POINTS);
}

function htftScoreBttsNo(ctx) {
  return scaledWeightedScore([
    { value: rampDown(ctx.htft.bttsGuaranteed, 0.14, 0.04), weight: 0.40 },
    { value: rampUp(ctx.htft.static, 0.45, 0.68), weight: 0.30 },
    { value: rampDown(ctx.htft.equalizer, 0.10, 0.03), weight: 0.15 },
    { value: rampDown(ctx.htft.reversal, 0.08, 0.02), weight: 0.15 }
  ], HTFT_MAX_POINTS);
}

function htftScoreFirstHalfOver(ctx) {
  return scaledWeightedScore([
    { value: rampUp(ctx.htft.firstHalfNonDraw, 0.38, 0.58), weight: 0.55 },
    { value: rampDown(ctx.htft.halfTimeDraw, 0.62, 0.42), weight: 0.20 },
    { value: rampUp(ctx.htft.homeLedAtHalf + ctx.htft.awayLedAtHalf, 0.38, 0.58), weight: 0.25 }
  ], HTFT_MAX_POINTS);
}

function htftScoreFirstHalfUnder(ctx) {
  return scaledWeightedScore([
    { value: rampUp(ctx.htft.halfTimeDraw, 0.52, 0.70), weight: 0.55 },
    { value: rampDown(ctx.htft.firstHalfNonDraw, 0.48, 0.30), weight: 0.25 },
    { value: rampUp(ctx.htft["X/X"], 0.22, 0.38), weight: 0.20 }
  ], HTFT_MAX_POINTS);
}

function htftScoreSecondHalfOver(ctx, twoGoals = false) {
  const reversalWeight = twoGoals ? 0.35 : 0.20;
  return scaledWeightedScore([
    { value: rampUp(ctx.htft.dynamic, twoGoals ? 0.38 : 0.32, twoGoals ? 0.55 : 0.50), weight: 0.50 },
    { value: rampUp(ctx.htft.reversal, twoGoals ? 0.07 : 0.04, twoGoals ? 0.16 : 0.12), weight: reversalWeight },
    { value: rampUp(ctx.htft.equalizer, 0.06, 0.16), weight: 0.20 },
    { value: rampDown(ctx.htft.static, twoGoals ? 0.62 : 0.68, twoGoals ? 0.42 : 0.48), weight: 0.10 }
  ], HTFT_MAX_POINTS);
}

function htftScoreHomeFirst(ctx) {
  return scaledWeightedScore([
    { value: rampUp(ctx.htft.homeLedAtHalf, 0.30, 0.50), weight: 0.45 },
    { value: rampUp(ctx.htft["1/1"], 0.22, 0.42), weight: 0.30 },
    { value: rampDown(ctx.htft.awayLedAtHalf, 0.35, 0.18), weight: 0.15 },
    { value: rampDown(ctx.htft["X/X"], 0.34, 0.18), weight: 0.10 }
  ], HTFT_MAX_POINTS);
}

function htftScoreAwayFirst(ctx) {
  return scaledWeightedScore([
    { value: rampUp(ctx.htft.awayLedAtHalf, 0.28, 0.48), weight: 0.45 },
    { value: rampUp(ctx.htft["2/2"], 0.20, 0.40), weight: 0.30 },
    { value: rampDown(ctx.htft.homeLedAtHalf, 0.36, 0.18), weight: 0.15 },
    { value: rampDown(ctx.htft["X/X"], 0.34, 0.18), weight: 0.10 }
  ], HTFT_MAX_POINTS);
}

function htftScoreCleanSheet(ctx, side) {
  const win = side === "home" ? ctx.htft.fullTimeHomeWin : ctx.htft.fullTimeAwayWin;
  const oppGuaranteedScored = side === "home"
    ? ctx.htft.awayGuaranteedScored : ctx.htft.homeGuaranteedScored;
  return scaledWeightedScore([
    { value: rampUp(win, 0.38, 0.60), weight: 0.35 },
    { value: rampDown(oppGuaranteedScored, 0.48, 0.28), weight: 0.35 },
    { value: rampUp(ctx.htft.static, 0.46, 0.68), weight: 0.20 },
    { value: rampDown(ctx.htft.equalizer, 0.10, 0.03), weight: 0.10 }
  ], HTFT_MAX_POINTS);
}

function componentScore(parts) {
  return scaledWeightedScore(parts, COMPONENT_MAX_POINTS);
}

function ruleResult(marketId, ctx, spec) {
  const hardFailures = [];
  const contradictions = [];

  if (XG_REQUIRED_MARKETS.has(marketId) && !ctx.availability.xg) {
    hardFailures.push("This market requires complete xG and xGA data.");
  }
  if (SCORE_ORDER_REQUIRED_MARKETS.has(marketId) && !ctx.availability.scoreOrder) {
    hardFailures.push("This market requires complete scored-first data.");
  }
  if (LEAD_ORDER_REQUIRED_MARKETS.has(marketId) && !ctx.availability.leadOrder) {
    hardFailures.push("This market requires explicit ledAnyTime and trailedAnyTime data.");
  }

  const htftGatePassed = spec.htftGate(ctx);
  if (!htftGatePassed) {
    hardFailures.push("HT/FT foundation gate failed.");
  }

  const mandatory = spec.mandatory(ctx);
  for (const item of mandatory) {
    if (!item.pass) hardFailures.push(item.reason);
  }

  const hardRejects = spec.hardRejects ? spec.hardRejects(ctx) : [];
  for (const item of hardRejects) {
    if (item.pass) hardFailures.push(item.reason);
  }

  const contradictionItems = spec.contradictions ? spec.contradictions(ctx) : [];
  let contradictionPenalty = 0;
  for (const item of contradictionItems) {
    if (item.pass) {
      contradictions.push(item.reason);
      contradictionPenalty += item.penalty;
    }
  }

  const htftPoints = clamp(spec.htftScore(ctx), 0, HTFT_MAX_POINTS);
  const components = clamp(spec.componentScore(ctx), 0, COMPONENT_MAX_POINTS);
  const streak = spec.streak(ctx);
  const context = contextPoints(ctx);
  const total = clamp(
    htftPoints + components + streak.points + context - contradictionPenalty,
    0,
    100
  );

  const minScore = spec.minScore ?? MARKET_MIN_SCORE;
  const accepted = hardFailures.length === 0 && total >= minScore;
  const grade = accepted
    ? (total >= PRIME_MIN_SCORE && contradictions.length <= 1 ? "PRIME" : "QUALIFIED")
    : "REJECTED";

  return {
    marketId,
    marketName: MARKET_NAMES[marketId],
    accepted,
    grade,
    score: round(total, 2),
    minimumScore: minScore,
    scoreBreakdown: {
      htft: round(htftPoints, 2),
      components: round(components, 2),
      streaks: round(streak.points, 2),
      context: round(context, 2),
      contradictionPenalty: round(contradictionPenalty, 2)
    },
    htftGatePassed,
    hardFailures,
    contradictions,
    streakAudit: streak,
    metrics: spec.audit ? spec.audit(ctx) : {}
  };
}

function req(pass, reason) {
  return { pass: Boolean(pass), reason };
}

function rej(pass, reason) {
  return { pass: Boolean(pass), reason };
}

function con(pass, penalty, reason) {
  return { pass: Boolean(pass), penalty, reason };
}

function marketStreak(ctx, marketId) {
  const home = ctx.home;
  const away = ctx.away;

  const predicates = {
    MATCH_OVER_1_5: [
      [home, m => m.totalGoals >= 2, 0.72],
      [away, m => m.totalGoals >= 2, 0.70]
    ],
    MATCH_OVER_2_5: [
      [home, m => m.totalGoals >= 3, 0.55],
      [away, m => m.totalGoals >= 3, 0.55]
    ],
    MATCH_OVER_3_5: [
      [home, m => m.totalGoals >= 4, 0.38],
      [away, m => m.totalGoals >= 4, 0.38]
    ],
    MATCH_UNDER_1_5: [
      [home, m => m.totalGoals <= 1, 0.40],
      [away, m => m.totalGoals <= 1, 0.40]
    ],
    MATCH_UNDER_2_5: [
      [home, m => m.totalGoals <= 2, 0.58],
      [away, m => m.totalGoals <= 2, 0.58]
    ],
    MATCH_UNDER_3_5: [
      [home, m => m.totalGoals <= 3, 0.76],
      [away, m => m.totalGoals <= 3, 0.76]
    ],
    MATCH_UNDER_4_5: [
      [home, m => m.totalGoals <= 4, 0.88],
      [away, m => m.totalGoals <= 4, 0.88]
    ],

    HOME_OVER_0_5: [
      [home, m => m.goalsFor >= 1, 0.80],
      [away, m => m.goalsAgainst >= 1, 0.72]
    ],
    HOME_OVER_1_5: [
      [home, m => m.goalsFor >= 2, 0.42],
      [away, m => m.goalsAgainst >= 2, 0.35]
    ],
    HOME_OVER_2_5: [
      [home, m => m.goalsFor >= 3, 0.25],
      [away, m => m.goalsAgainst >= 3, 0.22]
    ],
    AWAY_OVER_0_5: [
      [away, m => m.goalsFor >= 1, 0.76],
      [home, m => m.goalsAgainst >= 1, 0.70]
    ],
    AWAY_OVER_1_5: [
      [away, m => m.goalsFor >= 2, 0.42],
      [home, m => m.goalsAgainst >= 2, 0.35]
    ],
    AWAY_OVER_2_5: [
      [away, m => m.goalsFor >= 3, 0.25],
      [home, m => m.goalsAgainst >= 3, 0.22]
    ],

    HOME_UNDER_0_5: [
      [home, m => m.goalsFor === 0, 0.36],
      [away, m => m.goalsAgainst === 0, 0.38]
    ],
    HOME_UNDER_1_5: [
      [home, m => m.goalsFor <= 1, 0.72],
      [away, m => m.goalsAgainst <= 1, 0.72]
    ],
    HOME_UNDER_2_5: [
      [home, m => m.goalsFor <= 2, 0.82],
      [away, m => m.goalsAgainst <= 2, 0.85]
    ],
    AWAY_UNDER_0_5: [
      [away, m => m.goalsFor === 0, 0.36],
      [home, m => m.goalsAgainst === 0, 0.38]
    ],
    AWAY_UNDER_1_5: [
      [away, m => m.goalsFor <= 1, 0.72],
      [home, m => m.goalsAgainst <= 1, 0.72]
    ],
    AWAY_UNDER_2_5: [
      [away, m => m.goalsFor <= 2, 0.82],
      [home, m => m.goalsAgainst <= 2, 0.85]
    ],

    BTTS_YES: [
      [home, m => m.goalsFor > 0 && m.goalsAgainst > 0, 0.58],
      [away, m => m.goalsFor > 0 && m.goalsAgainst > 0, 0.58]
    ],
    BTTS_NO: [
      [home, m => !(m.goalsFor > 0 && m.goalsAgainst > 0), 0.60],
      [away, m => !(m.goalsFor > 0 && m.goalsAgainst > 0), 0.60]
    ],

    HOME_WIN: [[home, m => m.result === "W", 0.52], [away, m => m.result === "L", 0.42]],
    AWAY_WIN: [[away, m => m.result === "W", 0.50], [home, m => m.result === "L", 0.45]],
    DRAW: [[home, m => m.result === "D", 0.30], [away, m => m.result === "D", 0.30]],
    HOME_DNB: [[home, m => m.result !== "L", 0.72], [away, m => m.result !== "W", 0.72]],
    AWAY_DNB: [[away, m => m.result !== "L", 0.70], [home, m => m.result !== "W", 0.70]],
    DOUBLE_CHANCE_1X: [[home, m => m.result !== "L", 0.74], [away, m => m.result !== "W", 0.73]],
    DOUBLE_CHANCE_X2: [[away, m => m.result !== "L", 0.72], [home, m => m.result !== "W", 0.70]],
    DOUBLE_CHANCE_12: [[home, m => m.result !== "D", 0.77], [away, m => m.result !== "D", 0.77]],

    FIRST_HALF_OVER_0_5: [
      [home, m => m.halfTimeGoalsFor + m.halfTimeGoalsAgainst >= 1, 0.70],
      [away, m => m.halfTimeGoalsFor + m.halfTimeGoalsAgainst >= 1, 0.70]
    ],
    FIRST_HALF_OVER_1_5: [
      [home, m => m.halfTimeGoalsFor + m.halfTimeGoalsAgainst >= 2, 0.31],
      [away, m => m.halfTimeGoalsFor + m.halfTimeGoalsAgainst >= 2, 0.31]
    ],
    FIRST_HALF_UNDER_1_5: [
      [home, m => m.halfTimeGoalsFor + m.halfTimeGoalsAgainst <= 1, 0.74],
      [away, m => m.halfTimeGoalsFor + m.halfTimeGoalsAgainst <= 1, 0.74]
    ],
    SECOND_HALF_OVER_0_5: [
      [home, m => m.secondHalfGoalsFor + m.secondHalfGoalsAgainst >= 1, 0.80],
      [away, m => m.secondHalfGoalsFor + m.secondHalfGoalsAgainst >= 1, 0.80]
    ],
    HOME_WIN_EITHER_HALF: [[home, m => m.wonEitherHalf, 0.60], [away, m => m.lostEitherHalf, 0.55]],
    AWAY_WIN_EITHER_HALF: [[away, m => m.wonEitherHalf, 0.60], [home, m => m.lostEitherHalf, 0.55]],
    HOME_SCORE_BOTH_HALVES: [[home, m => m.scoredBothHalves, 0.30], [away, m => m.concededBothHalves, 0.27]],
    AWAY_SCORE_BOTH_HALVES: [[away, m => m.scoredBothHalves, 0.30], [home, m => m.concededBothHalves, 0.27]],

    NO_GOAL: [[home, m => m.noGoal, 0.14], [away, m => m.noGoal, 0.14]],
    HOME_LEAD_ANYTIME: [[home, m => m.ledAnyTime === true, 0.60], [away, m => m.trailedAnyTime === true, 0.58]],
    AWAY_LEAD_ANYTIME: [[away, m => m.ledAnyTime === true, 0.60], [home, m => m.trailedAnyTime === true, 0.58]],

    HOME_CLEAN_SHEET: [[home, m => m.goalsAgainst === 0, 0.38], [away, m => m.goalsFor === 0, 0.36]],
    AWAY_CLEAN_SHEET: [[away, m => m.goalsAgainst === 0, 0.36], [home, m => m.goalsFor === 0, 0.38]],
    HOME_WIN_TO_NIL: [[home, m => m.result === "W" && m.goalsAgainst === 0, 0.30], [away, m => m.result === "L" && m.goalsFor === 0, 0.30]],
    AWAY_WIN_TO_NIL: [[away, m => m.result === "W" && m.goalsAgainst === 0, 0.28], [home, m => m.result === "L" && m.goalsFor === 0, 0.28]]
  };

  const selected = predicates[marketId] || [];
  return combineStreakSignals(
    selected.map(([profile, predicate, threshold]) =>
      streakSignalForTeam(profile, predicate, threshold)
    )
  );
}

function commonAudit(ctx) {
  return {
    expectedGoalEnvironment: round(ctx.expectedGoalEnvironment),
    goalDependencyRatio: round(ctx.goalDependencyRatio),
    combinedFailedToScore: round(ctx.combined.failedToScore),
    combinedCleanSheet: round(ctx.combined.cleanSheet),
    dynamicHTFT: round(ctx.htft.dynamic),
    reversalEqualizerHTFT: round(ctx.htft.reversalEqualizer),
    xXHTFT: round(ctx.htft["X/X"])
  };
}

function marketDefinitions() {
  const defs = {};

  function add(id, spec) {
    defs[id] = {
      ...spec,
      streak: ctx => marketStreak(ctx, id),
      audit: spec.audit || commonAudit
    };
  }

  // ----- MATCH TOTALS -----

  add("MATCH_OVER_1_5", {
    htftGate: c => c.htft.dynamic >= 0.32 && c.htft["X/X"] <= 0.35,
    htftScore: c => htftScoreOver(c, {
      dynamicFloor: 0.32, dynamicCeiling: 0.50,
      reFloor: 0.10, reCeiling: 0.24,
      xxCeiling: 0.35, xxFloor: 0.18
    }),
    mandatory: c => [
      req(c.league.over15 >= 0.72, "League Over 1.5 is below 72%."),
      req(c.home.over15 >= 0.72, "Home venue Over 1.5 is below 72%."),
      req(c.away.over15 >= 0.70, "Away venue Over 1.5 is below 70%."),
      req(c.combined.over15 >= 0.73, "Combined Over 1.5 is below 73%."),
      req(c.expectedGoalEnvironment >= 2.30, "Expected goal environment is below 2.30."),
      req(c.combined.failedToScore <= 0.27, "Combined failed-to-score is above 27%."),
      req(c.combined.cleanSheet <= 0.34, "Combined clean-sheet rate is above 34%."),
      req(c.home.conceded >= 0.75 || c.away.conceded >= 0.75,
        "Neither defence concedes in at least 75% of relevant matches."),
      req(c.home.scored >= 0.82 || c.away.scored >= 0.82,
        "Neither team scores in at least 82% of relevant matches.")
    ],
    hardRejects: c => [
      rej(c.home.failedToScore > 0.30 && c.away.failedToScore > 0.30,
        "Both teams fail to score above 30%."),
      rej(c.home.cleanSheet > 0.40 && c.away.cleanSheet > 0.40,
        "Both teams keep clean sheets above 40%."),
      rej(c.goalDependencyRatio > 0.72 &&
          Math.max(c.home.scored2Plus, c.away.scored2Plus) < 0.42,
        "Dangerous one-team goal dependency.")
    ],
    contradictions: c => [
      con(c.combined.halfTimeZeroZero > 0.45, 6, "Combined halftime 0-0 exceeds 45%."),
      con(c.htft["X/X"] > 0.30, 5, "HT/FT X/X exceeds 30%.")
    ],
    componentScore: c => componentScore([
      { value: rampUp(c.combined.over15, 0.73, 0.84), weight: 0.25 },
      { value: rampUp(c.expectedGoalEnvironment, 2.30, 3.00), weight: 0.20 },
      { value: rampDown(c.combined.failedToScore, 0.27, 0.16), weight: 0.15 },
      { value: rampDown(c.combined.cleanSheet, 0.34, 0.20), weight: 0.15 },
      { value: rampUp(Math.max(c.home.conceded, c.away.conceded), 0.75, 0.90), weight: 0.15 },
      { value: rampUp(Math.max(c.home.scored, c.away.scored), 0.82, 0.92), weight: 0.10 }
    ])
  });

  add("MATCH_OVER_2_5", {
    htftGate: c => c.htft.dynamic >= 0.35 && c.htft.reversalEqualizer >= 0.12,
    htftScore: c => htftScoreOver(c, {
      dynamicFloor: 0.35, dynamicCeiling: 0.55,
      reFloor: 0.12, reCeiling: 0.27,
      xxCeiling: 0.32, xxFloor: 0.16
    }),
    mandatory: c => [
      req(c.league.over25 >= 0.52, "League Over 2.5 is below 52%."),
      req(c.combined.over25 >= 0.59, "Combined Over 2.5 is below 59%."),
      req(c.expectedGoalEnvironment >= 2.75, "Expected goal environment is below 2.75."),
      req(c.combined.btts >= 0.55 ||
          (Math.max(c.home.scored2Plus, c.away.scored2Plus) >= 0.50 &&
           Math.max(c.home.scored3Plus, c.away.scored3Plus) >= 0.25),
        "Neither balanced scoring nor dominant-team route qualifies."),
      req(c.combined.failedToScore <= 0.25, "Combined failed-to-score is above 25%."),
      req(Math.max(c.home.scored2Plus, c.away.scored2Plus) >= 0.42,
        "Neither team scores two or more in at least 42%."),
      req(Math.max(c.home.conceded2Plus, c.away.conceded2Plus) >= 0.35,
        "Neither defence concedes two or more in at least 35%.")
    ],
    hardRejects: c => [
      rej(c.combined.under25 > 0.58, "Combined Under 2.5 is above 58%."),
      rej(c.expectedGoalEnvironment < 2.45, "Expected goal environment is below 2.45."),
      rej(c.goalDependencyRatio > 0.72 &&
          Math.max(c.home.scored3Plus, c.away.scored3Plus) < 0.25,
        "Goal projection depends too heavily on one team.")
    ],
    contradictions: c => [
      con(c.combined.halfTimeZeroZero > 0.42, 6, "Halftime 0-0 exceeds 42%."),
      con(c.htft["X/X"] > 0.30, 5, "HT/FT X/X exceeds 30%.")
    ],
    componentScore: c => componentScore([
      { value: rampUp(c.combined.over25, 0.59, 0.72), weight: 0.25 },
      { value: rampUp(c.expectedGoalEnvironment, 2.75, 3.40), weight: 0.20 },
      { value: rampUp(c.combined.btts, 0.55, 0.68), weight: 0.15 },
      { value: rampUp(Math.max(c.home.scored2Plus, c.away.scored2Plus), 0.42, 0.60), weight: 0.15 },
      { value: rampUp(Math.max(c.home.conceded2Plus, c.away.conceded2Plus), 0.35, 0.52), weight: 0.15 },
      { value: rampDown(c.combined.failedToScore, 0.25, 0.15), weight: 0.10 }
    ])
  });

  add("MATCH_OVER_3_5", {
    htftGate: c => c.htft.dynamic >= 0.40 && c.htft.reversalEqualizer >= 0.15,
    htftScore: c => htftScoreOver(c, {
      dynamicFloor: 0.40, dynamicCeiling: 0.58,
      reFloor: 0.15, reCeiling: 0.30,
      xxCeiling: 0.28, xxFloor: 0.14
    }),
    mandatory: c => [
      req(c.league.over35 >= 0.32, "League Over 3.5 is below 32%."),
      req(c.combined.over35 >= 0.42, "Combined Over 3.5 is below 42%."),
      req(c.expectedGoalEnvironment >= 3.20, "Expected goal environment is below 3.20."),
      req(c.combined.over25 >= 0.67, "Combined Over 2.5 is below 67%."),
      req(Math.max(c.home.scored3Plus, c.away.scored3Plus) >= 0.25,
        "Neither team scores three or more in at least 25%."),
      req(Math.max(c.home.conceded3Plus, c.away.conceded3Plus) >= 0.22,
        "Neither defence concedes three or more in at least 22%."),
      req(c.combined.btts >= 0.60, "Combined BTTS is below 60%.")
    ],
    hardRejects: c => [
      rej(c.home.under35 > 0.80 || c.away.under35 > 0.80,
        "At least one team has Under 3.5 above 80%."),
      rej(Math.min(c.home.scored, c.away.scored) < 0.60 &&
          Math.max(c.home.scored3Plus, c.away.scored3Plus) < 0.32,
        "Weak secondary attack and insufficient three-goal strength.")
    ],
    contradictions: c => [
      con(c.goalDependencyRatio > 0.72, 7, "Dangerous one-team goal dependency."),
      con(c.combined.failedToScore > 0.25, 6, "Combined failed-to-score exceeds 25%.")
    ],
    componentScore: c => componentScore([
      { value: rampUp(c.combined.over35, 0.42, 0.55), weight: 0.25 },
      { value: rampUp(c.expectedGoalEnvironment, 3.20, 3.80), weight: 0.25 },
      { value: rampUp(c.combined.over25, 0.67, 0.78), weight: 0.15 },
      { value: rampUp(c.combined.btts, 0.60, 0.72), weight: 0.15 },
      { value: rampUp(Math.max(c.home.scored3Plus, c.away.scored3Plus), 0.25, 0.38), weight: 0.10 },
      { value: rampUp(Math.max(c.home.conceded3Plus, c.away.conceded3Plus), 0.22, 0.34), weight: 0.10 }
    ])
  });

  add("MATCH_UNDER_1_5", {
    htftGate: c => c.htft.static >= 0.55 && c.htft.dynamic <= 0.30 && c.htft["X/X"] >= 0.28,
    htftScore: c => htftScoreUnder(c, {
      staticFloor: 0.55, staticCeiling: 0.75,
      xxFloor: 0.28, xxCeiling: 0.45,
      dynamicCeiling: 0.30, dynamicFloor: 0.15,
      reCeiling: 0.10, reFloor: 0.03
    }),
    mandatory: c => [
      req(c.league.under15 >= 0.28, "League Under 1.5 is below 28%."),
      req(c.combined.under15 >= 0.40, "Combined Under 1.5 is below 40%."),
      req(c.expectedGoalEnvironment <= 1.95, "Expected goal environment is above 1.95."),
      req(c.combined.btts <= 0.38, "Combined BTTS is above 38%."),
      req(c.combined.failedToScore >= 0.34, "Combined failed-to-score is below 34%."),
      req(c.combined.zeroZero >= 0.12, "Combined 0-0 rate is below 12%.")
    ],
    hardRejects: c => [
      rej(c.combined.over15 >= 0.70, "Combined Over 1.5 is 70% or higher."),
      rej(c.home.scored2Plus >= 0.38 || c.away.scored2Plus >= 0.38,
        "At least one team scores two or more too frequently.")
    ],
    contradictions: c => [
      con(c.htft.reversalEqualizer > 0.12, 7, "HT/FT equalizer/reversal rate exceeds 12%."),
      con(c.league.avgTotalGoals > 2.50, 5, "League average goals exceed 2.50.")
    ],
    componentScore: c => componentScore([
      { value: rampUp(c.combined.under15, 0.40, 0.55), weight: 0.25 },
      { value: rampDown(c.expectedGoalEnvironment, 1.95, 1.45), weight: 0.25 },
      { value: rampDown(c.combined.btts, 0.38, 0.24), weight: 0.15 },
      { value: rampUp(c.combined.failedToScore, 0.34, 0.48), weight: 0.20 },
      { value: rampUp(c.combined.zeroZero, 0.12, 0.22), weight: 0.15 }
    ])
  });

  add("MATCH_UNDER_2_5", {
    htftGate: c => c.htft.static >= 0.50 && c.htft.dynamic <= 0.36,
    htftScore: c => htftScoreUnder(c, {
      staticFloor: 0.50, staticCeiling: 0.72,
      xxFloor: 0.24, xxCeiling: 0.40,
      dynamicCeiling: 0.36, dynamicFloor: 0.18,
      reCeiling: 0.14, reFloor: 0.04
    }),
    mandatory: c => [
      req(c.league.under25 >= 0.52, "League Under 2.5 is below 52%."),
      req(c.combined.under25 >= 0.60, "Combined Under 2.5 is below 60%."),
      req(c.expectedGoalEnvironment <= 2.25, "Expected goal environment is above 2.25."),
      req(c.combined.btts <= 0.47, "Combined BTTS is above 47%."),
      req(c.home.failedToScore >= 0.32 || c.away.failedToScore >= 0.32,
        "Neither team fails to score in at least 32%."),
      req(c.home.cleanSheet >= 0.35 || c.away.cleanSheet >= 0.35,
        "Neither team keeps clean sheets in at least 35%.")
    ],
    hardRejects: c => [
      rej(c.home.scored >= 0.78 && c.away.scored >= 0.78,
        "Both teams score in at least 78%."),
      rej(c.home.conceded >= 0.75 && c.away.conceded >= 0.75,
        "Both teams concede in at least 75%."),
      rej(c.htft.dynamic > 0.40, "Dynamic HT/FT exceeds 40%.")
    ],
    contradictions: c => [
      con(c.home.scored2Plus >= 0.42 && c.away.scored2Plus >= 0.42, 7,
        "Both teams have strong two-goal records."),
      con(Math.max(c.home.conceded2Plus, c.away.conceded2Plus) > 0.45, 6,
        "At least one defence concedes two or more above 45%.")
    ],
    componentScore: c => componentScore([
      { value: rampUp(c.combined.under25, 0.60, 0.72), weight: 0.25 },
      { value: rampDown(c.expectedGoalEnvironment, 2.25, 1.75), weight: 0.25 },
      { value: rampDown(c.combined.btts, 0.47, 0.32), weight: 0.15 },
      { value: rampUp(Math.max(c.home.failedToScore, c.away.failedToScore), 0.32, 0.48), weight: 0.15 },
      { value: rampUp(Math.max(c.home.cleanSheet, c.away.cleanSheet), 0.35, 0.50), weight: 0.10 },
      { value: rampDown(c.combined.over25, 0.45, 0.28), weight: 0.10 }
    ])
  });

  add("MATCH_UNDER_3_5", {
    htftGate: c => c.htft.static >= 0.44 && c.htft.reversal <= 0.15,
    htftScore: c => htftScoreUnder(c, {
      staticFloor: 0.44, staticCeiling: 0.66,
      xxFloor: 0.20, xxCeiling: 0.36,
      dynamicCeiling: 0.44, dynamicFloor: 0.24,
      reCeiling: 0.18, reFloor: 0.06
    }),
    mandatory: c => [
      req(c.league.under35 >= 0.72, "League Under 3.5 is below 72%."),
      req(c.combined.under35 >= 0.76, "Combined Under 3.5 is below 76%."),
      req(c.expectedGoalEnvironment <= 2.85, "Expected goal environment is above 2.85."),
      req(c.home.scored3Plus <= 0.25 && c.away.scored3Plus <= 0.25,
        "At least one team scores three or more above 25%."),
      req(c.home.conceded3Plus <= 0.25 && c.away.conceded3Plus <= 0.25,
        "At least one defence concedes three or more above 25%.")
    ],
    hardRejects: c => [
      rej(c.home.avgGoalsFor > 1.75 && c.away.avgGoalsFor > 1.75,
        "Both teams average above 1.75 goals scored."),
      rej(c.home.avgGoalsAgainst > 1.60 && c.away.avgGoalsAgainst > 1.60,
        "Both defences concede above 1.60.")
    ],
    contradictions: c => [
      con(c.combined.over35 >= 0.40, 7, "Combined Over 3.5 is at least 40%."),
      con(c.htft.dynamic > 0.45, 5, "Dynamic HT/FT exceeds 45%.")
    ],
    componentScore: c => componentScore([
      { value: rampUp(c.combined.under35, 0.76, 0.86), weight: 0.30 },
      { value: rampDown(c.expectedGoalEnvironment, 2.85, 2.20), weight: 0.25 },
      { value: rampDown(Math.max(c.home.scored3Plus, c.away.scored3Plus), 0.25, 0.10), weight: 0.20 },
      { value: rampDown(Math.max(c.home.conceded3Plus, c.away.conceded3Plus), 0.25, 0.10), weight: 0.15 },
      { value: rampDown(c.combined.over35, 0.24, 0.12), weight: 0.10 }
    ])
  });

  add("MATCH_UNDER_4_5", {
    htftGate: c => c.htft.reversal <= 0.18 || c.htft.static >= 0.40,
    htftScore: c => htftScoreUnder(c, {
      staticFloor: 0.40, staticCeiling: 0.62,
      xxFloor: 0.18, xxCeiling: 0.34,
      dynamicCeiling: 0.50, dynamicFloor: 0.28,
      reCeiling: 0.22, reFloor: 0.08
    }),
    mandatory: c => [
      req(c.combined.under45 >= 0.88, "Combined Under 4.5 is below 88%."),
      req(c.expectedGoalEnvironment <= 3.20, "Expected goal environment is above 3.20."),
      req(c.home.scored4Plus <= 0.15 && c.away.scored4Plus <= 0.15,
        "At least one team scores four or more too frequently.")
    ],
    hardRejects: c => [
      rej(c.expectedGoalEnvironment > 3.60, "Expected goal environment exceeds 3.60."),
      rej(c.home.scored3Plus > 0.35 && c.away.conceded3Plus > 0.30,
        "Home heavy-win route is too strong."),
      rej(c.away.scored3Plus > 0.35 && c.home.conceded3Plus > 0.30,
        "Away heavy-win route is too strong.")
    ],
    contradictions: c => [
      con(c.combined.over35 > 0.45, 6, "Combined Over 3.5 exceeds 45%.")
    ],
    componentScore: c => componentScore([
      { value: rampUp(c.combined.under45, 0.88, 0.95), weight: 0.35 },
      { value: rampDown(c.expectedGoalEnvironment, 3.20, 2.40), weight: 0.25 },
      { value: rampDown(Math.max(c.home.scored4Plus, c.away.scored4Plus), 0.15, 0.05), weight: 0.20 },
      { value: rampDown(Math.max(c.home.conceded3Plus, c.away.conceded3Plus), 0.30, 0.12), weight: 0.20 }
    ])
  });

  // ----- TEAM TOTAL FACTORIES -----

  function addTeamOver(side, line) {
    const isHome = side === "home";
    const id = `${isHome ? "HOME" : "AWAY"}_OVER_${String(line).replace(".", "_")}`;
    const team = c => isHome ? c.home : c.away;
    const opp = c => isHome ? c.away : c.home;
    const htftScoreFn = isHome ? htftScoreHomeScoring : htftScoreAwayScoring;

    const configs = {
      0.5: {
        minScored: isHome ? 0.80 : 0.76,
        maxFts: isHome ? 0.22 : 0.27,
        minAvg: isHome ? 1.15 : 1.00,
        minXg: isHome ? 1.10 : 1.00,
        minOppConceded: isHome ? 0.72 : 0.70,
        maxOppCs: isHome ? 0.28 : 0.32
      },
      1.5: {
        minScored2: 0.42,
        minAvg: 1.55,
        minXg: 1.50,
        maxFts: 0.20,
        minOppConceded2: 0.35,
        maxOppCs: 0.25
      },
      2.5: {
        minScored3: 0.25,
        minAvg: 2.00,
        minXg: 1.90,
        minScored2: 0.55,
        minOppConceded3: 0.22,
        minOppConceded2: 0.45,
        maxOppCs: 0.15
      }
    };
    const cfg = configs[line];

    add(id, {
      htftGate: c => {
        const signal = isHome ? c.htft.homeGuaranteedScored : c.htft.awayGuaranteedScored;
        const floor = line === 0.5 ? 0.45 : line === 1.5 ? 0.50 : 0.54;
        return signal >= floor;
      },
      htftScore: htftScoreFn,
      mandatory: c => {
        const t = team(c), o = opp(c);
        if (line === 0.5) return [
          req(t.scored >= cfg.minScored, `Selected team scoring rate is below ${cfg.minScored * 100}%.`),
          req(o.cleanSheet <= cfg.maxOppCs, `Opponent clean-sheet rate is above ${cfg.maxOppCs * 100}%.`),
          req(o.conceded >= cfg.minOppConceded, `Opponent conceding rate is below ${cfg.minOppConceded * 100}%.`),
          req(t.avgGoalsFor >= cfg.minAvg, `Selected team scoring average is below ${cfg.minAvg}.`),
          req(t.avgXgFor >= cfg.minXg, `Selected team xG is below ${cfg.minXg}.`),
          req(t.failedToScore <= cfg.maxFts, `Selected team failed-to-score is above ${cfg.maxFts * 100}%.`)
        ];
        if (line === 1.5) return [
          req(t.scored2Plus >= cfg.minScored2, "Selected team scores two or more below 42%."),
          req(t.avgGoalsFor >= cfg.minAvg, "Selected team scoring average is below 1.55."),
          req(t.avgXgFor >= cfg.minXg, "Selected team xG is below 1.50."),
          req(t.failedToScore <= cfg.maxFts, "Selected team failed-to-score is above 20%."),
          req(o.conceded2Plus >= cfg.minOppConceded2, "Opponent concedes two or more below 35%."),
          req(o.cleanSheet <= cfg.maxOppCs, "Opponent clean-sheet rate is above 25%.")
        ];
        return [
          req(t.scored3Plus >= cfg.minScored3, "Selected team scores three or more below 25%."),
          req(t.avgGoalsFor >= cfg.minAvg, "Selected team scoring average is below 2.00."),
          req(t.avgXgFor >= cfg.minXg, "Selected team xG is below 1.90."),
          req(t.scored2Plus >= cfg.minScored2, "Selected team scores two or more below 55%."),
          req(o.conceded3Plus >= cfg.minOppConceded3, "Opponent concedes three or more below 22%."),
          req(o.conceded2Plus >= cfg.minOppConceded2, "Opponent concedes two or more below 45%."),
          req(o.cleanSheet <= cfg.maxOppCs, "Opponent clean-sheet rate is above 15%.")
        ];
      },
      hardRejects: c => {
        const t = team(c), o = opp(c);
        if (line === 0.5) return [
          rej(o.cleanSheet > 0.42, "Opponent clean-sheet rate exceeds 42%."),
          rej(t.failedToScore > 0.32, "Selected team failed-to-score exceeds 32%."),
          rej(t.avgGoalsFor < 0.90, "Selected team scoring average is below 0.90.")
        ];
        if (line === 1.5) return [
          rej(t.scored2Plus < 0.35, "Selected team two-goal rate is below 35%."),
          rej(o.cleanSheet > 0.40, "Opponent clean-sheet rate exceeds 40%."),
          rej(o.conceded2Plus < 0.25, "Opponent concedes two or more below 25%.")
        ];
        return [
          rej(t.scored3Plus < 0.18, "Selected team three-goal rate is below 18%."),
          rej(o.conceded3Plus < 0.15, "Opponent concedes three or more below 15%."),
          rej(t.scored3Plus <= 1 / Math.max(t.sampleSizeVenue, 1),
            "Three-goal rate is driven by at most one relevant match.")
        ];
      },
      contradictions: c => {
        const t = team(c), o = opp(c);
        return [
          con(o.avgXgAgainst < (line === 0.5 ? 0.90 : line === 1.5 ? 1.15 : 1.50), 5,
            "Opponent xGA is low for this team-total line."),
          con(t.windows.recentVenue6.failedToScore > t.windows.seasonVenue.failedToScore + 0.15, 5,
            "Selected team recent failed-to-score form has deteriorated.")
        ];
      },
      componentScore: c => {
        const t = team(c), o = opp(c);
        if (line === 0.5) return componentScore([
          { value: rampUp(t.scored, cfg.minScored, 0.90), weight: 0.25 },
          { value: rampUp(o.conceded, cfg.minOppConceded, 0.88), weight: 0.20 },
          { value: rampDown(t.failedToScore, cfg.maxFts, 0.10), weight: 0.15 },
          { value: rampDown(o.cleanSheet, cfg.maxOppCs, 0.12), weight: 0.15 },
          { value: rampUp(t.avgGoalsFor, cfg.minAvg, cfg.minAvg + 0.70), weight: 0.15 },
          { value: rampUp(t.avgXgFor, cfg.minXg, cfg.minXg + 0.60), weight: 0.10 }
        ]);
        if (line === 1.5) return componentScore([
          { value: rampUp(t.scored2Plus, 0.42, 0.58), weight: 0.25 },
          { value: rampUp(o.conceded2Plus, 0.35, 0.52), weight: 0.20 },
          { value: rampUp(t.avgGoalsFor, 1.55, 2.10), weight: 0.15 },
          { value: rampUp(t.avgXgFor, 1.50, 2.00), weight: 0.15 },
          { value: rampDown(t.failedToScore, 0.20, 0.08), weight: 0.10 },
          { value: rampDown(o.cleanSheet, 0.25, 0.10), weight: 0.15 }
        ]);
        return componentScore([
          { value: rampUp(t.scored3Plus, 0.25, 0.38), weight: 0.25 },
          { value: rampUp(o.conceded3Plus, 0.22, 0.34), weight: 0.20 },
          { value: rampUp(t.scored2Plus, 0.55, 0.70), weight: 0.15 },
          { value: rampUp(o.conceded2Plus, 0.45, 0.60), weight: 0.15 },
          { value: rampUp(t.avgXgFor, 1.90, 2.40), weight: 0.15 },
          { value: rampDown(o.cleanSheet, 0.15, 0.05), weight: 0.10 }
        ]);
      }
    });
  }

  function addTeamUnder(side, line) {
    const isHome = side === "home";
    const id = `${isHome ? "HOME" : "AWAY"}_UNDER_${String(line).replace(".", "_")}`;
    const team = c => isHome ? c.home : c.away;
    const opp = c => isHome ? c.away : c.home;

    add(id, {
      htftGate: c => {
        const oppControl = isHome ? c.htft.fullTimeAwayWin : c.htft.fullTimeHomeWin;
        const ownGuaranteed = isHome ? c.htft.homeGuaranteedScored : c.htft.awayGuaranteedScored;
        if (line === 0.5) return ownGuaranteed <= 0.42 && (c.htft.static >= 0.48 || oppControl >= 0.38);
        if (line === 1.5) return ownGuaranteed <= 0.58 && c.htft.reversalEqualizer <= 0.16;
        return ownGuaranteed <= 0.68 && c.htft.reversal <= 0.16;
      },
      htftScore: c => {
        const ownGuaranteed = isHome ? c.htft.homeGuaranteedScored : c.htft.awayGuaranteedScored;
        const oppWin = isHome ? c.htft.fullTimeAwayWin : c.htft.fullTimeHomeWin;
        return scaledWeightedScore([
          { value: rampDown(ownGuaranteed,
            line === 0.5 ? 0.42 : line === 1.5 ? 0.58 : 0.68,
            line === 0.5 ? 0.25 : line === 1.5 ? 0.38 : 0.48), weight: 0.40 },
          { value: rampUp(c.htft.static, 0.46, 0.68), weight: 0.25 },
          { value: rampUp(oppWin, 0.36, 0.58), weight: 0.20 },
          { value: rampDown(c.htft.reversalEqualizer, 0.16, 0.05), weight: 0.15 }
        ], HTFT_MAX_POINTS);
      },
      mandatory: c => {
        const t = team(c), o = opp(c);
        if (line === 0.5) return [
          req(t.failedToScore >= 0.36, "Selected team failed-to-score is below 36%."),
          req(t.avgGoalsFor <= 0.85, "Selected team scoring average is above 0.85."),
          req(t.avgXgFor <= 0.90, "Selected team xG is above 0.90."),
          req(t.scored <= 0.62, "Selected team scores above 62%."),
          req(o.cleanSheet >= 0.38, "Opponent clean-sheet rate is below 38%."),
          req(o.conceded <= 0.65, "Opponent concedes above 65%.")
        ];
        if (line === 1.5) return [
          req(t.scored2Plus <= 0.28, "Selected team scores two or more above 28%."),
          req(t.avgGoalsFor <= 1.20, "Selected team scoring average is above 1.20."),
          req(t.avgXgFor <= 1.25, "Selected team xG is above 1.25."),
          req(o.conceded2Plus <= 0.28, "Opponent concedes two or more above 28%."),
          req(o.avgGoalsAgainst <= 1.20, "Opponent defensive average is above 1.20."),
          req(o.cleanSheet >= 0.30, "Opponent clean-sheet rate is below 30%.")
        ];
        return [
          req(t.scored3Plus <= 0.18, "Selected team scores three or more above 18%."),
          req(t.avgGoalsFor <= 1.65, "Selected team scoring average is above 1.65."),
          req(t.avgXgFor <= 1.65, "Selected team xG is above 1.65."),
          req(o.conceded3Plus <= 0.15, "Opponent concedes three or more above 15%."),
          req(1 - o.conceded3Plus >= 0.78, "Opponent does not hold teams to two or fewer often enough.")
        ];
      },
      hardRejects: c => {
        const t = team(c), o = opp(c);
        if (line === 0.5) return [
          rej(t.scored >= 0.72, "Selected team scores in at least 72%."),
          rej(o.conceded >= 0.75, "Opponent concedes in at least 75%."),
          rej(t.secondHalfScored >= 0.58, "Selected team has a strong late-scoring profile.")
        ];
        if (line === 1.5) return [
          rej(t.scored2Plus >= 0.40, "Selected team scores two or more in at least 40%."),
          rej(o.conceded2Plus >= 0.38, "Opponent concedes two or more in at least 38%."),
          rej(c.htft.dynamic >= 0.42, "Dynamic HT/FT is too high.")
        ];
        return [
          rej(t.scored3Plus >= 0.25, "Selected team scores three or more in at least 25%."),
          rej(o.conceded3Plus >= 0.22, "Opponent concedes three or more above 22%.")
        ];
      },
      contradictions: c => {
        const t = team(c), o = opp(c);
        return [
          con(t.windows.recentVenue6.avgGoalsFor > t.windows.seasonVenue.avgGoalsFor + 0.35, 6,
            "Selected team recent scoring average has risen sharply."),
          con(o.windows.recentVenue6.cleanSheet < o.windows.seasonVenue.cleanSheet - 0.15, 5,
            "Opponent recent clean-sheet form has deteriorated.")
        ];
      },
      componentScore: c => {
        const t = team(c), o = opp(c);
        if (line === 0.5) return componentScore([
          { value: rampUp(t.failedToScore, 0.36, 0.50), weight: 0.25 },
          { value: rampDown(t.avgGoalsFor, 0.85, 0.55), weight: 0.20 },
          { value: rampDown(t.avgXgFor, 0.90, 0.60), weight: 0.15 },
          { value: rampUp(o.cleanSheet, 0.38, 0.52), weight: 0.20 },
          { value: rampDown(o.conceded, 0.65, 0.48), weight: 0.20 }
        ]);
        if (line === 1.5) return componentScore([
          { value: rampDown(t.scored2Plus, 0.28, 0.15), weight: 0.25 },
          { value: rampDown(t.avgGoalsFor, 1.20, 0.85), weight: 0.20 },
          { value: rampDown(t.avgXgFor, 1.25, 0.90), weight: 0.15 },
          { value: rampDown(o.conceded2Plus, 0.28, 0.15), weight: 0.20 },
          { value: rampUp(o.cleanSheet, 0.30, 0.45), weight: 0.20 }
        ]);
        return componentScore([
          { value: rampDown(t.scored3Plus, 0.18, 0.08), weight: 0.25 },
          { value: rampDown(t.avgGoalsFor, 1.65, 1.20), weight: 0.20 },
          { value: rampDown(t.avgXgFor, 1.65, 1.20), weight: 0.15 },
          { value: rampDown(o.conceded3Plus, 0.15, 0.06), weight: 0.20 },
          { value: rampDown(o.avgGoalsAgainst, 1.40, 0.95), weight: 0.20 }
        ]);
      }
    });
  }

  for (const side of ["home", "away"]) {
    for (const line of [0.5, 1.5, 2.5]) addTeamOver(side, line);
    for (const line of [0.5, 1.5, 2.5]) addTeamUnder(side, line);
  }

  // ----- BTTS -----

  add("BTTS_YES", {
    htftGate: c => c.htft.bttsGuaranteed >= 0.10 && c.htft.dynamic >= 0.32,
    htftScore: htftScoreBttsYes,
    mandatory: c => [
      req(c.combined.btts >= 0.58, "Combined BTTS is below 58%."),
      req(c.home.scored >= 0.75, "Home scoring rate is below 75%."),
      req(c.away.scored >= 0.70, "Away scoring rate is below 70%."),
      req(c.home.conceded >= 0.68, "Home conceding rate is below 68%."),
      req(c.away.conceded >= 0.70, "Away conceding rate is below 70%."),
      req(c.home.failedToScore <= 0.30 && c.away.failedToScore <= 0.30,
        "At least one failed-to-score rate is above 30%."),
      req(c.home.cleanSheet <= 0.32 && c.away.cleanSheet <= 0.32,
        "At least one clean-sheet rate is above 32%."),
      req(c.expectedGoalEnvironment >= 2.55, "Expected goal environment is below 2.55.")
    ],
    hardRejects: c => [
      rej(c.home.failedToScore > 0.38 || c.away.failedToScore > 0.38,
        "At least one team fails to score above 38%."),
      rej(c.home.cleanSheet > 0.45 || c.away.cleanSheet > 0.45,
        "At least one team keeps clean sheets above 45%."),
      rej(c.goalDependencyRatio > 0.72, "Dangerous scoring imbalance.")
    ],
    contradictions: c => [
      con(c.htft["X/X"] > 0.30, 6, "HT/FT X/X exceeds 30%."),
      con(c.combined.failedToScore > 0.25, 5, "Combined failed-to-score exceeds 25%.")
    ],
    componentScore: c => componentScore([
      { value: rampUp(c.combined.btts, 0.58, 0.70), weight: 0.25 },
      { value: rampUp(Math.min(c.home.scored, c.away.scored), 0.70, 0.84), weight: 0.20 },
      { value: rampUp(Math.min(c.home.conceded, c.away.conceded), 0.68, 0.82), weight: 0.20 },
      { value: rampDown(Math.max(c.home.failedToScore, c.away.failedToScore), 0.30, 0.16), weight: 0.15 },
      { value: rampDown(Math.max(c.home.cleanSheet, c.away.cleanSheet), 0.32, 0.18), weight: 0.10 },
      { value: rampUp(c.expectedGoalEnvironment, 2.55, 3.20), weight: 0.10 }
    ])
  });

  add("BTTS_NO", {
    htftGate: c => c.htft.bttsGuaranteed <= 0.14 && c.htft.static >= 0.48,
    htftScore: htftScoreBttsNo,
    mandatory: c => [
      req(c.combined.bttsNo >= 0.60, "Combined BTTS No is below 60%."),
      req(c.home.failedToScore >= 0.35 || c.away.failedToScore >= 0.35,
        "Neither team fails to score in at least 35%."),
      req(c.home.cleanSheet >= 0.38 || c.away.cleanSheet >= 0.38,
        "Neither team keeps clean sheets in at least 38%."),
      req(c.expectedGoalEnvironment <= 2.35, "Expected goal environment is above 2.35."),
      req(c.htft.equalizer <= 0.14, "HT/FT equalizer rate is above 14%.")
    ],
    hardRejects: c => [
      rej(c.home.scored >= 0.75 && c.away.scored >= 0.75,
        "Both teams score in at least 75%."),
      rej(c.home.conceded >= 0.75 && c.away.conceded >= 0.75,
        "Both teams concede in at least 75%."),
      rej(c.htft.dynamic > 0.38, "Dynamic HT/FT exceeds 38%.")
    ],
    contradictions: c => [
      con(c.combined.btts > 0.48, 6, "Combined BTTS Yes exceeds 48%."),
      con(c.htft.reversal > 0.10, 5, "HT/FT reversal rate exceeds 10%.")
    ],
    componentScore: c => componentScore([
      { value: rampUp(c.combined.bttsNo, 0.60, 0.72), weight: 0.25 },
      { value: rampUp(Math.max(c.home.failedToScore, c.away.failedToScore), 0.35, 0.50), weight: 0.20 },
      { value: rampUp(Math.max(c.home.cleanSheet, c.away.cleanSheet), 0.38, 0.52), weight: 0.20 },
      { value: rampDown(c.expectedGoalEnvironment, 2.35, 1.80), weight: 0.20 },
      { value: rampDown(c.htft.equalizer, 0.14, 0.04), weight: 0.15 }
    ])
  });

  // ----- RESULT MARKETS -----

  add("HOME_WIN", {
    htftGate: c => c.htft.fullTimeHomeWin >= 0.42 && c.htft.fullTimeHomeWin > c.htft.fullTimeAwayWin,
    htftScore: htftScoreHomeResult,
    mandatory: c => [
      req(c.home.win >= 0.52, "Home win rate is below 52%."),
      req(c.away.loss >= 0.42, "Away loss rate is below 42%."),
      req(c.homePpgEdge >= 0.45, "Home PPG edge is below 0.45."),
      req(c.homeGoalDifferenceEdge >= 0.60, "Home goal-difference edge is below 0.60."),
      req(c.homeXgEdge >= 0.35, "Home xG edge is below 0.35."),
      req(c.home.scoredFirst >= 0.55, "Home scored-first rate is below 55%."),
      req(c.htft["1/1"] + c.htft["X/1"] >= 0.43,
        "1/1 plus X/1 HT/FT rate is below 43%."),
      req(c.away.win <= 0.30, "Away win rate exceeds 30%.")
    ],
    hardRejects: c => [
      rej(c.home.draw > 0.35, "Home draw rate exceeds 35%."),
      rej(c.away.unbeaten > 0.65, "Away unbeaten rate exceeds 65%."),
      rej(c.home.concededFirst > 0.50, "Home concedes first too frequently.")
    ],
    contradictions: c => [
      con(c.htft.reversal > 0.12, 6, "HT/FT reversal rate exceeds 12%."),
      con(c.home.scored2Plus < 0.35 && c.home.cleanSheet < 0.30, 6,
        "Home lacks both two-goal power and clean-sheet protection.")
    ],
    componentScore: c => componentScore([
      { value: rampUp(c.home.win, 0.52, 0.66), weight: 0.20 },
      { value: rampUp(c.away.loss, 0.42, 0.58), weight: 0.15 },
      { value: rampUp(c.homePpgEdge, 0.45, 0.90), weight: 0.20 },
      { value: rampUp(c.homeGoalDifferenceEdge, 0.60, 1.30), weight: 0.15 },
      { value: rampUp(c.homeXgEdge, 0.35, 0.80), weight: 0.15 },
      { value: rampUp(c.home.scoredFirst, 0.55, 0.70), weight: 0.15 }
    ])
  });

  add("AWAY_WIN", {
    htftGate: c => c.htft.fullTimeAwayWin >= 0.40 && c.htft.fullTimeAwayWin > c.htft.fullTimeHomeWin,
    htftScore: htftScoreAwayResult,
    mandatory: c => [
      req(c.away.win >= 0.50, "Away win rate is below 50%."),
      req(c.home.loss >= 0.45, "Home loss rate is below 45%."),
      req(-c.homePpgEdge >= 0.55, "Away PPG edge is below 0.55."),
      req(-c.homeGoalDifferenceEdge >= 0.60, "Away goal-difference edge is below 0.60."),
      req(-c.homeXgEdge >= 0.40, "Away xG edge is below 0.40."),
      req(c.away.scoredFirst >= 0.57, "Away scored-first rate is below 57%."),
      req(c.htft["2/2"] + c.htft["X/2"] >= 0.42,
        "2/2 plus X/2 HT/FT rate is below 42%."),
      req(c.home.win <= 0.30, "Home win rate exceeds 30%.")
    ],
    hardRejects: c => [
      rej(c.away.draw > 0.35, "Away draw rate exceeds 35%."),
      rej(c.home.unbeaten > 0.65, "Home unbeaten rate exceeds 65%."),
      rej(c.away.concededFirst > 0.50, "Away concedes first too frequently.")
    ],
    contradictions: c => [
      con(c.htft.reversal > 0.12, 6, "HT/FT reversal rate exceeds 12%."),
      con(c.away.scored2Plus < 0.35 && c.away.cleanSheet < 0.30, 6,
        "Away lacks both two-goal power and clean-sheet protection.")
    ],
    componentScore: c => componentScore([
      { value: rampUp(c.away.win, 0.50, 0.64), weight: 0.20 },
      { value: rampUp(c.home.loss, 0.45, 0.60), weight: 0.15 },
      { value: rampUp(-c.homePpgEdge, 0.55, 1.00), weight: 0.20 },
      { value: rampUp(-c.homeGoalDifferenceEdge, 0.60, 1.30), weight: 0.15 },
      { value: rampUp(-c.homeXgEdge, 0.40, 0.85), weight: 0.15 },
      { value: rampUp(c.away.scoredFirst, 0.57, 0.72), weight: 0.15 }
    ])
  });

  add("DRAW", {
    htftGate: c => c.htft.fullTimeDraw >= 0.27 && c.htft["X/X"] >= 0.24,
    htftScore: htftScoreDraw,
    mandatory: c => [
      req(c.combined.draw >= 0.30, "Combined draw rate is below 30%."),
      req(c.league.draw >= 0.27, "League draw rate is below 27%."),
      req(Math.abs(c.homePpgEdge) <= 0.25, "PPG difference exceeds 0.25."),
      req(Math.abs(c.homeXgEdge) <= 0.25, "xG difference exceeds 0.25."),
      req(Math.abs(c.homeGoalDifferenceEdge) <= 0.40, "Goal-difference gap exceeds 0.40."),
      req(c.htft["X/X"] >= 0.27, "HT/FT X/X is below 27%."),
      req(c.home.win <= 0.48 && c.away.win <= 0.48,
        "At least one team wins above 48%.")
    ],
    hardRejects: c => [
      rej(c.home.win > 0.55 || c.away.win > 0.55,
        "At least one team wins above 55%."),
      rej(Math.abs(c.homeFirstScoreEdge) >= 0.20,
        "First-score edge is too large for a draw.")
    ],
    contradictions: c => [
      con(c.htft.reversal > 0.12, 6, "HT/FT reversal rate is too volatile."),
      con(c.combined.oneGoalMargin < 0.30, 4, "One-goal-margin rate is low.")
    ],
    componentScore: c => componentScore([
      { value: rampUp(c.combined.draw, 0.30, 0.40), weight: 0.25 },
      { value: rampUp(c.league.draw, 0.27, 0.34), weight: 0.15 },
      { value: rampDown(Math.abs(c.homePpgEdge), 0.25, 0.05), weight: 0.20 },
      { value: rampDown(Math.abs(c.homeXgEdge), 0.25, 0.05), weight: 0.15 },
      { value: rampDown(Math.abs(c.homeGoalDifferenceEdge), 0.40, 0.10), weight: 0.10 },
      { value: rampUp(c.htft["X/X"], 0.27, 0.38), weight: 0.15 }
    ])
  });

  function addDnbAndDoubleChance() {
    add("HOME_DNB", {
      htftGate: c => c.htft.fullTimeHomeWin + c.htft.fullTimeDraw >= 0.68 &&
        c.htft.fullTimeHomeWin >= c.htft.fullTimeAwayWin,
      htftScore: c => scaledWeightedScore([
        { value: rampUp(c.htft.fullTimeHomeWin + c.htft.fullTimeDraw, 0.68, 0.84), weight: 0.50 },
        { value: rampDown(c.htft.fullTimeAwayWin, 0.32, 0.16), weight: 0.25 },
        { value: rampUp(c.htft.fullTimeHomeWin, 0.38, 0.58), weight: 0.25 }
      ], HTFT_MAX_POINTS),
      mandatory: c => [
        req(c.home.unbeaten >= 0.72, "Home unbeaten rate is below 72%."),
        req(c.away.win <= 0.28, "Away win rate exceeds 28%."),
        req(c.homePpgEdge >= 0.30, "Home PPG edge is below 0.30."),
        req(c.homeXgEdge >= 0.25, "Home xG edge is below 0.25."),
        req(c.home.loss <= 0.24, "Home loss rate exceeds 24%.")
      ],
      hardRejects: c => [
        rej(c.away.win >= 0.38, "Away win profile is too strong.")
      ],
      contradictions: c => [
        con(c.htft.fullTimeAwayWin > 0.32, 6, "HT/FT away-win rate exceeds 32%.")
      ],
      componentScore: c => componentScore([
        { value: rampUp(c.home.unbeaten, 0.72, 0.84), weight: 0.30 },
        { value: rampDown(c.away.win, 0.28, 0.15), weight: 0.20 },
        { value: rampUp(c.homePpgEdge, 0.30, 0.70), weight: 0.20 },
        { value: rampUp(c.homeXgEdge, 0.25, 0.60), weight: 0.15 },
        { value: rampDown(c.home.loss, 0.24, 0.12), weight: 0.15 }
      ])
    });

    add("AWAY_DNB", {
      htftGate: c => c.htft.fullTimeAwayWin + c.htft.fullTimeDraw >= 0.68 &&
        c.htft.fullTimeAwayWin >= c.htft.fullTimeHomeWin,
      htftScore: c => scaledWeightedScore([
        { value: rampUp(c.htft.fullTimeAwayWin + c.htft.fullTimeDraw, 0.68, 0.84), weight: 0.50 },
        { value: rampDown(c.htft.fullTimeHomeWin, 0.32, 0.16), weight: 0.25 },
        { value: rampUp(c.htft.fullTimeAwayWin, 0.38, 0.58), weight: 0.25 }
      ], HTFT_MAX_POINTS),
      mandatory: c => [
        req(c.away.unbeaten >= 0.70, "Away unbeaten rate is below 70%."),
        req(c.home.win <= 0.30, "Home win rate exceeds 30%."),
        req(-c.homePpgEdge >= 0.35, "Away PPG edge is below 0.35."),
        req(-c.homeXgEdge >= 0.25, "Away xG edge is below 0.25."),
        req(c.away.loss <= 0.26, "Away loss rate exceeds 26%.")
      ],
      hardRejects: c => [
        rej(c.home.win >= 0.40, "Home win profile is too strong.")
      ],
      contradictions: c => [
        con(c.htft.fullTimeHomeWin > 0.32, 6, "HT/FT home-win rate exceeds 32%.")
      ],
      componentScore: c => componentScore([
        { value: rampUp(c.away.unbeaten, 0.70, 0.82), weight: 0.30 },
        { value: rampDown(c.home.win, 0.30, 0.16), weight: 0.20 },
        { value: rampUp(-c.homePpgEdge, 0.35, 0.75), weight: 0.20 },
        { value: rampUp(-c.homeXgEdge, 0.25, 0.60), weight: 0.15 },
        { value: rampDown(c.away.loss, 0.26, 0.13), weight: 0.15 }
      ])
    });

    add("DOUBLE_CHANCE_1X", {
      htftGate: c => c.htft.fullTimeHomeWin + c.htft.fullTimeDraw >= 0.72,
      htftScore: c => scaledWeightedScore([
        { value: rampUp(c.htft.fullTimeHomeWin + c.htft.fullTimeDraw, 0.72, 0.86), weight: 0.60 },
        { value: rampDown(c.htft.fullTimeAwayWin, 0.28, 0.14), weight: 0.25 },
        { value: rampUp(c.htft.homeLedAtHalf + c.htft.halfTimeDraw, 0.68, 0.84), weight: 0.15 }
      ], HTFT_MAX_POINTS),
      mandatory: c => [
        req(c.home.unbeaten >= 0.74, "Home unbeaten rate is below 74%."),
        req(c.away.win <= 0.27, "Away win rate exceeds 27%."),
        req(c.home.ppg >= c.away.ppg, "Home PPG is below away PPG."),
        req(c.home.loss <= 0.25, "Home loss rate exceeds 25%."),
        req(c.home.scoredFirst >= c.away.scoredFirst, "Home scored-first rate is below away rate."),
        req(c.htft["2/2"] + c.htft["X/2"] <= 0.35,
          "Away 2/2 plus X/2 HT/FT exceeds 35%.")
      ],
      hardRejects: c => [rej(c.away.win > 0.38, "Away win rate is too strong.")],
      contradictions: c => [
        con(c.home.windows.recentVenue6.loss > 0.34, 6, "Home recent venue loss rate exceeds 34%.")
      ],
      componentScore: c => componentScore([
        { value: rampUp(c.home.unbeaten, 0.74, 0.86), weight: 0.35 },
        { value: rampDown(c.away.win, 0.27, 0.14), weight: 0.25 },
        { value: rampUp(c.homePpgEdge, 0.00, 0.45), weight: 0.15 },
        { value: rampDown(c.home.loss, 0.25, 0.12), weight: 0.15 },
        { value: rampUp(c.homeFirstScoreEdge, 0.00, 0.18), weight: 0.10 }
      ])
    });

    add("DOUBLE_CHANCE_X2", {
      htftGate: c => c.htft.fullTimeAwayWin + c.htft.fullTimeDraw >= 0.70,
      htftScore: c => scaledWeightedScore([
        { value: rampUp(c.htft.fullTimeAwayWin + c.htft.fullTimeDraw, 0.70, 0.84), weight: 0.60 },
        { value: rampDown(c.htft.fullTimeHomeWin, 0.30, 0.16), weight: 0.25 },
        { value: rampUp(c.htft.awayLedAtHalf + c.htft.halfTimeDraw, 0.66, 0.82), weight: 0.15 }
      ], HTFT_MAX_POINTS),
      mandatory: c => [
        req(c.away.unbeaten >= 0.72, "Away unbeaten rate is below 72%."),
        req(c.home.win <= 0.30, "Home win rate exceeds 30%."),
        req(c.away.ppg >= c.home.ppg, "Away PPG is below home PPG."),
        req(c.away.loss <= 0.27, "Away loss rate exceeds 27%."),
        req(c.away.scoredFirst >= c.home.scoredFirst, "Away scored-first rate is below home rate.")
      ],
      hardRejects: c => [rej(c.home.win > 0.40, "Home win rate is too strong.")],
      contradictions: c => [
        con(c.away.windows.recentVenue6.loss > 0.34, 6, "Away recent venue loss rate exceeds 34%.")
      ],
      componentScore: c => componentScore([
        { value: rampUp(c.away.unbeaten, 0.72, 0.84), weight: 0.35 },
        { value: rampDown(c.home.win, 0.30, 0.16), weight: 0.25 },
        { value: rampUp(-c.homePpgEdge, 0.00, 0.45), weight: 0.15 },
        { value: rampDown(c.away.loss, 0.27, 0.13), weight: 0.15 },
        { value: rampUp(-c.homeFirstScoreEdge, 0.00, 0.18), weight: 0.10 }
      ])
    });

    add("DOUBLE_CHANCE_12", {
      htftGate: c => c.htft.fullTimeDraw <= 0.23 && c.htft["X/X"] <= 0.20,
      htftScore: c => scaledWeightedScore([
        { value: rampDown(c.htft.fullTimeDraw, 0.23, 0.12), weight: 0.45 },
        { value: rampDown(c.htft["X/X"], 0.20, 0.10), weight: 0.30 },
        { value: rampUp(c.htft["X/1"] + c.htft["X/2"], 0.28, 0.42), weight: 0.25 }
      ], HTFT_MAX_POINTS),
      mandatory: c => [
        req(c.combined.draw <= 0.23, "Combined draw rate exceeds 23%."),
        req(c.league.draw <= 0.25, "League draw rate exceeds 25%."),
        req(c.htft["X/X"] <= 0.20, "HT/FT X/X exceeds 20%."),
        req(c.htft["X/1"] + c.htft["X/2"] >= 0.28,
          "X/1 plus X/2 HT/FT is below 28%.")
      ],
      hardRejects: c => [
        rej(c.combined.draw > 0.28, "Combined draw rate exceeds 28%."),
        rej(c.htft["X/X"] > 0.25, "HT/FT X/X exceeds 25%.")
      ],
      contradictions: c => [
        con(Math.abs(c.homePpgEdge) < 0.12 && Math.abs(c.homeXgEdge) < 0.12, 5,
          "Teams are too evenly matched.")
      ],
      componentScore: c => componentScore([
        { value: rampDown(c.combined.draw, 0.23, 0.12), weight: 0.30 },
        { value: rampDown(c.league.draw, 0.25, 0.18), weight: 0.20 },
        { value: rampDown(c.htft["X/X"], 0.20, 0.10), weight: 0.20 },
        { value: rampUp(c.htft["X/1"] + c.htft["X/2"], 0.28, 0.42), weight: 0.20 },
        { value: rampUp(Math.abs(c.homePpgEdge), 0.12, 0.55), weight: 0.10 }
      ])
    });
  }
  addDnbAndDoubleChance();

  // ----- HALF MARKETS -----

  add("FIRST_HALF_OVER_0_5", {
    htftGate: c => c.htft.firstHalfNonDraw >= 0.38,
    htftScore: htftScoreFirstHalfOver,
    mandatory: c => [
      req(c.combined.firstHalfGoal >= 0.70, "Combined first-half goal rate is below 70%."),
      req(c.combined.halfTimeZeroZero <= 0.30, "Combined halftime 0-0 exceeds 30%."),
      req(c.home.firstHalfScored >= 0.40 || c.away.firstHalfScored >= 0.40,
        "Neither team scores in the first half in at least 40%."),
      req(c.home.firstHalfConceded >= 0.40 || c.away.firstHalfConceded >= 0.40,
        "Neither team concedes in the first half in at least 40%."),
      req(c.league.firstHalfGoal >= 0.68, "League first-half goal rate is below 68%.")
    ],
    hardRejects: c => [
      rej(c.combined.halfTimeZeroZero > 0.38, "Combined halftime 0-0 exceeds 38%.")
    ],
    contradictions: c => [
      con(c.home.firstHalfScored < 0.28 && c.away.firstHalfScored < 0.28, 7,
        "Both teams start slowly.")
    ],
    componentScore: c => componentScore([
      { value: rampUp(c.combined.firstHalfGoal, 0.70, 0.82), weight: 0.30 },
      { value: rampDown(c.combined.halfTimeZeroZero, 0.30, 0.18), weight: 0.25 },
      { value: rampUp(Math.max(c.home.firstHalfScored, c.away.firstHalfScored), 0.40, 0.56), weight: 0.20 },
      { value: rampUp(Math.max(c.home.firstHalfConceded, c.away.firstHalfConceded), 0.40, 0.56), weight: 0.15 },
      { value: rampUp(c.league.firstHalfGoal, 0.68, 0.78), weight: 0.10 }
    ])
  });

  add("FIRST_HALF_OVER_1_5", {
    htftGate: c => c.htft.firstHalfNonDraw >= 0.42 && c.htft.reversalEqualizer >= 0.12,
    htftScore: htftScoreFirstHalfOver,
    mandatory: c => [
      req(c.combined.firstHalfOver15 >= 0.31, "Combined first-half Over 1.5 is below 31%."),
      req(mean([
        c.home.avgFirstHalfGoalsFor + c.home.avgFirstHalfGoalsAgainst,
        c.away.avgFirstHalfGoalsFor + c.away.avgFirstHalfGoalsAgainst
      ]) >= 1.15, "First-half average goals are below 1.15."),
      req(c.combined.over25 >= 0.62, "Combined match Over 2.5 is below 62%."),
      req(c.htft.dynamic >= 0.38, "Dynamic HT/FT is below 38%.")
    ],
    hardRejects: c => [
      rej(c.combined.halfTimeZeroZero > 0.32, "Combined halftime 0-0 exceeds 32%.")
    ],
    contradictions: c => [
      con(Math.max(c.home.firstHalfOver15, c.away.firstHalfOver15) < 0.28, 6,
        "Neither team produces two first-half goals often enough.")
    ],
    componentScore: c => componentScore([
      { value: rampUp(c.combined.firstHalfOver15, 0.31, 0.43), weight: 0.35 },
      { value: rampUp(mean([
        c.home.avgFirstHalfGoalsFor + c.home.avgFirstHalfGoalsAgainst,
        c.away.avgFirstHalfGoalsFor + c.away.avgFirstHalfGoalsAgainst
      ]), 1.15, 1.45), weight: 0.25 },
      { value: rampUp(c.combined.over25, 0.62, 0.74), weight: 0.20 },
      { value: rampDown(c.combined.halfTimeZeroZero, 0.32, 0.18), weight: 0.20 }
    ])
  });

  add("FIRST_HALF_UNDER_1_5", {
    htftGate: c => c.htft.halfTimeDraw >= 0.52,
    htftScore: htftScoreFirstHalfUnder,
    mandatory: c => [
      req(c.combined.firstHalfUnder15 >= 0.74, "Combined first-half Under 1.5 is below 74%."),
      req(mean([
        c.home.avgFirstHalfGoalsFor + c.home.avgFirstHalfGoalsAgainst,
        c.away.avgFirstHalfGoalsFor + c.away.avgFirstHalfGoalsAgainst
      ]) <= 0.95, "First-half average goals exceed 0.95."),
      req(c.combined.firstHalfOver15 <= 0.26, "Combined first-half Over 1.5 exceeds 26%."),
      req(c.combined.halfTimeZeroZero >= 0.30, "Combined halftime 0-0 is below 30%.")
    ],
    hardRejects: c => [
      rej(c.home.firstHalfScored >= 0.55 && c.away.firstHalfScored >= 0.55,
        "Both teams score early too frequently.")
    ],
    contradictions: c => [
      con(c.home.windows.recentVenue6.firstHalfOver15 >= 0.50 ||
          c.away.windows.recentVenue6.firstHalfOver15 >= 0.50, 7,
        "At least one team has first-half Over 1.5 in half of its last six venue matches.")
    ],
    componentScore: c => componentScore([
      { value: rampUp(c.combined.firstHalfUnder15, 0.74, 0.84), weight: 0.35 },
      { value: rampDown(mean([
        c.home.avgFirstHalfGoalsFor + c.home.avgFirstHalfGoalsAgainst,
        c.away.avgFirstHalfGoalsFor + c.away.avgFirstHalfGoalsAgainst
      ]), 0.95, 0.65), weight: 0.25 },
      { value: rampDown(c.combined.firstHalfOver15, 0.26, 0.16), weight: 0.20 },
      { value: rampUp(c.combined.halfTimeZeroZero, 0.30, 0.44), weight: 0.20 }
    ])
  });

  add("SECOND_HALF_OVER_0_5", {
    htftGate: c => c.htft.dynamic >= 0.32,
    htftScore: c => htftScoreSecondHalfOver(c, false),
    mandatory: c => [
      req(c.combined.secondHalfGoal >= 0.80, "Combined second-half goal rate is below 80%."),
      req(c.home.secondHalfScored >= 0.55 || c.away.secondHalfScored >= 0.55,
        "Neither team scores after halftime in at least 55%."),
      req(c.home.secondHalfConceded >= 0.55 || c.away.secondHalfConceded >= 0.55,
        "Neither team concedes after halftime in at least 55%."),
      req(c.htft.dynamic >= 0.32, "Dynamic HT/FT is below 32%.")
    ],
    hardRejects: c => [
      rej(c.htft.static > 0.72, "Static HT/FT patterns exceed 72%.")
    ],
    contradictions: c => [
      con(c.home.windows.recentVenue6.secondHalfGoal < 0.67 &&
          c.away.windows.recentVenue6.secondHalfGoal < 0.67, 6,
        "Recent second-half goal form is weak for both teams.")
    ],
    componentScore: c => componentScore([
      { value: rampUp(c.combined.secondHalfGoal, 0.80, 0.90), weight: 0.35 },
      { value: rampUp(Math.max(c.home.secondHalfScored, c.away.secondHalfScored), 0.55, 0.70), weight: 0.20 },
      { value: rampUp(Math.max(c.home.secondHalfConceded, c.away.secondHalfConceded), 0.55, 0.70), weight: 0.20 },
      { value: rampUp(c.htft.dynamic, 0.32, 0.50), weight: 0.25 }
    ])
  });

  // ----- EITHER HALF / BOTH HALVES -----

  function addHalfTeamMarkets(side) {
    const isHome = side === "home";
    const team = c => isHome ? c.home : c.away;
    const opp = c => isHome ? c.away : c.home;
    const winEitherId = `${isHome ? "HOME" : "AWAY"}_WIN_EITHER_HALF`;
    const scoreBothId = `${isHome ? "HOME" : "AWAY"}_SCORE_BOTH_HALVES`;
    const scoreFn = isHome ? htftScoreHomeResult : htftScoreAwayResult;

    add(winEitherId, {
      htftGate: c => {
        const finish = isHome ? c.htft.fullTimeHomeWin : c.htft.fullTimeAwayWin;
        const ledHalf = isHome ? c.htft.homeLedAtHalf : c.htft.awayLedAtHalf;
        return finish >= 0.38 || ledHalf >= 0.32;
      },
      htftScore: scoreFn,
      mandatory: c => {
        const t = team(c), o = opp(c);
        return [
          req(t.wonEitherHalf >= 0.60, "Selected team wins either half below 60%."),
          req(o.lostEitherHalf >= 0.55, "Opponent loses either half below 55%."),
          req(t.scored >= 0.78, "Selected team scores below 78%."),
          req(t.failedToScore <= 0.22, "Selected team failed-to-score exceeds 22%.")
        ];
      },
      hardRejects: c => {
        const t = team(c), o = opp(c);
        return [
          rej(t.draw > 0.40 && t.wonEitherHalf < 0.58, "Selected team draws too many halves/matches."),
          rej(o.wonEitherHalf > 0.62, "Opponent is strong across halves.")
        ];
      },
      contradictions: c => [
        con(team(c).windows.recentVenue6.wonEitherHalf < 0.50, 6,
          "Selected team recent either-half win rate is below 50%.")
      ],
      componentScore: c => {
        const t = team(c), o = opp(c);
        return componentScore([
          { value: rampUp(t.wonEitherHalf, 0.60, 0.72), weight: 0.30 },
          { value: rampUp(o.lostEitherHalf, 0.55, 0.68), weight: 0.25 },
          { value: rampUp(t.scored, 0.78, 0.90), weight: 0.20 },
          { value: rampDown(t.failedToScore, 0.22, 0.10), weight: 0.15 },
          { value: rampUp(t.ppg - o.ppg, 0.20, 0.70), weight: 0.10 }
        ]);
      }
    });

    add(scoreBothId, {
      htftGate: c => {
        const control = isHome
          ? c.htft["1/1"] + c.htft["X/1"]
          : c.htft["2/2"] + c.htft["X/2"];
        return control >= 0.35 && c.htft.dynamic >= 0.30;
      },
      htftScore: c => {
        const control = isHome
          ? c.htft["1/1"] + c.htft["X/1"]
          : c.htft["2/2"] + c.htft["X/2"];
        return scaledWeightedScore([
          { value: rampUp(control, 0.35, 0.52), weight: 0.45 },
          { value: rampUp(c.htft.dynamic, 0.30, 0.48), weight: 0.30 },
          { value: rampDown(c.htft["X/X"], 0.30, 0.16), weight: 0.25 }
        ], HTFT_MAX_POINTS);
      },
      mandatory: c => {
        const t = team(c), o = opp(c);
        return [
          req(t.scoredBothHalves >= 0.30, "Selected team scores in both halves below 30%."),
          req(t.scored2Plus >= 0.50, "Selected team scores two or more below 50%."),
          req(t.avgGoalsFor >= 1.85, "Selected team scoring average is below 1.85."),
          req(o.concededBothHalves >= 0.27, "Opponent concedes in both halves below 27%."),
          req(o.conceded2Plus >= 0.42, "Opponent concedes two or more below 42%."),
          req(t.failedToScore <= 0.15, "Selected team failed-to-score exceeds 15%.")
        ];
      },
      hardRejects: c => [
        rej(team(c).firstHalfScored < 0.35 || team(c).secondHalfScored < 0.50,
          "Selected team scoring is too concentrated in one half.")
      ],
      contradictions: c => [
        con(opp(c).firstHalfConceded < 0.30, 6,
          "Opponent rarely concedes before halftime.")
      ],
      componentScore: c => {
        const t = team(c), o = opp(c);
        return componentScore([
          { value: rampUp(t.scoredBothHalves, 0.30, 0.42), weight: 0.30 },
          { value: rampUp(t.scored2Plus, 0.50, 0.64), weight: 0.20 },
          { value: rampUp(t.avgGoalsFor, 1.85, 2.30), weight: 0.15 },
          { value: rampUp(o.concededBothHalves, 0.27, 0.40), weight: 0.20 },
          { value: rampUp(o.conceded2Plus, 0.42, 0.56), weight: 0.15 }
        ]);
      }
    });
  }

  addHalfTeamMarkets("home");
  addHalfTeamMarkets("away");

  // ----- SCORE FIRST / LEAD ANY TIME / NO GOAL -----

  add("NO_GOAL", {
    htftGate: c => c.htft["X/X"] >= 0.34 && c.htft.dynamic <= 0.28,
    htftScore: c => htftScoreUnder(c, {
      staticFloor: 0.58, staticCeiling: 0.78,
      xxFloor: 0.34, xxCeiling: 0.50,
      dynamicCeiling: 0.28, dynamicFloor: 0.12,
      reCeiling: 0.08, reFloor: 0.02
    }),
    mandatory: c => [
      req(c.league.zeroZero >= 0.11, "League 0-0 rate is below 11%."),
      req(c.combined.zeroZero >= 0.14, "Combined 0-0 rate is below 14%."),
      req(c.home.failedToScore >= 0.35 && c.away.failedToScore >= 0.35,
        "Both failed-to-score rates must be at least 35%."),
      req(c.home.avgGoalsFor <= 0.95 && c.away.avgGoalsFor <= 0.95,
        "Both scoring averages must be at most 0.95."),
      req(c.home.avgXgFor <= 1.00 && c.away.avgXgFor <= 1.00,
        "Both xG averages must be at most 1.00."),
      req(c.combined.under25 >= 0.68, "Combined Under 2.5 is below 68%."),
      req(c.combined.bttsNo >= 0.67, "Combined BTTS No is below 67%."),
      req(c.htft["X/X"] >= 0.34, "HT/FT X/X is below 34%.")
    ],
    hardRejects: c => [
      rej(c.home.scored >= 0.75 || c.away.scored >= 0.75,
        "At least one team scores in 75% or more."),
      rej(c.home.conceded >= 0.75 || c.away.conceded >= 0.75,
        "At least one defence concedes in 75% or more."),
      rej(c.expectedGoalEnvironment > 1.95, "Expected goal environment exceeds 1.95."),
      rej(c.htft.dynamic > 0.28, "Dynamic HT/FT exceeds 28%.")
    ],
    contradictions: c => [
      con(c.league.avgTotalGoals > 2.20, 7, "League goal average exceeds 2.20.")
    ],
    componentScore: c => componentScore([
      { value: rampUp(c.combined.zeroZero, 0.14, 0.22), weight: 0.25 },
      { value: rampUp(Math.min(c.home.failedToScore, c.away.failedToScore), 0.35, 0.48), weight: 0.20 },
      { value: rampDown(Math.max(c.home.avgGoalsFor, c.away.avgGoalsFor), 0.95, 0.65), weight: 0.15 },
      { value: rampDown(Math.max(c.home.avgXgFor, c.away.avgXgFor), 1.00, 0.70), weight: 0.15 },
      { value: rampUp(c.combined.under25, 0.68, 0.78), weight: 0.15 },
      { value: rampUp(c.combined.bttsNo, 0.67, 0.78), weight: 0.10 }
    ])
  });

  function addLeadAnytime(side) {
    const isHome = side === "home";
    const id = `${isHome ? "HOME" : "AWAY"}_LEAD_ANYTIME`;
    const t = c => isHome ? c.home : c.away;
    const o = c => isHome ? c.away : c.home;
    const htftScoreFn = isHome ? htftScoreHomeFirst : htftScoreAwayFirst;

    add(id, {
      htftGate: c => {
        const guaranteed = isHome ? c.htft.homeGuaranteedLedAnyTime : c.htft.awayGuaranteedLedAnyTime;
        return guaranteed >= (isHome ? 0.48 : 0.46);
      },
      htftScore: htftScoreFn,
      mandatory: c => [
        req(t(c).scored >= (isHome ? 0.82 : 0.78),
          `Selected team scoring rate is below ${isHome ? 82 : 78}%.`),
        req(t(c).avgGoalsFor >= (isHome ? 1.25 : 1.15),
          `Selected team scoring average is below ${isHome ? 1.25 : 1.15}.`),
        req(t(c).scoredFirst >= (isHome ? 0.52 : 0.54) ||
            (isHome ? c.htft["2/1"] : c.htft["1/2"]) >= 0.10,
          "Neither first-score route nor comeback route qualifies."),
        req(o(c).trailedAnyTime >= 0.58, "Opponent trails at some point below 58%."),
        req(t(c).failedToScore <= 0.20, "Selected team failed-to-score exceeds 20%."),
        req(mean([t(c).ledAnyTime, o(c).trailedAnyTime]) >= (isHome ? 0.66 : 0.67),
          `Projected lead probability is below ${isHome ? 66 : 67}%.`)
      ],
      hardRejects: c => [
        rej(t(c).scored < 0.72, "Selected team scoring rate is below 72%."),
        rej(o(c).cleanSheet > 0.40, "Opponent clean-sheet rate exceeds 40%."),
        rej(t(c).scoredFirst < 0.40 &&
            (isHome ? c.htft["2/1"] : c.htft["1/2"]) < 0.08,
          "Selected team rarely scores first and rarely completes comebacks.")
      ],
      contradictions: c => [
        con(o(c).ledAnyTime > 0.65, 6, "Opponent frequently controls the lead.")
      ],
      componentScore: c => componentScore([
        { value: rampUp(t(c).scored, isHome ? 0.82 : 0.78, 0.90), weight: 0.20 },
        { value: rampUp(t(c).avgGoalsFor, isHome ? 1.25 : 1.15, isHome ? 1.85 : 1.75), weight: 0.15 },
        { value: rampUp(t(c).scoredFirst, isHome ? 0.52 : 0.54, isHome ? 0.66 : 0.68), weight: 0.20 },
        { value: rampUp(o(c).trailedAnyTime, 0.58, 0.72), weight: 0.20 },
        { value: rampDown(t(c).failedToScore, 0.20, 0.08), weight: 0.10 },
        { value: rampUp(mean([t(c).ledAnyTime, o(c).trailedAnyTime]),
          isHome ? 0.66 : 0.67, isHome ? 0.76 : 0.77), weight: 0.15 }
      ])
    });
  }

  addLeadAnytime("home");
  addLeadAnytime("away");

  // ----- CLEAN SHEET / WIN TO NIL -----

  function addDefensive(side) {
    const isHome = side === "home";
    const t = c => isHome ? c.home : c.away;
    const o = c => isHome ? c.away : c.home;
    const csId = `${isHome ? "HOME" : "AWAY"}_CLEAN_SHEET`;
    const wtnId = `${isHome ? "HOME" : "AWAY"}_WIN_TO_NIL`;

    add(csId, {
      htftGate: c => {
        const oppGuaranteed = isHome ? c.htft.awayGuaranteedScored : c.htft.homeGuaranteedScored;
        const ownResultControl = isHome ? c.htft.fullTimeHomeWin : c.htft.fullTimeAwayWin;
        return oppGuaranteed <= 0.42 && (ownResultControl >= 0.36 || c.htft["X/X"] >= 0.25);
      },
      htftScore: c => htftScoreCleanSheet(c, side),
      mandatory: c => [
        req(t(c).cleanSheet >= (isHome ? 0.38 : 0.36),
          `Selected team clean-sheet rate is below ${isHome ? 38 : 36}%.`),
        req(o(c).failedToScore >= (isHome ? 0.36 : 0.38),
          `Opponent failed-to-score rate is below ${isHome ? 36 : 38}%.`),
        req(o(c).avgGoalsFor <= (isHome ? 0.90 : 0.85),
          `Opponent scoring average is above ${isHome ? 0.90 : 0.85}.`),
        req(o(c).avgXgFor <= 0.95, "Opponent xG is above 0.95."),
        req(t(c).avgGoalsAgainst <= 1.00, "Selected team concedes above 1.00 per match."),
        req(c.combined.bttsNo >= 0.60, "Combined BTTS No is below 60%.")
      ],
      hardRejects: c => [
        rej(o(c).scored >= 0.72, "Opponent scores in at least 72%."),
        rej(t(c).conceded >= 0.75, "Selected defence concedes in at least 75%."),
        rej(c.htft.equalizer > 0.14, "HT/FT equalizer rate is too high.")
      ],
      contradictions: c => [
        con(o(c).secondHalfScored > 0.62, 6, "Opponent has a strong late-scoring record.")
      ],
      componentScore: c => componentScore([
        { value: rampUp(t(c).cleanSheet, isHome ? 0.38 : 0.36, 0.52), weight: 0.25 },
        { value: rampUp(o(c).failedToScore, isHome ? 0.36 : 0.38, 0.52), weight: 0.20 },
        { value: rampDown(o(c).avgGoalsFor, isHome ? 0.90 : 0.85, 0.55), weight: 0.15 },
        { value: rampDown(o(c).avgXgFor, 0.95, 0.65), weight: 0.15 },
        { value: rampDown(t(c).avgGoalsAgainst, 1.00, 0.65), weight: 0.15 },
        { value: rampUp(c.combined.bttsNo, 0.60, 0.72), weight: 0.10 }
      ])
    });

    add(wtnId, {
      htftGate: c => {
        const win = isHome ? c.htft.fullTimeHomeWin : c.htft.fullTimeAwayWin;
        const oppGuaranteed = isHome ? c.htft.awayGuaranteedScored : c.htft.homeGuaranteedScored;
        return win >= (isHome ? 0.42 : 0.40) && oppGuaranteed <= 0.40;
      },
      htftScore: c => htftScoreCleanSheet(c, side),
      mandatory: c => [
        req(t(c).win >= (isHome ? 0.55 : 0.52),
          `Selected team win rate is below ${isHome ? 55 : 52}%.`),
        req(t(c).cleanSheet >= (isHome ? 0.38 : 0.36),
          `Selected team clean-sheet rate is below ${isHome ? 38 : 36}%.`),
        req(o(c).loss >= (isHome ? 0.45 : 0.48),
          `Opponent loss rate is below ${isHome ? 45 : 48}%.`),
        req(o(c).failedToScore >= (isHome ? 0.38 : 0.40),
          `Opponent failed-to-score rate is below ${isHome ? 38 : 40}%.`),
        req((isHome ? c.homeXgEdge : -c.homeXgEdge) >= 0.55,
          "Selected team xG edge is below 0.55."),
        req(o(c).avgGoalsFor <= 0.85, "Opponent scoring average is above 0.85.")
      ],
      hardRejects: c => [
        rej(o(c).scored >= 0.70, "Opponent scores in at least 70%."),
        rej(t(c).conceded >= 0.70, "Selected team concedes in at least 70%."),
        rej(c.combined.btts > 0.55, "Combined BTTS Yes exceeds 55%."),
        rej(c.htft.equalizer > 0.12, "HT/FT equalizer rate is too high.")
      ],
      contradictions: c => [
        con(o(c).secondHalfScored > 0.58, 6, "Opponent regularly scores after halftime.")
      ],
      componentScore: c => componentScore([
        { value: rampUp(t(c).win, isHome ? 0.55 : 0.52, isHome ? 0.68 : 0.65), weight: 0.20 },
        { value: rampUp(t(c).cleanSheet, isHome ? 0.38 : 0.36, 0.50), weight: 0.20 },
        { value: rampUp(o(c).loss, isHome ? 0.45 : 0.48, 0.62), weight: 0.15 },
        { value: rampUp(o(c).failedToScore, isHome ? 0.38 : 0.40, 0.54), weight: 0.15 },
        { value: rampUp(isHome ? c.homeXgEdge : -c.homeXgEdge, 0.55, 0.95), weight: 0.15 },
        { value: rampDown(o(c).avgGoalsFor, 0.85, 0.55), weight: 0.15 }
      ])
    });
  }

  addDefensive("home");
  addDefensive("away");

  return defs;
}

function areConflicting(a, b) {
  const pairs = new Set([
    "HOME_WIN|AWAY_WIN", "HOME_WIN|DRAW", "AWAY_WIN|DRAW",
    "HOME_DNB|AWAY_DNB",
    "DOUBLE_CHANCE_1X|DOUBLE_CHANCE_X2",
    "BTTS_YES|BTTS_NO",
    "HOME_LEAD_ANYTIME|AWAY_LEAD_ANYTIME",
    "HOME_CLEAN_SHEET|AWAY_OVER_0_5",
    "AWAY_CLEAN_SHEET|HOME_OVER_0_5",
    "HOME_WIN_TO_NIL|AWAY_OVER_0_5",
    "AWAY_WIN_TO_NIL|HOME_OVER_0_5",
    "MATCH_OVER_1_5|MATCH_UNDER_1_5",
    "MATCH_OVER_2_5|MATCH_UNDER_2_5",
    "MATCH_OVER_3_5|MATCH_UNDER_3_5",
    "FIRST_HALF_OVER_1_5|FIRST_HALF_UNDER_1_5",
    "HOME_OVER_0_5|HOME_UNDER_0_5",
    "HOME_OVER_1_5|HOME_UNDER_1_5",
    "HOME_OVER_2_5|HOME_UNDER_2_5",
    "AWAY_OVER_0_5|AWAY_UNDER_0_5",
    "AWAY_OVER_1_5|AWAY_UNDER_1_5",
    "AWAY_OVER_2_5|AWAY_UNDER_2_5"
  ]);

  const key1 = `${a}|${b}`;
  const key2 = `${b}|${a}`;
  return pairs.has(key1) || pairs.has(key2);
}

const CORE_MARKETS = new Set([
  "FIRST_HALF_OVER_0_5",
  "SECOND_HALF_OVER_0_5",
  "HOME_LEAD_ANYTIME",
  "AWAY_LEAD_ANYTIME",
  "HOME_WIN_EITHER_HALF",
  "AWAY_WIN_EITHER_HALF"
]);

function selectFinalMarket(results) {
  const allAccepted = results
    .filter(r => r.accepted)
    .sort((a, b) => b.score - a.score ||
      (SAFETY_RANK[b.marketId] || 0) - (SAFETY_RANK[a.marketId] || 0));

  const accepted = allAccepted.filter(r => CORE_MARKETS.has(r.marketId));

  if (accepted.length === 0) {
    const coreResults = results
      .filter(r => CORE_MARKETS.has(r.marketId))
      .sort((a, b) => b.score - a.score ||
        (SAFETY_RANK[b.marketId] || 0) - (SAFETY_RANK[a.marketId] || 0));
    const blockedAcceptedMarkets = allAccepted
      .filter(r => !CORE_MARKETS.has(r.marketId))
      .slice(0, 5);
    const bestCoreRejected = coreResults[0] || null;
    const reason = blockedAcceptedMarkets.length
      ? "One or more non-core markets qualified, but the v2.5 core-only policy does not permit them as final selections. No selectable core market qualified."
      : `No selectable core market reached its acceptance score while passing every mandatory gate (default floor ${MARKET_MIN_SCORE}/100).`;

    return {
      decision: "NO_BET",
      reason,
      bestRejected: bestCoreRejected,
      bestCoreRejected,
      blockedAcceptedMarkets
    };
  }

  const top = accepted[0];
  const closeContenders = accepted.filter(candidate =>
    top.score - candidate.score < MIN_TOP_MARGIN
  );

  const conflictPair = closeContenders.flatMap((a, index) =>
    closeContenders.slice(index + 1).map(b => [a, b])
  ).find(([a, b]) => areConflicting(a.marketId, b.marketId));

  if (conflictPair) {
    return {
      decision: "NO_BET",
      reason: "Near-tied accepted markets conflict; the engine will not force a direction.",
      topCandidates: conflictPair
    };
  }

  if (closeContenders.length > 1) {
    const safer = [...closeContenders].sort((a, b) =>
      (SAFETY_RANK[b.marketId] || 0) - (SAFETY_RANK[a.marketId] || 0) ||
      b.score - a.score
    )[0];

    return {
      decision: "BET",
      selected: safer,
      selectionRule: `${closeContenders.length} markets were within ${MIN_TOP_MARGIN} points; the wider/safer qualified market was selected.`,
      alternatives: accepted.filter(r => r.marketId !== safer.marketId).slice(0, 4)
    };
  }

  return {
    decision: "BET",
    selected: top,
    selectionRule: `Highest score with at least a ${MIN_TOP_MARGIN}-point margin or no competing candidate.`,
    alternatives: accepted.slice(1, 5)
  };
}

function summarizeContext(ctx) {
  return {
    match: ctx.match,
    dataSamples: {
      homeOverall: ctx.home.sampleSizeOverall,
      homeVenue: ctx.home.sampleSizeVenue,
      awayOverall: ctx.away.sampleSizeOverall,
      awayVenue: ctx.away.sampleSizeVenue,
      league: ctx.league.sampleSize
    },
    league: Object.fromEntries(
      Object.entries(ctx.league).map(([k, v]) => [k, round(v)])
    ),
    derived: {
      expectedGoalEnvironment: round(ctx.expectedGoalEnvironment),
      goalDependencyRatio: round(ctx.goalDependencyRatio),
      homePpgEdge: round(ctx.homePpgEdge),
      homeGoalDifferenceEdge: round(ctx.homeGoalDifferenceEdge),
      homeXgEdge: round(ctx.homeXgEdge),
      homeFirstScoreEdge: round(ctx.homeFirstScoreEdge)
    },
    htft: Object.fromEntries(
      Object.entries(ctx.htft).map(([k, v]) => [k, round(v)])
    ),
    combined: Object.fromEntries(
      Object.entries(ctx.combined).map(([k, v]) => [k, round(v)])
    ),
    risks: ctx.risks,
    availability: ctx.availability
  };
}

function calculateMetrics(input) {
  const ctx = buildContext(input);
  return {
    quality: dataQualityGate(ctx),
    context: summarizeContext(ctx)
  };
}

function runEngine(input) {
  const ctx = buildContext(input);
  const quality = dataQualityGate(ctx);

  if (!quality.passed) {
    return {
      engine: ENGINE_NAME,
      decision: "NO_BET",
      reason: "Global data-quality gate failed.",
      failures: quality.failures,
      context: summarizeContext(ctx)
    };
  }

  const defs = marketDefinitions();
  const results = Object.entries(defs).map(([marketId, spec]) => {
    const result = ruleResult(marketId, ctx, spec);
    return {
      ...result,
      selectionEligible: CORE_MARKETS.has(marketId)
    };
  });

  const final = selectFinalMarket(results);

  return {
    engine: ENGINE_NAME,
    generatedAt: new Date().toISOString(),
    selectionPolicy: {
      id: "CORE_ONLY_V2_5_2",
      description: "All active markets are evaluated, but only the six configured core markets may become the final selection.",
      selectableMarkets: [...CORE_MARKETS]
    },
    ...final,
    context: summarizeContext(ctx),
    allMarkets: results.sort((a, b) => b.score - a.score)
  };
}

function main() {
  const [, , inputPath] = process.argv;
  if (!inputPath) {
    console.error("Usage: node omni_htft_engine.js input.json");
    process.exit(1);
  }

  try {
    const raw = fs.readFileSync(inputPath, "utf8");
    const input = JSON.parse(raw);
    const result = runEngine(input);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    console.error(JSON.stringify({
      engine: ENGINE_NAME,
      decision: "ERROR",
      message: error.message,
      stack: process.env.DEBUG_ENGINE === "1" ? error.stack : undefined
    }, null, 2));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  runEngine,
  calculateMetrics,
  MARKET_NAMES,
  HTFT_KEYS,
  ENGINE_NAME,
  ENGINE_VERSION,
  CORE_MARKETS,
  selectFinalMarket,
  parseDateToTimestamp
};