import { CLASSIFICATIONS, MARKETS } from './constants.js';

function add(candidates, market, score, reasons = [], warnings = [], fatal = false) {
  candidates.push({ market, score: Math.max(0, Math.min(100, Math.round(score))), reasons, warnings, fatal });
}

function teamMarket(side, homeMarket, awayMarket) {
  return side === 'HOME' ? homeMarket : awayMarket;
}

export function scoreMarkets({ home, away, routes, classification, oddsConflict, config }) {
  const candidates = [];
  const side = classification.side;
  const isHome = side === 'HOME';
  const selected = isHome ? home : away;
  const opponent = isHome ? away : home;
  const leadRoute = isHome ? routes.homeWW : routes.awayWW;
  const lateRoute = isHome ? routes.homeDW : routes.awayDW;
  const reversalRoute = isHome ? routes.homeLW : routes.awayLW;

  const teamEitherHalf = teamMarket(side, MARKETS.HOME_WIN_EITHER_HALF, MARKETS.AWAY_WIN_EITHER_HALF);
  const teamDnb = teamMarket(side, MARKETS.HOME_DNB, MARKETS.AWAY_DNB);
  const teamDc = teamMarket(side, MARKETS.HOME_DOUBLE_CHANCE, MARKETS.AWAY_DOUBLE_CHANCE);
  const teamOver05 = teamMarket(side, MARKETS.HOME_OVER_0_5, MARKETS.AWAY_OVER_0_5);

  const routeScore = (leadRoute?.adjusted ?? 0) * 100 + (lateRoute?.adjusted ?? 0) * 90 + (reversalRoute?.adjusted ?? 0) * 70;
  const selectedLeadSafety = selected ? selected.leadHoldRate : 0;
  const opponentComebackWeakness = opponent ? 1 - opponent.comebackSaveRate : 0;

  if (side) {
    let eitherHalfScore = 55 + routeScore * 0.65 + selectedLeadSafety * 12 + opponentComebackWeakness * 8;
    if (classification.type === CLASSIFICATIONS.MULTI_ROUTE_ADVANTAGE) eitherHalfScore += 12;
    if (classification.type === CLASSIFICATIONS.STABLE_LEADER) eitherHalfScore += 8;
    if (classification.type === CLASSIFICATIONS.LATE_SEPARATION) eitherHalfScore += 7;
    if (oddsConflict.conflict && config.requireVenueSplitForConflictedDirection && !selected.venue) eitherHalfScore -= 18;
    add(candidates, teamEitherHalf, eitherHalfScore,
      ['Compatible winning routes', 'Lead protection vs opponent comeback'],
      oddsConflict.conflict ? ['ODDS_DIRECTION_CONFLICT'] : []);

    add(candidates, teamDnb, eitherHalfScore - 6, ['Directional protection'], oddsConflict.conflict ? ['ODDS_DIRECTION_CONFLICT'] : []);
    add(candidates, teamDc, eitherHalfScore - 10, ['Directional protection with draw cover']);

    let teamGoalScore = 58 + Math.min(20, routeScore * 0.35);
    if (selected.goalsFor !== null && selected.matchesPlayed > 0 && selected.goalsFor / selected.matchesPlayed >= 1.2) teamGoalScore += 10;
    add(candidates, teamOver05, teamGoalScore, ['Winning routes support at least one team goal']);
  }

  const avgGoals = classification.combinedAvgGoals;
  const o25 = classification.combinedOver25;
  const u25 = classification.combinedUnder25;
  const matchedReversalStrong = Math.max(routes.homeLW.bottleneckCount, routes.awayLW.bottleneckCount) >= config.matchedReversalCountStrong;

  let over15Score = 55;
  if (avgGoals !== null) over15Score += Math.min(24, Math.max(0, (avgGoals - 1.6) * 14));
  if (o25 !== null) over15Score += o25 * 12;
  if ([CLASSIFICATIONS.HIGH_EVENT_EARLY_SEPARATION, CLASSIFICATIONS.SWING_GAME, CLASSIFICATIONS.MULTI_ROUTE_ADVANTAGE].includes(classification.type)) over15Score += 8;
  if (classification.type === CLASSIFICATIONS.FALSE_OVER_TRAP) over15Score -= 20;
  add(candidates, MARKETS.OVER_1_5, over15Score, ['Goal average', 'Match structure']);

  let over25Score = 42;
  if (o25 !== null) over25Score += o25 * 35;
  if (avgGoals !== null) over25Score += Math.max(0, (avgGoals - 2.3) * 12);
  if ([CLASSIFICATIONS.HIGH_EVENT_EARLY_SEPARATION, CLASSIFICATIONS.SWING_GAME].includes(classification.type)) over25Score += 10;
  if (classification.type === CLASSIFICATIONS.FALSE_OVER_TRAP) over25Score -= 24;
  if (classification.type === CLASSIFICATIONS.DRAW_LOCK) over25Score -= 18;
  add(candidates, MARKETS.OVER_2_5, over25Score, ['Aligned Over 2.5 profile', 'Structural capacity for goals']);

  let under35Score = 54;
  if (avgGoals !== null) under35Score += Math.max(0, (3.2 - avgGoals) * 12);
  if (u25 !== null) under35Score += u25 * 16;
  if ([CLASSIFICATIONS.DRAW_LOCK, CLASSIFICATIONS.CONTROLLED_CORRIDOR, CLASSIFICATIONS.FALSE_OVER_TRAP].includes(classification.type)) under35Score += 10;
  if (matchedReversalStrong) under35Score -= 25;
  if ([CLASSIFICATIONS.HIGH_EVENT_EARLY_SEPARATION, CLASSIFICATIONS.SWING_GAME, CLASSIFICATIONS.MULTI_ROUTE_ADVANTAGE].includes(classification.type)) under35Score -= 10;
  add(candidates, MARKETS.UNDER_3_5, under35Score, ['Goal ceiling', 'Volatility check'], matchedReversalStrong ? ['MATCHED_REVERSAL'] : []);

  let under25Score = 40;
  if (u25 !== null) under25Score += u25 * 42;
  if (avgGoals !== null) under25Score += Math.max(0, (2.4 - avgGoals) * 18);
  if (classification.type === CLASSIFICATIONS.DRAW_LOCK) under25Score += 10;
  if (matchedReversalStrong || classification.type === CLASSIFICATIONS.HIGH_EVENT_EARLY_SEPARATION) under25Score -= 22;
  add(candidates, MARKETS.UNDER_2_5, under25Score, ['Strong dual Under profile required']);

  const htDrawAvg = (home.htDrawRate + away.htDrawRate) / 2;
  let htDrawScore = 35 + htDrawAvg * 60;
  if (classification.type === CLASSIFICATIONS.DRAW_LOCK || classification.type === CLASSIFICATIONS.LATE_SEPARATION) htDrawScore += 8;
  if (classification.type === CLASSIFICATIONS.HIGH_EVENT_EARLY_SEPARATION) htDrawScore -= 16;
  add(candidates, MARKETS.HALF_TIME_DRAW, htDrawScore, ['Half-time draw frequency']);

  let ftDrawScore = 28 + ((home.ftDrawRate + away.ftDrawRate) / 2) * 80;
  if (classification.type === CLASSIFICATIONS.DRAW_LOCK) ftDrawScore += 12;
  if (side) ftDrawScore -= 10;
  add(candidates, MARKETS.FULL_TIME_DRAW, ftDrawScore, ['W/D + D/D + L/D tendency']);

  let fhUnder15Score = 45 + htDrawAvg * 35;
  if (classification.type === CLASSIFICATIONS.DRAW_LOCK || classification.type === CLASSIFICATIONS.FALSE_OVER_TRAP) fhUnder15Score += 8;
  if (classification.type === CLASSIFICATIONS.HIGH_EVENT_EARLY_SEPARATION) fhUnder15Score -= 14;
  add(candidates, MARKETS.FIRST_HALF_UNDER_1_5, fhUnder15Score,
      ['HT draw supports caution but does not prove 0-0'], ['DIRECT_1H_GOAL_DATA_RECOMMENDED']);

  let fhOver05Score = 40;
  if (classification.type === CLASSIFICATIONS.HIGH_EVENT_EARLY_SEPARATION) fhOver05Score += 22;
  if (home.htDrawRate < 0.25 && away.htDrawRate < 0.35) fhOver05Score += 8;
  add(candidates, MARKETS.FIRST_HALF_OVER_0_5, fhOver05Score,
      ['Early separation structure'], ['DIRECT_1H_GOAL_DATA_REQUIRED_FOR_BANKER']);

  const bothCanScore = home.goalsFor !== null && away.goalsFor !== null &&
    home.goalsFor / home.matchesPlayed >= 0.9 && away.goalsFor / away.matchesPlayed >= 0.9;
  let bttsScore = 44;
  if (bothCanScore) bttsScore += 18;
  if (avgGoals !== null) bttsScore += Math.max(0, (avgGoals - 2.2) * 8);
  if (classification.type === CLASSIFICATIONS.DRAW_LOCK) bttsScore -= 12;
  add(candidates, MARKETS.BTTS_YES, bttsScore,
      ['Requires separate scoring evidence'], bothCanScore ? [] : ['INSUFFICIENT_SCORING_EVIDENCE']);

  return candidates.sort((a, b) => b.score - a.score);
}
