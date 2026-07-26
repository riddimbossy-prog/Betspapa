import { CLASSIFICATIONS, MARKETS } from "./athena-transition-engine/src/index.js";

// File name retained so deployed imports and older clients keep working.
export const ATHENA_ARBITRATION_VERSION = "3.0.0";
export const ATHENA_PRIMARY_SCORE = 80;
export const ATHENA_PRIME_SCORE = 88;

const DIRECTIONAL_RESULT_MARKETS = new Set([
  MARKETS.HOME_WIN_EITHER_HALF,
  MARKETS.AWAY_WIN_EITHER_HALF,
  MARKETS.HOME_DNB,
  MARKETS.AWAY_DNB,
  MARKETS.HOME_DOUBLE_CHANCE,
  MARKETS.AWAY_DOUBLE_CHANCE,
  MARKETS.HOME_SECOND_HALF_DNB,
  MARKETS.AWAY_SECOND_HALF_DNB
]);

const DIRECTIONAL_GOAL_MARKETS = new Set([
  MARKETS.HOME_OVER_0_5,
  MARKETS.AWAY_OVER_0_5,
  MARKETS.HOME_SECOND_HALF_OVER_0_5,
  MARKETS.AWAY_SECOND_HALF_OVER_0_5
]);

const GOAL_MARKETS = new Set([
  ...DIRECTIONAL_GOAL_MARKETS,
  MARKETS.OVER_1_5,
  MARKETS.OVER_2_5,
  MARKETS.UNDER_2_5,
  MARKETS.UNDER_3_5,
  MARKETS.FIRST_HALF_UNDER_1_5,
  MARKETS.FIRST_HALF_OVER_0_5,
  MARKETS.SECOND_HALF_OVER_0_5,
  MARKETS.SECOND_HALF_OVER_1_5,
  MARKETS.GOALS_BOTH_HALVES,
  MARKETS.BTTS_YES
]);

const OPEN_GOAL_MARKETS = new Set([
  MARKETS.OVER_1_5,
  MARKETS.OVER_2_5,
  MARKETS.FIRST_HALF_OVER_0_5,
  MARKETS.SECOND_HALF_OVER_0_5,
  MARKETS.SECOND_HALF_OVER_1_5,
  MARKETS.GOALS_BOTH_HALVES,
  MARKETS.BTTS_YES,
  MARKETS.HOME_SECOND_HALF_OVER_0_5,
  MARKETS.AWAY_SECOND_HALF_OVER_0_5
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
  MARKETS.SECOND_HALF_OVER_0_5,
  MARKETS.HOME_DOUBLE_CHANCE,
  MARKETS.AWAY_DOUBLE_CHANCE,
  MARKETS.HOME_DNB,
  MARKETS.AWAY_DNB,
  MARKETS.HOME_OVER_0_5,
  MARKETS.AWAY_OVER_0_5,
  MARKETS.HOME_SECOND_HALF_OVER_0_5,
  MARKETS.AWAY_SECOND_HALF_OVER_0_5,
  MARKETS.FIRST_HALF_UNDER_1_5
]);

const MARKET_SIDE = new Map([
  [MARKETS.HOME_WIN_EITHER_HALF, "HOME"],
  [MARKETS.AWAY_WIN_EITHER_HALF, "AWAY"],
  [MARKETS.HOME_DNB, "HOME"],
  [MARKETS.AWAY_DNB, "AWAY"],
  [MARKETS.HOME_DOUBLE_CHANCE, "HOME"],
  [MARKETS.AWAY_DOUBLE_CHANCE, "AWAY"],
  [MARKETS.HOME_SECOND_HALF_DNB, "HOME"],
  [MARKETS.AWAY_SECOND_HALF_DNB, "AWAY"],
  [MARKETS.HOME_SECOND_HALF_OVER_0_5, "HOME"],
  [MARKETS.AWAY_SECOND_HALF_OVER_0_5, "AWAY"]
]);

const PRIMARY_BLOCKING_WARNINGS = new Set([
  "INSUFFICIENT_SCORING_EVIDENCE",
  "DIRECT_1H_GOAL_DATA_REQUIRED_FOR_BANKER",
  "DIRECT_HALF_GOAL_DATA_REQUIRED",
  "INSUFFICIENT_TEAM_SECOND_HALF_EVIDENCE",
  "INSUFFICIENT_SECOND_HALF_GOAL_EVIDENCE",
  "INSUFFICIENT_BOTH_HALVES_EVIDENCE",
  "INSUFFICIENT_OVER15_EVIDENCE",
  "INSUFFICIENT_TEAM_SCORING_EVIDENCE"
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
  const secondHalfGoalMarket = DIRECTIONAL_GOAL_MARKETS.has(candidate?.market);
  const secondHalfResultMarket = [MARKETS.HOME_SECOND_HALF_DNB, MARKETS.AWAY_SECOND_HALF_DNB].includes(candidate?.market);

  const reasons = [];
  if (overallDirection !== side) reasons.push("Overall HT/FT direction does not support this side");
  if (!oddsAligned) reasons.push("Bookmaker direction conflicts with this side");
  if (!venueAligned) reasons.push("Home/away HT/FT split does not confirm this side");
  if (!secondHalfGoalMarket && !secondHalfResultMarket && leadSafety < 0.65) reasons.push("Lead-protection rate is below 65%");
  if (!secondHalfGoalMarket && !secondHalfResultMarket && opponentComebackWeakness < 0.45) reasons.push("Opponent comeback weakness is below 45%");
  if (warnings.includes("ODDS_DIRECTION_CONFLICT")) reasons.push("Candidate carries an odds-direction warning");

  const halfGoalReady = !secondHalfGoalMarket || (
    finite(selected?.secondHalfScoringRate) >= 0.58 &&
    finite(opponent?.secondHalfConcedingRate) >= 0.58
  );
  const halfResultReady = !secondHalfResultMarket || finite(selected?.secondHalfWinRate) >= 0.35;

  return {
    directional: true,
    eligible:
      overallDirection === side &&
      oddsAligned &&
      venueAligned &&
      halfGoalReady &&
      halfResultReady &&
      (secondHalfGoalMarket || secondHalfResultMarket || (leadSafety >= 0.65 && opponentComebackWeakness >= 0.45)) &&
      !warnings.includes("ODDS_DIRECTION_CONFLICT"),
    side,
    overallDirection,
    venueDirection,
    oddsAligned,
    venueAligned,
    leadSafety,
    opponentComebackWeakness,
    venueReliability,
    halfGoalReady,
    halfResultReady,
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
    side: candidate.safety?.side || null,
    evidence: candidate.evidence || null
  };
}

function chooseFirst(candidates, marketIds) {
  for (const market of marketIds) {
    const found = strongest(candidates, (candidate) => candidate.market === market);
    if (found) return found;
  }
  return null;
}

function teamMarket(side, homeMarket, awayMarket) {
  return side === "HOME" ? homeMarket : awayMarket;
}

function chooseByClassification({ result, separation, candidates, bestOverall, bestDirectional, bestGoal, bestOpenGoal, bestControl }) {
  const type = result?.classification?.type;
  const side = result?.classification?.side;
  const rationale = [];

  if ([CLASSIFICATIONS.CONFLICT_NO_PICK, CLASSIFICATIONS.SWING_FALSE_SIGNAL].includes(type)) {
    rationale.push(
      type === CLASSIFICATIONS.SWING_FALSE_SIGNAL
        ? "Athena saw a possible HT/FT swing, but the goals scored in each half did not confirm enough second-half activity."
        : "Athena found no safe shared route, so scored markets remain observations only."
    );
    return {
      primary: null,
      rationale,
      rule: type === CLASSIFICATIONS.SWING_FALSE_SIGNAL ? "FALSE_SWING_HARD_STOP" : "CONFLICT_HARD_STOP",
      hardStop: true
    };
  }

  if (type === CLASSIFICATIONS.SWING_FULL_REVERSAL) {
    const primary = chooseFirst(candidates, [
      teamMarket(side, MARKETS.HOME_SECOND_HALF_OVER_0_5, MARKETS.AWAY_SECOND_HALF_OVER_0_5),
      MARKETS.SECOND_HALF_OVER_0_5,
      teamMarket(side, MARKETS.HOME_WIN_EITHER_HALF, MARKETS.AWAY_WIN_EITHER_HALF),
      MARKETS.OVER_1_5,
      MARKETS.BTTS_YES,
      MARKETS.SECOND_HALF_OVER_1_5,
      MARKETS.OVER_2_5
    ]);
    if (primary) {
      rationale.push("The comeback-versus-collapse route is confirmed by second-half scoring, so Athena follows the clearest second-half market before considering a full-match goal line.");
      return { primary, rationale, rule: "V3_FULL_REVERSAL_ROUTE" };
    }
  }

  if (type === CLASSIFICATIONS.SWING_LEAD_SURRENDER) {
    const primary = chooseFirst(candidates, [
      MARKETS.SECOND_HALF_OVER_0_5,
      teamMarket(side, MARKETS.HOME_SECOND_HALF_OVER_0_5, MARKETS.AWAY_SECOND_HALF_OVER_0_5),
      MARKETS.OVER_1_5,
      MARKETS.BTTS_YES,
      teamMarket(side, MARKETS.HOME_DOUBLE_CHANCE, MARKETS.AWAY_DOUBLE_CHANCE)
    ]);
    if (primary) {
      rationale.push("One side often gives up a lead and the other often responds, so Athena protects the decision with a second-half or lower goal market.");
      return { primary, rationale, rule: "V3_LEAD_SURRENDER_ROUTE" };
    }
  }

  if (type === CLASSIFICATIONS.SWING_LATE_SEPARATION) {
    const primary = chooseFirst(candidates, [
      teamMarket(side, MARKETS.HOME_SECOND_HALF_OVER_0_5, MARKETS.AWAY_SECOND_HALF_OVER_0_5),
      MARKETS.SECOND_HALF_OVER_0_5,
      teamMarket(side, MARKETS.HOME_WIN_EITHER_HALF, MARKETS.AWAY_WIN_EITHER_HALF),
      teamMarket(side, MARKETS.HOME_SECOND_HALF_DNB, MARKETS.AWAY_SECOND_HALF_DNB),
      MARKETS.OVER_1_5
    ]);
    if (primary) {
      rationale.push("The match is likely to separate after the break, and the team-specific second-half goal data identifies the safest expression.");
      return { primary, rationale, rule: "V3_LATE_SEPARATION_ROUTE" };
    }
  }

  if (type === CLASSIFICATIONS.SWING_TWO_WAY_INSTABILITY) {
    const primary = chooseFirst(candidates, [
      MARKETS.SECOND_HALF_OVER_0_5,
      MARKETS.OVER_1_5,
      MARKETS.BTTS_YES,
      MARKETS.SECOND_HALF_OVER_1_5,
      MARKETS.GOALS_BOTH_HALVES,
      MARKETS.OVER_2_5
    ]);
    if (primary) {
      rationale.push("Both teams have credible ways to recover and collapse, so Athena avoids a winner and selects the strongest neutral goal market.");
      return { primary, rationale, rule: "V3_TWO_WAY_SWING_ROUTE" };
    }
  }

  if (separation?.type === "EARLY_SEPARATION") {
    const over25 = strongest(candidates, (candidate) => candidate.market === MARKETS.OVER_2_5);
    if (over25) {
      rationale.push("Early separation supports Over 2.5 when the direct goal data clears the primary gate.");
      return { primary: over25, rationale, rule: "V3_EARLY_SEPARATION" };
    }
  }
  if (separation?.type === "LATE_SEPARATION") {
    const secondHalf = strongest(candidates, (candidate) => candidate.market === MARKETS.SECOND_HALF_OVER_0_5);
    const over15 = strongest(candidates, (candidate) => candidate.market === MARKETS.OVER_1_5);
    if (secondHalf) {
      rationale.push("Late separation is now expressed directly through at least one second-half goal when the half-goal data qualifies.");
      return { primary: secondHalf, rationale, rule: "V3_LATE_SEPARATION_HALF_GOAL" };
    }
    if (over15) {
      rationale.push("Late separation is present, but the lower full-match Over 1.5 line is safer than forcing a team direction.");
      return { primary: over15, rationale, rule: "V3_LATE_SEPARATION_OVER15" };
    }
  }
  if (separation?.type === "MIXED_SEPARATION") {
    const over15 = strongest(candidates, (candidate) => candidate.market === MARKETS.OVER_1_5);
    const over25 = strongest(candidates, (candidate) => candidate.market === MARKETS.OVER_2_5);
    if (over25 && over15 && over25.score >= over15.score + 5) {
      rationale.push("Mixed timing still supports Over 2.5 because it holds a clear five-point advantage.");
      return { primary: over25, rationale, rule: "V3_MIXED_OVER25_MARGIN" };
    }
    if (over15) {
      rationale.push("Mixed timing favours the protected Over 1.5 line unless Over 2.5 is clearly stronger.");
      return { primary: over15, rationale, rule: "V3_MIXED_OVER15_PROTECTION" };
    }
  }
  if (separation?.type === "GOAL_ONLY_HIGH_EVENT") {
    const over15 = strongest(candidates, (candidate) => candidate.market === MARKETS.OVER_1_5);
    const over25 = strongest(candidates, (candidate) => candidate.market === MARKETS.OVER_2_5);
    if (over25 && over15 && over25.score >= 90 && over25.score >= over15.score + 4) {
      rationale.push("The high-event profile supports Over 2.5 at the stricter 90-point gate.");
      return { primary: over25, rationale, rule: "V3_GOAL_ONLY_OVER25_STRICT" };
    }
    if (over15) {
      rationale.push("The match looks open but the direction is unclear, so Athena uses Over 1.5.");
      return { primary: over15, rationale, rule: "V3_GOAL_ONLY_OVER15" };
    }
  }

  if ([CLASSIFICATIONS.HIGH_EVENT_EARLY_SEPARATION, CLASSIFICATIONS.SWING_GAME].includes(type)) {
    if (bestOpenGoal) {
      if (
        type === CLASSIFICATIONS.HIGH_EVENT_EARLY_SEPARATION &&
        bestDirectional &&
        [MARKETS.HOME_WIN_EITHER_HALF, MARKETS.AWAY_WIN_EITHER_HALF].includes(bestDirectional.market) &&
        bestDirectional.score >= bestOpenGoal.score - 5
      ) {
        rationale.push("The team direction stayed close to the strongest goal market and passed the venue, odds and safety checks.");
        return { primary: bestDirectional, rationale, rule: "HIGH_EVENT_CLOSE_DIRECTION" };
      }
      rationale.push("The high-event structure uses the strongest qualified attacking goal market.");
      return { primary: bestOpenGoal, rationale, rule: "HIGH_EVENT_GOAL_FIRST" };
    }
  }

  if ([CLASSIFICATIONS.STABLE_LEADER, CLASSIFICATIONS.MULTI_ROUTE_ADVANTAGE, CLASSIFICATIONS.LATE_SEPARATION].includes(type)) {
    if (bestDirectional) {
      const strongestNonDirectional = strongest(candidates, (candidate) => !candidate.safety.directional);
      if (!strongestNonDirectional || bestDirectional.score >= strongestNonDirectional.score - 6) {
        rationale.push("The team direction is fully confirmed and remains within six points of the strongest neutral market.");
        return { primary: bestDirectional, rationale, rule: "STABLE_DIRECTION_WITHIN_MARGIN" };
      }
      rationale.push("A neutral market was clearly stronger, so Athena did not force the team direction.");
      return { primary: strongestNonDirectional, rationale, rule: "STABLE_SCORE_OVERRIDE" };
    }
  }

  if (type === CLASSIFICATIONS.DRAW_LOCK && bestControl) {
    rationale.push("The draw-lock structure uses the strongest qualified draw or under market.");
    return { primary: bestControl, rationale, rule: "DRAW_LOCK_CONTROL" };
  }

  if (type === CLASSIFICATIONS.FALSE_OVER_TRAP) {
    const falseOver = strongest(candidates, (candidate) => [
      MARKETS.FIRST_HALF_UNDER_1_5,
      MARKETS.HALF_TIME_DRAW,
      MARKETS.UNDER_3_5,
      MARKETS.UNDER_2_5
    ].includes(candidate.market));
    if (falseOver) {
      rationale.push("The apparent high-goal trend is not supported by the match structure, so Athena uses a control market.");
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
      rationale.push("The match fits a controlled two-to-three-goal range.");
      return { primary: corridor, rationale, rule: "CONTROLLED_CORRIDOR" };
    }
  }

  if (bestOverall) {
    rationale.push("No match-type rule overruled the highest safe score.");
    return { primary: bestOverall, rationale, rule: "HIGHEST_SAFE_SCORE" };
  }

  return { primary: null, rationale: ["No market cleared Athena v3’s score and safety checks."], rule: "NO_PICK" };
}

function saferAlternative(candidates, primary) {
  return strongest(
    candidates,
    (candidate) => candidate.market !== primary?.market && SAFER_MARKETS.has(candidate.market)
  );
}

export function arbitrateAthenaV11({ result, venueResult = null, samples = {}, separation = null }) {
  const rawCandidates = uniqueMarkets(result);
  const candidates = eligibleCandidates(result, venueResult, samples);
  const bestOverall = strongest(candidates);
  const bestDirectional = strongest(candidates, (candidate) => DIRECTIONAL_RESULT_MARKETS.has(candidate.market));
  const bestGoal = strongest(candidates, (candidate) => GOAL_MARKETS.has(candidate.market));
  const bestOpenGoal = strongest(candidates, (candidate) => OPEN_GOAL_MARKETS.has(candidate.market));
  const bestControl = strongest(candidates, (candidate) => CONTROL_MARKETS.has(candidate.market));
  const bestGoalObservation = strongest(rawCandidates, (candidate) => GOAL_MARKETS.has(candidate.market));

  const decision = chooseByClassification({
    result,
    separation,
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
    hardStop: Boolean(decision.hardStop),
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
          warnings: [decision.rule === "CONFLICT_HARD_STOP"
            ? "ATHENA_V3_CONFLICT_HARD_STOP"
            : decision.rule === "FALSE_SWING_HARD_STOP"
              ? "ATHENA_V3_FALSE_SWING_HARD_STOP"
              : "ATHENA_V3_NO_PICK"],
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
    bestGoal: describe(decision.hardStop ? bestGoalObservation : bestGoal),
    saferAlternative: describe(safer),
    alternatives,
    eligibleCount: candidates.length,
    rejectedCount: Math.max(0, uniqueMarkets(result).length - candidates.length),
    classification: result?.classification?.type || null,
    separation,
    rationale: decision.rationale,
    rule: decision.rule
  };
}
