import { CLASSIFICATIONS, MARKETS } from "./athena-transition-engine/src/index.js";

export const ATHENA_ARBITRATION_VERSION = "1.1.0";
export const ATHENA_PRIMARY_SCORE = 80;
export const ATHENA_PRIME_SCORE = 88;

const DIRECTIONAL_RESULT_MARKETS = new Set([
  MARKETS.HOME_WIN_EITHER_HALF,
  MARKETS.AWAY_WIN_EITHER_HALF,
  MARKETS.HOME_DNB,
  MARKETS.AWAY_DNB,
  MARKETS.HOME_DOUBLE_CHANCE,
  MARKETS.AWAY_DOUBLE_CHANCE
]);

const GOAL_MARKETS = new Set([
  MARKETS.HOME_OVER_0_5,
  MARKETS.AWAY_OVER_0_5,
  MARKETS.OVER_1_5,
  MARKETS.OVER_2_5,
  MARKETS.UNDER_2_5,
  MARKETS.UNDER_3_5,
  MARKETS.FIRST_HALF_UNDER_1_5,
  MARKETS.FIRST_HALF_OVER_0_5,
  MARKETS.BTTS_YES
]);

const OPEN_GOAL_MARKETS = new Set([
  MARKETS.OVER_1_5,
  MARKETS.OVER_2_5,
  MARKETS.FIRST_HALF_OVER_0_5,
  MARKETS.BTTS_YES
]);

const CONTROL_MARKETS = new Set([
  MARKETS.UNDER_2_5,
  MARKETS.UNDER_3_5,
  MARKETS.FIRST_HALF_UNDER_1_5,
  MARKETS.HALF_TIME_DRAW,
  MARKETS.FULL_TIME_DRAW
]);

const SAFER_MARKETS = new Set([
  MARKETS.OVER_1_5,
  MARKETS.UNDER_3_5,
  MARKETS.HOME_DOUBLE_CHANCE,
  MARKETS.AWAY_DOUBLE_CHANCE,
  MARKETS.HOME_DNB,
  MARKETS.AWAY_DNB,
  MARKETS.HOME_OVER_0_5,
  MARKETS.AWAY_OVER_0_5,
  MARKETS.FIRST_HALF_UNDER_1_5
]);

const MARKET_SIDE = new Map([
  [MARKETS.HOME_WIN_EITHER_HALF, "HOME"],
  [MARKETS.AWAY_WIN_EITHER_HALF, "AWAY"],
  [MARKETS.HOME_DNB, "HOME"],
  [MARKETS.AWAY_DNB, "AWAY"],
  [MARKETS.HOME_DOUBLE_CHANCE, "HOME"],
  [MARKETS.AWAY_DOUBLE_CHANCE, "AWAY"]
]);

const PRIMARY_BLOCKING_WARNINGS = new Set([
  "INSUFFICIENT_SCORING_EVIDENCE",
  "DIRECT_1H_GOAL_DATA_REQUIRED_FOR_BANKER"
]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function uniqueMarkets(result) {
  const source = [
    ...(result?.topMarkets || []),
    ...(result?.secondary || []),
    ...(result?.banker ? [result.banker] : [])
  ];
  const byMarket = new Map();
  for (const candidate of source) {
    if (!candidate?.market || candidate.market === MARKETS.NO_PICK) continue;
    const previous = byMarket.get(candidate.market);
    if (!previous || finite(candidate.score) > finite(previous.score)) {
      byMarket.set(candidate.market, {
        ...candidate,
        score: finite(candidate.score),
        reasons: [...(candidate.reasons || [])],
        warnings: [...(candidate.warnings || [])],
        fatal: Boolean(candidate.fatal)
      });
    }
  }
  return [...byMarket.values()].sort((a, b) => b.score - a.score);
}

function candidateBlocked(candidate) {
  if (!candidate || candidate.fatal || finite(candidate.score) < ATHENA_PRIMARY_SCORE) return true;
  return (candidate.warnings || []).some((warning) => PRIMARY_BLOCKING_WARNINGS.has(warning));
}

function sideForMarket(market) {
  return MARKET_SIDE.get(market) || null;
}

function directionalSafety(result, venueResult, candidate, samples = {}) {
  const side = sideForMarket(candidate?.market);
  if (!side) {
    return {
      directional: false,
      eligible: true,
      side: null,
      overallDirection: result?.classification?.side || null,
      venueDirection: venueResult?.classification?.side || null,
      oddsAligned: true,
      venueAligned: true,
      leadSafety: null,
      opponentComebackWeakness: null,
      venueReliability: 0,
      reasons: []
    };
  }

  const selected = side === "HOME" ? result?.metrics?.home : result?.metrics?.away;
  const opponent = side === "HOME" ? result?.metrics?.away : result?.metrics?.home;
  const venueMin = Math.min(finite(samples.homeVenue), finite(samples.awayVenue));
  const venueReliability = Math.min(1, venueMin / 12);
  const overallDirection = result?.classification?.side || null;
  const venueDirection = venueResult?.classification?.side || null;
  const oddsFavorite = result?.oddsConflict?.favorite || null;
  const oddsAligned = !result?.oddsConflict?.conflict && (!oddsFavorite || oddsFavorite === side);
  const venueAligned = venueDirection === side;
  const leadSafety = finite(selected?.leadHoldRate);
  const opponentComebackWeakness = 1 - finite(opponent?.comebackSaveRate);
  const warnings = candidate?.warnings || [];

  const reasons = [];
  if (overallDirection !== side) reasons.push("Overall HT/FT direction does not support this side");
  if (!oddsAligned) reasons.push("Bookmaker direction conflicts with this side");
  if (!venueAligned) reasons.push("Home/away HT/FT split does not confirm this side");
  if (leadSafety < 0.65) reasons.push("Lead-protection rate is below 65%");
  if (opponentComebackWeakness < 0.45) reasons.push("Opponent comeback weakness is below 45%");
  if (warnings.includes("ODDS_DIRECTION_CONFLICT")) reasons.push("Candidate carries an odds-direction warning");

  return {
    directional: true,
    eligible:
      overallDirection === side &&
      oddsAligned &&
      venueAligned &&
      leadSafety >= 0.65 &&
      opponentComebackWeakness >= 0.45 &&
      !warnings.includes("ODDS_DIRECTION_CONFLICT"),
    side,
    overallDirection,
    venueDirection,
    oddsAligned,
    venueAligned,
    leadSafety,
    opponentComebackWeakness,
    venueReliability,
    reasons
  };
}

function eligibleCandidates(result, venueResult, samples) {
  return uniqueMarkets(result)
    .filter((candidate) => !candidateBlocked(candidate))
    .map((candidate) => ({
      ...candidate,
      family: DIRECTIONAL_RESULT_MARKETS.has(candidate.market)
        ? "DIRECTIONAL"
        : GOAL_MARKETS.has(candidate.market)
          ? "GOALS"
          : CONTROL_MARKETS.has(candidate.market)
            ? "CONTROL"
            : "OTHER",
      safety: directionalSafety(result, venueResult, candidate, samples)
    }))
    .filter((candidate) => !candidate.safety.directional || candidate.safety.eligible);
}

function strongest(candidates, predicate = () => true) {
  return candidates.filter(predicate).sort((a, b) => b.score - a.score)[0] || null;
}

function describe(candidate) {
  if (!candidate) return null;
  return {
    market: candidate.market,
    score: candidate.score,
    family: candidate.family,
    warnings: candidate.warnings || [],
    reasons: candidate.reasons || [],
    side: candidate.safety?.side || null
  };
}

function chooseByClassification({ result, candidates, bestOverall, bestDirectional, bestGoal, bestOpenGoal, bestControl }) {
  const type = result?.classification?.type;
  const rationale = [];

  if ([CLASSIFICATIONS.HIGH_EVENT_EARLY_SEPARATION, CLASSIFICATIONS.SWING_GAME].includes(type)) {
    if (bestOpenGoal) {
      if (
        type === CLASSIFICATIONS.HIGH_EVENT_EARLY_SEPARATION &&
        bestDirectional &&
        [MARKETS.HOME_WIN_EITHER_HALF, MARKETS.AWAY_WIN_EITHER_HALF].includes(bestDirectional.market) &&
        bestDirectional.score >= bestOpenGoal.score - 5
      ) {
        rationale.push(
          `The directional market stayed within 5 points of the strongest high-event goal market and passed direction, venue, odds, lead-safety and comeback checks.`
        );
        return { primary: bestDirectional, rationale, rule: "HIGH_EVENT_CLOSE_DIRECTION" };
      }
      rationale.push("High-event and swing classifications choose the strongest qualified attacking goal market unless a fully confirmed Win Either Half option is within five points.");
      return { primary: bestOpenGoal, rationale, rule: "HIGH_EVENT_GOAL_FIRST" };
    }
  }

  if ([CLASSIFICATIONS.STABLE_LEADER, CLASSIFICATIONS.MULTI_ROUTE_ADVANTAGE, CLASSIFICATIONS.LATE_SEPARATION].includes(type)) {
    if (bestDirectional) {
      const strongestNonDirectional = strongest(candidates, (candidate) => !candidate.safety.directional);
      if (!strongestNonDirectional || bestDirectional.score >= strongestNonDirectional.score - 6) {
        rationale.push("A stable directional classification keeps the strongest fully confirmed directional market when it is within six points of the strongest non-directional option.");
        return { primary: bestDirectional, rationale, rule: "STABLE_DIRECTION_WITHIN_MARGIN" };
      }
      rationale.push("A non-directional market was more than six points stronger, so Athena did not force the team direction.");
      return { primary: strongestNonDirectional, rationale, rule: "STABLE_SCORE_OVERRIDE" };
    }
  }

  if (type === CLASSIFICATIONS.DRAW_LOCK) {
    if (bestControl) {
      rationale.push("Draw-lock fixtures choose the strongest qualified draw or under control market.");
      return { primary: bestControl, rationale, rule: "DRAW_LOCK_CONTROL" };
    }
  }

  if (type === CLASSIFICATIONS.FALSE_OVER_TRAP) {
    const falseOver = strongest(candidates, (candidate) => [
      MARKETS.FIRST_HALF_UNDER_1_5,
      MARKETS.HALF_TIME_DRAW,
      MARKETS.UNDER_3_5,
      MARKETS.UNDER_2_5
    ].includes(candidate.market));
    if (falseOver) {
      rationale.push("False-over classifications choose the strongest qualified first-half or full-match control market.");
      return { primary: falseOver, rationale, rule: "FALSE_OVER_CONTROL" };
    }
  }

  if (type === CLASSIFICATIONS.CONTROLLED_CORRIDOR) {
    const corridor = strongest(candidates, (candidate) => [
      MARKETS.UNDER_3_5,
      MARKETS.OVER_1_5,
      MARKETS.UNDER_2_5
    ].includes(candidate.market));
    if (corridor) {
      rationale.push("Controlled-corridor fixtures choose the strongest qualified market inside the two-to-three-goal corridor.");
      return { primary: corridor, rationale, rule: "CONTROLLED_CORRIDOR" };
    }
  }

  if (bestOverall) {
    rationale.push("No classification-specific preference overruled the highest safe score.");
    return { primary: bestOverall, rationale, rule: "HIGHEST_SAFE_SCORE" };
  }

  return { primary: null, rationale: ["No market cleared Athena v1.1 score and safety arbitration."], rule: "NO_PICK" };
}

function saferAlternative(candidates, primary) {
  return strongest(
    candidates,
    (candidate) => candidate.market !== primary?.market && SAFER_MARKETS.has(candidate.market)
  );
}

export function arbitrateAthenaV11({ result, venueResult = null, samples = {} }) {
  const candidates = eligibleCandidates(result, venueResult, samples);
  const bestOverall = strongest(candidates);
  const bestDirectional = strongest(candidates, (candidate) => DIRECTIONAL_RESULT_MARKETS.has(candidate.market));
  const bestGoal = strongest(candidates, (candidate) => GOAL_MARKETS.has(candidate.market));
  const bestOpenGoal = strongest(candidates, (candidate) => OPEN_GOAL_MARKETS.has(candidate.market));
  const bestControl = strongest(candidates, (candidate) => CONTROL_MARKETS.has(candidate.market));

  const decision = chooseByClassification({
    result,
    candidates,
    bestOverall,
    bestDirectional,
    bestGoal,
    bestOpenGoal,
    bestControl
  });

  const primary = decision.primary;
  const safer = saferAlternative(candidates, primary);
  const originalBanker = result?.banker?.market === MARKETS.NO_PICK ? null : result?.banker || null;
  const switchedFromRc1 = Boolean(primary && originalBanker && primary.market !== originalBanker.market);
  const scoreGapFromBest = primary && bestOverall ? bestOverall.score - primary.score : null;

  const alternatives = candidates
    .filter((candidate) => candidate.market !== primary?.market)
    .slice(0, 5)
    .map((candidate) => ({
      ...candidate,
      role: candidate.market === bestDirectional?.market
        ? "BEST_DIRECTIONAL"
        : candidate.market === bestGoal?.market
          ? "BEST_GOAL"
          : candidate.market === safer?.market
            ? "SAFER_ALTERNATIVE"
            : "QUALIFIED_ALTERNATIVE"
    }));

  return {
    version: ATHENA_ARBITRATION_VERSION,
    primary: primary
      ? {
          ...primary,
          role: "PRIMARY",
          arbitrationRule: decision.rule,
          arbitrationReasons: decision.rationale
        }
      : {
          market: MARKETS.NO_PICK,
          score: 0,
          reasons: decision.rationale,
          warnings: ["ATHENA_V11_NO_PICK"],
          fatal: false,
          role: "NO_PICK",
          arbitrationRule: decision.rule,
          arbitrationReasons: decision.rationale
        },
    originalRc1Banker: describe(originalBanker),
    switchedFromRc1,
    scoreGapFromBest,
    bestOverall: describe(bestOverall),
    bestDirectional: describe(bestDirectional),
    bestGoal: describe(bestGoal),
    saferAlternative: describe(safer),
    alternatives,
    eligibleCount: candidates.length,
    rejectedCount: Math.max(0, uniqueMarkets(result).length - candidates.length),
    classification: result?.classification?.type || null,
    rationale: decision.rationale,
    rule: decision.rule
  };
}
