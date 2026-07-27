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

function minFinite(values) {
  const present = values.filter(Number.isFinite);
  return present.length === values.length && present.length ? Math.min(...present) : null;
}

function maxFinite(values) {
  const present = values.filter(Number.isFinite);
  return present.length ? Math.max(...present) : null;
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

    const fullMatchTeamCore = minFinite([
      selected.scoringRate,
      selected.venueScoringRate,
      selected.recentScoringRate,
      opponent.concedingRate,
      opponent.venueConcedingRate,
      opponent.recentConcedingRate
    ]);
    const teamGoalWarnings = [];
    if (fullMatchTeamCore === null) teamGoalWarnings.push('DIRECT_TEAM_GOAL_DATA_REQUIRED');
    else if (
      selected.scoringRate < 0.75 || selected.venueScoringRate < 0.75 || selected.recentScoringRate < 0.66 ||
      opponent.concedingRate < 0.70 || opponent.venueConcedingRate < 0.70 || opponent.recentConcedingRate < 0.66
    ) teamGoalWarnings.push('INSUFFICIENT_TEAM_SCORING_EVIDENCE');
    const teamGoalScore = fullMatchTeamCore === null
      ? 0
      : 25 + fullMatchTeamCore * 65 + Math.min(10, routeScore * 0.18);
    add(candidates, teamOver05, teamGoalScore,
      ['Overall, venue and recent scoring all support the same team goal'],
      teamGoalWarnings,
      false,
      {
        conservativeScoringFloor: fullMatchTeamCore,
        selectedScoringRate: selected.scoringRate,
        selectedVenueScoringRate: selected.venueScoringRate,
        selectedRecentScoringRate: selected.recentScoringRate,
        opponentConcedingRate: opponent.concedingRate,
        opponentVenueConcedingRate: opponent.venueConcedingRate,
        opponentRecentConcedingRate: opponent.recentConcedingRate
      });

    const shAttack = selected.secondHalfScoringRate;
    const shWeakness = opponent.secondHalfConcedingRate;
    const teamSecondHalfCore = minFinite([
      shAttack,
      selected.venueSecondHalfScoringRate,
      selected.recentSecondHalfScoringRate,
      shWeakness,
      opponent.venueSecondHalfConcedingRate,
      opponent.recentSecondHalfConcedingRate
    ]);
    const routeFloor = Math.min(
      selected.secondHalfScoreRouteRate || 0,
      opponent.secondHalfConcedeStateRouteRate || 0
    );
    const routeCountFloor = Math.min(
      selected.secondHalfScoreRouteCount || 0,
      opponent.secondHalfConcedeStateRouteCount || 0
    );
    const eventConfirmed = Boolean(
      selected.eventDataReady && opponent.eventDataReady &&
      ((selected.goalsWhileTrailing + selected.equalisersScored) > 0 || opponent.leadsSurrendered > 0)
    );
    const eventBonus = eventConfirmed ? 8 : (teamSecondHalfCore !== null && teamSecondHalfCore >= 0.75 ? 3 : 0);
    const teamSecondHalfScore = teamSecondHalfCore === null
      ? 0
      : 18 + teamSecondHalfCore * 76 + Math.min(8, routeFloor * 20) + eventBonus;
    const teamSecondHalfWarnings = [];
    if (teamSecondHalfCore === null) {
      teamSecondHalfWarnings.push('DIRECT_HALF_GOAL_DATA_REQUIRED');
    } else {
      if (
        shAttack < config.secondHalfScoringStrong ||
        selected.venueSecondHalfScoringRate < config.venueSecondHalfScoringStrong ||
        selected.recentSecondHalfScoringRate < config.recentSecondHalfStrong ||
        shWeakness < config.secondHalfConcedingStrong ||
        opponent.venueSecondHalfConcedingRate < config.venueSecondHalfConcedingStrong ||
        opponent.recentSecondHalfConcedingRate < config.recentSecondHalfStrong ||
        selected.secondHalfGoalsForPerMatch < config.secondHalfGoalsForPerMatchStrong ||
        selected.venueSecondHalfGoalsForPerMatch < config.secondHalfGoalsForPerMatchStrong
      ) teamSecondHalfWarnings.push('INSUFFICIENT_TEAM_SECOND_HALF_EVIDENCE');
      if (routeCountFloor < 2) teamSecondHalfWarnings.push('INSUFFICIENT_DIRECT_SECOND_HALF_ROUTE');
      if ((1 - opponent.venueSecondHalfConcedingRate) >= 0.40) teamSecondHalfWarnings.push('OPPONENT_SECOND_HALF_CLEAN_SHEET_RISK');
      if (teamSecondHalfScore < config.teamSecondHalfPrimaryScore) teamSecondHalfWarnings.push('TEAM_SECOND_HALF_SPECIALIST_SCORE_TOO_LOW');
    }
    add(candidates, teamSecondHalfGoal, teamSecondHalfScore,
      [
        `${selected.name} has passed overall, venue and recent second-half scoring checks`,
        `${opponent.name} has passed overall, venue and recent second-half conceding checks`
      ],
      teamSecondHalfWarnings,
      false,
      {
        conservativeSecondHalfFloor: teamSecondHalfCore,
        routeFloor,
        routeCountFloor,
        eventConfirmed,
        selectedSecondHalfScoringRate: shAttack,
        selectedVenueSecondHalfScoringRate: selected.venueSecondHalfScoringRate,
        selectedRecentSecondHalfScoringRate: selected.recentSecondHalfScoringRate,
        opponentSecondHalfConcedingRate: shWeakness,
        opponentVenueSecondHalfConcedingRate: opponent.venueSecondHalfConcedingRate,
        opponentRecentSecondHalfConcedingRate: opponent.recentSecondHalfConcedingRate
      });

    const opponentSecondHalfLossRate = Math.max(0, 1 - (opponent.secondHalfWinRate || 0) - (opponent.secondHalfDrawRate || 0));
    const opponentVenueSecondHalfLossRate = Math.max(0, 1 - (opponent.venueSecondHalfWinRate || 0) - (opponent.venueSecondHalfDrawRate || 0));
    const opponentRecentSecondHalfLossRate = Math.max(0, 1 - (opponent.recentSecondHalfWinRate || 0) - (opponent.recentSecondHalfDrawRate || 0));
    const shDnbCore = minFinite([
      selected.secondHalfWinRate,
      selected.venueSecondHalfWinRate,
      selected.recentSecondHalfWinRate,
      opponentSecondHalfLossRate,
      opponentVenueSecondHalfLossRate,
      opponentRecentSecondHalfLossRate
    ]);
    const shDnbScore = shDnbCore === null ? 0 : 20 + shDnbCore * 90 + Math.min(8, routeFloor * 18);
    const shDnbWarnings = [];
    if (shDnbCore === null) shDnbWarnings.push('DIRECT_HALF_GOAL_DATA_REQUIRED');
    else if (
      selected.secondHalfWinRate < config.secondHalfDnbWinRateStrong ||
      selected.venueSecondHalfWinRate < config.secondHalfDnbVenueWinRateStrong ||
      selected.recentSecondHalfWinRate < config.secondHalfDnbVenueWinRateStrong ||
      opponentVenueSecondHalfLossRate < 0.40 ||
      routeCountFloor < 2
    ) shDnbWarnings.push('INSUFFICIENT_SECOND_HALF_RESULT_EVIDENCE');
    if (oddsConflict.conflict) shDnbWarnings.push('ODDS_DIRECTION_CONFLICT');
    add(candidates, teamSecondHalfDnb, shDnbScore,
      ['Overall, venue and recent post-break result records favour this team, with the draw protected'],
      shDnbWarnings,
      false,
      {
        conservativeSecondHalfResultFloor: shDnbCore,
        selectedSecondHalfWinRate: selected.secondHalfWinRate,
        selectedVenueSecondHalfWinRate: selected.venueSecondHalfWinRate,
        selectedRecentSecondHalfWinRate: selected.recentSecondHalfWinRate,
        opponentSecondHalfLossRate,
        opponentVenueSecondHalfLossRate,
        opponentRecentSecondHalfLossRate
      });
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

  const fhUnderCore = minFinite([
    Number.isFinite(home.firstHalfOver15Rate) ? 1 - home.firstHalfOver15Rate : null,
    Number.isFinite(away.firstHalfOver15Rate) ? 1 - away.firstHalfOver15Rate : null,
    Number.isFinite(home.venueFirstHalfOver15Rate) ? 1 - home.venueFirstHalfOver15Rate : null,
    Number.isFinite(away.venueFirstHalfOver15Rate) ? 1 - away.venueFirstHalfOver15Rate : null,
    Number.isFinite(home.recentFirstHalfOver15Rate) ? 1 - home.recentFirstHalfOver15Rate : null,
    Number.isFinite(away.recentFirstHalfOver15Rate) ? 1 - away.recentFirstHalfOver15Rate : null
  ]);
  let fhUnder15Score = fhUnderCore === null ? 0 : 18 + fhUnderCore * 78 + htDrawAvg * 8;
  if ([CLASSIFICATIONS.DRAW_LOCK, CLASSIFICATIONS.FALSE_OVER_TRAP].includes(classification.type)) fhUnder15Score += 5;
  if (classification.type === CLASSIFICATIONS.HIGH_EVENT_EARLY_SEPARATION) fhUnder15Score -= 14;
  const fhUnderWarnings = [];
  if (fhUnderCore === null) fhUnderWarnings.push('DIRECT_HALF_GOAL_DATA_REQUIRED');
  else if (fhUnderCore < 0.70) fhUnderWarnings.push('INSUFFICIENT_FIRST_HALF_UNDER_EVIDENCE');
  add(candidates, MARKETS.FIRST_HALF_UNDER_1_5, fhUnder15Score,
    ['Overall, venue and recent first-half records all support fewer than two opening-half goals'],
    fhUnderWarnings,
    false,
    { conservativeFirstHalfUnder15Floor: fhUnderCore });

  const fhOver05Core = minFinite([
    home.firstHalfOver05Rate,
    away.firstHalfOver05Rate,
    home.venueFirstHalfOver05Rate,
    away.venueFirstHalfOver05Rate,
    home.recentFirstHalfOver05Rate,
    away.recentFirstHalfOver05Rate
  ]);
  let fhOver05Score = fhOver05Core === null ? 0 : 20 + fhOver05Core * 75 + Math.max(0, (1 - htDrawAvg) * 5);
  if (classification.type === CLASSIFICATIONS.HIGH_EVENT_EARLY_SEPARATION) fhOver05Score += 4;
  const fhOverWarnings = [];
  if (fhOver05Core === null) fhOverWarnings.push('DIRECT_HALF_GOAL_DATA_REQUIRED');
  else if (fhOver05Core < config.firstHalfOver05Strong) fhOverWarnings.push('INSUFFICIENT_FIRST_HALF_GOAL_EVIDENCE');
  add(candidates, MARKETS.FIRST_HALF_OVER_0_5, fhOver05Score,
    ['Overall, venue and recent first-half records all support an opening-half goal'],
    fhOverWarnings,
    false,
    { conservativeFirstHalfOver05Floor: fhOver05Core });

  const shOver05Core = minFinite([
    home.secondHalfOver05Rate,
    away.secondHalfOver05Rate,
    home.venueSecondHalfOver05Rate,
    away.venueSecondHalfOver05Rate,
    home.recentSecondHalfOver05Rate,
    away.recentSecondHalfOver05Rate
  ]);
  const shAvgGoals = avg([
    Number.isFinite(home.venueSecondHalfGoalsForPerMatch) && Number.isFinite(away.venueSecondHalfGoalsAgainstPerMatch)
      ? home.venueSecondHalfGoalsForPerMatch + away.venueSecondHalfGoalsAgainstPerMatch : null,
    Number.isFinite(away.venueSecondHalfGoalsForPerMatch) && Number.isFinite(home.venueSecondHalfGoalsAgainstPerMatch)
      ? away.venueSecondHalfGoalsForPerMatch + home.venueSecondHalfGoalsAgainstPerMatch : null
  ]);
  let shOver05Score = shOver05Core === null ? 0 : 18 + shOver05Core * 78;
  if (shAvgGoals !== null) shOver05Score += Math.min(8, Math.max(0, (shAvgGoals - 0.9) * 10));
  if (OPEN_SWING_TYPES.has(classification.type)) shOver05Score += 4;
  if (classification.type === CLASSIFICATIONS.SWING_FALSE_SIGNAL) shOver05Score -= 22;
  const shOver05Warnings = [];
  if (shOver05Core === null) shOver05Warnings.push('DIRECT_HALF_GOAL_DATA_REQUIRED');
  else if (shOver05Core < config.secondHalfOver05Strong || (shAvgGoals !== null && shAvgGoals < 1.0)) {
    shOver05Warnings.push('INSUFFICIENT_SECOND_HALF_GOAL_EVIDENCE');
  }
  add(candidates, MARKETS.SECOND_HALF_OVER_0_5, shOver05Score,
    ['Overall, venue and recent second-half records all support at least one goal after the break'],
    shOver05Warnings,
    false,
    { conservativeSecondHalfOver05Floor: shOver05Core, combinedSecondHalfAverageGoals: shAvgGoals });

  const shOver15Core = minFinite([
    home.secondHalfOver15Rate,
    away.secondHalfOver15Rate,
    home.venueSecondHalfOver15Rate,
    away.venueSecondHalfOver15Rate,
    home.recentSecondHalfOver15Rate,
    away.recentSecondHalfOver15Rate
  ]);
  let shOver15Score = shOver15Core === null ? 0 : 15 + shOver15Core * 88;
  if (shAvgGoals !== null) shOver15Score += Math.min(8, Math.max(0, (shAvgGoals - 1.35) * 8));
  if ([CLASSIFICATIONS.SWING_FULL_REVERSAL, CLASSIFICATIONS.SWING_TWO_WAY_INSTABILITY].includes(classification.type)) shOver15Score += 4;
  const shOver15Warnings = [];
  if (shOver15Core === null) shOver15Warnings.push('DIRECT_HALF_GOAL_DATA_REQUIRED');
  else if (shOver15Core < config.secondHalfOver15Strong || (shAvgGoals !== null && shAvgGoals < 1.4)) {
    shOver15Warnings.push('INSUFFICIENT_SECOND_HALF_GOAL_EVIDENCE');
  }
  add(candidates, MARKETS.SECOND_HALF_OVER_1_5, shOver15Score,
    ['Two-goal second halves repeat across overall, venue and recent samples'],
    shOver15Warnings,
    false,
    { conservativeSecondHalfOver15Floor: shOver15Core, combinedSecondHalfAverageGoals: shAvgGoals });

  const bothHalvesCore = minFinite([
    home.goalsBothHalvesRate,
    away.goalsBothHalvesRate,
    home.venueGoalsBothHalvesRate,
    away.venueGoalsBothHalvesRate,
    home.recentGoalsBothHalvesRate,
    away.recentGoalsBothHalvesRate
  ]);
  const bothHalvesSupportingFloor = minFinite([fhOver05Core, shOver05Core]);
  let bothHalvesScore = bothHalvesCore === null ? 0 : 12 + bothHalvesCore * 90;
  if (bothHalvesSupportingFloor !== null) bothHalvesScore += bothHalvesSupportingFloor * 8;
  const bothHalvesWarnings = [];
  if (bothHalvesCore === null || bothHalvesSupportingFloor === null) bothHalvesWarnings.push('DIRECT_HALF_GOAL_DATA_REQUIRED');
  else if (bothHalvesCore < config.goalsBothHalvesStrong || bothHalvesSupportingFloor < 0.70) {
    bothHalvesWarnings.push('INSUFFICIENT_BOTH_HALVES_EVIDENCE');
  }
  add(candidates, MARKETS.GOALS_BOTH_HALVES, bothHalvesScore,
    ['Goals in each half repeat across overall, venue and recent samples, with both half totals independently confirmed'],
    bothHalvesWarnings,
    false,
    { conservativeGoalsBothHalvesFloor: bothHalvesCore, supportingHalfGoalFloor: bothHalvesSupportingFloor });

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
