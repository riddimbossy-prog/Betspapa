import {
  DEFAULT_LEAGUE_BASELINE,
  HTFT_CODE,
  MARKET_THRESHOLDS,
  OPPOSITE,
  PROFILE_WEIGHTS,
  TRANSITIONS
} from "./constants.js";
import {
  clamp,
  geometricMean,
  normalizedWeights,
  round,
  safeRate,
  sum
} from "./utils.js";

function profileMatches(profile = {}) {
  if (Number.isFinite(profile.matches)) return Number(profile.matches);
  return sum(TRANSITIONS.map((key) => Number(profile[key]) || 0));
}

function smoothedProfile(profile = {}, baseline = DEFAULT_LEAGUE_BASELINE, strength = 6) {
  const matches = profileMatches(profile);
  const output = {};

  for (const transition of TRANSITIONS) {
    const count = Number(profile[transition]) || 0;
    output[transition] = (count + safeRate(baseline[transition], 1 / 9) * strength) / (matches + strength);
  }

  return { probabilities: output, matches };
}

function blendTeamProfile(team, leagueBaseline) {
  const venue = smoothedProfile(team.htft?.venue, leagueBaseline, 5);
  const overall = smoothedProfile(team.htft?.overall, leagueBaseline, 7);
  const recent = smoothedProfile(team.htft?.recent, leagueBaseline, 4);

  const weightRows = normalizedWeights([
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

  const blended = Object.fromEntries(TRANSITIONS.map((key) => [key, 0]));
  for (const row of weightRows) {
    for (const transition of TRANSITIONS) {
      blended[transition] += row.value.probabilities[transition] * row.normalizedWeight;
    }
  }

  return {
    probabilities: blended,
    samples: {
      venue: venue.matches,
      overall: overall.matches,
      recent: recent.matches
    },
    appliedWeights: Object.fromEntries(weightRows.map((row) => [row.key, round(row.normalizedWeight)]))
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
  const normalized = {};
  for (const transition of TRANSITIONS) {
    normalized[transition] = raw[transition] / total;
  }

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
    secondHalfScoringRate: blendGoalMetric(team, "secondHalfScoringRate", 0.55)
  };
}

function directProbabilities(matrix) {
  const p = matrix.normalized;
  const ft = {
    home: p.WW + p.DW + p.LW,
    draw: p.WD + p.DD + p.LD,
    away: p.WL + p.DL + p.LL
  };
  const ht = {
    home: p.WW + p.WD + p.WL,
    draw: p.DW + p.DD + p.DL,
    away: p.LW + p.LD + p.LL
  };

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

  const transitionScore = geometricMean(sampleScore(homeProfile.samples), sampleScore(awayProfile.samples));
  const goalScore = geometricMean(clamp(homeGoalMatches / 10), clamp(awayGoalMatches / 10));
  const score = clamp(transitionScore * 0.7 + goalScore * 0.3);

  return {
    score,
    label: score >= 0.82 ? "Excellent" : score >= 0.68 ? "Good" : score >= 0.52 ? "Limited" : "Small sample",
    homeSamples: homeProfile.samples,
    awaySamples: awayProfile.samples
  };
}

function goalLogic(input, matrix, homeTeamProfile, awayTeamProfile, quality) {
  const p = matrix.normalized;
  const homeGoals = goalProfile(input.home);
  const awayGoals = goalProfile(input.away);
  const leagueGoals = input.league?.goals || {};

  const homeGoalSupport = geometricMean(homeGoals.scoreRate, awayGoals.concedeRate);
  const awayGoalSupport = geometricMean(awayGoals.scoreRate, homeGoals.concedeRate);
  const twoSidedGoalFloor = Math.min(homeGoalSupport, awayGoalSupport);

  const latestGgAgreement = geometricMean(
    safeRate(input.home.goals?.recent?.bttsRate, homeGoals.bttsRate),
    safeRate(input.away.goals?.recent?.bttsRate, awayGoals.bttsRate)
  );
  const venueGgAgreement = geometricMean(
    safeRate(input.home.goals?.venue?.bttsRate, homeGoals.bttsRate),
    safeRate(input.away.goals?.venue?.bttsRate, awayGoals.bttsRate)
  );

  const forcedGgMass = p.WD + p.WL + p.LW + p.LD;
  const stableMass = p.WW + p.DD + p.LL;
  const extremeReversalMass = p.WL + p.LW;
  const moderateChangeMass = p.WD + p.DW + p.DL + p.LD;

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

  const transitionGgScore = clamp(
    forcedGgMass + (1 - forcedGgMass) * twoSidedGoalFloor * 0.35 + volatilitySpillover * 0.12
  );

  const ggYes = clamp(
    twoSidedGoalFloor * 0.35 +
      transitionGgScore * 0.25 +
      latestGgAgreement * 0.2 +
      venueGgAgreement * 0.1 +
      safeRate(leagueGoals.bttsRate, 0.5) * 0.1
  );

  const homeBlankSupport = geometricMean(homeGoals.failedToScoreRate, awayGoals.cleanSheetRate);
  const awayBlankSupport = geometricMean(awayGoals.failedToScoreRate, homeGoals.cleanSheetRate);
  const shutoutSupport = Math.max(homeBlankSupport, awayBlankSupport);
  const ggNo = clamp(shutoutSupport * 0.6 + (1 - twoSidedGoalFloor) * 0.25 + (1 - volatilitySpillover) * 0.15);

  const transitionO15 = clamp(
    forcedGgMass +
      0.4 * (p.DW + p.DL) +
      0.25 * (p.WW + p.LL) +
      0.2 * p.DD
  );
  const venueO15 = geometricMean(
    safeRate(input.home.goals?.venue?.over15Rate, homeGoals.over15Rate),
    safeRate(input.away.goals?.venue?.over15Rate, awayGoals.over15Rate)
  );
  const recentO15 = geometricMean(
    safeRate(input.home.goals?.recent?.over15Rate, homeGoals.over15Rate),
    safeRate(input.away.goals?.recent?.over15Rate, awayGoals.over15Rate)
  );
  const over15 = clamp(
    transitionO15 * 0.32 +
      venueO15 * 0.28 +
      recentO15 * 0.22 +
      Math.max(homeGoalSupport, awayGoalSupport) * 0.18
  );

  const direct = directProbabilities(matrix);
  const favouriteSide = direct.ft.home >= direct.ft.away ? "home" : "away";
  const favourite = favouriteSide === "home" ? homeGoals : awayGoals;
  const underdog = favouriteSide === "home" ? awayGoals : homeGoals;
  const favouriteGoalSupport = favouriteSide === "home" ? homeGoalSupport : awayGoalSupport;
  const dominantRoute = favouriteSide === "home"
    ? p.WW + p.DW + p.LW * 0.5
    : p.LL + p.DL + p.WL * 0.5;
  const opponentRecovery = favouriteSide === "home"
    ? awayTeamProfile.probabilities.LW + awayTeamProfile.probabilities.LD
    : homeTeamProfile.probabilities.LW + homeTeamProfile.probabilities.LD;
  const noRecovery = 1 - opponentRecovery;
  const dominant2PlusSupport = geometricMean(favourite.scored2PlusRate, underdog.conceded2PlusRate);
  const teamOver15 = clamp(
    dominant2PlusSupport * 0.45 + favouriteGoalSupport * 0.3 + dominantRoute * 0.18 + noRecovery * 0.07
  );

  const transitionO25 = clamp(
    extremeReversalMass +
      0.45 * (p.WD + p.LD) +
      0.3 * (p.DW + p.DL) +
      0.2 * (p.WW + p.LL)
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
  const oneSidedO25Path = dominant2PlusSupport * dominantRoute;
  const over25 = clamp(
    transitionO25 * 0.28 +
      recentO25 * 0.23 +
      venueO25 * 0.2 +
      Math.max(twoSidedO25Path, oneSidedO25Path) * 0.29
  );

  const venueU35 = geometricMean(
    safeRate(input.home.goals?.venue?.under35Rate, homeGoals.under35Rate),
    safeRate(input.away.goals?.venue?.under35Rate, awayGoals.under35Rate)
  );
  const recentU35 = geometricMean(
    safeRate(input.home.goals?.recent?.under35Rate, homeGoals.under35Rate),
    safeRate(input.away.goals?.recent?.under35Rate, awayGoals.under35Rate)
  );
  const transitionCeiling = clamp(0.65 * stableMass + 0.35 * moderateChangeMass - 0.85 * extremeReversalMass);
  const dominantHighScorePenalty = dominant2PlusSupport >= 0.58 && dominantRoute >= 0.45 ? 0.12 : 0;
  const under35 = clamp(
    venueU35 * 0.4 +
      recentU35 * 0.3 +
      safeRate(leagueGoals.under35Rate, 0.72) * 0.15 +
      transitionCeiling * 0.15 -
      dominantHighScorePenalty
  );

  const corridor = ggYes >= 0.66 && over15 >= 0.69 && under35 >= 0.7 && over25 < 0.69;

  return {
    homeGoals,
    awayGoals,
    favouriteSide,
    metrics: {
      homeGoalSupport,
      awayGoalSupport,
      twoSidedGoalFloor,
      latestGgAgreement,
      venueGgAgreement,
      forcedGgMass,
      stableMass,
      extremeReversalMass,
      moderateChangeMass,
      volatilitySpillover,
      dominantRoute,
      noRecovery,
      dominant2PlusSupport,
      dataQuality: quality.score
    },
    scores: {
      ggYes,
      ggNo,
      over15,
      over25,
      under35,
      homeOver05: homeGoalSupport,
      awayOver05: awayGoalSupport,
      favouriteOver15: teamOver15
    },
    corridor
  };
}

function confidenceBand(score) {
  if (score >= 0.85) return "Elite";
  if (score >= 0.8) return "Strong";
  if (score >= 0.75) return "Qualified";
  if (score >= 0.7) return "Lean";
  return "No bet";
}

function makeMarket({ key, market, selection, score, threshold, risk = 0, reasons = [], blockers = [] }) {
  const adjusted = clamp(score - risk);
  const qualified = adjusted >= threshold && blockers.length === 0;
  return {
    key,
    market,
    selection,
    modelScore: round(score),
    safetyAdjustedScore: round(adjusted),
    threshold,
    qualified,
    tier: qualified ? confidenceBand(adjusted) : "Rejected",
    reasons,
    blockers
  };
}

function marketCandidates(input, matrix, direct, goals, quality) {
  const p = matrix.normalized;
  const candidates = [];
  const dataPenalty = quality.score < 0.52 ? 0.08 : quality.score < 0.68 ? 0.04 : 0;
  const ftSorted = Object.entries(direct.ft).sort((a, b) => b[1] - a[1]);
  const ftGap = ftSorted[0][1] - ftSorted[1][1];
  const htSorted = Object.entries(direct.ht).sort((a, b) => b[1] - a[1]);
  const htGap = htSorted[0][1] - htSorted[1][1];

  candidates.push(
    makeMarket({
      key: "home-1x",
      market: "Double Chance",
      selection: `${input.home.name} or Draw (1X)`,
      score: direct.doubleChance.homeOrDraw,
      threshold: MARKET_THRESHOLDS.doubleChance,
      risk: dataPenalty,
      reasons: ["Home-win and draw transition mass combined", "Protects against the main draw route"]
    }),
    makeMarket({
      key: "away-x2",
      market: "Double Chance",
      selection: `${input.away.name} or Draw (X2)`,
      score: direct.doubleChance.awayOrDraw,
      threshold: MARKET_THRESHOLDS.doubleChance,
      risk: dataPenalty,
      reasons: ["Away-win and draw transition mass combined", "Protects against the main draw route"]
    }),
    makeMarket({
      key: "no-draw",
      market: "Double Chance",
      selection: "Either Team to Win (12)",
      score: direct.doubleChance.noDraw,
      threshold: MARKET_THRESHOLDS.noDraw,
      risk: dataPenalty,
      reasons: ["Low normalized draw-transition mass"]
    }),
    makeMarket({
      key: "home-dnb",
      market: "Draw No Bet",
      selection: `${input.home.name} DNB`,
      score: direct.dnb.home,
      threshold: MARKET_THRESHOLDS.dnb,
      risk: dataPenalty + (direct.ft.home < direct.ft.draw ? 0.04 : 0),
      reasons: ["Home win routes remain stronger after removing the draw"]
    }),
    makeMarket({
      key: "away-dnb",
      market: "Draw No Bet",
      selection: `${input.away.name} DNB`,
      score: direct.dnb.away,
      threshold: MARKET_THRESHOLDS.dnb,
      risk: dataPenalty + (direct.ft.away < direct.ft.draw ? 0.04 : 0),
      reasons: ["Away win routes remain stronger after removing the draw"]
    })
  );

  candidates.push(
    makeMarket({
      key: "home-win",
      market: "Full-Time Result",
      selection: `${input.home.name} Win`,
      score: direct.ft.home,
      threshold: MARKET_THRESHOLDS.fullTimeWin,
      risk: dataPenalty,
      blockers: ftGap < 0.07 || direct.ft.home !== ftSorted[0][1] ? ["Full-time result is not separated enough"] : [],
      reasons: ["Multiple home-winning HT/FT routes contribute"]
    }),
    makeMarket({
      key: "away-win",
      market: "Full-Time Result",
      selection: `${input.away.name} Win`,
      score: direct.ft.away,
      threshold: MARKET_THRESHOLDS.fullTimeWin,
      risk: dataPenalty,
      blockers: ftGap < 0.07 || direct.ft.away !== ftSorted[0][1] ? ["Full-time result is not separated enough"] : [],
      reasons: ["Multiple away-winning HT/FT routes contribute"]
    })
  );

  candidates.push(
    makeMarket({
      key: "ht-home-or-draw",
      market: "Half-Time Double Chance",
      selection: `${input.home.name} or Draw at HT`,
      score: direct.halfTimeDoubleChance.homeOrDraw,
      threshold: MARKET_THRESHOLDS.halfTimeDoubleChance,
      risk: dataPenalty,
      reasons: ["Home side is rarely behind across compatible first-half states"]
    }),
    makeMarket({
      key: "ht-away-or-draw",
      market: "Half-Time Double Chance",
      selection: `${input.away.name} or Draw at HT`,
      score: direct.halfTimeDoubleChance.awayOrDraw,
      threshold: MARKET_THRESHOLDS.halfTimeDoubleChance,
      risk: dataPenalty,
      reasons: ["Away side is rarely behind across compatible first-half states"]
    }),
    makeMarket({
      key: "ht-home",
      market: "Half-Time Result",
      selection: `${input.home.name} at HT`,
      score: direct.ht.home,
      threshold: MARKET_THRESHOLDS.halfTimeResult,
      risk: dataPenalty,
      blockers: htGap < 0.07 || direct.ht.home !== htSorted[0][1] ? ["Half-time states are too close"] : [],
      reasons: ["Home-leading transition row is strongest"]
    }),
    makeMarket({
      key: "ht-draw",
      market: "Half-Time Result",
      selection: "Draw at HT",
      score: direct.ht.draw,
      threshold: MARKET_THRESHOLDS.halfTimeResult,
      risk: dataPenalty,
      blockers: htGap < 0.07 || direct.ht.draw !== htSorted[0][1] ? ["Half-time states are too close"] : [],
      reasons: ["Draw-at-half-time transition row is strongest"]
    }),
    makeMarket({
      key: "ht-away",
      market: "Half-Time Result",
      selection: `${input.away.name} at HT`,
      score: direct.ht.away,
      threshold: MARKET_THRESHOLDS.halfTimeResult,
      risk: dataPenalty,
      blockers: htGap < 0.07 || direct.ht.away !== htSorted[0][1] ? ["Half-time states are too close"] : [],
      reasons: ["Away-leading transition row is strongest"]
    })
  );

  const topExact = Object.entries(p)
    .map(([transition, probability]) => ({ transition, probability }))
    .sort((a, b) => b.probability - a.probability);
  const exactGap = topExact[0].probability - topExact[1].probability;
  const exactTransition = topExact[0].transition;
  candidates.push(
    makeMarket({
      key: "exact-htft",
      market: "HT/FT",
      selection: HTFT_CODE[exactTransition],
      score: topExact[0].probability,
      threshold: MARKET_THRESHOLDS.exactHtFt,
      risk: dataPenalty + 0.05,
      blockers: [
        ...(exactGap < 0.055 ? ["Top two HT/FT stories are too close"] : []),
        ...(quality.score < 0.58 ? ["Sample is too small for an exact HT/FT call"] : [])
      ],
      reasons: [`Strongest compatible transition: ${exactTransition}`]
    })
  );

  const ggBlockers = [];
  if (goals.metrics.homeGoalSupport < 0.58) ggBlockers.push(`${input.home.name} scoring route is weak`);
  if (goals.metrics.awayGoalSupport < 0.58) ggBlockers.push(`${input.away.name} scoring route is weak`);
  if (goals.metrics.latestGgAgreement < 0.5) ggBlockers.push("Latest GG agreement is weak");

  candidates.push(
    makeMarket({
      key: "gg-yes",
      market: "Both Teams to Score",
      selection: "GG — Yes",
      score: goals.scores.ggYes,
      threshold: MARKET_THRESHOLDS.ggYes,
      risk: dataPenalty,
      blockers: ggBlockers,
      reasons: [
        "Both teams have an independent scoring route",
        "Comeback and lead-surrender transitions add goal pressure"
      ]
    }),
    makeMarket({
      key: "gg-no",
      market: "Both Teams to Score",
      selection: "GG — No",
      score: goals.scores.ggNo,
      threshold: MARKET_THRESHOLDS.ggNo,
      risk: dataPenalty,
      blockers: goals.metrics.twoSidedGoalFloor > 0.66 ? ["Both teams retain credible scoring routes"] : [],
      reasons: ["At least one failed-to-score/clean-sheet pathway is strong"]
    }),
    makeMarket({
      key: "over-15",
      market: "Total Goals",
      selection: "Over 1.5",
      score: goals.scores.over15,
      threshold: MARKET_THRESHOLDS.over15,
      risk: dataPenalty,
      reasons: ["Transition changes and current scoring thresholds support two goals"]
    }),
    makeMarket({
      key: "over-25",
      market: "Total Goals",
      selection: "Over 2.5",
      score: goals.scores.over25,
      threshold: MARKET_THRESHOLDS.over25,
      risk: dataPenalty + 0.015,
      blockers: goals.metrics.dominant2PlusSupport < 0.48 && goals.scores.ggYes < 0.65
        ? ["Neither two-sided nor one-sided 3-goal route is strong enough"]
        : [],
      reasons: ["Can qualify through GG plus 2+ potential or one-team dominance"]
    }),
    makeMarket({
      key: "under-35",
      market: "Total Goals",
      selection: "Under 3.5",
      score: goals.scores.under35,
      threshold: MARKET_THRESHOLDS.under35,
      risk: dataPenalty,
      blockers: [
        ...(goals.metrics.dominant2PlusSupport >= 0.58 && goals.metrics.dominantRoute >= 0.45
          ? ["Dominant favourite has a credible one-sided 3+ goal route"]
          : []),
        ...(goals.metrics.extremeReversalMass > 0.14 ? ["Complete reversal risk is too high"] : [])
      ],
      reasons: ["Venue and recent 4-goal ceilings agree"]
    }),
    makeMarket({
      key: "home-over-05",
      market: "Team Goals",
      selection: `${input.home.name} Over 0.5`,
      score: goals.scores.homeOver05,
      threshold: MARKET_THRESHOLDS.teamOver05,
      risk: dataPenalty,
      reasons: ["Home scoring rate matches away conceding rate"]
    }),
    makeMarket({
      key: "away-over-05",
      market: "Team Goals",
      selection: `${input.away.name} Over 0.5`,
      score: goals.scores.awayOver05,
      threshold: MARKET_THRESHOLDS.teamOver05,
      risk: dataPenalty,
      reasons: ["Away scoring rate matches home conceding rate"]
    }),
    makeMarket({
      key: "favourite-over-15",
      market: "Team Goals",
      selection: `${goals.favouriteSide === "home" ? input.home.name : input.away.name} Over 1.5`,
      score: goals.scores.favouriteOver15,
      threshold: MARKET_THRESHOLDS.teamOver15,
      risk: dataPenalty,
      blockers: goals.metrics.dominantRoute < 0.42 ? ["Favourite does not control enough winning transition mass"] : [],
      reasons: ["Favourite 2+ scoring and opponent 2+ conceding thresholds agree"]
    })
  );

  return candidates;
}

function rankMarkets(candidates) {
  const riskPriority = {
    "Double Chance": 0.035,
    "Total Goals": 0.025,
    "Team Goals": 0.02,
    "Draw No Bet": 0.015,
    "Both Teams to Score": 0.01,
    "Half-Time Double Chance": 0.005,
    "Full-Time Result": 0,
    "Half-Time Result": -0.015,
    "HT/FT": -0.06
  };

  return candidates
    .map((market) => ({
      ...market,
      rankScore: round(market.safetyAdjustedScore + (riskPriority[market.market] || 0))
    }))
    .sort((a, b) => {
      if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
      return b.rankScore - a.rankScore;
    });
}

function matchStory(input, matrix, direct, goals) {
  const topTransitions = Object.entries(matrix.normalized)
    .map(([transition, probability]) => ({
      transition,
      code: HTFT_CODE[transition],
      probability: round(probability)
    }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 3);

  const htState = Object.entries(direct.ht).sort((a, b) => b[1] - a[1])[0][0];
  const ftState = Object.entries(direct.ft).sort((a, b) => b[1] - a[1])[0][0];
  const sideName = {
    home: input.home.name,
    draw: "Draw",
    away: input.away.name
  };

  let narrative = `${sideName[htState]} is the leading half-time state, while ${sideName[ftState]} is the strongest full-time direction.`;
  if (goals.metrics.volatilitySpillover >= 0.3) {
    narrative += " Comeback and lead-surrender behaviour raises the chance of goals after the first major swing.";
  } else if (goals.metrics.dominantRoute >= 0.48) {
    narrative += " One side has a credible control route, so team-goal markets can be stronger than GG.";
  } else {
    narrative += " No single transition dominates enough to justify forcing an exact match story.";
  }

  return { topTransitions, likelyHalfTime: sideName[htState], likelyFullTime: sideName[ftState], narrative };
}

export function predictMatch(input) {
  if (!input?.home?.name || !input?.away?.name) {
    throw new Error("Both home.name and away.name are required.");
  }

  const leagueBaseline = { ...DEFAULT_LEAGUE_BASELINE, ...(input.league?.transitionBaseline || {}) };
  const homeProfile = blendTeamProfile(input.home, leagueBaseline);
  const awayProfile = blendTeamProfile(input.away, leagueBaseline);
  const matrix = buildTransitionMatrix(homeProfile, awayProfile);
  const direct = directProbabilities(matrix);
  const quality = dataQuality(input.home, input.away, homeProfile, awayProfile);
  const goals = goalLogic(input, matrix, homeProfile, awayProfile, quality);
  const candidates = marketCandidates(input, matrix, direct, goals, quality);
  const rankedMarkets = rankMarkets(candidates);
  const primary = rankedMarkets.find((market) => market.qualified) || null;
  const supporting = rankedMarkets.find(
    (market) => market.qualified && market.key !== primary?.key && market.market !== primary?.market
  ) || null;

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
    noBet: !primary,
    story: matchStory(input, matrix, direct, goals),
    directProbabilities: {
      fullTime: Object.fromEntries(Object.entries(direct.ft).map(([key, value]) => [key, round(value)])),
      halfTime: Object.fromEntries(Object.entries(direct.ht).map(([key, value]) => [key, round(value)])),
      doubleChance: Object.fromEntries(
        Object.entries(direct.doubleChance).map(([key, value]) => [key, round(value)])
      ),
      drawNoBet: Object.fromEntries(Object.entries(direct.dnb).map(([key, value]) => [key, round(value)]))
    },
    transitionMatrix: Object.fromEntries(
      TRANSITIONS.map((transition) => [
        HTFT_CODE[transition],
        {
          transition,
          probability: round(matrix.normalized[transition])
        }
      ])
    ),
    goalIntelligence: {
      metrics: Object.fromEntries(Object.entries(goals.metrics).map(([key, value]) => [key, round(value)])),
      scores: Object.fromEntries(Object.entries(goals.scores).map(([key, value]) => [key, round(value)])),
      expectedCorridor: goals.corridor ? "2–3 goals" : null,
      favouriteSide: goals.favouriteSide
    },
    markets: rankedMarkets,
    safeguards: [
      "Home and away orientation is resolved before translating W/W into 1/1 or 2/2.",
      "GG requires two independent scoring routes; one strong team cannot create GG alone.",
      "Under 3.5 cannot qualify from stable transitions alone.",
      "Small samples are smoothed toward the league baseline and receive a confidence penalty.",
      "Only one highest-ranked qualified market is published; otherwise the engine returns No Bet."
    ]
  };
}
