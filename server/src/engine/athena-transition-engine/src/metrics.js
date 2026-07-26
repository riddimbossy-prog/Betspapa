function safeRate(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function goalRate(goals, countKey, rateKey, matches) {
  const explicit = finiteOrNull(goals?.[rateKey]);
  if (explicit !== null) return explicit;
  const count = finiteOrNull(goals?.[countKey]);
  return count === null ? null : safeRate(count, matches);
}

export function deriveTeamMetrics(team, config) {
  const h = team.htft;
  const htLead = h.ww + h.wd + h.wl;
  const htDraw = h.dw + h.dd + h.dl;
  const htTrail = h.lw + h.ld + h.ll;
  const sampleFactor = Math.min(1, team.matchesPlayed / config.minMatchesForFullReliability);
  const goals = team.goals ?? {};
  const matches = team.matchesPlayed;

  const firstHalfGoalsFor = finiteOrNull(goals.firstHalfGoalsFor);
  const firstHalfGoalsAgainst = finiteOrNull(goals.firstHalfGoalsAgainst);
  const secondHalfGoalsFor = finiteOrNull(goals.secondHalfGoalsFor);
  const secondHalfGoalsAgainst = finiteOrNull(goals.secondHalfGoalsAgainst);
  const totalHalfGoals = [firstHalfGoalsFor, firstHalfGoalsAgainst, secondHalfGoalsFor, secondHalfGoalsAgainst]
    .filter((value) => value !== null)
    .reduce((sum, value) => sum + value, 0);
  const secondHalfTotal = [secondHalfGoalsFor, secondHalfGoalsAgainst]
    .filter((value) => value !== null)
    .reduce((sum, value) => sum + value, 0);

  const eventCoverageMatches = finiteOrNull(goals.eventCoverageMatches) ?? 0;
  const eventCoverageDenominator = Math.max(
    1,
    Math.min(matches, Number(config.eventCoverageSampleTarget || matches || 1))
  );
  const eventCoverageRate = matches
    ? Math.min(1, eventCoverageMatches / eventCoverageDenominator)
    : 0;

  return {
    name: team.name,
    matchesPlayed: matches,
    htft: { ...h },
    htLead,
    htDraw,
    htTrail,
    leadWinRate: safeRate(h.ww, htLead),
    leadHoldRate: safeRate(h.ww + h.wd, htLead),
    leadCollapseRate: safeRate(h.wl, htLead),
    leadSurrenderRate: safeRate(h.wd + h.wl, htLead),
    htDrawRate: safeRate(htDraw, matches),
    drawToWinRate: safeRate(h.dw, htDraw),
    drawStaysDrawRate: safeRate(h.dd, htDraw),
    drawToLossRate: safeRate(h.dl, htDraw),
    comebackWinRate: safeRate(h.lw, htTrail),
    comebackSaveRate: safeRate(h.lw + h.ld, htTrail),
    stayLostRate: safeRate(h.ll, htTrail),
    ftDrawCount: h.wd + h.dd + h.ld,
    ftDrawRate: safeRate(h.wd + h.dd + h.ld, matches),
    sampleFactor,
    over25Rate: goals.over25 === undefined ? null : safeRate(goals.over25, matches),
    under25Rate: goals.under25 === undefined ? null : safeRate(goals.under25, matches),
    over15Rate: goalRate(goals, "over15", "over15Rate", matches),
    bttsRate: goalRate(goals, "btts", "bttsRate", matches),
    scoringRate: goalRate(goals, "scoredMatches", "scoringRate", matches),
    concedingRate: goalRate(goals, "concededMatches", "concedingRate", matches),
    failedToScoreRate: goalRate(goals, "failedToScoreMatches", "failedToScoreRate", matches),
    cleanSheetRate: goalRate(goals, "cleanSheetMatches", "cleanSheetRate", matches),
    averageTotalGoals: goals.averageTotalGoals ?? null,
    goalsFor: goals.goalsFor ?? null,
    goalsAgainst: goals.goalsAgainst ?? null,
    recentOver25: Array.isArray(goals.last5Over25) ? goals.last5Over25.filter(Boolean).length : null,

    firstHalfGoalsFor,
    firstHalfGoalsAgainst,
    secondHalfGoalsFor,
    secondHalfGoalsAgainst,
    firstHalfGoalsForPerMatch: firstHalfGoalsFor === null ? null : safeRate(firstHalfGoalsFor, matches),
    firstHalfGoalsAgainstPerMatch: firstHalfGoalsAgainst === null ? null : safeRate(firstHalfGoalsAgainst, matches),
    secondHalfGoalsForPerMatch: secondHalfGoalsFor === null ? null : safeRate(secondHalfGoalsFor, matches),
    secondHalfGoalsAgainstPerMatch: secondHalfGoalsAgainst === null ? null : safeRate(secondHalfGoalsAgainst, matches),
    firstHalfScoringRate: goalRate(goals, "firstHalfScoringMatches", "firstHalfScoringRate", matches),
    firstHalfConcedingRate: goalRate(goals, "firstHalfConcedingMatches", "firstHalfConcedingRate", matches),
    secondHalfScoringRate: goalRate(goals, "secondHalfScoringMatches", "secondHalfScoringRate", matches),
    secondHalfConcedingRate: goalRate(goals, "secondHalfConcedingMatches", "secondHalfConcedingRate", matches),
    firstHalfOver05Rate: goalRate(goals, "firstHalfOver05", "firstHalfOver05Rate", matches),
    firstHalfOver15Rate: goalRate(goals, "firstHalfOver15", "firstHalfOver15Rate", matches),
    secondHalfOver05Rate: goalRate(goals, "secondHalfOver05", "secondHalfOver05Rate", matches),
    secondHalfOver15Rate: goalRate(goals, "secondHalfOver15", "secondHalfOver15Rate", matches),
    scoredBothHalvesRate: goalRate(goals, "scoredBothHalves", "scoredBothHalvesRate", matches),
    goalsBothHalvesRate: goalRate(goals, "goalsBothHalves", "goalsBothHalvesRate", matches),
    secondHalfWinRate: goalRate(goals, "secondHalfWins", "secondHalfWinRate", matches),
    secondHalfDrawRate: goalRate(goals, "secondHalfDraws", "secondHalfDrawRate", matches),
    secondHalfGoalShare: totalHalfGoals > 0 ? secondHalfTotal / totalHalfGoals : null,

    eventCoverageMatches,
    eventCoverageDenominator,
    eventCoverageRate,
    eventDataReady: eventCoverageRate >= config.eventCoverageRequired,
    goalsWhileTrailing: finiteOrNull(goals.goalsWhileTrailing) ?? 0,
    equalisersScored: finiteOrNull(goals.equalisersScored) ?? 0,
    winningGoalsAfterEqualising: finiteOrNull(goals.winningGoalsAfterEqualising) ?? 0,
    leadsSurrendered: finiteOrNull(goals.leadsSurrendered) ?? 0,
    minute46To60For: finiteOrNull(goals.minute46To60For) ?? 0,
    minute61To75For: finiteOrNull(goals.minute61To75For) ?? 0,
    minute76To90For: finiteOrNull(goals.minute76To90For) ?? 0,

    venue: team.venue ?? null,
    raw: team
  };
}

export function routeSupport(aCount, aDenom, bCount, bDenom, sampleFactor = 1) {
  const aRate = safeRate(aCount, aDenom);
  const bRate = safeRate(bCount, bDenom);
  return {
    aRate,
    bRate,
    raw: Math.min(aRate, bRate),
    adjusted: Math.min(aRate, bRate) * sampleFactor,
    bottleneckCount: Math.min(aCount, bCount)
  };
}

export function buildCompatibleRoutes(home, away) {
  const reliability = Math.min(home.sampleFactor, away.sampleFactor);
  const H = home.htft;
  const A = away.htft;

  return {
    homeWW: routeSupport(H.ww, home.matchesPlayed, A.ll, away.matchesPlayed, reliability),
    homeWD: routeSupport(H.wd, home.matchesPlayed, A.ld, away.matchesPlayed, reliability),
    homeWL: routeSupport(H.wl, home.matchesPlayed, A.lw, away.matchesPlayed, reliability),
    homeDW: routeSupport(H.dw, home.matchesPlayed, A.dl, away.matchesPlayed, reliability),
    dd: routeSupport(H.dd, home.matchesPlayed, A.dd, away.matchesPlayed, reliability),
    awayDW: routeSupport(A.dw, away.matchesPlayed, H.dl, home.matchesPlayed, reliability),
    awayWW: routeSupport(A.ww, away.matchesPlayed, H.ll, home.matchesPlayed, reliability),
    awayWD: routeSupport(A.wd, away.matchesPlayed, H.ld, home.matchesPlayed, reliability),
    awayWL: routeSupport(A.wl, away.matchesPlayed, H.lw, home.matchesPlayed, reliability),
    homeLW: routeSupport(H.lw, home.matchesPlayed, A.wl, away.matchesPlayed, reliability),
    awayLW: routeSupport(A.lw, away.matchesPlayed, H.wl, home.matchesPlayed, reliability)
  };
}
