import { CLASSIFICATIONS, MARKETS } from './constants.js';

function add(candidates, market, score, reasons = [], warnings = [], fatal = false, evidence = {}) {
  candidates.push({
    market,
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
    warnings,
    fatal,
    evidence
  });
}

function teamMarket(side, homeMarket, awayMarket) {
  return side === 'HOME' ? homeMarket : awayMarket;
}

function avg(values) {
  const present = values.filter(Number.isFinite);
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
}

function percentage(value) {
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

const OPEN_SWING_TYPES = new Set([
  CLASSIFICATIONS.SWING_GAME,
  CLASSIFICATIONS.SWING_FULL_REVERSAL,
  CLASSIFICATIONS.SWING_LEAD_SURRENDER,
  CLASSIFICATIONS.SWING_LATE_SEPARATION,
  CLASSIFICATIONS.SWING_TWO_WAY_INSTABILITY
]);

export function scoreMarkets({ home, away, routes, classification, oddsConflict, config }) {
  const candidates = [];
  const side = classification.side;
  const isHome = side === 'HOME';
  const selected = side ? (isHome ? home : away) : null;
  const opponent = side ? (isHome ? away : home) : null;
  const leadRoute = isHome ? routes.homeWW : routes.awayWW;
  const lateRoute = isHome ? routes.homeDW : routes.awayDW;
  const reversalRoute = isHome ? routes.homeLW : routes.awayLW;

  const teamEitherHalf = teamMarket(side, MARKETS.HOME_WIN_EITHER_HALF, MARKETS.AWAY_WIN_EITHER_HALF);
  const teamDnb = teamMarket(side, MARKETS.HOME_DNB, MARKETS.AWAY_DNB);
  const teamDc = teamMarket(side, MARKETS.HOME_DOUBLE_CHANCE, MARKETS.AWAY_DOUBLE_CHANCE);
  const teamOver05 = teamMarket(side, MARKETS.HOME_OVER_0_5, MARKETS.AWAY_OVER_0_5);
  const teamSecondHalfGoal = teamMarket(side, MARKETS.HOME_SECOND_HALF_OVER_0_5, MARKETS.AWAY_SECOND_HALF_OVER_0_5);
  const teamSecondHalfDnb = teamMarket(side, MARKETS.HOME_SECOND_HALF_DNB, MARKETS.AWAY_SECOND_HALF_DNB);

  const routeScore = (leadRoute?.adjusted ?? 0) * 100 + (lateRoute?.adjusted ?? 0) * 90 + (reversalRoute?.adjusted ?? 0) * 70;
  const selectedLeadSafety = selected ? selected.leadHoldRate : 0;
  const opponentComebackWeakness = opponent ? 1 - opponent.comebackSaveRate : 0;

  if (side) {
    let eitherHalfScore = 55 + routeScore * 0.65 + selectedLeadSafety * 12 + opponentComebackWeakness * 8;
    if (classification.type === CLASSIFICATIONS.MULTI_ROUTE_ADVANTAGE) eitherHalfScore += 12;
    if (classification.type === CLASSIFICATIONS.STABLE_LEADER) eitherHalfScore += 8;
    if ([CLASSIFICATIONS.LATE_SEPARATION, CLASSIFICATIONS.SWING_LATE_SEPARATION].includes(classification.type)) eitherHalfScore += 7;
    if (classification.type === CLASSIFICATIONS.SWING_FULL_REVERSAL) eitherHalfScore += 4;
    if (oddsConflict.conflict && config.requireVenueSplitForConflictedDirection && !selected.venue) eitherHalfScore -= 18;
    add(candidates, teamEitherHalf, eitherHalfScore,
      ['The HT/FT routes favour this team in at least one half', 'Lead protection and opponent recovery were checked'],
      oddsConflict.conflict ? ['ODDS_DIRECTION_CONFLICT'] : [],
      false,
      { routeScore, selectedLeadSafety, opponentComebackWeakness });

    add(candidates, teamDnb, eitherHalfScore - 6,
      ['The team direction is supported, with draw protection'],
      oddsConflict.conflict ? ['ODDS_DIRECTION_CONFLICT'] : []);
    add(candidates, teamDc, eitherHalfScore - 10,
      ['The direction is supported and the draw is covered']);

    let teamGoalScore = 52 + Math.min(18, routeScore * 0.35);
    if (selected.goalsFor !== null && selected.matchesPlayed > 0 && selected.goalsFor / selected.matchesPlayed >= 1.2) teamGoalScore += 8;
    if (Number.isFinite(selected.scoringRate)) teamGoalScore += selected.scoringRate * 18;
    const teamGoalWarnings = [];
    if (!Number.isFinite(selected.scoringRate) || selected.scoringRate < 0.70) {
      teamGoalWarnings.push('INSUFFICIENT_TEAM_SCORING_EVIDENCE');
    }
    add(candidates, teamOver05, teamGoalScore,
      ['The team has more than one route to score'],
      teamGoalWarnings,
      false,
      { selectedScoringRate: selected.scoringRate });

    const shAttack = selected.secondHalfScoringRate;
    const shWeakness = opponent.secondHalfConcedingRate;
    let teamSecondHalfScore = 42;
    if (Number.isFinite(shAttack)) teamSecondHalfScore += shAttack * 32;
    if (Number.isFinite(shWeakness)) teamSecondHalfScore += shWeakness * 24;
    if ([CLASSIFICATIONS.SWING_FULL_REVERSAL, CLASSIFICATIONS.SWING_LEAD_SURRENDER, CLASSIFICATIONS.SWING_LATE_SEPARATION].includes(classification.type)) {
      teamSecondHalfScore += 12;
    }
    const teamSecondHalfWarnings = [];
    if (!Number.isFinite(shAttack) || !Number.isFinite(shWeakness)) {
      teamSecondHalfWarnings.push('DIRECT_HALF_GOAL_DATA_REQUIRED');
    } else if (shAttack < config.secondHalfScoringStrong || shWeakness < config.secondHalfConcedingStrong) {
      teamSecondHalfWarnings.push('INSUFFICIENT_TEAM_SECOND_HALF_EVIDENCE');
    }
    add(candidates, teamSecondHalfGoal, teamSecondHalfScore,
      [
        `${selected.name} scores after half-time in ${percentage(shAttack) ?? 0}% of the sample`,
        `${opponent.name} concedes after half-time in ${percentage(shWeakness) ?? 0}% of the sample`
      ],
      teamSecondHalfWarnings,
      false,
      { selectedSecondHalfScoringRate: shAttack, opponentSecondHalfConcedingRate: shWeakness });

    let shDnbScore = 38;
    if (Number.isFinite(selected.secondHalfWinRate)) shDnbScore += selected.secondHalfWinRate * 38;
    if (Number.isFinite(opponent.secondHalfWinRate)) shDnbScore += (1 - opponent.secondHalfWinRate) * 16;
    if ([CLASSIFICATIONS.SWING_FULL_REVERSAL, CLASSIFICATIONS.SWING_LATE_SEPARATION].includes(classification.type)) shDnbScore += 10;
    const shDnbWarnings = [];
    if (!Number.isFinite(selected.secondHalfWinRate) || !Number.isFinite(opponent.secondHalfWinRate)) {
      shDnbWarnings.push('DIRECT_HALF_GOAL_DATA_REQUIRED');
    }
    if (oddsConflict.conflict) shDnbWarnings.push('ODDS_DIRECTION_CONFLICT');
    add(candidates, teamSecondHalfDnb, shDnbScore,
      ['Second-half scoring balance favours this team, with a draw returning the stake'],
      shDnbWarnings,
      false,
      { selectedSecondHalfWinRate: selected.secondHalfWinRate, opponentSecondHalfWinRate: opponent.secondHalfWinRate });
  }

  const avgGoals = classification.combinedAvgGoals;
  const o25 = classification.combinedOver25;
  const u25 = classification.combinedUnder25;
  const matchedReversalStrong = Math.max(routes.homeLW.bottleneckCount, routes.awayLW.bottleneckCount) >= config.matchedReversalCountStrong;

  const over15Rate = avg([home.over15Rate, away.over15Rate]);
  let over15Score = 55;
  if (over15Rate !== null) over15Score += Math.max(0, (over15Rate - 0.65) * 12);
  if (avgGoals !== null) over15Score += Math.min(24, Math.max(0, (avgGoals - 1.6) * 14));
  if (o25 !== null) over15Score += o25 * 12;
  if ([CLASSIFICATIONS.HIGH_EVENT_EARLY_SEPARATION, CLASSIFICATIONS.MULTI_ROUTE_ADVANTAGE].includes(classification.type) || OPEN_SWING_TYPES.has(classification.type)) over15Score += 8;
  if ([CLASSIFICATIONS.FALSE_OVER_TRAP, CLASSIFICATIONS.SWING_FALSE_SIGNAL].includes(classification.type)) over15Score -= 20;
  const over15Warnings = [];
  if (over15Rate === null || over15Rate < 0.65) over15Warnings.push('INSUFFICIENT_OVER15_EVIDENCE');
  add(candidates, MARKETS.OVER_1_5, over15Score,
    ['The direct Over 1.5 record, combined goal average and transition structure support at least two match goals'],
    over15Warnings,
    false,
    { combinedOver15Rate: over15Rate });

  let over25Score = 42;
  if (o25 !== null) over25Score += o25 * 35;
  if (avgGoals !== null) over25Score += Math.max(0, (avgGoals - 2.3) * 12);
  if (classification.type === CLASSIFICATIONS.HIGH_EVENT_EARLY_SEPARATION || OPEN_SWING_TYPES.has(classification.type)) over25Score += 10;
  if ([CLASSIFICATIONS.FALSE_OVER_TRAP, CLASSIFICATIONS.SWING_FALSE_SIGNAL].includes(classification.type)) over25Score -= 24;
  if (classification.type === CLASSIFICATIONS.DRAW_LOCK) over25Score -= 18;
  add(candidates, MARKETS.OVER_2_5, over25Score,
    ['Both the Over 2.5 record and the match structure allow three or more goals']);

  let under35Score = 54;
  if (avgGoals !== null) under35Score += Math.max(0, (3.2 - avgGoals) * 12);
  if (u25 !== null) under35Score += u25 * 16;
  if ([CLASSIFICATIONS.DRAW_LOCK, CLASSIFICATIONS.CONTROLLED_CORRIDOR, CLASSIFICATIONS.FALSE_OVER_TRAP, CLASSIFICATIONS.SWING_FALSE_SIGNAL].includes(classification.type)) under35Score += 10;
  if (matchedReversalStrong) under35Score -= 25;
  if ([CLASSIFICATIONS.HIGH_EVENT_EARLY_SEPARATION, CLASSIFICATIONS.MULTI_ROUTE_ADVANTAGE].includes(classification.type) || OPEN_SWING_TYPES.has(classification.type)) under35Score -= 10;
  add(candidates, MARKETS.UNDER_3_5, under35Score,
    ['The historical goal ceiling was checked against swing risk'],
    matchedReversalStrong ? ['MATCHED_REVERSAL'] : []);

  let under25Score = 40;
  if (u25 !== null) under25Score += u25 * 42;
  if (avgGoals !== null) under25Score += Math.max(0, (2.4 - avgGoals) * 18);
  if (classification.type === CLASSIFICATIONS.DRAW_LOCK) under25Score += 10;
  if (matchedReversalStrong || classification.type === CLASSIFICATIONS.HIGH_EVENT_EARLY_SEPARATION || OPEN_SWING_TYPES.has(classification.type)) under25Score -= 22;
  add(candidates, MARKETS.UNDER_2_5, under25Score,
    ['Both teams need a convincing low-goal profile']);

  const htDrawAvg = (home.htDrawRate + away.htDrawRate) / 2;
  let htDrawScore = 35 + htDrawAvg * 60;
  if ([CLASSIFICATIONS.DRAW_LOCK, CLASSIFICATIONS.LATE_SEPARATION, CLASSIFICATIONS.SWING_LATE_SEPARATION].includes(classification.type)) htDrawScore += 8;
  if (classification.type === CLASSIFICATIONS.HIGH_EVENT_EARLY_SEPARATION) htDrawScore -= 16;
  add(candidates, MARKETS.HALF_TIME_DRAW, htDrawScore,
    ['Both teams’ half-time draw frequency supports a level break']);

  let ftDrawScore = 28 + ((home.ftDrawRate + away.ftDrawRate) / 2) * 80;
  if (classification.type === CLASSIFICATIONS.DRAW_LOCK) ftDrawScore += 12;
  if (side) ftDrawScore -= 10;
  add(candidates, MARKETS.FULL_TIME_DRAW, ftDrawScore,
    ['The teams’ full-time draw transitions were compared']);

  const fhUnderRate = avg([
    Number.isFinite(home.firstHalfOver15Rate) ? 1 - home.firstHalfOver15Rate : null,
    Number.isFinite(away.firstHalfOver15Rate) ? 1 - away.firstHalfOver15Rate : null
  ]);
  let fhUnder15Score = 42 + htDrawAvg * 20;
  if (fhUnderRate !== null) fhUnder15Score += fhUnderRate * 34;
  if ([CLASSIFICATIONS.DRAW_LOCK, CLASSIFICATIONS.FALSE_OVER_TRAP].includes(classification.type)) fhUnder15Score += 8;
  if (classification.type === CLASSIFICATIONS.HIGH_EVENT_EARLY_SEPARATION) fhUnder15Score -= 14;
  add(candidates, MARKETS.FIRST_HALF_UNDER_1_5, fhUnder15Score,
    ['Direct first-half goal records and the half-time structure support a quiet opening half'],
    fhUnderRate === null ? ['DIRECT_HALF_GOAL_DATA_REQUIRED'] : []);

  const fhOver05Rate = avg([home.firstHalfOver05Rate, away.firstHalfOver05Rate]);
  let fhOver05Score = 38;
  if (fhOver05Rate !== null) fhOver05Score += fhOver05Rate * 45;
  if (classification.type === CLASSIFICATIONS.HIGH_EVENT_EARLY_SEPARATION) fhOver05Score += 12;
  add(candidates, MARKETS.FIRST_HALF_OVER_0_5, fhOver05Score,
    ['Direct first-half goal records support an opening-half goal'],
    fhOver05Rate === null ? ['DIRECT_HALF_GOAL_DATA_REQUIRED'] : []);

  const shOver05Rate = avg([home.secondHalfOver05Rate, away.secondHalfOver05Rate]);
  const shAvgGoals = avg([
    Number.isFinite(home.secondHalfGoalsForPerMatch) && Number.isFinite(home.secondHalfGoalsAgainstPerMatch)
      ? home.secondHalfGoalsForPerMatch + home.secondHalfGoalsAgainstPerMatch : null,
    Number.isFinite(away.secondHalfGoalsForPerMatch) && Number.isFinite(away.secondHalfGoalsAgainstPerMatch)
      ? away.secondHalfGoalsForPerMatch + away.secondHalfGoalsAgainstPerMatch : null
  ]);
  let shOver05Score = 38;
  if (shOver05Rate !== null) shOver05Score += shOver05Rate * 46;
  if (shAvgGoals !== null) shOver05Score += Math.min(12, Math.max(0, (shAvgGoals - 0.7) * 12));
  if (OPEN_SWING_TYPES.has(classification.type)) shOver05Score += 10;
  if (classification.type === CLASSIFICATIONS.SWING_FALSE_SIGNAL) shOver05Score -= 22;
  add(candidates, MARKETS.SECOND_HALF_OVER_0_5, shOver05Score,
    ['Both teams’ second-half records support at least one goal after the break'],
    shOver05Rate === null ? ['DIRECT_HALF_GOAL_DATA_REQUIRED'] : [],
    false,
    { combinedSecondHalfOver05Rate: shOver05Rate, combinedSecondHalfAverageGoals: shAvgGoals });

  const shOver15Rate = avg([home.secondHalfOver15Rate, away.secondHalfOver15Rate]);
  let shOver15Score = 32;
  if (shOver15Rate !== null) shOver15Score += shOver15Rate * 52;
  if (shAvgGoals !== null) shOver15Score += Math.min(15, Math.max(0, (shAvgGoals - 1.05) * 14));
  if ([CLASSIFICATIONS.SWING_FULL_REVERSAL, CLASSIFICATIONS.SWING_TWO_WAY_INSTABILITY].includes(classification.type)) shOver15Score += 12;
  const shOver15Warnings = [];
  if (shOver15Rate === null) shOver15Warnings.push('DIRECT_HALF_GOAL_DATA_REQUIRED');
  else if (shOver15Rate < config.secondHalfOver15Strong) shOver15Warnings.push('INSUFFICIENT_SECOND_HALF_GOAL_EVIDENCE');
  add(candidates, MARKETS.SECOND_HALF_OVER_1_5, shOver15Score,
    ['The second half is regularly producing two or more goals'],
    shOver15Warnings,
    false,
    { combinedSecondHalfOver15Rate: shOver15Rate, combinedSecondHalfAverageGoals: shAvgGoals });

  const bothHalvesRate = avg([home.goalsBothHalvesRate, away.goalsBothHalvesRate]);
  let bothHalvesScore = 34;
  if (bothHalvesRate !== null) bothHalvesScore += bothHalvesRate * 58;
  if (classification.type === CLASSIFICATIONS.SWING_TWO_WAY_INSTABILITY) bothHalvesScore += 8;
  const bothHalvesWarnings = [];
  if (bothHalvesRate === null) bothHalvesWarnings.push('DIRECT_HALF_GOAL_DATA_REQUIRED');
  else if (bothHalvesRate < config.goalsBothHalvesStrong) bothHalvesWarnings.push('INSUFFICIENT_BOTH_HALVES_EVIDENCE');
  add(candidates, MARKETS.GOALS_BOTH_HALVES, bothHalvesScore,
    ['Goals appear in both halves often enough to support this market'],
    bothHalvesWarnings,
    false,
    { combinedGoalsBothHalvesRate: bothHalvesRate });

  const bothCanScore = home.goalsFor !== null && away.goalsFor !== null &&
    home.goalsFor / home.matchesPlayed >= 0.9 && away.goalsFor / away.matchesPlayed >= 0.9;
  const dualScoringRate = avg([home.scoringRate, away.scoringRate]);
  const dualConcedingRate = avg([home.concedingRate, away.concedingRate]);
  const combinedBttsRate = avg([home.bttsRate, away.bttsRate]);
  const ftsRisk = avg([home.failedToScoreRate, away.failedToScoreRate]);
  let bttsScore = 30;
  if (bothCanScore) bttsScore += 10;
  if (combinedBttsRate !== null) bttsScore += combinedBttsRate * 24;
  if (dualScoringRate !== null) bttsScore += dualScoringRate * 16;
  if (dualConcedingRate !== null) bttsScore += dualConcedingRate * 14;
  if (ftsRisk !== null) bttsScore -= ftsRisk * 18;
  if (avgGoals !== null) bttsScore += Math.max(0, (avgGoals - 2.2) * 6);
  if ([CLASSIFICATIONS.SWING_FULL_REVERSAL, CLASSIFICATIONS.SWING_TWO_WAY_INSTABILITY, CLASSIFICATIONS.SWING_LEAD_SURRENDER].includes(classification.type)) bttsScore += 7;
  if (classification.type === CLASSIFICATIONS.DRAW_LOCK) bttsScore -= 12;
  const bttsWarnings = [];
  if (!bothCanScore ||
      combinedBttsRate === null || combinedBttsRate < 0.55 ||
      dualScoringRate === null || dualScoringRate < 0.65 ||
      (ftsRisk !== null && ftsRisk > 0.35)) {
    bttsWarnings.push('INSUFFICIENT_SCORING_EVIDENCE');
  }
  add(candidates, MARKETS.BTTS_YES, bttsScore,
    ['Both teams must show independent scoring ability and a strong direct BTTS record; swing activity alone is not enough'],
    bttsWarnings,
    false,
    { combinedBttsRate, dualScoringRate, dualConcedingRate, failedToScoreRisk: ftsRisk });

  return candidates.sort((a, b) => b.score - a.score);
}
