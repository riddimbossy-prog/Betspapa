import {
  DEFAULT_LEAGUE_BASELINE,
  FALLBACK_FAMILIES,
  HTFT_CODE,
  MARKET_THRESHOLDS,
  OPPOSITE,
  PROFILE_WEIGHTS,
  TRANSITIONS
} from "./overhaulConstants.js";
import {
  clamp,
  geometricMean,
  normalizedWeights,
  round,
  safeRate,
  sum
} from "./utils.js";

const HOME_WIN_ROUTES = ["WW", "DW", "LW"];
const DRAW_ROUTES = ["WD", "DD", "LD"];
const AWAY_WIN_ROUTES = ["WL", "DL", "LL"];
const DECISIVE_ROUTES = [...HOME_WIN_ROUTES, ...AWAY_WIN_ROUTES];

function profileMatches(profile = {}) {
  if (Number.isFinite(profile.matches)) return Number(profile.matches);
  return sum(TRANSITIONS.map((key) => Number(profile[key]) || 0));
}

function smoothedProfile(profile = {}, baseline = DEFAULT_LEAGUE_BASELINE, strength = 6) {
  const matches = profileMatches(profile);
  const probabilities = {};

  for (const transition of TRANSITIONS) {
    const count = Number(profile[transition]) || 0;
    probabilities[transition] =
      (count + safeRate(baseline[transition], 1 / 9) * strength) /
      (matches + strength);
  }

  return { probabilities, matches };
}

function blendTeamProfile(team, leagueBaseline) {
  const venue = smoothedProfile(team.htft?.venue, leagueBaseline, 5);
  const overall = smoothedProfile(team.htft?.overall, leagueBaseline, 7);
  const recent = smoothedProfile(team.htft?.recent, leagueBaseline, 4);

  const rows = normalizedWeights([
    { key: "venue", value: venue, weight: PROFILE_WEIGHTS.venue, enabled: venue.matches > 0 },
    { key: "overall", value: overall, weight: PROFILE_WEIGHTS.overall, enabled: overall.matches > 0 },
    { key: "recent", value: recent, weight: PROFILE_WEIGHTS.recent, enabled: recent.matches > 0 },
    {
      key: "league",
      value: { probabilities: leagueBaseline, matches: 999 },
      weight: PROFILE_WEIGHTS.league,
      enabled: true
    }
  ]);

  const probabilities = Object.fromEntries(TRANSITIONS.map((key) => [key, 0]));
  for (const row of rows) {
    for (const transition of TRANSITIONS) {
      probabilities[transition] +=
        row.value.probabilities[transition] * row.normalizedWeight;
    }
  }

  return {
    probabilities,
    samples: {
      venue: venue.matches,
      overall: overall.matches,
      recent: recent.matches
    },
    appliedWeights: Object.fromEntries(
      rows.map((row) => [row.key, round(row.normalizedWeight)])
    )
  };
}

function buildTransitionMatrix(homeProfile, awayProfile) {
  const raw = {};
  for (const transition of TRANSITIONS) {
    raw[transition] = geometricMean(
      homeProfile.probabilities[transition],
      awayProfile.probabilities[OPPOSITE[transition]]
    );
  }

  const total = sum(Object.values(raw)) || 1;
  const normalized = Object.fromEntries(
    TRANSITIONS.map((transition) => [transition, raw[transition] / total])
  );

  return { raw, normalized };
}

function metricBlock(team, scope) {
  return team.goals?.[scope] || {};
}

function blendGoalMetric(team, metric, fallback) {
  const rows = normalizedWeights([
    {
      value: safeRate(metricBlock(team, "venue")[metric], fallback),
      weight: 0.45,
      enabled: Number(metricBlock(team, "venue").matches) > 0
    },
    {
      value: safeRate(metricBlock(team, "recent")[metric], fallback),
      weight: 0.35,
      enabled: Number(metricBlock(team, "recent").matches) > 0
    },
    {
      value: safeRate(metricBlock(team, "overall")[metric], fallback),
      weight: 0.2,
      enabled: Number(metricBlock(team, "overall").matches) > 0
    }
  ]);

  if (!rows.length) return fallback;
  return clamp(sum(rows.map((row) => row.value * row.normalizedWeight)));
}

function goalProfile(team) {
  return {
    scoreRate: blendGoalMetric(team, "scoreRate", 0.62),
    concedeRate: blendGoalMetric(team, "concedeRate", 0.62),
    bttsRate: blendGoalMetric(team, "bttsRate", 0.5),
    over15Rate: blendGoalMetric(team, "over15Rate", 0.7),
    over25Rate: blendGoalMetric(team, "over25Rate", 0.5),
    under35Rate: blendGoalMetric(team, "under35Rate", 0.72),
    scored2PlusRate: blendGoalMetric(team, "scored2PlusRate", 0.38),
    conceded2PlusRate: blendGoalMetric(team, "conceded2PlusRate", 0.38),
    failedToScoreRate: blendGoalMetric(team, "failedToScoreRate", 0.32),
    cleanSheetRate: blendGoalMetric(team, "cleanSheetRate", 0.28),
    firstHalfScoringRate: blendGoalMetric(team, "firstHalfScoringRate", 0.42),
    secondHalfScoringRate: blendGoalMetric(team, "secondHalfScoringRate", 0.55)
  };
}

function routeMass(p, routes) {
  return sum(routes.map((route) => p[route]));
}

function routeBreadth(p, routes, meaningful = 0.055) {
  return clamp(routes.filter((route) => p[route] >= meaningful).length / routes.length);
}

function directProbabilities(matrix) {
  const p = matrix.normalized;
  const ft = {
    home: routeMass(p, HOME_WIN_ROUTES),
    draw: routeMass(p, DRAW_ROUTES),
    away: routeMass(p, AWAY_WIN_ROUTES)
  };
  const ht = {
    home: p.WW + p.WD + p.WL,
    draw: p.DW + p.DD + p.DL,
    away: p.LW + p.LD + p.LL
  };

  const homeEitherHalf = clamp(p.WW + p.WD + p.WL + p.DW + p.LW + p.LD);
  const awayEitherHalf = clamp(p.LW + p.LD + p.LL + p.WD + p.WL + p.DL);

  return {
    ft,
    ht,
    doubleChance: {
      homeOrDraw: ft.home + ft.draw,
      awayOrDraw: ft.away + ft.draw,
      noDraw: ft.home + ft.away
    },
    dnb: {
      home: ft.home / Math.max(0.0001, ft.home + ft.away),
      away: ft.away / Math.max(0.0001, ft.home + ft.away)
    },
    halfTimeDoubleChance: {
      homeOrDraw: ht.home + ht.draw,
      awayOrDraw: ht.away + ht.draw,
      noDraw: ht.home + ht.away
    },
    winEitherHalf: {
      home: homeEitherHalf,
      away: awayEitherHalf
    }
  };
}

function dataQuality(home, away, homeProfile, awayProfile) {
  const sampleScore = (samples) => {
    const overall = clamp(samples.overall / 14);
    const venue = clamp(samples.venue / 8);
    const recent = clamp(samples.recent / 6);
    return overall * 0.45 + venue * 0.35 + recent * 0.2;
  };

  const homeGoalMatches = Math.max(
    Number(home.goals?.venue?.matches) || 0,
    Number(home.goals?.overall?.matches) || 0
  );
  const awayGoalMatches = Math.max(
    Number(away.goals?.venue?.matches) || 0,
    Number(away.goals?.overall?.matches) || 0
  );

  const transitionScore = geometricMean(
    sampleScore(homeProfile.samples),
    sampleScore(awayProfile.samples)
  );
  const goalScore = geometricMean(
    clamp(homeGoalMatches / 10),
    clamp(awayGoalMatches / 10)
  );
  const score = clamp(transitionScore * 0.7 + goalScore * 0.3);

  return {
    score,
    label:
      score >= 0.82
        ? "Excellent"
        : score >= 0.68
          ? "Good"
          : score >= 0.52
            ? "Limited"
            : "Small sample",
    homeSamples: homeProfile.samples,
    awaySamples: awayProfile.samples
  };
}

function resultStructure(matrix, direct) {
  const p = matrix.normalized;
  const homeBreadth = routeBreadth(p, HOME_WIN_ROUTES);
  const awayBreadth = routeBreadth(p, AWAY_WIN_ROUTES);
  const decisiveBreadth = routeBreadth(p, DECISIVE_ROUTES, 0.045);
  const twoSideWinSupport = clamp(Math.min(direct.ft.home, direct.ft.away) / 0.28);
  const favouriteSide = direct.ft.home >= direct.ft.away ? "home" : "away";
  const favouriteMass = Math.max(direct.ft.home, direct.ft.away);
  const underdogMass = Math.min(direct.ft.home, direct.ft.away);

  return {
    homeBreadth,
    awayBreadth,
    decisiveBreadth,
    twoSideWinSupport,
    permanentDrawMass: p.DD,
    leadToDrawMass: p.WD + p.LD,
    drawToWinnerMass: p.DW + p.DL,
    fullReversalMass: p.WL + p.LW,
    stableMass: p.WW + p.DD + p.LL,
    favouriteSide,
    favouriteMass,
    underdogMass,
    favouriteGap: favouriteMass - Math.max(direct.ft.draw, underdogMass),
    homeWinRoutes: Object.fromEntries(HOME_WIN_ROUTES.map((route) => [route, p[route]])),
    drawRoutes: Object.fromEntries(DRAW_ROUTES.map((route) => [route, p[route]])),
    awayWinRoutes: Object.fromEntries(AWAY_WIN_ROUTES.map((route) => [route, p[route]]))
  };
}

function goalLogic(input, matrix, homeTeamProfile, awayTeamProfile, quality, direct, structure) {
  const p = matrix.normalized;
  const homeGoals = goalProfile(input.home);
  const awayGoals = goalProfile(input.away);
  const leagueGoals = input.league?.goals || {};

  const homeGoalSupport = geometricMean(homeGoals.scoreRate, awayGoals.concedeRate);
  const awayGoalSupport = geometricMean(awayGoals.scoreRate, homeGoals.concedeRate);
  const twoSidedGoalFloor = Math.min(homeGoalSupport, awayGoalSupport);
  const strongestGoalRoute = Math.max(homeGoalSupport, awayGoalSupport);
  const goalBalance = 1 - Math.abs(homeGoalSupport - awayGoalSupport);

  const latestGgAgreement = geometricMean(
    safeRate(input.home.goals?.recent?.bttsRate, homeGoals.bttsRate),
    safeRate(input.away.goals?.recent?.bttsRate, awayGoals.bttsRate)
  );
  const venueGgAgreement = geometricMean(
    safeRate(input.home.goals?.venue?.bttsRate, homeGoals.bttsRate),
    safeRate(input.away.goals?.venue?.bttsRate, awayGoals.bttsRate)
  );

  const forcedGgMass = p.WD + p.WL + p.LW + p.LD;
  const homeVolatility =
    homeTeamProfile.probabilities.WD +
    homeTeamProfile.probabilities.WL +
    homeTeamProfile.probabilities.LW +
    homeTeamProfile.probabilities.LD;
  const awayVolatility =
    awayTeamProfile.probabilities.WD +
    awayTeamProfile.probabilities.WL +
    awayTeamProfile.probabilities.LW +
    awayTeamProfile.probabilities.LD;
  const volatilitySpillover = geometricMean(homeVolatility, awayVolatility);
  const transitionGg = clamp(
    forcedGgMass * 0.62 +
      structure.drawToWinnerMass * 0.12 +
      structure.fullReversalMass * 0.18 +
      twoSidedGoalFloor * 0.08
  );

  const ggYes = clamp(
    twoSidedGoalFloor * 0.34 +
      transitionGg * 0.25 +
      latestGgAgreement * 0.2 +
      venueGgAgreement * 0.11 +
      safeRate(leagueGoals.bttsRate, 0.5) * 0.1
  );

  const homeShutoutSupport = geometricMean(
    homeGoals.cleanSheetRate,
    awayGoals.failedToScoreRate
  );
  const awayShutoutSupport = geometricMean(
    awayGoals.cleanSheetRate,
    homeGoals.failedToScoreRate
  );
  const strongestShutout = Math.max(homeShutoutSupport, awayShutoutSupport);
  const lowTwoSidedPressure = 1 - twoSidedGoalFloor;
  const ggNo = clamp(
    strongestShutout * 0.5 +
      lowTwoSidedPressure * 0.25 +
      (1 - forcedGgMass) * 0.15 +
      structure.stableMass * 0.1
  );

  const venueO15 = geometricMean(
    safeRate(input.home.goals?.venue?.over15Rate, homeGoals.over15Rate),
    safeRate(input.away.goals?.venue?.over15Rate, awayGoals.over15Rate)
  );
  const recentO15 = geometricMean(
    safeRate(input.home.goals?.recent?.over15Rate, homeGoals.over15Rate),
    safeRate(input.away.goals?.recent?.over15Rate, awayGoals.over15Rate)
  );
  const transitionO15 = clamp(
    forcedGgMass * 0.55 +
      structure.drawToWinnerMass * 0.2 +
      structure.fullReversalMass * 0.2 +
      (p.WW + p.LL) * 0.18 +
      p.DD * 0.08
  );
  const over15 = clamp(
    venueO15 * 0.29 +
      recentO15 * 0.24 +
      transitionO15 * 0.25 +
      strongestGoalRoute * 0.22
  );

  const venueU15 = geometricMean(
    1 - safeRate(input.home.goals?.venue?.over15Rate, homeGoals.over15Rate),
    1 - safeRate(input.away.goals?.venue?.over15Rate, awayGoals.over15Rate)
  );
  const recentU15 = geometricMean(
    1 - safeRate(input.home.goals?.recent?.over15Rate, homeGoals.over15Rate),
    1 - safeRate(input.away.goals?.recent?.over15Rate, awayGoals.over15Rate)
  );
  const lowScorePressure = clamp(
    geometricMean(homeGoals.failedToScoreRate, awayGoals.cleanSheetRate) * 0.25 +
      geometricMean(awayGoals.failedToScoreRate, homeGoals.cleanSheetRate) * 0.25 +
      (1 - strongestGoalRoute) * 0.25 +
      (1 - forcedGgMass) * 0.15 +
      p.DD * 0.1
  );
  const under15 = clamp(
    venueU15 * 0.3 +
      recentU15 * 0.25 +
      lowScorePressure * 0.28 +
      p.DD * 0.1 +
      (1 - structure.fullReversalMass) * 0.07
  );

  const favouriteSide = structure.favouriteSide;
  const favourite = favouriteSide === "home" ? homeGoals : awayGoals;
  const underdog = favouriteSide === "home" ? awayGoals : homeGoals;
  const favouriteGoalSupport = favouriteSide === "home" ? homeGoalSupport : awayGoalSupport;
  const favouriteRoute = favouriteSide === "home"
    ? p.WW + p.DW + p.LW * 0.5
    : p.LL + p.DL + p.WL * 0.5;
  const opponentRecovery = favouriteSide === "home"
    ? awayTeamProfile.probabilities.LW + awayTeamProfile.probabilities.LD
    : homeTeamProfile.probabilities.LW + homeTeamProfile.probabilities.LD;
  const noRecovery = 1 - opponentRecovery;
  const dominant2PlusSupport = geometricMean(
    favourite.scored2PlusRate,
    underdog.conceded2PlusRate
  );

  const home2PlusSupport = geometricMean(
    homeGoals.scored2PlusRate,
    awayGoals.conceded2PlusRate
  );
  const away2PlusSupport = geometricMean(
    awayGoals.scored2PlusRate,
    homeGoals.conceded2PlusRate
  );

  const homeOver15 = clamp(
    home2PlusSupport * 0.48 +
      homeGoalSupport * 0.28 +
      direct.ft.home * 0.14 +
      (1 - awayGoals.cleanSheetRate) * 0.1
  );
  const awayOver15 = clamp(
    away2PlusSupport * 0.48 +
      awayGoalSupport * 0.28 +
      direct.ft.away * 0.14 +
      (1 - homeGoals.cleanSheetRate) * 0.1
  );
  const homeUnder15 = clamp(
    (1 - home2PlusSupport) * 0.52 +
      (1 - homeGoalSupport) * 0.2 +
      awayGoals.cleanSheetRate * 0.14 +
      (1 - direct.ft.home) * 0.14
  );
  const awayUnder15 = clamp(
    (1 - away2PlusSupport) * 0.52 +
      (1 - awayGoalSupport) * 0.2 +
      homeGoals.cleanSheetRate * 0.14 +
      (1 - direct.ft.away) * 0.14
  );

  const transitionO25 = clamp(
    structure.fullReversalMass * 0.72 +
      structure.leadToDrawMass * 0.34 +
      structure.drawToWinnerMass * 0.28 +
      (p.WW + p.LL) * 0.18
  );
  const venueO25 = geometricMean(
    safeRate(input.home.goals?.venue?.over25Rate, homeGoals.over25Rate),
    safeRate(input.away.goals?.venue?.over25Rate, awayGoals.over25Rate)
  );
  const recentO25 = geometricMean(
    safeRate(input.home.goals?.recent?.over25Rate, homeGoals.over25Rate),
    safeRate(input.away.goals?.recent?.over25Rate, awayGoals.over25Rate)
  );
  const twoSidedO25Path = ggYes * Math.max(homeGoals.scored2PlusRate, awayGoals.scored2PlusRate);
  const oneSidedO25Path = dominant2PlusSupport * favouriteRoute;
  const over25 = clamp(
    transitionO25 * 0.28 +
      recentO25 * 0.22 +
      venueO25 * 0.2 +
      Math.max(twoSidedO25Path, oneSidedO25Path) * 0.3
  );

  const venueU25 = geometricMean(
    1 - safeRate(input.home.goals?.venue?.over25Rate, homeGoals.over25Rate),
    1 - safeRate(input.away.goals?.venue?.over25Rate, awayGoals.over25Rate)
  );
  const recentU25 = geometricMean(
    1 - safeRate(input.home.goals?.recent?.over25Rate, homeGoals.over25Rate),
    1 - safeRate(input.away.goals?.recent?.over25Rate, awayGoals.over25Rate)
  );
  const under25 = clamp(
    venueU25 * 0.34 +
      recentU25 * 0.28 +
      lowScorePressure * 0.14 +
      structure.stableMass * 0.12 +
      (1 - structure.fullReversalMass) * 0.12
  );

  const venueU35 = geometricMean(
    safeRate(input.home.goals?.venue?.under35Rate, homeGoals.under35Rate),
    safeRate(input.away.goals?.venue?.under35Rate, awayGoals.under35Rate)
  );
  const recentU35 = geometricMean(
    safeRate(input.home.goals?.recent?.under35Rate, homeGoals.under35Rate),
    safeRate(input.away.goals?.recent?.under35Rate, awayGoals.under35Rate)
  );
  const transitionCeiling = clamp(
    structure.stableMass * 0.62 +
      (structure.leadToDrawMass + structure.drawToWinnerMass) * 0.24 -
      structure.fullReversalMass * 0.72
  );
  const under35 = clamp(
    venueU35 * 0.38 +
      recentU35 * 0.29 +
      safeRate(leagueGoals.under35Rate, 0.72) * 0.14 +
      transitionCeiling * 0.19 -
      (dominant2PlusSupport >= 0.62 && favouriteRoute >= 0.48 ? 0.1 : 0)
  );
  const over35 = clamp(
    (1 - venueU35) * 0.34 +
      (1 - recentU35) * 0.29 +
      structure.fullReversalMass * 0.18 +
      geometricMean(home2PlusSupport, away2PlusSupport) * 0.19
  );

  const twoToThreeGoals = clamp(
    geometricMean(over15, under35) * 0.74 +
      geometricMean(under25, over25) * 0.08 +
      (1 - over35) * 0.1 +
      goalBalance * 0.08
  );

  const firstHalfOver05 = clamp(
    (1 - (1 - homeGoals.firstHalfScoringRate) * (1 - awayGoals.firstHalfScoringRate)) * 0.58 +
      (1 - direct.ht.draw) * 0.18 +
      strongestGoalRoute * 0.14 +
      (1 - p.DD) * 0.1
  );
  const secondHalfOver05 = clamp(
    (1 - (1 - homeGoals.secondHalfScoringRate) * (1 - awayGoals.secondHalfScoringRate)) * 0.6 +
      (structure.leadToDrawMass + structure.drawToWinnerMass + structure.fullReversalMass) * 0.22 +
      strongestGoalRoute * 0.18
  );

  const homeCleanSheet = clamp(
    homeShutoutSupport * 0.58 +
      (1 - awayGoalSupport) * 0.24 +
      (direct.ft.home + direct.ft.draw) * 0.1 +
      (1 - forcedGgMass) * 0.08
  );
  const awayCleanSheet = clamp(
    awayShutoutSupport * 0.58 +
      (1 - homeGoalSupport) * 0.24 +
      (direct.ft.away + direct.ft.draw) * 0.1 +
      (1 - forcedGgMass) * 0.08
  );

  const goalBreakingSupport = clamp(
    over15 * 0.38 +
      strongestGoalRoute * 0.28 +
      secondHalfOver05 * 0.18 +
      (1 - lowScorePressure) * 0.16
  );

  return {
    homeGoals,
    awayGoals,
    favouriteSide,
    metrics: {
      homeGoalSupport,
      awayGoalSupport,
      strongestGoalRoute,
      twoSidedGoalFloor,
      goalBalance,
      latestGgAgreement,
      venueGgAgreement,
      forcedGgMass,
      volatilitySpillover,
      homeShutoutSupport,
      awayShutoutSupport,
      lowScorePressure,
      venueO15,
      recentO15,
      venueO25,
      recentO25,
      venueU25,
      recentU25,
      venueU35,
      recentU35,
      favouriteRoute,
      noRecovery,
      dominant2PlusSupport,
      home2PlusSupport,
      away2PlusSupport,
      goalBreakingSupport,
      dataQuality: quality.score
    },
    scores: {
      ggYes,
      ggNo,
      over15,
      under15,
      over25,
      under25,
      over35,
      under35,
      twoToThreeGoals,
      homeOver05: homeGoalSupport,
      awayOver05: awayGoalSupport,
      homeOver15,
      awayOver15,
      homeUnder15,
      awayUnder15,
      firstHalfOver05,
      secondHalfOver05,
      homeCleanSheet,
      awayCleanSheet
    }
  };
}

function confidenceBand(score) {
  if (score >= 0.85) return "Elite";
  if (score >= 0.8) return "Strong";
  if (score >= 0.75) return "Qualified";
  if (score >= 0.7) return "Lean";
  if (score >= 0.62) return "Cautious";
  return "Low";
}

function qualityPenalty(quality, sensitivity = 1) {
  if (quality.score < 0.42) return 0.1 * sensitivity;
  if (quality.score < 0.52) return 0.075 * sensitivity;
  if (quality.score < 0.68) return 0.04 * sensitivity;
  return 0;
}

function makeMarket({
  key,
  family,
  market,
  selection,
  score,
  threshold,
  risk = 0,
  reasons = [],
  blockers = [],
  fallbackEligible = true,
  complexity = 0,
  evidence = {}
}) {
  const adjusted = clamp(score - risk - complexity);
  const qualified = adjusted >= threshold && blockers.length === 0;
  const blockerPenalty = Math.min(0.18, blockers.length * 0.04);

  return {
    key,
    family,
    market,
    selection,
    modelScore: round(score),
    safetyAdjustedScore: round(adjusted),
    threshold,
    thresholdGap: round(adjusted - threshold),
    blockerPenalty: round(blockerPenalty),
    qualified,
    directional: !qualified,
    fallbackEligible,
    tier: qualified ? confidenceBand(adjusted) : `Directional · ${confidenceBand(adjusted)}`,
    reasons,
    blockers,
    evidence
  };
}

function percentText(value) {
  return `${round(value * 100, 1)}%`;
}

function marketCandidates(input, matrix, direct, structure, goals, quality) {
  const p = matrix.normalized;
  const candidates = [];
  const generalPenalty = qualityPenalty(quality, 1);
  const precisionPenalty = qualityPenalty(quality, 1.25);
  const homeGoalEdge = clamp((goals.metrics.homeGoalSupport - goals.metrics.awayGoalSupport + 1) / 2);
  const awayGoalEdge = clamp((goals.metrics.awayGoalSupport - goals.metrics.homeGoalSupport + 1) / 2);

  const home1xScore = clamp(
    direct.doubleChance.homeOrDraw * 0.68 +
      structure.homeBreadth * 0.1 +
      goals.metrics.homeGoalSupport * 0.1 +
      (1 - direct.ft.away) * 0.12
  );
  const awayX2Score = clamp(
    direct.doubleChance.awayOrDraw * 0.68 +
      structure.awayBreadth * 0.1 +
      goals.metrics.awayGoalSupport * 0.1 +
      (1 - direct.ft.home) * 0.12
  );

  candidates.push(
    makeMarket({
      key: "home-1x",
      family: "Result Safety",
      market: "Double Chance",
      selection: `${input.home.name} or Draw (1X)`,
      score: home1xScore,
      threshold: MARKET_THRESHOLDS.doubleChance,
      risk: generalPenalty,
      blockers: [
        ...(direct.ft.away >= 0.38 ? [`Away-win mass is still ${percentText(direct.ft.away)}`] : []),
        ...(structure.awayBreadth >= 0.67 && goals.metrics.awayGoalSupport >= 0.68
          ? ["Away side owns several credible win routes"]
          : [])
      ],
      reasons: [
        `Home-or-draw transition mass is ${percentText(direct.doubleChance.homeOrDraw)}`,
        `Away-win mass is limited to ${percentText(direct.ft.away)}`,
        "Multiple home-protection routes agree"
      ],
      evidence: { homeOrDraw: direct.doubleChance.homeOrDraw, awayWin: direct.ft.away }
    }),
    makeMarket({
      key: "away-x2",
      family: "Result Safety",
      market: "Double Chance",
      selection: `${input.away.name} or Draw (X2)`,
      score: awayX2Score,
      threshold: MARKET_THRESHOLDS.doubleChance,
      risk: generalPenalty,
      blockers: [
        ...(direct.ft.home >= 0.38 ? [`Home-win mass is still ${percentText(direct.ft.home)}`] : []),
        ...(structure.homeBreadth >= 0.67 && goals.metrics.homeGoalSupport >= 0.68
          ? ["Home side owns several credible win routes"]
          : [])
      ],
      reasons: [
        `Away-or-draw transition mass is ${percentText(direct.doubleChance.awayOrDraw)}`,
        `Home-win mass is limited to ${percentText(direct.ft.home)}`,
        "Multiple away-protection routes agree"
      ],
      evidence: { awayOrDraw: direct.doubleChance.awayOrDraw, homeWin: direct.ft.home }
    })
  );

  const noDrawScore = clamp(
    direct.doubleChance.noDraw * 0.56 +
      structure.decisiveBreadth * 0.12 +
      structure.twoSideWinSupport * 0.1 +
      goals.metrics.goalBreakingSupport * 0.08 +
      (1 - structure.permanentDrawMass) * 0.07 +
      (1 - structure.leadToDrawMass) * 0.07
  );
  const meaningfulDecisiveRoutes = DECISIVE_ROUTES.filter((route) => p[route] >= 0.055).length;
  const oneSidedNoDraw = structure.underdogMass < 0.12 && direct.ft.draw >= structure.underdogMass + 0.06;

  candidates.push(
    makeMarket({
      key: "no-draw",
      family: "Result Safety",
      market: "Double Chance",
      selection: "Either Team to Win (12)",
      score: noDrawScore,
      threshold: MARKET_THRESHOLDS.noDraw,
      risk: generalPenalty,
      blockers: [
        ...(direct.ft.draw > 0.29 ? [`Draw-ending mass is too high at ${percentText(direct.ft.draw)}`] : []),
        ...(structure.permanentDrawMass > 0.2 ? [`X/X remains strong at ${percentText(structure.permanentDrawMass)}`] : []),
        ...(structure.leadToDrawMass > 0.19 ? ["Lead-to-draw routes are too active"] : []),
        ...(meaningfulDecisiveRoutes < 2 ? ["Too few independent win-ending routes"] : []),
        ...(oneSidedNoDraw ? ["The weaker side has too little outright-win support; favourite protection is safer"] : []),
        ...(goals.metrics.goalBreakingSupport < 0.55 && direct.ft.draw > 0.22
          ? ["Goal pressure may not be strong enough to break a draw"]
          : [])
      ],
      reasons: [
        `Six win-ending routes carry ${percentText(direct.doubleChance.noDraw)}`,
        `Three draw-ending routes carry ${percentText(direct.ft.draw)}`,
        `${meaningfulDecisiveRoutes} independent decisive routes remain meaningful`,
        `X/X is controlled at ${percentText(structure.permanentDrawMass)}`
      ],
      evidence: {
        homeWinMass: direct.ft.home,
        awayWinMass: direct.ft.away,
        drawMass: direct.ft.draw,
        permanentDrawMass: structure.permanentDrawMass,
        leadToDrawMass: structure.leadToDrawMass,
        decisiveBreadth: structure.decisiveBreadth,
        meaningfulDecisiveRoutes
      }
    })
  );

  for (const side of ["home", "away"]) {
    const opponent = side === "home" ? "away" : "home";
    const name = input[side].name;
    const winMass = direct.ft[side];
    const opponentWin = direct.ft[opponent];
    const dnb = direct.dnb[side];
    const breadth = side === "home" ? structure.homeBreadth : structure.awayBreadth;
    const goalEdge = side === "home" ? homeGoalEdge : awayGoalEdge;
    const dnbScore = clamp(
      dnb * 0.5 +
        winMass * 0.18 +
        breadth * 0.12 +
        goalEdge * 0.1 +
        (1 - direct.ft.draw) * 0.1
    );

    candidates.push(
      makeMarket({
        key: `${side}-dnb`,
        family: "Result Safety",
        market: "Draw No Bet",
        selection: `${name} DNB`,
        score: dnbScore,
        threshold: MARKET_THRESHOLDS.dnb,
        risk: generalPenalty,
        blockers: [
          ...(winMass <= opponentWin ? ["Selected side does not lead the opponent in outright-win mass"] : []),
          ...(winMass - opponentWin < 0.07 ? ["The decisive side gap is too narrow"] : []),
          ...(breadth < 0.34 ? ["Win support depends on one narrow route"] : [])
        ],
        reasons: [
          `${name} owns ${percentText(winMass)} full-time win mass`,
          `Draw-removed strength is ${percentText(dnb)}`,
          "The draw is refunded while the stronger side is retained"
        ],
        evidence: { winMass, opponentWin, drawMass: direct.ft.draw, breadth }
      })
    );
  }

  const ftRows = Object.entries(direct.ft).sort((a, b) => b[1] - a[1]);
  const ftGap = ftRows[0][1] - ftRows[1][1];
  for (const side of ["home", "away"]) {
    const opponent = side === "home" ? "away" : "home";
    const name = input[side].name;
    const winMass = direct.ft[side];
    const breadth = side === "home" ? structure.homeBreadth : structure.awayBreadth;
    const goalEdge = side === "home" ? homeGoalEdge : awayGoalEdge;
    const resultScore = clamp(
      winMass * 0.55 +
        clamp(ftGap / 0.25) * 0.15 +
        breadth * 0.12 +
        goalEdge * 0.1 +
        (1 - direct.ft.draw) * 0.08
    );

    candidates.push(
      makeMarket({
        key: `${side}-win`,
        family: "Match Result",
        market: "Full-Time Result",
        selection: `${name} Win`,
        score: resultScore,
        threshold: MARKET_THRESHOLDS.fullTimeWin,
        risk: precisionPenalty,
        fallbackEligible: false,
        complexity: 0.01,
        blockers: [
          ...(ftRows[0][0] !== side ? ["Selected team is not the leading full-time state"] : []),
          ...(winMass < 0.4 ? [`Outright-win mass is only ${percentText(winMass)}`] : []),
          ...(ftGap < 0.08 ? ["The leading result is not separated enough"] : []),
          ...(breadth < 0.34 ? ["Outright win relies on one route"] : [])
        ],
        reasons: [
          `${name} has the highest full-time mass at ${percentText(winMass)}`,
          `The result gap is ${percentText(ftGap)}`,
          "Several compatible HT/FT routes point to the same winner"
        ],
        evidence: { winMass, opponentWin: direct.ft[opponent], drawMass: direct.ft.draw, ftGap, breadth }
      })
    );
  }

  const drawScore = clamp(
    direct.ft.draw * 0.55 +
      structure.permanentDrawMass * 0.18 +
      structure.leadToDrawMass * 0.12 +
      goals.metrics.lowScorePressure * 0.1 +
      (1 - structure.decisiveBreadth) * 0.05
  );
  candidates.push(
    makeMarket({
      key: "ft-draw",
      family: "Match Result",
      market: "Full-Time Result",
      selection: "Draw",
      score: drawScore,
      threshold: MARKET_THRESHOLDS.fullTimeDraw,
      risk: precisionPenalty,
      fallbackEligible: false,
      complexity: 0.015,
      blockers: [
        ...(direct.ft.draw < 0.3 ? [`Draw mass is only ${percentText(direct.ft.draw)}`] : []),
        ...(structure.permanentDrawMass < 0.13 ? ["X/X is not strong enough"] : []),
        ...(goals.scores.over15 > 0.76 && structure.leadToDrawMass < 0.12
          ? ["Goal pressure is high without enough equalising routes"]
          : [])
      ],
      reasons: [
        `Draw-ending routes carry ${percentText(direct.ft.draw)}`,
        `X/X contributes ${percentText(structure.permanentDrawMass)}`,
        "Lead-to-draw behaviour supports a level finish"
      ],
      evidence: { drawMass: direct.ft.draw, permanentDrawMass: structure.permanentDrawMass }
    })
  );

  for (const side of ["home", "away"]) {
    const name = input[side].name;
    const opponent = side === "home" ? "away" : "home";
    const eitherHalf = direct.winEitherHalf[side];
    const goalSupport = side === "home" ? goals.metrics.homeGoalSupport : goals.metrics.awayGoalSupport;
    const opponentSupport = side === "home" ? goals.metrics.awayGoalSupport : goals.metrics.homeGoalSupport;
    const score = clamp(
      eitherHalf * 0.64 +
        goalSupport * 0.17 +
        (side === "home" ? structure.homeBreadth : structure.awayBreadth) * 0.11 +
        (1 - opponentSupport) * 0.08
    );

    candidates.push(
      makeMarket({
        key: `${side}-win-either-half`,
        family: "Special Result",
        market: "Win Either Half",
        selection: `${name} to Win Either Half`,
        score,
        threshold: MARKET_THRESHOLDS.winEitherHalf,
        risk: generalPenalty,
        blockers: [
          ...(eitherHalf < 0.58 ? ["Either-half transition support is too low"] : []),
          ...(goalSupport < 0.55 ? ["Selected team has weak scoring support"] : [])
        ],
        reasons: [
          `${name} wins at least one half in ${percentText(eitherHalf)} of compatible transition mass`,
          `Team scoring support is ${percentText(goalSupport)}`,
          "The selection can land through first-half control or a second-half response"
        ],
        evidence: { eitherHalf, goalSupport, opponentSupport }
      })
    );
  }

  const htRows = Object.entries(direct.ht).sort((a, b) => b[1] - a[1]);
  const htGap = htRows[0][1] - htRows[1][1];
  candidates.push(
    makeMarket({
      key: "ht-home-or-draw",
      family: "Half-Time",
      market: "Half-Time Double Chance",
      selection: `${input.home.name} or Draw at HT`,
      score: clamp(direct.halfTimeDoubleChance.homeOrDraw * 0.82 + (1 - direct.ht.away) * 0.18),
      threshold: MARKET_THRESHOLDS.halfTimeDoubleChance,
      risk: generalPenalty,
      blockers: direct.ht.away > 0.36 ? ["Away-leading first-half mass remains high"] : [],
      reasons: [
        `Home-or-draw at half-time carries ${percentText(direct.halfTimeDoubleChance.homeOrDraw)}`,
        "The home side is rarely behind across compatible first-half states"
      ],
      evidence: { homeOrDraw: direct.halfTimeDoubleChance.homeOrDraw, awayHt: direct.ht.away }
    }),
    makeMarket({
      key: "ht-away-or-draw",
      family: "Half-Time",
      market: "Half-Time Double Chance",
      selection: `${input.away.name} or Draw at HT`,
      score: clamp(direct.halfTimeDoubleChance.awayOrDraw * 0.82 + (1 - direct.ht.home) * 0.18),
      threshold: MARKET_THRESHOLDS.halfTimeDoubleChance,
      risk: generalPenalty,
      blockers: direct.ht.home > 0.36 ? ["Home-leading first-half mass remains high"] : [],
      reasons: [
        `Away-or-draw at half-time carries ${percentText(direct.halfTimeDoubleChance.awayOrDraw)}`,
        "The away side is rarely behind across compatible first-half states"
      ],
      evidence: { awayOrDraw: direct.halfTimeDoubleChance.awayOrDraw, homeHt: direct.ht.home }
    })
  );

  for (const state of ["home", "draw", "away"]) {
    const label = state === "home" ? `${input.home.name} at HT` : state === "away" ? `${input.away.name} at HT` : "Draw at HT";
    const goalModifier = state === "draw"
      ? 1 - goals.scores.firstHalfOver05 * 0.35
      : state === "home"
        ? goals.metrics.homeGoalSupport
        : goals.metrics.awayGoalSupport;
    const score = clamp(
      direct.ht[state] * 0.66 +
        clamp(htGap / 0.22) * 0.16 +
        goalModifier * 0.12 +
        quality.score * 0.06
    );

    candidates.push(
      makeMarket({
        key: `ht-${state}`,
        family: "Half-Time",
        market: "Half-Time Result",
        selection: label,
        score,
        threshold: MARKET_THRESHOLDS.halfTimeResult,
        risk: precisionPenalty,
        fallbackEligible: false,
        complexity: 0.015,
        blockers: [
          ...(htRows[0][0] !== state ? ["Selected state is not the leading half-time state"] : []),
          ...(htGap < 0.08 ? ["Half-time states are too close"] : [])
        ],
        reasons: [
          `${label} is the strongest half-time state at ${percentText(direct.ht[state])}`,
          `The first-half gap is ${percentText(htGap)}`
        ],
        evidence: { stateMass: direct.ht[state], htGap }
      })
    );
  }

  const exactRows = Object.entries(p)
    .map(([transition, probability]) => ({ transition, probability }))
    .sort((a, b) => b.probability - a.probability);
  const exactGap = exactRows[0].probability - exactRows[1].probability;
  candidates.push(
    makeMarket({
      key: "exact-htft",
      family: "Exact Story",
      market: "HT/FT",
      selection: HTFT_CODE[exactRows[0].transition],
      score: exactRows[0].probability,
      threshold: MARKET_THRESHOLDS.exactHtFt,
      risk: precisionPenalty,
      fallbackEligible: false,
      complexity: 0.045,
      blockers: [
        ...(exactGap < 0.065 ? ["Top two HT/FT stories are too close"] : []),
        ...(quality.score < 0.62 ? ["Sample is too small for an exact HT/FT call"] : [])
      ],
      reasons: [
        `${HTFT_CODE[exactRows[0].transition]} is the strongest compatible story`,
        `Its normalized mass is ${percentText(exactRows[0].probability)}`
      ],
      evidence: { transition: exactRows[0].transition, probability: exactRows[0].probability, exactGap }
    })
  );

  const ggYesBlockers = [
    ...(goals.metrics.homeGoalSupport < 0.58 ? [`${input.home.name} scoring support is weak`] : []),
    ...(goals.metrics.awayGoalSupport < 0.58 ? [`${input.away.name} scoring support is weak`] : []),
    ...(goals.metrics.latestGgAgreement < 0.5 ? ["Recent GG agreement is weak"] : []),
    ...(goals.homeGoals.failedToScoreRate > 0.43 ? [`${input.home.name} fails to score too often`] : []),
    ...(goals.awayGoals.failedToScoreRate > 0.43 ? [`${input.away.name} fails to score too often`] : [])
  ];
  candidates.push(
    makeMarket({
      key: "gg-yes",
      family: "Goal Participation",
      market: "Both Teams to Score",
      selection: "GG — Yes",
      score: goals.scores.ggYes,
      threshold: MARKET_THRESHOLDS.ggYes,
      risk: generalPenalty,
      blockers: ggYesBlockers,
      reasons: [
        `Home scoring support is ${percentText(goals.metrics.homeGoalSupport)}`,
        `Away scoring support is ${percentText(goals.metrics.awayGoalSupport)}`,
        `Both-scoring HT/FT routes carry ${percentText(goals.metrics.forcedGgMass)}`,
        "GG requires two independent scoring routes; one dominant team is not enough"
      ],
      evidence: {
        homeGoalSupport: goals.metrics.homeGoalSupport,
        awayGoalSupport: goals.metrics.awayGoalSupport,
        forcedGgMass: goals.metrics.forcedGgMass,
        latestGgAgreement: goals.metrics.latestGgAgreement
      }
    }),
    makeMarket({
      key: "gg-no",
      family: "Goal Participation",
      market: "Both Teams to Score",
      selection: "GG — No",
      score: goals.scores.ggNo,
      threshold: MARKET_THRESHOLDS.ggNo,
      risk: generalPenalty,
      blockers: [
        ...(goals.metrics.twoSidedGoalFloor > 0.66 ? ["Both teams retain credible scoring routes"] : []),
        ...(goals.metrics.forcedGgMass > 0.22 ? ["Equalisation and comeback routes force too much two-sided scoring"] : [])
      ],
      reasons: [
        `Strongest clean-sheet/blank route is ${percentText(Math.max(goals.metrics.homeShutoutSupport, goals.metrics.awayShutoutSupport))}`,
        `Two-sided scoring floor is ${percentText(goals.metrics.twoSidedGoalFloor)}`,
        "At least one team has a credible failed-to-score pathway"
      ],
      evidence: {
        homeShutoutSupport: goals.metrics.homeShutoutSupport,
        awayShutoutSupport: goals.metrics.awayShutoutSupport,
        twoSidedGoalFloor: goals.metrics.twoSidedGoalFloor
      }
    })
  );

  candidates.push(
    makeMarket({
      key: "over-15",
      family: "Total Goals",
      market: "Total Goals",
      selection: "Over 1.5",
      score: goals.scores.over15,
      threshold: MARKET_THRESHOLDS.over15,
      risk: generalPenalty,
      blockers: [
        ...(goals.metrics.venueO15 < 0.57 && goals.metrics.recentO15 < 0.57
          ? ["Venue and recent two-goal rates are both weak"]
          : []),
        ...(goals.metrics.lowScorePressure > 0.52 ? ["Low-score pressure is too high"] : [])
      ],
      reasons: [
        `Venue Over 1.5 agreement is ${percentText(goals.metrics.venueO15)}`,
        `Recent Over 1.5 agreement is ${percentText(goals.metrics.recentO15)}`,
        `Strongest one-team scoring route is ${percentText(goals.metrics.strongestGoalRoute)}`,
        "Over 1.5 can qualify through one team scoring twice; GG cannot"
      ],
      evidence: { venueO15: goals.metrics.venueO15, recentO15: goals.metrics.recentO15 }
    }),
    makeMarket({
      key: "under-15",
      family: "Total Goals",
      market: "Total Goals",
      selection: "Under 1.5",
      score: goals.scores.under15,
      threshold: MARKET_THRESHOLDS.under15,
      risk: precisionPenalty,
      blockers: [
        ...(goals.scores.over15 > 0.72 ? ["Two-goal evidence is already strong"] : []),
        ...(goals.metrics.strongestGoalRoute > 0.74 ? ["At least one team has high scoring support"] : []),
        ...(structure.fullReversalMass > 0.12 ? ["Complete reversal routes are too active"] : [])
      ],
      reasons: [
        `Low-score pressure is ${percentText(goals.metrics.lowScorePressure)}`,
        "Failed-to-score and clean-sheet routes support a 0–0, 1–0 or 0–1 corridor"
      ],
      evidence: { lowScorePressure: goals.metrics.lowScorePressure }
    }),
    makeMarket({
      key: "over-25",
      family: "Total Goals",
      market: "Total Goals",
      selection: "Over 2.5",
      score: goals.scores.over25,
      threshold: MARKET_THRESHOLDS.over25,
      risk: precisionPenalty,
      blockers: [
        ...(goals.metrics.dominant2PlusSupport < 0.48 && goals.scores.ggYes < 0.65
          ? ["Neither a two-sided nor one-sided three-goal route is strong enough"]
          : []),
        ...(goals.scores.under25 > goals.scores.over25 + 0.08 ? ["Under 2.5 evidence is materially stronger"] : [])
      ],
      reasons: [
        `Venue Over 2.5 agreement is ${percentText(goals.metrics.venueO25)}`,
        `Recent Over 2.5 agreement is ${percentText(goals.metrics.recentO25)}`,
        "Can qualify through GG plus 2+ potential or one-team dominance"
      ],
      evidence: { venueO25: goals.metrics.venueO25, recentO25: goals.metrics.recentO25 }
    }),
    makeMarket({
      key: "under-25",
      family: "Total Goals",
      market: "Total Goals",
      selection: "Under 2.5",
      score: goals.scores.under25,
      threshold: MARKET_THRESHOLDS.under25,
      risk: generalPenalty,
      blockers: [
        ...(goals.scores.over25 > goals.scores.under25 + 0.08 ? ["Over 2.5 evidence is materially stronger"] : []),
        ...(structure.fullReversalMass > 0.15 ? ["Comeback reversals create too much three-goal risk"] : [])
      ],
      reasons: [
        `Venue Under 2.5 agreement is ${percentText(goals.metrics.venueU25)}`,
        `Recent Under 2.5 agreement is ${percentText(goals.metrics.recentU25)}`,
        "Stable transitions and limited reversal routes support a low ceiling"
      ],
      evidence: { venueU25: goals.metrics.venueU25, recentU25: goals.metrics.recentU25 }
    }),
    makeMarket({
      key: "over-35",
      family: "Total Goals",
      market: "Total Goals",
      selection: "Over 3.5",
      score: goals.scores.over35,
      threshold: MARKET_THRESHOLDS.over35,
      risk: precisionPenalty,
      fallbackEligible: false,
      complexity: 0.02,
      blockers: [
        ...(goals.metrics.home2PlusSupport < 0.48 || goals.metrics.away2PlusSupport < 0.48
          ? ["Both teams do not have enough 2+ goal support"]
          : []),
        ...(goals.metrics.recentU35 > 0.62 ? ["Recent four-goal ceiling remains too strong"] : [])
      ],
      reasons: [
        "Requires weak Under 3.5 records plus genuine two-team 2+ goal potential",
        `Full-reversal mass is ${percentText(structure.fullReversalMass)}`
      ],
      evidence: { home2Plus: goals.metrics.home2PlusSupport, away2Plus: goals.metrics.away2PlusSupport }
    }),
    makeMarket({
      key: "under-35",
      family: "Total Goals",
      market: "Total Goals",
      selection: "Under 3.5",
      score: goals.scores.under35,
      threshold: MARKET_THRESHOLDS.under35,
      risk: generalPenalty,
      blockers: [
        ...(goals.metrics.dominant2PlusSupport >= 0.62 && goals.metrics.favouriteRoute >= 0.48
          ? ["Dominant favourite has a credible one-sided four-goal route"]
          : []),
        ...(structure.fullReversalMass > 0.15 ? ["Complete reversal risk is too high"] : [])
      ],
      reasons: [
        `Venue Under 3.5 agreement is ${percentText(goals.metrics.venueU35)}`,
        `Recent Under 3.5 agreement is ${percentText(goals.metrics.recentU35)}`,
        "Transition ceiling and goal records agree on a maximum of three goals"
      ],
      evidence: { venueU35: goals.metrics.venueU35, recentU35: goals.metrics.recentU35 }
    }),
    makeMarket({
      key: "total-2-3",
      family: "Total Goals",
      market: "Total Goals Range",
      selection: "2–3 Total Goals",
      score: goals.scores.twoToThreeGoals,
      threshold: MARKET_THRESHOLDS.twoToThreeGoals,
      risk: generalPenalty,
      blockers: [
        ...(goals.scores.over15 < 0.66 ? ["Two-goal floor is not secure enough"] : []),
        ...(goals.scores.under35 < 0.68 ? ["Four-goal ceiling is not secure enough"] : [])
      ],
      reasons: [
        "Over 1.5 and Under 3.5 agree on the same goal corridor",
        `Two-goal floor ${percentText(goals.scores.over15)}; four-goal ceiling ${percentText(goals.scores.under35)}`
      ],
      evidence: { over15: goals.scores.over15, under35: goals.scores.under35 }
    })
  );

  for (const side of ["home", "away"]) {
    const opponent = side === "home" ? "away" : "home";
    const name = input[side].name;
    const support = side === "home" ? goals.metrics.homeGoalSupport : goals.metrics.awayGoalSupport;
    const over15 = side === "home" ? goals.scores.homeOver15 : goals.scores.awayOver15;
    const under15 = side === "home" ? goals.scores.homeUnder15 : goals.scores.awayUnder15;
    const cleanSheetAgainst = side === "home" ? goals.awayGoals.cleanSheetRate : goals.homeGoals.cleanSheetRate;
    const failed = side === "home" ? goals.homeGoals.failedToScoreRate : goals.awayGoals.failedToScoreRate;
    const opponentGoalSupport = side === "home" ? goals.metrics.awayGoalSupport : goals.metrics.homeGoalSupport;
    const cleanSheet = side === "home" ? goals.scores.homeCleanSheet : goals.scores.awayCleanSheet;

    candidates.push(
      makeMarket({
        key: `${side}-over-05`,
        family: "Team Goals",
        market: "Team Goals",
        selection: `${name} Over 0.5`,
        score: support,
        threshold: MARKET_THRESHOLDS.teamOver05,
        risk: generalPenalty,
        blockers: [
          ...(failed > 0.44 ? [`${name} fails to score too often`] : []),
          ...(cleanSheetAgainst > 0.42 ? ["Opponent clean-sheet rate is too high"] : [])
        ],
        reasons: [
          `${name} scoring rate is matched against the opponent conceding rate`,
          `Resulting goal support is ${percentText(support)}`
        ],
        evidence: { support, failedToScoreRate: failed, opponentCleanSheetRate: cleanSheetAgainst }
      }),
      makeMarket({
        key: `${side}-over-15`,
        family: "Team Goals",
        market: "Team Goals",
        selection: `${name} Over 1.5`,
        score: over15,
        threshold: MARKET_THRESHOLDS.teamOver15,
        risk: precisionPenalty,
        blockers: [
          ...(support < 0.63 ? ["Basic scoring route is not secure enough"] : []),
          ...(over15 < goals.scores[`${side}Under15`] + 0.02 ? ["Team Under 1.5 is equally or more plausible"] : [])
        ],
        reasons: [
          "Team 2+ scoring and opponent 2+ conceding rates agree",
          `Two-goal team score is ${percentText(over15)}`
        ],
        evidence: { support, over15 }
      }),
      makeMarket({
        key: `${side}-under-15`,
        family: "Team Goals",
        market: "Team Goals",
        selection: `${name} Under 1.5`,
        score: under15,
        threshold: MARKET_THRESHOLDS.teamUnder15,
        risk: generalPenalty,
        blockers: [
          ...(over15 > under15 + 0.08 ? ["Team Over 1.5 evidence is materially stronger"] : [])
        ],
        reasons: [
          "Team 2+ scoring support is weak relative to the opponent defence",
          `Under 1.5 team score is ${percentText(under15)}`
        ],
        evidence: { under15, over15 }
      }),
      makeMarket({
        key: `${side}-clean-sheet`,
        family: "Clean Sheet",
        market: "Clean Sheet",
        selection: `${name} Clean Sheet — Yes`,
        score: cleanSheet,
        threshold: MARKET_THRESHOLDS.cleanSheet,
        risk: precisionPenalty,
        blockers: [
          ...(opponentGoalSupport > 0.62 ? ["Opponent retains credible scoring support"] : []),
          ...(goals.metrics.forcedGgMass > 0.2 ? ["Comeback/equalising transitions create BTTS risk"] : [])
        ],
        reasons: [
          "Selected team clean-sheet rate matches opponent failed-to-score rate",
          `Clean-sheet score is ${percentText(cleanSheet)}`
        ],
        evidence: { cleanSheet, opponentGoalSupport }
      })
    );
  }

  candidates.push(
    makeMarket({
      key: "first-half-over-05",
      family: "Half Goals",
      market: "First-Half Goals",
      selection: "First Half Over 0.5",
      score: goals.scores.firstHalfOver05,
      threshold: MARKET_THRESHOLDS.firstHalfOver05,
      risk: precisionPenalty,
      blockers: [
        ...(goals.homeGoals.firstHalfScoringRate < 0.35 && goals.awayGoals.firstHalfScoringRate < 0.35
          ? ["Both first-half scoring rates are weak"]
          : [])
      ],
      reasons: [
        "At least one team has a repeatable first-half scoring route",
        `First-half goal score is ${percentText(goals.scores.firstHalfOver05)}`
      ],
      evidence: {
        homeFirstHalfScoring: goals.homeGoals.firstHalfScoringRate,
        awayFirstHalfScoring: goals.awayGoals.firstHalfScoringRate
      }
    }),
    makeMarket({
      key: "second-half-over-05",
      family: "Half Goals",
      market: "Second-Half Goals",
      selection: "Second Half Over 0.5",
      score: goals.scores.secondHalfOver05,
      threshold: MARKET_THRESHOLDS.secondHalfOver05,
      risk: generalPenalty,
      blockers: [
        ...(goals.homeGoals.secondHalfScoringRate < 0.42 && goals.awayGoals.secondHalfScoringRate < 0.42
          ? ["Both second-half scoring rates are weak"]
          : [])
      ],
      reasons: [
        "Second-half scoring rates agree with comeback and lead-change routes",
        `Second-half goal score is ${percentText(goals.scores.secondHalfOver05)}`
      ],
      evidence: {
        homeSecondHalfScoring: goals.homeGoals.secondHalfScoringRate,
        awaySecondHalfScoring: goals.awayGoals.secondHalfScoringRate
      }
    })
  );

  return candidates;
}

function rankMarkets(candidates) {
  const familyPriority = {
    "Double Chance": 0.04,
    "Team Goals": 0.03,
    "Total Goals": 0.028,
    "Draw No Bet": 0.025,
    "Win Either Half": 0.022,
    "Total Goals Range": 0.018,
    "Both Teams to Score": 0.014,
    "Clean Sheet": 0.01,
    "Half Goals": 0.008,
    "Half-Time Double Chance": 0.006,
    "Full-Time Result": 0,
    "Half-Time Result": -0.02,
    "HT/FT": -0.075
  };

  return candidates
    .map((market) => {
      const priority = familyPriority[market.market] || 0;
      const fallbackBonus = market.fallbackEligible && FALLBACK_FAMILIES.has(market.market) ? 0.012 : 0;
      const directionalRankScore = clamp(
        market.safetyAdjustedScore + priority + fallbackBonus - market.blockerPenalty
      );

      return {
        ...market,
        rankScore: round(market.safetyAdjustedScore + priority),
        directionalRankScore: round(directionalRankScore)
      };
    })
    .sort((a, b) => {
      if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
      return b.directionalRankScore - a.directionalRankScore;
    });
}

function matchStory(input, matrix, direct, structure, goals) {
  const topTransitions = Object.entries(matrix.normalized)
    .map(([transition, probability]) => ({
      transition,
      code: HTFT_CODE[transition],
      probability: round(probability)
    }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 4);

  const htState = Object.entries(direct.ht).sort((a, b) => b[1] - a[1])[0][0];
  const ftState = Object.entries(direct.ft).sort((a, b) => b[1] - a[1])[0][0];
  const sideName = { home: input.home.name, draw: "Draw", away: input.away.name };

  let narrative = `${sideName[htState]} is the leading half-time state, while ${sideName[ftState]} is the strongest full-time direction.`;
  if (structure.fullReversalMass >= 0.12) {
    narrative += " Complete comeback routes raise goal and volatility risk.";
  } else if (structure.leadToDrawMass >= 0.16) {
    narrative += " Lead-surrender routes keep the draw relevant.";
  } else if (goals.metrics.favouriteRoute >= 0.48) {
    narrative += " One side owns a credible control route, so team-goal markets can outrank GG.";
  } else {
    narrative += " No exact transition is strong enough to replace the safer market families.";
  }

  return {
    topTransitions,
    likelyHalfTime: sideName[htState],
    likelyFullTime: sideName[ftState],
    narrative
  };
}

function marketFamilyComparison(rankedMarkets) {
  const map = new Map();
  for (const market of rankedMarkets) {
    if (!map.has(market.family)) map.set(market.family, market);
  }
  return [...map.entries()].map(([family, market]) => ({
    family,
    market: market.market,
    selection: market.selection,
    score: market.safetyAdjustedScore,
    threshold: market.threshold,
    qualified: market.qualified,
    tier: market.tier,
    reasons: market.reasons,
    blockers: market.blockers
  }));
}

function buildDecisionTrace({
  input,
  primary,
  supporting,
  rankedMarkets,
  matrix,
  direct,
  structure,
  goals,
  quality,
  homeProfile,
  awayProfile,
  story
}) {
  const topAlternatives = rankedMarkets
    .filter((market) => market.key !== primary.key)
    .slice(0, 6)
    .map((market) => ({
      key: market.key,
      family: market.family,
      market: market.market,
      selection: market.selection,
      score: market.safetyAdjustedScore,
      threshold: market.threshold,
      qualified: market.qualified,
      tier: market.tier,
      reasons: market.reasons,
      blockers: market.blockers
    }));

  const topProbability = Math.max(...Object.values(matrix.normalized));
  const allHtftIndicators = TRANSITIONS.map((transition) => {
    const homeRate = homeProfile.probabilities[transition];
    const awayOppositeRate = awayProfile.probabilities[OPPOSITE[transition]];
    const combined = matrix.normalized[transition];
    let interpretation = "Secondary transition";
    if (Math.abs(combined - topProbability) < 0.000001) interpretation = "Strongest compatible HT/FT route";
    else if (combined >= 0.14) interpretation = "Important supporting route";
    else if (combined <= 0.04) interpretation = "Weak route";

    return {
      transition,
      code: HTFT_CODE[transition],
      homeRate: round(homeRate),
      awayOppositeRate: round(awayOppositeRate),
      combinedProbability: round(combined),
      interpretation
    };
  });

  const thresholdStatus = primary.qualified
    ? `Passed the ${round(primary.threshold * 100, 1)}% market threshold.`
    : `Best available direction, but below the ${round(primary.threshold * 100, 1)}% strong-pick threshold.`;

  const whyChosen = [
    ...primary.reasons,
    `Model score: ${round(primary.modelScore * 100, 1)}%; safety-adjusted score: ${round(primary.safetyAdjustedScore * 100, 1)}%.`,
    thresholdStatus,
    `Leading half-time direction: ${story.likelyHalfTime}; leading full-time direction: ${story.likelyFullTime}.`,
    `Home goal support ${round(goals.metrics.homeGoalSupport * 100, 1)}% vs away goal support ${round(goals.metrics.awayGoalSupport * 100, 1)}%.`
  ];

  const cautions = [
    ...(primary.blockers || []),
    ...(quality.score < 0.52 ? ["Historical sample is small, so league smoothing has more influence."] : []),
    ...(!primary.qualified ? ["Directional only: this is not a banker or high-confidence call."] : [])
  ];

  return {
    mode: primary.qualified ? "qualified" : "directional",
    qualified: primary.qualified,
    headline: primary.qualified
      ? "Papa’s strongest qualified market"
      : "Papa’s best available direction",
    summary: `${primary.selection}. ${story.narrative}`,
    whyChosen,
    cautions,
    supportingPick: supporting
      ? {
          family: supporting.family,
          market: supporting.market,
          selection: supporting.selection,
          score: supporting.safetyAdjustedScore,
          qualified: supporting.qualified,
          tier: supporting.tier
        }
      : null,
    alternatives: topAlternatives,
    marketComparison: marketFamilyComparison(rankedMarkets),
    allHtftIndicators,
    directReadout: {
      fullTime: Object.fromEntries(Object.entries(direct.ft).map(([key, value]) => [key, round(value)])),
      halfTime: Object.fromEntries(Object.entries(direct.ht).map(([key, value]) => [key, round(value)])),
      doubleChance: Object.fromEntries(Object.entries(direct.doubleChance).map(([key, value]) => [key, round(value)])),
      drawNoBet: Object.fromEntries(Object.entries(direct.dnb).map(([key, value]) => [key, round(value)])),
      winEitherHalf: Object.fromEntries(Object.entries(direct.winEitherHalf).map(([key, value]) => [key, round(value)]))
    },
    resultStructure: Object.fromEntries(
      Object.entries(structure)
        .filter(([, value]) => typeof value === "number" || typeof value === "string")
        .map(([key, value]) => [key, typeof value === "number" ? round(value) : value])
    ),
    dataQuality: {
      score: round(quality.score),
      label: quality.label,
      homeSamples: quality.homeSamples,
      awaySamples: quality.awaySamples
    },
    goalReadout: Object.fromEntries(
      Object.entries(goals.scores).map(([key, value]) => [key, round(value)])
    )
  };
}

export function predictMatch(input) {
  if (!input?.home?.name || !input?.away?.name) {
    throw new Error("Both home.name and away.name are required.");
  }

  const leagueBaseline = {
    ...DEFAULT_LEAGUE_BASELINE,
    ...(input.league?.transitionBaseline || {})
  };
  const homeProfile = blendTeamProfile(input.home, leagueBaseline);
  const awayProfile = blendTeamProfile(input.away, leagueBaseline);
  const matrix = buildTransitionMatrix(homeProfile, awayProfile);
  const direct = directProbabilities(matrix);
  const structure = resultStructure(matrix, direct);
  const quality = dataQuality(input.home, input.away, homeProfile, awayProfile);
  const goals = goalLogic(input, matrix, homeProfile, awayProfile, quality, direct, structure);
  const candidates = marketCandidates(input, matrix, direct, structure, goals, quality);
  const rankedMarkets = rankMarkets(candidates);

  const qualifiedPrimary = rankedMarkets.find((market) => market.qualified) || null;
  const directionalPool = rankedMarkets.filter(
    (market) => market.fallbackEligible && FALLBACK_FAMILIES.has(market.market)
  );
  const primary = qualifiedPrimary || directionalPool[0] || rankedMarkets[0];
  const supporting = rankedMarkets.find(
    (market) =>
      market.key !== primary.key &&
      market.family !== primary.family &&
      (market.qualified || market.directionalRankScore >= 0.58)
  ) || null;

  const story = matchStory(input, matrix, direct, structure, goals);
  const decisionTrace = buildDecisionTrace({
    input,
    primary,
    supporting,
    rankedMarkets,
    matrix,
    direct,
    structure,
    goals,
    quality,
    homeProfile,
    awayProfile,
    story
  });

  return {
    fixtureId: input.fixtureId || null,
    competition: input.competition || "",
    kickoff: input.kickoff || null,
    home: input.home.name,
    away: input.away.name,
    generatedAt: new Date().toISOString(),
    dataQuality: {
      score: round(quality.score),
      label: quality.label,
      homeSamples: quality.homeSamples,
      awaySamples: quality.awaySamples
    },
    primaryPrediction: primary,
    supportingPrediction: supporting,
    noBet: false,
    qualified: primary.qualified,
    directionMode: primary.qualified ? "qualified" : "directional",
    decisionTrace,
    story,
    directProbabilities: {
      fullTime: Object.fromEntries(Object.entries(direct.ft).map(([key, value]) => [key, round(value)])),
      halfTime: Object.fromEntries(Object.entries(direct.ht).map(([key, value]) => [key, round(value)])),
      doubleChance: Object.fromEntries(Object.entries(direct.doubleChance).map(([key, value]) => [key, round(value)])),
      drawNoBet: Object.fromEntries(Object.entries(direct.dnb).map(([key, value]) => [key, round(value)])),
      winEitherHalf: Object.fromEntries(Object.entries(direct.winEitherHalf).map(([key, value]) => [key, round(value)]))
    },
    resultStructure: Object.fromEntries(
      Object.entries(structure)
        .filter(([, value]) => typeof value === "number" || typeof value === "string")
        .map(([key, value]) => [key, typeof value === "number" ? round(value) : value])
    ),
    transitionMatrix: Object.fromEntries(
      TRANSITIONS.map((transition) => [
        HTFT_CODE[transition],
        { transition, probability: round(matrix.normalized[transition]) }
      ])
    ),
    goalIntelligence: {
      metrics: Object.fromEntries(Object.entries(goals.metrics).map(([key, value]) => [key, round(value)])),
      scores: Object.fromEntries(Object.entries(goals.scores).map(([key, value]) => [key, round(value)])),
      favouriteSide: goals.favouriteSide
    },
    markets: rankedMarkets,
    safeguards: [
      "All nine HT/FT routes are matched to the opponent’s opposite perspective before any market is scored.",
      "Either Team to Win requires low draw mass, controlled X/X, several decisive routes and enough goal pressure to break a draw.",
      "GG requires two independent scoring routes; one dominant team cannot create GG alone.",
      "Over 1.5 may qualify through one team scoring twice and is therefore scored separately from GG.",
      "Under markets require venue, recent and transition-ceiling agreement rather than one raw percentage.",
      "Exact HT/FT, half-time result and Over 3.5 are never used as weak fallback directions.",
      "Every fixture receives one direction; only threshold-passing selections are labelled Qualified."
    ]
  };
}
