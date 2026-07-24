function safeRate(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

export function deriveTeamMetrics(team, config) {
  const h = team.htft;
  const htLead = h.ww + h.wd + h.wl;
  const htDraw = h.dw + h.dd + h.dl;
  const htTrail = h.lw + h.ld + h.ll;
  const sampleFactor = Math.min(1, team.matchesPlayed / config.minMatchesForFullReliability);
  const goals = team.goals ?? {};

  return {
    name: team.name,
    matchesPlayed: team.matchesPlayed,
    htft: { ...h },
    htLead,
    htDraw,
    htTrail,
    leadWinRate: safeRate(h.ww, htLead),
    leadHoldRate: safeRate(h.ww + h.wd, htLead),
    leadCollapseRate: safeRate(h.wl, htLead),
    htDrawRate: safeRate(htDraw, team.matchesPlayed),
    drawToWinRate: safeRate(h.dw, htDraw),
    drawStaysDrawRate: safeRate(h.dd, htDraw),
    drawToLossRate: safeRate(h.dl, htDraw),
    comebackWinRate: safeRate(h.lw, htTrail),
    comebackSaveRate: safeRate(h.lw + h.ld, htTrail),
    stayLostRate: safeRate(h.ll, htTrail),
    ftDrawCount: h.wd + h.dd + h.ld,
    ftDrawRate: safeRate(h.wd + h.dd + h.ld, team.matchesPlayed),
    sampleFactor,
    over25Rate: goals.over25 === undefined ? null : safeRate(goals.over25, team.matchesPlayed),
    under25Rate: goals.under25 === undefined ? null : safeRate(goals.under25, team.matchesPlayed),
    averageTotalGoals: goals.averageTotalGoals ?? null,
    goalsFor: goals.goalsFor ?? null,
    goalsAgainst: goals.goalsAgainst ?? null,
    recentOver25: Array.isArray(goals.last5Over25) ? goals.last5Over25.filter(Boolean).length : null,
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
