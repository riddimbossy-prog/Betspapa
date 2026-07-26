import { CLASSIFICATIONS } from './constants.js';

function avg(values) {
  const present = values.filter((value) => Number.isFinite(value));
  return present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
}

function maxRouteSide(homeRoute, awayRoute, homeSide = 'HOME', awaySide = 'AWAY') {
  if ((homeRoute?.adjusted || 0) === (awayRoute?.adjusted || 0)) return null;
  return (homeRoute?.adjusted || 0) > (awayRoute?.adjusted || 0) ? homeSide : awaySide;
}

function eventAssessment(type, selected, opponent, home, away) {
  const coverageReady = type === 'TWO_WAY_INSTABILITY'
    ? home.eventDataReady && away.eventDataReady
    : selected?.eventDataReady && opponent?.eventDataReady;

  if (!coverageReady) {
    return {
      eventConfirmation: false,
      eventCoverageReady: false,
      warnings: ['EVENT_DETAIL_PARTIAL']
    };
  }

  let confirmed = false;
  if (type === 'FULL_REVERSAL') {
    confirmed = (selected.goalsWhileTrailing > 0 || selected.equalisersScored > 0) &&
      opponent.leadsSurrendered > 0;
  } else if (type === 'LEAD_SURRENDER') {
    confirmed = selected.equalisersScored > 0 && opponent.leadsSurrendered > 0;
  } else if (type === 'LATE_SEPARATION') {
    const selectedLateGoals = selected.minute46To60For + selected.minute61To75For + selected.minute76To90For;
    confirmed = selectedLateGoals > 0;
  } else if (type === 'TWO_WAY_INSTABILITY') {
    const homeSwingEvents = home.goalsWhileTrailing + home.equalisersScored + home.leadsSurrendered;
    const awaySwingEvents = away.goalsWhileTrailing + away.equalisersScored + away.leadsSurrendered;
    confirmed = homeSwingEvents > 0 && awaySwingEvents > 0;
  }

  return {
    eventConfirmation: confirmed,
    eventCoverageReady: true,
    warnings: confirmed ? [] : ['EVENT_DETAIL_NOT_CONFIRMED']
  };
}

function swingPicture(home, away, routes, config, highEvent) {
  const combinedSecondHalfOver05 = avg([home.secondHalfOver05Rate, away.secondHalfOver05Rate]);
  const combinedSecondHalfOver15 = avg([home.secondHalfOver15Rate, away.secondHalfOver15Rate]);
  const combinedGoalsBothHalves = avg([home.goalsBothHalvesRate, away.goalsBothHalvesRate]);
  const combinedSecondHalfGoalShare = avg([home.secondHalfGoalShare, away.secondHalfGoalShare]);
  const halfDataReady = [
    home.secondHalfOver05Rate,
    away.secondHalfOver05Rate,
    home.secondHalfScoringRate,
    away.secondHalfScoringRate,
    home.secondHalfConcedingRate,
    away.secondHalfConcedingRate
  ].every(Number.isFinite);

  const homeReversal = routes.homeLW;
  const awayReversal = routes.awayLW;
  const homeRecoveryDraw = routes.awayWD; // away led/drew; home trailed/drew
  const awayRecoveryDraw = routes.homeWD; // home led/drew; away trailed/drew
  const homeLate = routes.homeDW;
  const awayLate = routes.awayDW;

  const reversalPresent = Math.max(homeReversal.bottleneckCount, awayReversal.bottleneckCount) >= config.matchedSwingCountMinimum;
  const fullReversalStrong = Math.max(homeReversal.bottleneckCount, awayReversal.bottleneckCount) >= config.matchedReversalCountStrong ||
    Math.max(homeReversal.adjusted, awayReversal.adjusted) >= 0.08;
  const surrenderPresent = Math.max(homeRecoveryDraw.bottleneckCount, awayRecoveryDraw.bottleneckCount) >= config.matchedSwingCountMinimum;
  const latePresent = Math.max(homeLate.bottleneckCount, awayLate.bottleneckCount) >= config.matchedSwingCountMinimum;
  const twoWayRouteCount = [
    homeReversal.adjusted >= 0.05,
    awayReversal.adjusted >= 0.05,
    homeRecoveryDraw.adjusted >= 0.06,
    awayRecoveryDraw.adjusted >= 0.06,
    homeLate.adjusted >= 0.08,
    awayLate.adjusted >= 0.08
  ].filter(Boolean).length;

  const secondHalfActive = combinedSecondHalfOver05 !== null && combinedSecondHalfOver05 >= config.secondHalfActivityStrong;
  const secondHalfVeryOpen = combinedSecondHalfOver15 !== null && combinedSecondHalfOver15 >= config.secondHalfOver15Strong;

  if (halfDataReady && fullReversalStrong && secondHalfActive) {
    const side = maxRouteSide(homeReversal, awayReversal);
    const selected = side === 'HOME' ? home : away;
    const opponent = side === 'HOME' ? away : home;
    const attackConfirmed = selected?.secondHalfScoringRate >= config.secondHalfScoringStrong;
    const collapseConfirmed = opponent?.secondHalfConcedingRate >= config.secondHalfConcedingStrong;
    if (side && (attackConfirmed || collapseConfirmed)) {
      const event = eventAssessment('FULL_REVERSAL', selected, opponent, home, away);
      return {
        type: CLASSIFICATIONS.SWING_FULL_REVERSAL,
        side,
        swingType: 'FULL_REVERSAL',
        halfDataReady,
        combinedSecondHalfOver05,
        combinedSecondHalfOver15,
        combinedGoalsBothHalves,
        combinedSecondHalfGoalShare,
        ...event
      };
    }
  }

  if (halfDataReady && surrenderPresent && secondHalfActive) {
    const side = maxRouteSide(homeRecoveryDraw, awayRecoveryDraw, 'HOME', 'AWAY');
    const selected = side === 'HOME' ? home : away;
    const opponent = side === 'HOME' ? away : home;
    const recoveryConfirmed = selected?.secondHalfScoringRate >= config.secondHalfScoringStrong;
    const surrenderConfirmed = opponent?.secondHalfConcedingRate >= config.secondHalfConcedingStrong || opponent?.leadSurrenderRate >= 0.35;
    if (side && recoveryConfirmed && surrenderConfirmed) {
      const event = eventAssessment('LEAD_SURRENDER', selected, opponent, home, away);
      return {
        type: CLASSIFICATIONS.SWING_LEAD_SURRENDER,
        side,
        swingType: 'LEAD_SURRENDER',
        halfDataReady,
        combinedSecondHalfOver05,
        combinedSecondHalfOver15,
        combinedGoalsBothHalves,
        combinedSecondHalfGoalShare,
        ...event
      };
    }
  }

  if (halfDataReady && latePresent && secondHalfActive) {
    const side = maxRouteSide(homeLate, awayLate);
    const selected = side === 'HOME' ? home : away;
    const opponent = side === 'HOME' ? away : home;
    if (side && selected?.secondHalfScoringRate >= config.secondHalfScoringStrong &&
        opponent?.secondHalfConcedingRate >= config.secondHalfConcedingStrong) {
      const event = eventAssessment('LATE_SEPARATION', selected, opponent, home, away);
      return {
        type: CLASSIFICATIONS.SWING_LATE_SEPARATION,
        side,
        swingType: 'LATE_SEPARATION',
        halfDataReady,
        combinedSecondHalfOver05,
        combinedSecondHalfOver15,
        combinedGoalsBothHalves,
        combinedSecondHalfGoalShare,
        ...event
      };
    }
  }

  if (halfDataReady && twoWayRouteCount >= 3 && secondHalfActive && (highEvent || secondHalfVeryOpen)) {
    const event = eventAssessment('TWO_WAY_INSTABILITY', null, null, home, away);
    return {
      type: CLASSIFICATIONS.SWING_TWO_WAY_INSTABILITY,
      side: null,
      swingType: 'TWO_WAY_INSTABILITY',
      halfDataReady,
      combinedSecondHalfOver05,
      combinedSecondHalfOver15,
      combinedGoalsBothHalves,
      combinedSecondHalfGoalShare,
      ...event,
      warnings: ['DIRECTIONAL_CONFLICT', ...event.warnings]
    };
  }

  if ((reversalPresent || surrenderPresent || latePresent) && halfDataReady && !secondHalfActive) {
    return {
      type: CLASSIFICATIONS.SWING_FALSE_SIGNAL,
      side: null,
      swingType: 'FALSE_SWING',
      halfDataReady,
      combinedSecondHalfOver05,
      combinedSecondHalfOver15,
      combinedGoalsBothHalves,
      combinedSecondHalfGoalShare,
      eventConfirmation: false,
      warnings: ['HTFT_SWING_NOT_CONFIRMED_BY_HALF_GOALS']
    };
  }

  return null;
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

  const halfDataReady = [
    home.secondHalfOver05Rate,
    away.secondHalfOver05Rate,
    home.secondHalfScoringRate,
    away.secondHalfScoringRate,
    home.secondHalfConcedingRate,
    away.secondHalfConcedingRate
  ].every(Number.isFinite);
  const common = { combinedOver25, combinedUnder25, combinedAvgGoals };

  if (bothHighHtDraw && bothHighFtDraw && combinedUnder25 !== null && combinedUnder25 >= 0.62 &&
      routes.dd.adjusted >= 0.10) {
    return { type: CLASSIFICATIONS.DRAW_LOCK, side: null, ...common, warnings: [] };
  }

  const swing = swingPicture(home, away, routes, config, highEvent);
  if (swing) return { ...common, ...swing };

  if (anyStrongReversal && !halfDataReady) {
    return {
      type: CLASSIFICATIONS.SWING_FALSE_SIGNAL,
      side: null,
      ...common,
      halfDataReady: false,
      eventConfirmation: false,
      warnings: ['HALF_GOAL_DATA_MISSING']
    };
  }

  if (homeWinningRoutes === 3 || awayWinningRoutes === 3) {
    return {
      type: CLASSIFICATIONS.MULTI_ROUTE_ADVANTAGE,
      side: homeWinningRoutes === 3 ? 'HOME' : 'AWAY',
      ...common,
      warnings: anyStrongReversal ? ['MATCHED_REVERSAL_PRESENT'] : []
    };
  }

  if (anyStrongReversal && highEvent) {
    return {
      type: CLASSIFICATIONS.SWING_FALSE_SIGNAL,
      side: null,
      ...common,
      halfDataReady,
      eventConfirmation: false,
      warnings: ['SWING_ROUTE_NOT_RESOLVED']
    };
  }

  const balancedLateRoutes = Math.abs(routes.homeDW.adjusted - routes.awayDW.adjusted) < 0.06;

  if (bothHighHtDraw && balancedLateRoutes && !anyStrongReversal && highEvent) {
    return {
      type: CLASSIFICATIONS.FALSE_OVER_TRAP,
      side: null,
      ...common,
      warnings: ['HISTORICAL_OVER_WITH_LOCKED_STRUCTURE']
    };
  }

  if (bothHighHtDraw && (strongHomeLate || strongAwayLate)) {
    const side = routes.homeDW.adjusted > routes.awayDW.adjusted ? 'HOME' : 'AWAY';
    return {
      type: CLASSIFICATIONS.LATE_SEPARATION,
      side,
      ...common,
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
      ...common,
      warnings: side === null ? ['DIRECTIONAL_CONFLICT'] : []
    };
  }

  if (strongHomeLead || strongAwayLead || strongHomeLate || strongAwayLate) {
    const homeScore = routes.homeWW.adjusted + routes.homeDW.adjusted;
    const awayScore = routes.awayWW.adjusted + routes.awayDW.adjusted;
    return {
      type: CLASSIFICATIONS.STABLE_LEADER,
      side: homeScore > awayScore ? 'HOME' : 'AWAY',
      ...common,
      warnings: Math.abs(homeScore - awayScore) < 0.08 ? ['DIRECTIONAL_CONFLICT'] : []
    };
  }

  if (combinedAvgGoals !== null && combinedAvgGoals <= 2.8 && !anyStrongReversal) {
    return { type: CLASSIFICATIONS.CONTROLLED_CORRIDOR, side: null, ...common, warnings: [] };
  }

  return {
    type: CLASSIFICATIONS.CONFLICT_NO_PICK,
    side: null,
    ...common,
    warnings: ['NO_CLEAR_SHARED_MARKET']
  };
}
