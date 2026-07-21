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
    firstHalfScoringRate: blendGoalMetric(team, "firstHalfScoringRate", 0.45),
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
  const homeDominantRoute = p.WW + p.DW + p.LW * 0.5;
  const awayDominantRoute = p.LL + p.DL + p.WL * 0.5;
  const homeOpponentRecovery = awayTeamProfile.probabilities.LW + awayTeamProfile.probabilities.LD;
  const awayOpponentRecovery = homeTeamProfile.probabilities.LW + homeTeamProfile.probabilities.LD;
  const homeNoRecovery = 1 - homeOpponentRecovery;
  const awayNoRecovery = 1 - awayOpponentRecovery;
  const home2PlusSupport = geometricMean(homeGoals.scored2PlusRate, awayGoals.conceded2PlusRate);
  const away2PlusSupport = geometricMean(awayGoals.scored2PlusRate, homeGoals.conceded2PlusRate);
  const homeOver15 = clamp(
    home2PlusSupport * 0.45 + homeGoalSupport * 0.3 + homeDominantRoute * 0.18 + homeNoRecovery * 0.07
  );
  const awayOver15 = clamp(
    away2PlusSupport * 0.45 + awayGoalSupport * 0.3 + awayDominantRoute * 0.18 + awayNoRecovery * 0.07
  );
  const dominantRoute = favouriteSide === "home" ? homeDominantRoute : awayDominantRoute;
  const noRecovery = favouriteSide === "home" ? homeNoRecovery : awayNoRecovery;
  const dominant2PlusSupport = favouriteSide === "home" ? home2PlusSupport : away2PlusSupport;
  const teamOver15 = favouriteSide === "home" ? homeOver15 : awayOver15;

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

  const firstHalfOver05 = clamp(
    1 - (1 - homeGoals.firstHalfScoringRate) * (1 - awayGoals.firstHalfScoringRate)
  );
  const firstHalfOver15 = clamp(
    geometricMean(homeGoals.firstHalfScoringRate, awayGoals.firstHalfScoringRate) * 0.48 +
      over25 * 0.32 +
      volatilitySpillover * 0.2
  );
  const secondHalfOver05 = clamp(
    1 - (1 - homeGoals.secondHalfScoringRate) * (1 - awayGoals.secondHalfScoringRate)
  );
  const homeWinEitherHalf = clamp(
    (direct.ht.home + direct.ft.home - p.WW) * 0.76 +
      homeGoalSupport * 0.14 +
      homeGoals.secondHalfScoringRate * 0.1
  );
  const awayWinEitherHalf = clamp(
    (direct.ht.away + direct.ft.away - p.LL) * 0.76 +
      awayGoalSupport * 0.14 +
      awayGoals.secondHalfScoringRate * 0.1
  );
  const drawEitherHalf = clamp(p.DW + p.DD + p.DL + p.WD + p.LD);

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
      homeDominantRoute,
      awayDominantRoute,
      home2PlusSupport,
      away2PlusSupport,
      homeNoRecovery,
      awayNoRecovery,
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
      homeOver15,
      awayOver15,
      favouriteOver15: teamOver15,
      firstHalfOver05,
      firstHalfOver15,
      secondHalfOver05,
      homeWinEitherHalf,
      awayWinEitherHalf,
      drawEitherHalf
    },
    corridor
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

function makeMarket({
  key,
  market,
  selection,
  score,
  threshold,
  risk = 0,
  reasons = [],
  blockers = [],
  odds = null,
  policy = null
}) {
  const adjusted = clamp(score - risk);
  const thresholdPassed = adjusted >= threshold;
  const qualified = thresholdPassed && blockers.length === 0;
  const blockerPenalty = Math.min(0.14, blockers.length * 0.035);
  return {
    key,
    market,
    selection,
    modelScore: round(score),
    safetyAdjustedScore: round(adjusted),
    threshold,
    thresholdPassed,
    thresholdGap: round(adjusted - threshold),
    blockerPenalty: round(blockerPenalty),
    qualified,
    directional: !qualified,
    tier: qualified ? confidenceBand(adjusted) : `Directional · ${confidenceBand(adjusted)}`,
    reasons,
    blockers,
    odds: Number.isFinite(Number(odds)) ? Number(odds) : null,
    policy
  };
}

function decimalOdd(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : null;
}

function teamGoalOdd(input, side, line) {
  const teamGoals = input?.odds?.teamGoals || {};
  const sideBlock = teamGoals?.[side] || {};
  const aliases = line === "over05"
    ? ["over05", "over0_5", "over0.5", "o05"]
    : ["over15", "over1_5", "over1.5", "o15"];

  for (const alias of aliases) {
    const odd = decimalOdd(sideBlock?.[alias]);
    if (odd) return odd;
  }

  const flatAliases = side === "home"
    ? line === "over05"
      ? ["homeOver05", "home_over_05", "homeTeamOver05"]
      : ["homeOver15", "home_over_15", "homeTeamOver15"]
    : line === "over05"
      ? ["awayOver05", "away_over_05", "awayTeamOver05"]
      : ["awayOver15", "away_over_15", "awayTeamOver15"];

  for (const alias of flatAliases) {
    const odd = decimalOdd(input?.odds?.[alias]);
    if (odd) return odd;
  }

  return null;
}

function fullTimeWinCount(profile = {}) {
  return Number(profile.WW || 0) + Number(profile.DW || 0) + Number(profile.LW || 0);
}

function resultSampleGate(team = {}) {
  const overallWins = fullTimeWinCount(team.htft?.overall);
  const venueWins = fullTimeWinCount(team.htft?.venue);
  const overallPass = overallWins >= 6;
  const venuePass = venueWins >= 6;

  return {
    overallWins,
    venueWins,
    overallPass,
    venuePass,
    bothPass: overallPass && venuePass,
    exactlyOnePass: overallPass !== venuePass,
    bothFail: !overallPass && !venuePass
  };
}

function transitionRate(profile = {}, keys = []) {
  const matches = profileMatches(profile);
  if (!matches) return 0;
  return clamp(sum(keys.map((key) => Number(profile[key]) || 0)) / matches);
}

function straightWinBehaviour(team = {}, opponent = {}) {
  const holdLeadRate = transitionRate(team.htft?.overall, ["WW"]);
  const comebackWinRate = transitionRate(team.htft?.overall, ["DW", "LW"]);
  const opponentLeadSurrenderRate = transitionRate(opponent.htft?.overall, ["WD", "WL"]);
  const passed =
    holdLeadRate >= 0.2 ||
    comebackWinRate >= 0.1 ||
    opponentLeadSurrenderRate >= 0.12;

  return {
    holdLeadRate,
    comebackWinRate,
    opponentLeadSurrenderRate,
    passed
  };
}

function lowValueTeamGoalBlocker(odd, selection) {
  if (odd !== null && odd < 1.2) {
    return [`${selection} odds ${odd.toFixed(2)} are below Papa's 1.20 value floor`];
  }
  return [];
}

function marketCandidates(input, matrix, direct, goals, quality) {
  const p = matrix.normalized;
  const candidates = [];
  const dataPenalty = quality.score < 0.52 ? 0.08 : quality.score < 0.68 ? 0.04 : 0;
  const ftSorted = Object.entries(direct.ft).sort((a, b) => b[1] - a[1]);
  const ftGap = ftSorted[0][1] - ftSorted[1][1];
  const htSorted = Object.entries(direct.ht).sort((a, b) => b[1] - a[1]);
  const htGap = htSorted[0][1] - htSorted[1][1];
  const homeResultGate = resultSampleGate(input.home);
  const awayResultGate = resultSampleGate(input.away);
  const homeBehaviour = straightWinBehaviour(input.home, input.away);
  const awayBehaviour = straightWinBehaviour(input.away, input.home);
  const homeOver05Odd = teamGoalOdd(input, "home", "over05");
  const awayOver05Odd = teamGoalOdd(input, "away", "over05");
  const homeOver15Odd = teamGoalOdd(input, "home", "over15");
  const awayOver15Odd = teamGoalOdd(input, "away", "over15");

  candidates.push(
    makeMarket({
      key: "home-1x",
      market: "Double Chance",
      selection: `${input.home.name} or Draw (1X)`,
      score: direct.doubleChance.homeOrDraw,
      threshold: MARKET_THRESHOLDS.doubleChance,
      risk: dataPenalty,
      blockers: direct.ft.home < direct.ft.away + 0.05
        ? ["Home result mass does not lead the away result mass by enough"]
        : [],
      reasons: [
        "Home-win and draw transition mass combined",
        "Protection is justified only when the home-result route leads the away-result route"
      ]
    }),
    makeMarket({
      key: "away-x2",
      market: "Double Chance",
      selection: `${input.away.name} or Draw (X2)`,
      score: direct.doubleChance.awayOrDraw,
      threshold: MARKET_THRESHOLDS.doubleChance,
      risk: dataPenalty,
      blockers: direct.ft.away < direct.ft.home + 0.05
        ? ["Away result mass does not lead the home result mass by enough"]
        : [],
      reasons: [
        "Away-win and draw transition mass combined",
        "Protection is justified only when the away-result route leads the home-result route"
      ]
    }),
    makeMarket({
      key: "no-draw",
      market: "Double Chance",
      selection: "Either Team to Win (12)",
      score: direct.doubleChance.noDraw,
      threshold: MARKET_THRESHOLDS.noDraw,
      risk: dataPenalty,
      blockers: direct.ft.draw > 0.28
        ? ["Draw transition mass is too high for the 12 route"]
        : [],
      reasons: ["Low normalized draw-transition mass supports either team winning"]
    }),
    makeMarket({
      key: "home-dnb",
      market: "Draw No Bet",
      selection: `${input.home.name} DNB`,
      score: direct.dnb.home,
      threshold: MARKET_THRESHOLDS.dnb,
      risk: dataPenalty + (direct.ft.home < direct.ft.draw ? 0.04 : 0),
      blockers: homeResultGate.bothFail
        ? [`${input.home.name} has fewer than six wins both overall and at home`]
        : [],
      reasons: [
        "Home win routes remain stronger after removing the draw",
        homeResultGate.exactlyOnePass
          ? "Exactly one of the overall/split six-win gates passed, so DNB is the permitted result protection"
          : "DNB remains available as a downgrade when the straight-win behaviour check is not strong enough"
      ],
      policy: { resultSampleGate: homeResultGate, straightWinBehaviour: homeBehaviour }
    }),
    makeMarket({
      key: "away-dnb",
      market: "Draw No Bet",
      selection: `${input.away.name} DNB`,
      score: direct.dnb.away,
      threshold: MARKET_THRESHOLDS.dnb,
      risk: dataPenalty + (direct.ft.away < direct.ft.draw ? 0.04 : 0),
      blockers: awayResultGate.bothFail
        ? [`${input.away.name} has fewer than six wins both overall and away`]
        : [],
      reasons: [
        "Away win routes remain stronger after removing the draw",
        awayResultGate.exactlyOnePass
          ? "Exactly one of the overall/split six-win gates passed, so DNB is the permitted result protection"
          : "DNB remains available as a downgrade when the straight-win behaviour check is not strong enough"
      ],
      policy: { resultSampleGate: awayResultGate, straightWinBehaviour: awayBehaviour }
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
      blockers: [
        ...(ftGap < 0.07 || direct.ft.home !== ftSorted[0][1]
          ? ["Full-time result is not separated enough"]
          : []),
        ...(!homeResultGate.bothPass
          ? [`Straight win requires at least six overall wins and six home wins; found ${homeResultGate.overallWins} and ${homeResultGate.venueWins}`]
          : []),
        ...(!homeBehaviour.passed
          ? ["Comeback, lead-hold and opponent lead-surrender evidence do not support a straight home win"]
          : [])
      ],
      reasons: ["Multiple home-winning HT/FT routes contribute"],
      policy: { resultSampleGate: homeResultGate, straightWinBehaviour: homeBehaviour }
    }),
    makeMarket({
      key: "away-win",
      market: "Full-Time Result",
      selection: `${input.away.name} Win`,
      score: direct.ft.away,
      threshold: MARKET_THRESHOLDS.fullTimeWin,
      risk: dataPenalty,
      blockers: [
        ...(ftGap < 0.07 || direct.ft.away !== ftSorted[0][1]
          ? ["Full-time result is not separated enough"]
          : []),
        ...(!awayResultGate.bothPass
          ? [`Straight win requires at least six overall wins and six away wins; found ${awayResultGate.overallWins} and ${awayResultGate.venueWins}`]
          : []),
        ...(!awayBehaviour.passed
          ? ["Comeback, lead-hold and opponent lead-surrender evidence do not support a straight away win"]
          : [])
      ],
      reasons: ["Multiple away-winning HT/FT routes contribute"],
      policy: { resultSampleGate: awayResultGate, straightWinBehaviour: awayBehaviour }
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
      key: "home-win-either-half",
      market: "Win Either Half",
      selection: `${input.home.name} to Win Either Half`,
      score: goals.scores.homeWinEitherHalf,
      threshold: MARKET_THRESHOLDS.winEitherHalf,
      risk: dataPenalty,
      blockers: goals.metrics.homeGoalSupport < 0.58
        ? [`${input.home.name} goal support is too weak for an either-half win`]
        : [],
      reasons: ["The 1/1 control route is translated into the safer Win Either Half market"]
    }),
    makeMarket({
      key: "away-win-either-half",
      market: "Win Either Half",
      selection: `${input.away.name} to Win Either Half`,
      score: goals.scores.awayWinEitherHalf,
      threshold: MARKET_THRESHOLDS.winEitherHalf,
      risk: dataPenalty,
      blockers: goals.metrics.awayGoalSupport < 0.58
        ? [`${input.away.name} goal support is too weak for an either-half win`]
        : [],
      reasons: ["The 2/2 control route is translated into the safer Win Either Half market"]
    }),
    makeMarket({
      key: "draw-either-half",
      market: "Draw in Either Half",
      selection: "Draw in Either Half",
      score: goals.scores.drawEitherHalf,
      threshold: MARKET_THRESHOLDS.drawEitherHalf,
      risk: dataPenalty,
      reasons: ["An X at half-time or full-time creates a practical draw-in-either-half route"]
    }),
    makeMarket({
      key: "first-half-over-05",
      market: "First-Half Goals",
      selection: "First Half Over 0.5",
      score: goals.scores.firstHalfOver05,
      threshold: MARKET_THRESHOLDS.firstHalfOver05,
      risk: dataPenalty,
      reasons: ["At least one team has a reliable first-half scoring route"]
    }),
    makeMarket({
      key: "first-half-over-15",
      market: "First-Half Goals",
      selection: "First Half Over 1.5",
      score: goals.scores.firstHalfOver15,
      threshold: MARKET_THRESHOLDS.firstHalfOver15,
      risk: dataPenalty + 0.015,
      blockers: goals.scores.over25 < 0.54
        ? ["Full-match three-goal support is too weak for two first-half goals"]
        : [],
      reasons: ["Both first-half scoring routes and the full-match goal environment agree"]
    }),
    makeMarket({
      key: "second-half-over-05",
      market: "Second-Half Goals",
      selection: "Second Half Over 0.5",
      score: goals.scores.secondHalfOver05,
      threshold: MARKET_THRESHOLDS.secondHalfOver05,
      risk: dataPenalty,
      reasons: ["Second-half scoring rates support at least one goal after the break"]
    }),
    makeMarket({
      key: "home-over-05",
      market: "Team Goals",
      selection: `${input.home.name} Over 0.5`,
      score: goals.scores.homeOver05,
      threshold: MARKET_THRESHOLDS.teamOver05,
      risk: dataPenalty,
      blockers: lowValueTeamGoalBlocker(homeOver05Odd, `${input.home.name} Over 0.5`),
      reasons: ["Home scoring rate matches away conceding rate"],
      odds: homeOver05Odd,
      policy: {
        valueFloor: 1.2,
        lowValueRejected: homeOver05Odd !== null && homeOver05Odd < 1.2,
        upgradeKey: "home-over-15"
      }
    }),
    makeMarket({
      key: "away-over-05",
      market: "Team Goals",
      selection: `${input.away.name} Over 0.5`,
      score: goals.scores.awayOver05,
      threshold: MARKET_THRESHOLDS.teamOver05,
      risk: dataPenalty,
      blockers: lowValueTeamGoalBlocker(awayOver05Odd, `${input.away.name} Over 0.5`),
      reasons: ["Away scoring rate matches home conceding rate"],
      odds: awayOver05Odd,
      policy: {
        valueFloor: 1.2,
        lowValueRejected: awayOver05Odd !== null && awayOver05Odd < 1.2,
        upgradeKey: "away-over-15"
      }
    }),
    makeMarket({
      key: "home-over-15",
      market: "Team Goals",
      selection: `${input.home.name} Over 1.5`,
      score: goals.scores.homeOver15,
      threshold: MARKET_THRESHOLDS.teamOver15,
      risk: dataPenalty,
      blockers: [
        ...(goals.homeGoals.scored2PlusRate < 0.42
          ? [`${input.home.name} 2+ scoring rate is below 42%`]
          : []),
        ...(goals.awayGoals.conceded2PlusRate < 0.42
          ? [`${input.away.name} 2+ conceding rate is below 42%`]
          : []),
        ...(goals.metrics.homeGoalSupport < 0.68
          ? [`${input.home.name} goal support is below 68%`]
          : []),
        ...(goals.metrics.homeDominantRoute < 0.38
          ? [`${input.home.name} HT/FT control route is below 38%`]
          : []),
        ...lowValueTeamGoalBlocker(homeOver15Odd, `${input.home.name} Over 1.5`)
      ],
      reasons: ["Home 2+ scoring, away 2+ conceding, HT/FT control and goal support agree"],
      odds: homeOver15Odd,
      policy: { sameTeamUpgradeFrom: "home-over-05" }
    }),
    makeMarket({
      key: "away-over-15",
      market: "Team Goals",
      selection: `${input.away.name} Over 1.5`,
      score: goals.scores.awayOver15,
      threshold: MARKET_THRESHOLDS.teamOver15,
      risk: dataPenalty,
      blockers: [
        ...(goals.awayGoals.scored2PlusRate < 0.42
          ? [`${input.away.name} 2+ scoring rate is below 42%`]
          : []),
        ...(goals.homeGoals.conceded2PlusRate < 0.42
          ? [`${input.home.name} 2+ conceding rate is below 42%`]
          : []),
        ...(goals.metrics.awayGoalSupport < 0.68
          ? [`${input.away.name} goal support is below 68%`]
          : []),
        ...(goals.metrics.awayDominantRoute < 0.38
          ? [`${input.away.name} HT/FT control route is below 38%`]
          : []),
        ...lowValueTeamGoalBlocker(awayOver15Odd, `${input.away.name} Over 1.5`)
      ],
      reasons: ["Away 2+ scoring, home 2+ conceding, HT/FT control and goal support agree"],
      odds: awayOver15Odd,
      policy: { sameTeamUpgradeFrom: "away-over-05" }
    }),
    makeMarket({
      key: "favourite-over-15",
      market: "Team Goals",
      selection: `${goals.favouriteSide === "home" ? input.home.name : input.away.name} Over 1.5`,
      score: goals.scores.favouriteOver15,
      threshold: MARKET_THRESHOLDS.teamOver15,
      risk: dataPenalty,
      blockers: goals.metrics.dominantRoute < 0.42 ? ["Favourite does not control enough winning transition mass"] : [],
      reasons: ["Favourite 2+ scoring and opponent 2+ conceding thresholds agree"],
      odds: goals.favouriteSide === "home" ? homeOver15Odd : awayOver15Odd,
      policy: { legacyAlias: true }
    })
  );

  return candidates;
}


function rawProfileRate(profile = {}, transition) {
  const matches = profileMatches(profile);
  return matches ? clamp((Number(profile[transition]) || 0) / matches) : 0;
}

function venuePatternContext(input, leagueBaseline) {
  const homeRaw = input.home.htft?.venue || {};
  const awayRaw = input.away.htft?.venue || {};
  const home = smoothedProfile(homeRaw, leagueBaseline, 3);
  const away = smoothedProfile(awayRaw, leagueBaseline, 3);
  const matrix = buildTransitionMatrix(home, away);
  const direct = directProbabilities(matrix);

  const indicators = TRANSITIONS.map((transition) => ({
    transition,
    code: HTFT_CODE[transition],
    opposite: OPPOSITE[transition],
    homeCount: Number(homeRaw[transition]) || 0,
    homeMatches: home.matches,
    homeRate: round(rawProfileRate(homeRaw, transition)),
    awayOppositeCount: Number(awayRaw[OPPOSITE[transition]]) || 0,
    awayMatches: away.matches,
    awayOppositeRate: round(rawProfileRate(awayRaw, OPPOSITE[transition])),
    compatibility: round(matrix.normalized[transition])
  })).sort((a, b) => b.compatibility - a.compatibility);

  const ftRows = Object.entries(direct.ft).sort((a, b) => b[1] - a[1]);
  const htRows = Object.entries(direct.ht).sort((a, b) => b[1] - a[1]);
  const top = indicators[0];
  const second = indicators[1];

  const stateName = {
    home: input.home.name,
    draw: "Draw",
    away: input.away.name
  };

  const reasons = [];
  if (top) {
    reasons.push(
      `${top.code} is the strongest venue-compatible route: ` +
      `${input.home.name} ${top.transition} ${round(top.homeRate * 100, 1)}% ` +
      `against ${input.away.name} ${top.opposite} ${round(top.awayOppositeRate * 100, 1)}%.`
    );
  }
  if (second) {
    reasons.push(
      `${second.code} is the next venue route at ${round(second.compatibility * 100, 1)}% compatibility.`
    );
  }
  reasons.push(
    `${stateName[htRows[0][0]]} leads the venue half-time direction; ` +
    `${stateName[ftRows[0][0]]} leads the venue full-time direction.`
  );

  return {
    home,
    away,
    matrix,
    direct,
    indicators,
    topTransitions: indicators.slice(0, 3),
    ftRows,
    htRows,
    ftGap: ftRows[0][1] - ftRows[1][1],
    htGap: htRows[0][1] - htRows[1][1],
    reasons,
    samples: {
      homeVenue: home.matches,
      awayVenue: away.matches
    }
  };
}

function marketVenueAlignment(market, venue, input) {
  const topExact = venue.topTransitions[0]?.code;
  const homeName = input.home.name;
  const awayName = input.away.name;
  let evidence = 0.5;

  if (market.key === "home-win") evidence = venue.direct.ft.home;
  else if (market.key === "away-win") evidence = venue.direct.ft.away;
  else if (market.key === "home-dnb") evidence = venue.direct.dnb.home;
  else if (market.key === "away-dnb") evidence = venue.direct.dnb.away;
  else if (market.key === "home-1x") evidence = venue.direct.doubleChance.homeOrDraw;
  else if (market.key === "away-x2") evidence = venue.direct.doubleChance.awayOrDraw;
  else if (market.key === "no-draw") evidence = venue.direct.doubleChance.noDraw;
  else if (market.key === "ht-home") evidence = venue.direct.ht.home;
  else if (market.key === "ht-draw") evidence = venue.direct.ht.draw;
  else if (market.key === "ht-away") evidence = venue.direct.ht.away;
  else if (market.key === "ht-home-or-draw") evidence = venue.direct.halfTimeDoubleChance.homeOrDraw;
  else if (market.key === "ht-away-or-draw") evidence = venue.direct.halfTimeDoubleChance.awayOrDraw;
  else if (market.key === "exact-htft") {
    evidence = venue.topTransitions.find((row) => row.code === market.selection)?.compatibility || 0;
  } else if (market.key === "home-over-05" || market.selection?.startsWith(homeName)) {
    evidence = Math.max(venue.direct.ft.home, 0.5);
  } else if (market.key === "away-over-05" || market.selection?.startsWith(awayName)) {
    evidence = Math.max(venue.direct.ft.away, 0.5);
  }

  const centered = (evidence - 0.5) * 0.14;
  return clamp(centered, -0.055, 0.075);
}

function marketFamily(market) {
  if (market.market === "Total Goals") return "Goals";
  if (market.market === "Team Goals") return "Team Goals";
  if (market.market === "Both Teams to Score") return "BTTS";
  if (market.market === "Full-Time Result") return "Match Result";
  if (market.market === "Draw No Bet") return "Result Protection";
  if (market.market === "Double Chance") return "Result Protection";
  if (market.market === "Half-Time Double Chance") return "Half-Time Protection";
  if (market.market === "Half-Time Result") return "Half-Time";
  if (market.market === "Win Either Half") return "Half Result";
  if (market.market === "Draw in Either Half") return "Half Result";
  if (market.market === "First-Half Goals") return "Half Goals";
  if (market.market === "Second-Half Goals") return "Half Goals";
  if (market.market === "HT/FT") return "Exact HT/FT";
  return market.market;
}

function isProtectionMarket(market) {
  return ["Double Chance", "Half-Time Double Chance"].includes(market.market);
}

function isExactMarket(market) {
  return ["HT/FT", "Half-Time Result"].includes(market.market);
}

function rankMarkets(candidates, venue, input) {
  // Raw probabilities cannot be compared directly across unlike markets:
  // a union such as 1X naturally starts higher than Over 2.5 or a straight win.
  // Every market is therefore measured against its own qualification threshold.
  const familyBias = {
    "Total Goals": 0.065,
    "Team Goals": 0.055,
    "Both Teams to Score": 0.05,
    "Full-Time Result": 0.04,
    "Draw No Bet": 0.02,
    "Double Chance": -0.075,
    "Half-Time Double Chance": -0.09,
    "Half-Time Result": -0.025,
    "Win Either Half": 0.055,
    "Draw in Either Half": 0.05,
    "First-Half Goals": 0.035,
    "Second-Half Goals": 0.045,
    "HT/FT": -0.11
  };

  return candidates
    .map((market) => {
      const supportRatio = market.safetyAdjustedScore / Math.max(0.01, market.threshold);
      const thresholdEdge = market.safetyAdjustedScore - market.threshold;
      const blockerPenalty = Math.min(0.24, market.blockers.length * 0.075);
      const qualifiedBonus = market.qualified ? 0.085 : 0;
      const venueBonus = marketVenueAlignment(market, venue, input);
      const comparisonScore =
        supportRatio +
        (familyBias[market.market] || 0) +
        qualifiedBonus +
        venueBonus -
        blockerPenalty;

      const valueBlockerCount = market.policy?.lowValueRejected ? 1 : 0;
      const nonValueBlockerCount = Math.max(0, market.blockers.length - valueBlockerCount);
      const preValueQualified = market.thresholdPassed && nonValueBlockerCount === 0;
      const preValueComparisonScore =
        supportRatio +
        (familyBias[market.market] || 0) +
        (preValueQualified ? 0.085 : 0) +
        venueBonus -
        Math.min(0.24, nonValueBlockerCount * 0.075);

      return {
        ...market,
        family: marketFamily(market),
        supportRatio: round(supportRatio),
        thresholdEdge: round(thresholdEdge),
        venueBonus: round(venueBonus),
        comparisonScore: round(comparisonScore),
        preValueQualified,
        preValueComparisonScore: round(preValueComparisonScore),
        rankScore: round(comparisonScore),
        directionalRankScore: round(comparisonScore)
      };
    })
    .sort((a, b) => {
      if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
      return b.comparisonScore - a.comparisonScore;
    });
}

function choosePrimaryMarket(rankedMarkets) {
  const qualified = rankedMarkets.filter((market) => market.qualified);
  const fallback = rankedMarkets.filter(
    (market) => !isExactMarket(market) && market.blockers.length === 0
  );
  const pool = qualified.length ? qualified : fallback;
  let selected = pool[0] || rankedMarkets[0];

  // A broad protection market should not beat a more informative market solely
  // because it combines two outcomes. When a non-protection market is close,
  // the more specific common-sense direction wins.
  if (selected && isProtectionMarket(selected)) {
    const informative = pool.find(
      (market) =>
        !isProtectionMarket(market) &&
        !isExactMarket(market) &&
        market.comparisonScore >= selected.comparisonScore - 0.055 &&
        market.safetyAdjustedScore >= 0.48
    );
    if (informative) selected = informative;
  }

  return selected;
}


function topTransitionCode(matrix) {
  return Object.entries(matrix.normalized)
    .map(([transition, probability]) => ({
      transition,
      code: HTFT_CODE[transition],
      probability
    }))
    .sort((a, b) => b.probability - a.probability)[0] || null;
}

function firstUsableMarket(rankedMarkets, predicate = () => true) {
  return rankedMarkets.find(
    (market) =>
      predicate(market) &&
      market.blockers.length === 0 &&
      !isExactMarket(market) &&
      market.safetyAdjustedScore >= 0.48
  ) || null;
}

function applyPapasPickPolicy({ rankedMarkets, defaultPrimary, input, matrix }) {
  const byKey = new Map(rankedMarkets.map((market) => [market.key, market]));
  const top = topTransitionCode(matrix);
  const actions = [];
  let selected = defaultPrimary;
  const preValuePrimary = [...rankedMarkets]
    .filter((market) => market.preValueQualified)
    .sort((a, b) => b.preValueComparisonScore - a.preValueComparisonScore)[0] || null;

  const chooseMapped = (key, reason, minimum = 0.5) => {
    const candidate = byKey.get(key);
    if (
      candidate &&
      candidate.blockers.length === 0 &&
      candidate.safetyAdjustedScore >= minimum
    ) {
      selected = candidate;
      actions.push(reason);
      return true;
    }
    return false;
  };

  if (top && top.probability >= 0.17) {
    if (top.code === "1/1") {
      chooseMapped(
        "home-win-either-half",
        `Top HT/FT route 1/1 is converted to ${input.home.name} to Win Either Half.`
      );
    } else if (top.code === "2/2") {
      chooseMapped(
        "away-win-either-half",
        `Top HT/FT route 2/2 is converted to ${input.away.name} to Win Either Half.`
      );
    } else if (["1/2", "2/1"].includes(top.code)) {
      if (!chooseMapped(
        "gg-yes",
        `Reversal route ${top.code} is converted to GG because both independent scoring routes passed.`,
        0.6
      )) {
        chooseMapped(
          "over-15",
          `Reversal route ${top.code} did not pass the full GG gate, so Papa uses Match Over 1.5.`,
          0.58
        );
      }
    } else if (["X/X", "X/1", "X/2", "1/X", "2/X"].includes(top.code)) {
      chooseMapped(
        "draw-either-half",
        `Top HT/FT route ${top.code} contains an X state and is converted to Draw in Either Half.`,
        0.5
      );
    }
  }

  const htftMapped = actions.length > 0;

  const resultSide = selected?.key === "home-win" || selected?.key === "home-dnb"
    ? "home"
    : selected?.key === "away-win" || selected?.key === "away-dnb"
      ? "away"
      : null;

  if (resultSide) {
    const straight = byKey.get(`${resultSide}-win`);
    const dnb = byKey.get(`${resultSide}-dnb`);
    const eitherHalf = byKey.get(`${resultSide}-win-either-half`);
    const gate = straight?.policy?.resultSampleGate || dnb?.policy?.resultSampleGate;
    const behaviour = straight?.policy?.straightWinBehaviour || dnb?.policy?.straightWinBehaviour;

    if (gate?.bothFail) {
      selected = firstUsableMarket(
        rankedMarkets,
        (market) => !["Full-Time Result", "Draw No Bet"].includes(market.market)
      ) || selected;
      actions.push("Both the overall and relevant split six-win gates failed, so Papa removed the result market.");
    } else if (gate?.exactlyOnePass && dnb && dnb.blockers.length === 0) {
      selected = dnb;
      actions.push("Exactly one six-win gate passed, so the straight win was downgraded to Draw No Bet.");
    } else if (gate?.bothPass && behaviour && !behaviour.passed) {
      if (eitherHalf && eitherHalf.blockers.length === 0 && eitherHalf.safetyAdjustedScore >= 0.55) {
        selected = eitherHalf;
        actions.push("The straight-win behaviour check failed, so Papa downgraded to Win Either Half.");
      } else if (dnb && dnb.blockers.length === 0) {
        selected = dnb;
        actions.push("The straight-win behaviour check failed, so Papa downgraded to Draw No Bet.");
      }
    }
  }

  for (const side of ["home", "away"]) {
    const lowLine = byKey.get(`${side}-over-05`);
    const highLine = byKey.get(`${side}-over-15`);
    const lowValueRejected =
      lowLine?.thresholdPassed &&
      lowLine?.policy?.lowValueRejected === true;

    if (!lowValueRejected) continue;

    const wouldHaveLed =
      selected?.key === lowLine.key ||
      (!htftMapped && preValuePrimary?.key === lowLine.key);

    if (!wouldHaveLed) continue;

    const highLineHasValue = Number.isFinite(highLine?.odds) && highLine.odds >= 1.2;
    if (highLine?.qualified && highLineHasValue) {
      selected = highLine;
      actions.push(
        `${lowLine.selection} was rejected below odds 1.20 and upgraded only after the same team's Over 1.5 passed every statistical and value gate.`
      );
    } else {
      selected = firstUsableMarket(
        rankedMarkets,
        (market) => market.key !== lowLine.key && market.key !== highLine?.key
      ) || selected;
      actions.push(
        `${lowLine.selection} was rejected below odds 1.20; the same team's Over 1.5 failed at least one full gate, so no forced upgrade was made.`
      );
    }
  }

  return {
    primary: {
      ...selected,
      reasons: [...(selected?.reasons || []), ...actions],
      papasPolicy: {
        version: "v1.13.0",
        topHtftRoute: top,
        actions
      }
    },
    trace: {
      version: "v1.13.0",
      topHtftRoute: top,
      actions
    }
  };
}


function copyEnginePick(market, engineKey, engineName, {
  reasons = [],
  cautions = [],
  description = "",
  explanationParagraph = "",
  explanationEvidence = null,
  venueRoute = null
} = {}) {
  return {
    engineKey,
    engineName,
    key: market.key,
    family: market.family,
    market: market.market,
    selection: market.selection,
    score: market.safetyAdjustedScore,
    confidence: round(market.safetyAdjustedScore * 100, 2),
    modelScore: market.modelScore,
    threshold: market.threshold,
    comparisonScore: market.comparisonScore,
    qualified: market.qualified,
    mode: market.qualified ? "qualified" : "directional",
    tier: market.tier,
    reasons: [...reasons, ...(market.reasons || [])],
    cautions: [...cautions, ...(market.blockers || [])],
    description,
    explanationParagraph,
    explanationEvidence,
    venueRoute
  };
}

function chooseAggressiveMarket(rankedMarkets, primary) {
  const aggressiveBias = {
    "HT/FT": 0.22,
    "Full-Time Result": 0.16,
    "Team Goals": 0.13,
    "Total Goals": 0.11,
    "Both Teams to Score": 0.1,
    "Half-Time Result": 0.08,
    "Draw No Bet": 0.01,
    "Double Chance": -0.16,
    "Half-Time Double Chance": -0.18
  };

  const ranked = rankedMarkets
    .filter((market) => !isProtectionMarket(market))
    .map((market) => ({
      market,
      score:
        market.comparisonScore +
        (aggressiveBias[market.market] || 0) -
        Math.min(0.12, market.blockers.length * 0.035)
    }))
    .sort((a, b) => b.score - a.score);

  return (
    ranked.find(({ market }) => market.key !== primary.key)?.market ||
    ranked[0]?.market ||
    primary
  );
}

function selectionSide(market, input) {
  const value = `${market.key} ${market.selection}`.toLowerCase();
  if (
    value.includes("home-win") ||
    value.includes("home-dnb") ||
    value.includes("home-1x") ||
    value.includes(input.home.name.toLowerCase())
  ) return "home";
  if (
    value.includes("away-win") ||
    value.includes("away-dnb") ||
    value.includes("away-x2") ||
    value.includes(input.away.name.toLowerCase())
  ) return "away";
  return null;
}

function chooseSaferMarket(rankedMarkets, primary, input, venue, quality) {
  const byKey = new Map(rankedMarkets.map((market) => [market.key, market]));
  const side = selectionSide(primary, input);
  const priorities = [];

  if (side === "home") {
    priorities.push("home-dnb", "home-over-05", "over-15", "under-35", "home-1x");
  } else if (side === "away") {
    priorities.push("away-dnb", "away-over-05", "over-15", "under-35", "away-x2");
  } else if (primary.key === "over-25" || primary.key === "gg-yes") {
    priorities.push("over-15", "home-over-05", "away-over-05", "under-35");
  } else if (["home-over-15", "away-over-15", "favourite-over-15"].includes(primary.key)) {
    priorities.push(
      primary.selection.startsWith(input.home.name) ? "home-over-05" : "away-over-05",
      "over-15",
      "under-35"
    );
  } else if (primary.key === "under-35") {
    priorities.push("under-35", "ht-draw", "home-1x", "away-x2");
  } else if (primary.key === "gg-no") {
    priorities.push("under-35", "home-over-05", "away-over-05");
  } else {
    priorities.push("over-15", "under-35", "home-1x", "away-x2", "no-draw");
  }

  const protectionAllowed = (market) => {
    if (!market || market.market !== "Double Chance") return true;
    const sideEdge = side === "home"
      ? venue.direct.ft.home - venue.direct.ft.away
      : side === "away"
        ? venue.direct.ft.away - venue.direct.ft.home
        : 0;
    return (
      market.qualified &&
      quality.score >= 0.52 &&
      sideEdge >= 0.07
    );
  };

  const directChoice = priorities
    .map((key) => byKey.get(key))
    .find(
      (market) =>
        market &&
        market.key !== primary.key &&
        market.safetyAdjustedScore >= 0.45 &&
        protectionAllowed(market)
    );

  if (directChoice) return directChoice;

  return (
    rankedMarkets
      .filter((market) => market.key !== primary.key && !isExactMarket(market))
      .map((market) => ({
        market,
        safety:
          market.comparisonScore +
          ({
            "Draw No Bet": 0.12,
            "Double Chance": market.qualified && quality.score >= 0.52 ? -0.02 : -0.22,
            "Total Goals": market.key === "over-15" || market.key === "under-35" ? 0.12 : 0,
            "Team Goals": market.key.endsWith("over-05") ? 0.1 : 0
          }[market.market] || 0)
      }))
      .sort((a, b) => b.safety - a.safety)[0]?.market ||
    primary
  );
}

function chooseVenuePatternMarket(rankedMarkets, venue, input, goals) {
  const byKey = new Map(rankedMarkets.map((market) => [market.key, market]));
  const [ftState, ftProbability] = venue.ftRows[0];
  const [htState, htProbability] = venue.htRows[0];
  const topExact = venue.topTransitions[0];
  const secondExact = venue.topTransitions[1];

  let key;
  if (ftState === "home" && venue.ftGap >= 0.065) {
    key = ftProbability >= 0.5 ? "home-win" : "home-dnb";
  } else if (ftState === "away" && venue.ftGap >= 0.065) {
    key = ftProbability >= 0.5 ? "away-win" : "away-dnb";
  } else if (htState === "draw" && htProbability >= 0.42) {
    key = "ht-draw";
  } else if (venue.direct.doubleChance.noDraw >= 0.7) {
    key = "no-draw";
  } else if (goals.scores.under35 >= goals.scores.over15) {
    key = "under-35";
  } else {
    key = "over-15";
  }

  const market = byKey.get(key) || byKey.get("exact-htft") || rankedMarkets[0];
  const sameFtStory =
    topExact &&
    secondExact &&
    topExact.code.split("/")[1] === secondExact.code.split("/")[1];

  const routeExplanation = sameFtStory
    ? `${topExact.code} and ${secondExact.code} finish in the same full-time state, so ${market.selection} covers both leading venue routes.`
    : `${topExact?.code || "The leading route"} is the strongest direct venue story.`;

  return {
    market,
    reasons: [
      ...venue.reasons,
      routeExplanation
    ],
    route: {
      top: topExact || null,
      second: secondExact || null,
      likelyHalfTime: htState,
      likelyFullTime: ftState,
      homeVenueMatches: venue.samples.homeVenue,
      awayVenueMatches: venue.samples.awayVenue
    }
  };
}


function wholeNumber(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function simpleSample(count, matches, label) {
  const rawCount = Math.max(0, Number(count) || 0);
  const rawMatches = Math.max(0, Number(matches) || 0);

  if (!rawMatches) {
    return {
      count: 0,
      total: 0,
      percent: 0,
      approximate: false,
      text: `no confirmed ${label} sample`
    };
  }

  const total = Math.max(1, wholeNumber(rawMatches));
  const roundedCount = Math.min(total, wholeNumber(rawCount));
  const percent = Math.round(clamp(rawCount / rawMatches) * 100);
  const approximate =
    Math.abs(rawCount - roundedCount) > 0.05 ||
    Math.abs(rawMatches - total) > 0.05;

  return {
    count: roundedCount,
    total,
    percent,
    approximate,
    text:
      `${approximate ? "about " : ""}${roundedCount} of ${total} ${label} ` +
      `(${percent}%)`
  };
}

function transitionMeaning(code, input) {
  const [half, full] = String(code || "").split("/");
  const halfText = {
    "1": `${input.home.name} lead at half-time`,
    "X": "the teams are level at half-time",
    "2": `${input.away.name} lead at half-time`
  }[half] || "the half-time direction is unclear";

  const fullText = {
    "1": `${input.home.name} win at full-time`,
    "X": "the match ends level",
    "2": `${input.away.name} win at full-time`
  }[full] || "the full-time direction is unclear";

  return `${halfText}, then ${fullText}`;
}

function practicalMarketReason(market, input, venue, goals) {
  const top = venue.topTransitions[0];
  const second = venue.topTransitions[1];
  const topFt = top?.code?.split("/")[1];
  const secondFt = second?.code?.split("/")[1];
  const resultRoutesConflict = Boolean(topFt && secondFt) && topFt !== secondFt;

  if (market.key === "home-win") {
    return `${input.home.name} have the clearest full-time edge. Papa keeps the straight home win instead of weakening it to Double Chance.`;
  }
  if (market.key === "away-win") {
    return `${input.away.name} have the clearest full-time edge. Papa keeps the straight away win instead of weakening it to Double Chance.`;
  }
  if (market.key === "home-dnb") {
    return `${input.home.name} have the stronger result direction, but the draw is still possible. Draw No Bet protects the stake if the match finishes level.`;
  }
  if (market.key === "away-dnb") {
    return `${input.away.name} have the stronger result direction, but the draw is still possible. Draw No Bet protects the stake if the match finishes level.`;
  }
  if (market.key === "home-1x") {
    return `${input.home.name} have the stronger side of the match, but the straight win is not strong enough. The 1X market keeps the draw covered.`;
  }
  if (market.key === "away-x2") {
    return `${input.away.name} have the stronger side of the match, but the straight win is not strong enough. The X2 market keeps the draw covered.`;
  }
  if (market.key === "no-draw") {
    return `The win routes are stronger than the draw routes, so Papa chooses Either Team to Win (12).`;
  }
  if (market.key === "exact-htft") {
    return `${top?.code || market.selection} is the strongest exact half-time/full-time pattern. This is the sharper, higher-risk route.`;
  }
  if (market.key === "ht-draw") {
    return `A draw is the strongest first-half direction, so Papa stops at Draw at Half-Time instead of forcing the final result.`;
  }
  if (market.key === "ht-home") {
    return `${input.home.name} have the stronger first-half route, so Papa backs them to lead at half-time.`;
  }
  if (market.key === "ht-away") {
    return `${input.away.name} have the stronger first-half route, so Papa backs them to lead at half-time.`;
  }
  if (market.key === "home-win-either-half") {
    return `${input.home.name} have the strongest 1/1 control route, but Papa uses Win Either Half instead of forcing the full-time win.`;
  }
  if (market.key === "away-win-either-half") {
    return `${input.away.name} have the strongest 2/2 control route, but Papa uses Win Either Half instead of forcing the full-time win.`;
  }
  if (market.key === "draw-either-half") {
    return `The leading HT/FT route contains an X state, so Papa converts it to Draw in Either Half.`;
  }
  if (market.key === "first-half-over-05") {
    return `At least one first-half scoring route is strong enough for First Half Over 0.5.`;
  }
  if (market.key === "first-half-over-15") {
    return `Both first-half scoring routes and the wider goal environment support two first-half goals.`;
  }
  if (market.key === "second-half-over-05") {
    return `The teams' second-half scoring records support at least one goal after the break.`;
  }
  if (market.key === "under-35") {
    return `The match does not show enough support for four or more goals. Under 3.5 is the clearer goal ceiling.`;
  }
  if (market.key === "over-15") {
    return `The scoring evidence supports at least two match goals, but not enough to force Over 2.5. Papa uses the lower Over 1.5 line.`;
  }
  if (market.key === "over-25") {
    return `The scoring and transition evidence are strong enough to support three or more match goals, so Papa chooses Over 2.5.`;
  }
  if (market.key === "gg-yes") {
    return `Both teams have a credible scoring route, so Papa expects each side to score at least once.`;
  }
  if (market.key === "gg-no") {
    return `One team does not have a dependable scoring route, so Papa does not expect both teams to score.`;
  }
  if (market.key === "home-over-05") {
    return resultRoutesConflict
      ? `The result patterns point in different directions, but ${input.home.name} have the clearer scoring route. Papa avoids forcing a winner and backs them to score at least once.`
      : `${input.home.name} have the more dependable scoring route, so Papa backs them to score at least once.`;
  }
  if (market.key === "away-over-05") {
    return resultRoutesConflict
      ? `The result patterns point in different directions, but ${input.away.name} have the clearer scoring route. Papa avoids forcing a winner and backs them to score at least once.`
      : `${input.away.name} have the more dependable scoring route, so Papa backs them to score at least once.`;
  }
  if (["home-over-15", "away-over-15", "favourite-over-15"].includes(market.key)) {
    return `${market.selection} passed the 2+ scoring, opponent 2+ conceding, HT/FT control and goal-support checks.`;
  }

  return `${market.selection} is the clearest practical market after the HT/FT, venue, scoring and risk checks.`;
}

function buildExplanationEvidence({ market, input, venue, goals }) {
  const top = venue.topTransitions[0] || null;
  const second = venue.topTransitions[1] || null;
  const homeSample = top
    ? simpleSample(top.homeCount, top.homeMatches, "home matches")
    : simpleSample(0, 0, "home matches");
  const awaySample = top
    ? simpleSample(top.awayOppositeCount, top.awayMatches, "away matches")
    : simpleSample(0, 0, "away matches");

  return {
    strongestRoute: top?.code || null,
    strongestRouteMeaning: top ? transitionMeaning(top.code, input) : null,
    homeSupport: homeSample,
    awaySupport: awaySample,
    secondRoute: second?.code || null,
    secondRouteMeaning: second ? transitionMeaning(second.code, input) : null,
    decision: practicalMarketReason(market, input, venue, goals)
  };
}

function buildPotosiStyleExplanation({ market, input, venue, goals, engineName }) {
  const evidence = buildExplanationEvidence({ market, input, venue, goals });

  if (!evidence.strongestRoute) {
    return `${engineName}'s pick is ${market.selection}. The market ranked first after the individual HT/FT, venue, recent-form, scoring and risk checks.`;
  }

  const secondSentence = evidence.secondRoute
    ? ` The next supporting route is ${evidence.secondRoute}: ${evidence.secondRouteMeaning}.`
    : "";

  return (
    `${engineName}'s pick is ${market.selection}. ` +
    `The strongest exact transition is ${evidence.strongestRoute}: ${evidence.strongestRouteMeaning}. ` +
    `${input.home.name}'s home record supports it in ${evidence.homeSupport.text}. ` +
    `${input.away.name}'s away record supports the matching opposite pattern in ${evidence.awaySupport.text}.` +
    `${secondSentence} ` +
    evidence.decision
  );
}


function buildEngineSuite({
  rankedMarkets,
  primary,
  venue,
  input,
  goals,
  quality
}) {
  const aggressive = chooseAggressiveMarket(rankedMarkets, primary);
  const safer = chooseSaferMarket(
    rankedMarkets,
    primary,
    input,
    venue,
    quality
  );
  const venueSelection = chooseVenuePatternMarket(rankedMarkets, venue, input, goals);

  const primaryExplanation = buildPotosiStyleExplanation({
    market: primary,
    input,
    venue,
    goals,
    engineName: "Papa"
  });
  const aggressiveExplanation = buildPotosiStyleExplanation({
    market: aggressive,
    input,
    venue,
    goals,
    engineName: "Aggressive"
  });
  const saferExplanation = buildPotosiStyleExplanation({
    market: safer,
    input,
    venue,
    goals,
    engineName: "Safer"
  });
  const venueExplanation = buildPotosiStyleExplanation({
    market: venueSelection.market,
    input,
    venue,
    goals,
    engineName: "Venue Pattern"
  });

  const primaryEvidence = buildExplanationEvidence({ market: primary, input, venue, goals });
  const aggressiveEvidence = buildExplanationEvidence({ market: aggressive, input, venue, goals });
  const saferEvidence = buildExplanationEvidence({ market: safer, input, venue, goals });
  const venueEvidence = buildExplanationEvidence({
    market: venueSelection.market,
    input,
    venue,
    goals
  });

  const primaryVenueAligned = marketVenueAlignment(primary, venue, input) > 0.01;
  const audit = input.profileAudit || {};
  const sampleReason = audit.home && audit.away
    ? `Individual history used: ${audit.home.teamName} overall ${audit.home.evidence.overall}, venue ${audit.home.evidence.venue}; ` +
      `${audit.away.teamName} overall ${audit.away.evidence.overall}, venue ${audit.away.evidence.venue}.`
    : "Individual team history was used before market ranking.";

  const primaryReasons = primaryVenueAligned
    ? [
        sampleReason,
        "Venue HT/FT direction agrees with the overall PapaSense market direction.",
        ...venue.reasons.slice(0, 2)
      ]
    : [
        sampleReason,
        "Overall, recent, venue and goal evidence were compared before the final market was chosen."
      ];

  return {
    primary: copyEnginePick(primary, "primary", "Papa's Pick", {
      reasons: primaryReasons,
      cautions: !primary.qualified
        ? ["This is the default direction, but it remains below the strong-pick threshold."]
        : [],
      description:
        "Papa's default pick uses venue, overall and recent HT/FT, goal support, market calibration and contradiction checks.",
      explanationParagraph: primaryExplanation,
      explanationEvidence: primaryEvidence
    }),
    aggressive: copyEnginePick(aggressive, "aggressive", "Aggressive", {
      reasons: [
        "Selects the most specific credible route after removing broad protection markets.",
        "Designed for users who accept higher variance for a sharper outcome."
      ],
      cautions: [
        "Aggressive picks carry more variance and should not be treated as safer than Papa's Pick."
      ],
      description:
        "Higher-specificity route such as exact HT/FT, straight result, O2.5, GG or team O1.5.",
      explanationParagraph: aggressiveExplanation,
      explanationEvidence: aggressiveEvidence
    }),
    safer: copyEnginePick(safer, "safer", "Safer", {
      reasons: [
        "Protects the main match story with a lower line or result cushion.",
        "Chosen only when it remains aligned with the primary direction."
      ],
      cautions: [
        "Safer means broader coverage, not certainty."
      ],
      description:
        "Lower-risk expression of the same match direction: DNB, Double Chance, O1.5, U3.5 or team O0.5.",
      explanationParagraph: saferExplanation,
      explanationEvidence: saferEvidence
    }),
    venue: copyEnginePick(venueSelection.market, "venue", "Venue Pattern", {
      reasons: venueSelection.reasons,
      cautions: quality.score < 0.52
        ? ["Venue samples are small, so the venue engine is partly smoothed toward league norms."]
        : [],
      description:
        "Uses the home venue HT/FT profile against the away venue's opposite transitions, Potosi-style.",
      explanationParagraph: venueExplanation,
      explanationEvidence: venueEvidence,
      venueRoute: venueSelection.route
    })
  };
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


function buildDecisionTrace({
  input,
  primary,
  supporting,
  rankedMarkets,
  matrix,
  direct,
  goals,
  quality,
  homeProfile,
  awayProfile,
  story,
  enginePicks,
  venue
}) {
  const mode = primary.qualified ? "qualified" : "directional";
  const topAlternatives = rankedMarkets
    .filter((market) => market.key !== primary.key)
    .slice(0, 5)
    .map((market) => ({
      key: market.key,
      market: market.market,
      selection: market.selection,
      score: market.safetyAdjustedScore,
      threshold: market.threshold,
      qualified: market.qualified,
      tier: market.tier,
      reasons: market.reasons,
      blockers: market.blockers,
      comparisonScore: market.comparisonScore,
      supportRatio: market.supportRatio,
      thresholdEdge: market.thresholdEdge
    }));

  const allHtftIndicators = TRANSITIONS.map((transition) => {
    const homeRate = homeProfile.probabilities[transition];
    const awayOppositeRate = awayProfile.probabilities[OPPOSITE[transition]];
    const combined = matrix.normalized[transition];
    const code = HTFT_CODE[transition];

    let interpretation = "Secondary transition";
    if (combined === Math.max(...Object.values(matrix.normalized))) {
      interpretation = "Strongest compatible HT/FT route";
    } else if (combined >= 0.14) {
      interpretation = "Important supporting route";
    } else if (combined <= 0.04) {
      interpretation = "Weak route";
    }

    return {
      transition,
      code,
      homeRate: round(homeRate),
      awayOppositeRate: round(awayOppositeRate),
      combinedProbability: round(combined),
      interpretation
    };
  });

  const confidence = primary.safetyAdjustedScore;
  const thresholdStatus = primary.qualified
    ? `Passed the ${round(primary.threshold * 100, 1)}% publication threshold.`
    : `Best available direction, but below the ${round(primary.threshold * 100, 1)}% strong-pick threshold.`;

  const whyChosen = [
    ...primary.reasons,
    primary.market === "Double Chance"
      ? "Double Chance remained on top even after its protection-market penalty, so the safer two-outcome route was genuinely strongest."
      : `The ${primary.market} route beat the protected Double Chance routes after threshold-relative comparison.` ,
    `Model score: ${round(primary.modelScore * 100, 1)}%; safety-adjusted score: ${round(confidence * 100, 1)}%.`,
    thresholdStatus,
    `Leading half-time direction: ${story.likelyHalfTime}; leading full-time direction: ${story.likelyFullTime}.`,
    `Home goal support ${round(goals.metrics.homeGoalSupport * 100, 1)}% vs away goal support ${round(goals.metrics.awayGoalSupport * 100, 1)}%.`
  ];

  const cautions = [
    ...(primary.blockers || []),
    ...(quality.score < 0.52 ? ["Historical sample is small, so league smoothing has more influence."] : []),
    ...(!primary.qualified ? ["Treat this as a direction, not a banker or high-confidence pick."] : [])
  ];

  return {
    mode,
    qualified: primary.qualified,
    headline: primary.qualified
      ? "Papa’s strongest qualified market"
      : "Papa’s best available direction",
    summary: `${primary.selection}. ${story.narrative}`,
    whyChosen,
    cautions,
    supportingPick: supporting
      ? {
          market: supporting.market,
          selection: supporting.selection,
          score: supporting.safetyAdjustedScore,
          qualified: supporting.qualified,
          tier: supporting.tier
        }
      : null,
    enginePicks,
    venuePatternReview: {
      reasons: venue.reasons,
      indicators: venue.indicators,
      topTransitions: venue.topTransitions,
      samples: venue.samples,
      fullTime: Object.fromEntries(
        Object.entries(venue.direct.ft).map(([key, value]) => [key, round(value)])
      ),
      halfTime: Object.fromEntries(
        Object.entries(venue.direct.ht).map(([key, value]) => [key, round(value)])
      )
    },
    alternatives: topAlternatives,
    marketComparison: rankedMarkets.slice(0, 10).map((market) => ({
      key: market.key,
      family: market.family,
      market: market.market,
      selection: market.selection,
      score: market.safetyAdjustedScore,
      threshold: market.threshold,
      supportRatio: market.supportRatio,
      thresholdEdge: market.thresholdEdge,
      comparisonScore: market.comparisonScore,
      qualified: market.qualified,
      selected: market.key === primary.key,
      reasons: market.reasons,
      blockers: market.blockers
    })),
    selectionMethod:
      "Markets are compared by support relative to their own thresholds. Double Chance receives a protection penalty so its naturally larger union probability cannot dominate by default.",
    allHtftIndicators,
    directReadout: {
      fullTime: Object.fromEntries(Object.entries(direct.ft).map(([key, value]) => [key, round(value)])),
      halfTime: Object.fromEntries(Object.entries(direct.ht).map(([key, value]) => [key, round(value)])),
      doubleChance: Object.fromEntries(
        Object.entries(direct.doubleChance).map(([key, value]) => [key, round(value)])
      ),
      drawNoBet: Object.fromEntries(Object.entries(direct.dnb).map(([key, value]) => [key, round(value)]))
    },
    dataQuality: {
      score: round(quality.score),
      label: quality.label,
      homeSamples: quality.homeSamples,
      awaySamples: quality.awaySamples
    },
    goalReadout: {
      homeGoalSupport: round(goals.metrics.homeGoalSupport),
      awayGoalSupport: round(goals.metrics.awayGoalSupport),
      ggYes: round(goals.scores.ggYes),
      ggNo: round(goals.scores.ggNo),
      over15: round(goals.scores.over15),
      over25: round(goals.scores.over25),
      under35: round(goals.scores.under35),
      favouriteOver15: round(goals.scores.favouriteOver15)
    }
  };
}


function inputSampleCount(team) {
  return (
    Number(team.htft?.overall?.matches || 0) +
    Number(team.htft?.venue?.matches || 0) +
    Number(team.htft?.recent?.matches || 0)
  );
}

function requireTeamEvidence(input) {
  const homeSamples = inputSampleCount(input.home);
  const awaySamples = inputSampleCount(input.away);

  if (homeSamples <= 0 || awaySamples <= 0) {
    const error = new Error(
      "PapaSense refuses to publish a prior-only prediction. Both teams need real HT/FT history."
    );
    error.code = "PRIOR_ONLY_PREDICTION_BLOCKED";
    throw error;
  }
}

export function predictMatch(input) {
  if (!input?.home?.name || !input?.away?.name) {
    throw new Error("Both home.name and away.name are required.");
  }
  requireTeamEvidence(input);

  const leagueBaseline = { ...DEFAULT_LEAGUE_BASELINE, ...(input.league?.transitionBaseline || {}) };
  const homeProfile = blendTeamProfile(input.home, leagueBaseline);
  const awayProfile = blendTeamProfile(input.away, leagueBaseline);
  const matrix = buildTransitionMatrix(homeProfile, awayProfile);
  const direct = directProbabilities(matrix);
  const quality = dataQuality(input.home, input.away, homeProfile, awayProfile);
  const goals = goalLogic(input, matrix, homeProfile, awayProfile, quality);
  const venue = venuePatternContext(input, leagueBaseline);
  const candidates = marketCandidates(input, matrix, direct, goals, quality);
  const rankedMarkets = rankMarkets(candidates, venue, input);
  const defaultPrimary = choosePrimaryMarket(rankedMarkets);
  const papaPolicy = applyPapasPickPolicy({
    rankedMarkets,
    defaultPrimary,
    input,
    matrix
  });
  const primary = papaPolicy.primary;
  const enginePicks = buildEngineSuite({
    rankedMarkets,
    primary,
    venue,
    input,
    goals,
    quality
  });
  const supporting = rankedMarkets.find(
    (market) =>
      market.key !== primary.key &&
      market.market !== primary.market &&
      (market.qualified || market.directionalRankScore >= 0.58)
  ) || null;
  const story = matchStory(input, matrix, direct, goals);
  const decisionTrace = buildDecisionTrace({
    input,
    primary,
    supporting,
    rankedMarkets,
    matrix,
    direct,
    goals,
    quality,
    homeProfile,
    awayProfile,
    story,
    enginePicks,
    venue
  });

  return {
    fixtureId: input.fixtureId || null,
    competition: input.competition || "",
    kickoff: input.kickoff || null,
    home: input.home.name,
    away: input.away.name,
    generatedAt: new Date().toISOString(),
    odds: input.odds || null,
    profileAudit: input.profileAudit || null,
    analysisFingerprint: input.analysisFingerprint || null,
    dataQuality: {
      score: round(quality.score),
      label: quality.label,
      homeSamples: quality.homeSamples,
      awaySamples: quality.awaySamples
    },
    primaryPrediction: primary,
    enginePicks,
    defaultEngine: "primary",
    supportingPrediction: supporting,
    noBet: false,
    qualified: primary.qualified,
    directionMode: primary.qualified ? "qualified" : "directional",
    papaPolicy: papaPolicy.trace,
    decisionTrace: {
      ...decisionTrace,
      papaPolicy: papaPolicy.trace
    },
    story,
    directProbabilities: {
      fullTime: Object.fromEntries(Object.entries(direct.ft).map(([key, value]) => [key, round(value)])),
      halfTime: Object.fromEntries(Object.entries(direct.ht).map(([key, value]) => [key, round(value)])),
      doubleChance: Object.fromEntries(
        Object.entries(direct.doubleChance).map(([key, value]) => [key, round(value)])
      ),
      drawNoBet: Object.fromEntries(Object.entries(direct.dnb).map(([key, value]) => [key, round(value)]))
    },
    venuePattern: {
      topTransitions: venue.topTransitions,
      indicators: venue.indicators,
      samples: venue.samples,
      fullTime: Object.fromEntries(
        Object.entries(venue.direct.ft).map(([key, value]) => [key, round(value)])
      ),
      halfTime: Object.fromEntries(
        Object.entries(venue.direct.ht).map(([key, value]) => [key, round(value)])
      )
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
      "Prior-only predictions are blocked; both teams must contribute real HT/FT history.",
      "Home and away orientation is resolved before translating W/W into 1/1 or 2/2.",
      "GG requires two independent scoring routes; one strong team cannot create GG alone.",
      "Under 3.5 cannot qualify from stable transitions alone.",
      "Small samples are smoothed toward the league baseline and receive a confidence penalty.",
      "Every fixture receives one direction; only threshold-passing selections are labelled Qualified.",
      "Directional picks are clearly marked when the best available market remains below the strong-pick threshold."
    ]
  };
}
