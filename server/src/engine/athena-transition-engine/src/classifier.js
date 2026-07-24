import { CLASSIFICATIONS } from './constants.js';

function avg(values) {
  const present = values.filter(v => Number.isFinite(v));
  return present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
}

export function classifyMatch(home, away, routes, config) {
  const combinedOver25 = avg([home.over25Rate, away.over25Rate]);
  const combinedUnder25 = avg([home.under25Rate, away.under25Rate]);
  const combinedAvgGoals = avg([home.averageTotalGoals, away.averageTotalGoals]);
  const bothHighHtDraw = home.htDrawRate >= config.htDrawRateStrong && away.htDrawRate >= 0.40;
  const bothHighFtDraw = home.ftDrawRate >= config.drawRateStrong && away.ftDrawRate >= config.drawRateStrong;
  const highEvent = combinedOver25 !== null && combinedAvgGoals !== null &&
    combinedOver25 >= config.highEventOver25Rate && combinedAvgGoals >= config.highEventAverageGoals;

  const strongHomeLead = routes.homeWW.adjusted >= config.strongRouteRate;
  const strongAwayLead = routes.awayWW.adjusted >= config.strongRouteRate;
  const strongHomeLate = routes.homeDW.adjusted >= config.strongRouteRate;
  const strongAwayLate = routes.awayDW.adjusted >= config.strongRouteRate;

  const homeReversalStrong = routes.homeLW.bottleneckCount >= config.matchedReversalCountStrong;
  const awayReversalStrong = routes.awayLW.bottleneckCount >= config.matchedReversalCountStrong;
  const anyStrongReversal = homeReversalStrong || awayReversalStrong;

  const homeWinningRoutes = [strongHomeLead, strongHomeLate, routes.homeLW.adjusted >= 0.08].filter(Boolean).length;
  const awayWinningRoutes = [strongAwayLead, strongAwayLate, routes.awayLW.adjusted >= 0.08].filter(Boolean).length;

  if (homeWinningRoutes === 3 || awayWinningRoutes === 3) {
    return {
      type: CLASSIFICATIONS.MULTI_ROUTE_ADVANTAGE,
      side: homeWinningRoutes === 3 ? 'HOME' : 'AWAY',
      combinedOver25,
      combinedUnder25,
      combinedAvgGoals,
      warnings: anyStrongReversal ? ['MATCHED_REVERSAL_PRESENT'] : []
    };
  }

  if (anyStrongReversal && highEvent) {
    return {
      type: CLASSIFICATIONS.SWING_GAME,
      side: homeReversalStrong ? 'HOME' : 'AWAY',
      combinedOver25,
      combinedUnder25,
      combinedAvgGoals,
      warnings: ['HIGH_VOLATILITY']
    };
  }

  const noClearEarlyLeader = Math.abs(routes.homeWW.adjusted - routes.awayWW.adjusted) < 0.06;
  const balancedLateRoutes = Math.abs(routes.homeDW.adjusted - routes.awayDW.adjusted) < 0.06;

  if (bothHighHtDraw && bothHighFtDraw && combinedUnder25 !== null && combinedUnder25 >= 0.62 &&
      routes.dd.adjusted >= 0.10) {
    return {
      type: CLASSIFICATIONS.DRAW_LOCK,
      side: null,
      combinedOver25,
      combinedUnder25,
      combinedAvgGoals,
      warnings: []
    };
  }

  if (bothHighHtDraw && balancedLateRoutes && !anyStrongReversal && highEvent) {
    return {
      type: CLASSIFICATIONS.FALSE_OVER_TRAP,
      side: null,
      combinedOver25,
      combinedUnder25,
      combinedAvgGoals,
      warnings: ['HISTORICAL_OVER_WITH_LOCKED_STRUCTURE']
    };
  }

  if (bothHighHtDraw && (strongHomeLate || strongAwayLate)) {
    const side = routes.homeDW.adjusted > routes.awayDW.adjusted ? 'HOME' : 'AWAY';
    return {
      type: CLASSIFICATIONS.LATE_SEPARATION,
      side,
      combinedOver25,
      combinedUnder25,
      combinedAvgGoals,
      warnings: balancedLateRoutes ? ['BALANCED_LATE_ROUTES'] : []
    };
  }

  if (highEvent && (!bothHighHtDraw || strongHomeLead || strongAwayLead)) {
    let side = null;
    if (Math.abs(routes.homeWW.adjusted - routes.awayWW.adjusted) >= 0.06) {
      side = routes.homeWW.adjusted > routes.awayWW.adjusted ? 'HOME' : 'AWAY';
    }
    return {
      type: CLASSIFICATIONS.HIGH_EVENT_EARLY_SEPARATION,
      side,
      combinedOver25,
      combinedUnder25,
      combinedAvgGoals,
      warnings: side === null ? ['DIRECTIONAL_CONFLICT'] : []
    };
  }

  if (strongHomeLead || strongAwayLead || strongHomeLate || strongAwayLate) {
    const homeScore = routes.homeWW.adjusted + routes.homeDW.adjusted;
    const awayScore = routes.awayWW.adjusted + routes.awayDW.adjusted;
    return {
      type: CLASSIFICATIONS.STABLE_LEADER,
      side: homeScore > awayScore ? 'HOME' : 'AWAY',
      combinedOver25,
      combinedUnder25,
      combinedAvgGoals,
      warnings: Math.abs(homeScore - awayScore) < 0.08 ? ['DIRECTIONAL_CONFLICT'] : []
    };
  }

  if (combinedAvgGoals !== null && combinedAvgGoals <= 2.8 && !anyStrongReversal) {
    return {
      type: CLASSIFICATIONS.CONTROLLED_CORRIDOR,
      side: null,
      combinedOver25,
      combinedUnder25,
      combinedAvgGoals,
      warnings: []
    };
  }

  return {
    type: CLASSIFICATIONS.CONFLICT_NO_PICK,
    side: null,
    combinedOver25,
    combinedUnder25,
    combinedAvgGoals,
    warnings: ['NO_CLEAR_SHARED_MARKET']
  };
}
