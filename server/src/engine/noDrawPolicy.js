import { MARKET_THRESHOLDS } from "./overhaulConstants.js";
import { clamp, round } from "./utils.js";

const DECISIVE_ROUTES = ["WW", "DW", "LW", "WL", "DL", "LL"];
const CLEAN_DECISIVE_ROUTES = ["WW", "DW", "DL", "LL"];

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sumRoutes(matrix = {}, routes = []) {
  return routes.reduce((total, route) => total + number(matrix[route]), 0);
}

function routeCount(matrix = {}, routes = [], minimum = 0.055) {
  return routes.filter((route) => number(matrix[route]) >= minimum).length;
}

/**
 * PapaSense No-Draw policy.
 *
 * Either Team to Win is a result-structure market. A high-scoring league may
 * lower the draw rate, but that alone must not allow 12 to outrank GG or O1.5.
 * The market is therefore built from clean decisive HT/FT routes first, then
 * diverted toward goal markets whenever the same matrix is better explained
 * by forced two-sided scoring or a verified two-goal route.
 */
export function evaluateNoDrawPolicy({ matrix, direct, structure, goals }) {
  const p = matrix?.normalized || {};
  const decisiveMass = number(direct?.doubleChance?.noDraw);
  const drawMass = number(direct?.ft?.draw);
  const cleanDecisiveMass = sumRoutes(p, CLEAN_DECISIVE_ROUTES);
  const reversalWinMass = number(p.WL) + number(p.LW);
  const meaningfulDecisiveRoutes = routeCount(p, DECISIVE_ROUTES, 0.055);

  const permanentDrawMass = number(structure?.permanentDrawMass);
  const leadToDrawMass = number(structure?.leadToDrawMass);
  const decisiveBreadth = number(structure?.decisiveBreadth);
  const twoSideWinSupport = number(structure?.twoSideWinSupport);
  const underdogMass = number(structure?.underdogMass);

  const forcedGgMass = number(goals?.metrics?.forcedGgMass);
  const oneSideTwoGoalHtft = number(goals?.metrics?.oneSideTwoGoalHtft);
  const twoSidedGoalFloor = number(goals?.metrics?.twoSidedGoalFloor);
  const strongestGoalRoute = number(goals?.metrics?.strongestGoalRoute);
  const venueO15 = number(goals?.metrics?.venueO15, 0.5);
  const recentO15 = number(goals?.metrics?.recentO15, 0.5);
  const leagueBttsRate = number(goals?.metrics?.leagueBttsRate, 0.5);
  const leagueOver15Rate = number(goals?.metrics?.leagueOver15Rate, 0.7);
  const ggScore = number(goals?.scores?.ggYes);
  const over15Score = number(goals?.scores?.over15);

  const ggRouteReady =
    forcedGgMass >= 0.14 &&
    twoSidedGoalFloor >= 0.58 &&
    ggScore >= MARKET_THRESHOLDS.ggYes - 0.02;

  const over15RouteReady =
    (forcedGgMass >= 0.14 || oneSideTwoGoalHtft >= 0.1) &&
    strongestGoalRoute >= 0.66 &&
    over15Score >= MARKET_THRESHOLDS.over15 - 0.02;

  const highScoringEnvironment =
    (leagueOver15Rate >= 0.76 || leagueBttsRate >= 0.58) &&
    (venueO15 >= 0.66 || recentO15 >= 0.66) &&
    (twoSidedGoalFloor >= 0.58 || strongestGoalRoute >= 0.72);

  const openGoalStructure =
    forcedGgMass >= 0.16 ||
    reversalWinMass >= 0.09 ||
    twoSidedGoalFloor >= 0.64;

  const goalMarketDiversion =
    highScoringEnvironment &&
    openGoalStructure &&
    (ggRouteReady || over15RouteReady);

  const exceptionalResultStructure =
    decisiveMass >= 0.84 &&
    drawMass <= 0.16 &&
    cleanDecisiveMass >= 0.62 &&
    permanentDrawMass <= 0.12 &&
    leadToDrawMass <= 0.1 &&
    reversalWinMass <= 0.14 &&
    meaningfulDecisiveRoutes >= 3;

  const divertedToGoals = goalMarketDiversion && !exceptionalResultStructure;
  const openGamePenalty = divertedToGoals ? 0.12 : goalMarketDiversion ? 0.04 : 0;

  const score = clamp(
    decisiveMass * 0.58 +
      cleanDecisiveMass * 0.18 +
      decisiveBreadth * 0.1 +
      twoSideWinSupport * 0.06 +
      (1 - permanentDrawMass) * 0.04 +
      (1 - leadToDrawMass) * 0.04 -
      openGamePenalty
  );

  const baseEligible =
    decisiveMass >= 0.74 &&
    drawMass <= 0.26 &&
    cleanDecisiveMass >= 0.5 &&
    meaningfulDecisiveRoutes >= 3 &&
    underdogMass >= 0.12 &&
    permanentDrawMass <= 0.18 &&
    leadToDrawMass <= 0.16 &&
    reversalWinMass <= 0.2;

  const blockers = [
    ...(decisiveMass < 0.74
      ? [`Decisive HT/FT mass is only ${(decisiveMass * 100).toFixed(1)}%; 12 needs at least 74%.`]
      : []),
    ...(drawMass > 0.26
      ? [`Draw-ending mass is ${(drawMass * 100).toFixed(1)}%, above the 26% No-Draw ceiling.`]
      : []),
    ...(cleanDecisiveMass < 0.5
      ? ["Too much of the decisive result comes from open comeback routes instead of clean win-ending routes."]
      : []),
    ...(meaningfulDecisiveRoutes < 3
      ? ["Fewer than three independent win-ending routes are meaningful."]
      : []),
    ...(underdogMass < 0.12
      ? ["The weaker side has too little outright-win support; favourite protection is safer than 12."]
      : []),
    ...(permanentDrawMass > 0.18
      ? [`X/X remains too strong at ${(permanentDrawMass * 100).toFixed(1)}%.`]
      : []),
    ...(leadToDrawMass > 0.16
      ? ["Lead-to-draw routes remain too active for Either Team to Win."]
      : []),
    ...(reversalWinMass > 0.2
      ? ["Full-reversal win routes are too dominant; the match is better described by GG or a goals market."]
      : []),
    ...(divertedToGoals
      ? [
          `High-scoring context plus forced goal routes favour ${ggRouteReady && ggScore >= over15Score - 0.02 ? "GG" : "Over 1.5"} over Either Team to Win.`
        ]
      : [])
  ];

  let preferredGoalMarket = null;
  if (ggRouteReady && over15RouteReady) {
    preferredGoalMarket = ggScore >= over15Score - 0.02 ? "gg-yes" : "over-15";
  } else if (ggRouteReady) {
    preferredGoalMarket = "gg-yes";
  } else if (over15RouteReady) {
    preferredGoalMarket = "over-15";
  }

  return {
    eligible: baseEligible && !divertedToGoals && blockers.length === 0,
    score: round(score),
    decisiveMass: round(decisiveMass),
    drawMass: round(drawMass),
    cleanDecisiveMass: round(cleanDecisiveMass),
    reversalWinMass: round(reversalWinMass),
    meaningfulDecisiveRoutes,
    underdogMass: round(underdogMass),
    permanentDrawMass: round(permanentDrawMass),
    leadToDrawMass: round(leadToDrawMass),
    forcedGgMass: round(forcedGgMass),
    twoSidedGoalFloor: round(twoSidedGoalFloor),
    venueO15: round(venueO15),
    recentO15: round(recentO15),
    leagueBttsRate: round(leagueBttsRate),
    leagueOver15Rate: round(leagueOver15Rate),
    ggScore: round(ggScore),
    over15Score: round(over15Score),
    ggRouteReady,
    over15RouteReady,
    highScoringEnvironment,
    openGoalStructure,
    goalMarketDiversion,
    divertedToGoals,
    exceptionalResultStructure,
    preferredGoalMarket,
    blockers
  };
}
