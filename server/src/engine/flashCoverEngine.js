export const FLASH_ENGINE_NAME = "Flash — Cover IQ";
export const FLASH_ENGINE_VERSION = "flash-cover-iq-v1.1.0";
export const FLASH_ODDS_MIN = 1.2;
export const FLASH_ODDS_MAX = 1.85;
export const FLASH_MODEL_MIN = 0.75;
export const FLASH_DIRECT_SIDE_MIN = 0.7;
export const FLASH_DIRECT_COMBINED_MIN = 0.75;
export const FLASH_RESCUE_MIN = 0.1;
export const FLASH_EV_MIN = 1.04;
export const FLASH_CONFIDENCE_MIN = 80;
export const FLASH_LOWER_MIN = 0.68;
export const FLASH_MIN_SPLIT_MATCHES = 5;
export const FLASH_MAX_SPLIT_MATCHES = 10;

const RESULT = Object.freeze({ HOME: "home", DRAW: "draw", AWAY: "away" });

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function finitePrice(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 1 ? number : null;
}

function result(home, away) {
  if (home > away) return RESULT.HOME;
  if (home < away) return RESULT.AWAY;
  return RESULT.DRAW;
}

function scoreNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normaliseGame(game) {
  const ftHome = scoreNumber(game?.ftHome ?? game?.fulltime_home);
  const ftAway = scoreNumber(game?.ftAway ?? game?.fulltime_away);
  if (ftHome == null || ftAway == null) return null;
  const htHome = scoreNumber(game?.htHome ?? game?.halftime_home);
  const htAway = scoreNumber(game?.htAway ?? game?.halftime_away);
  return {
    ftHome,
    ftAway,
    htHome,
    htAway,
    ftResult: result(ftHome, ftAway),
    htResult: htHome == null || htAway == null ? null : result(htHome, htAway),
    total: ftHome + ftAway,
    gg: ftHome > 0 && ftAway > 0,
    cleanSheet: ftHome === 0 || ftAway === 0
  };
}

function marketDefinition({
  key,
  market,
  selection,
  family,
  left,
  right,
  leftLabel,
  rightLabel,
  leftFloor,
  rightFloor,
  lossCondition,
  componentGate = null,
  paired = true
}) {
  return {
    key,
    market,
    selection,
    family,
    left,
    right,
    leftLabel,
    rightLabel,
    leftFloor,
    rightFloor,
    lossCondition,
    componentGate,
    paired,
    wins: (state) => left(state) || right(state)
  };
}

export const FLASH_MARKETS = Object.freeze([
  marketDefinition({
    key: "first-half-or-match-home",
    market: "1st Half Result or Match Result",
    selection: "Home",
    family: "Half or Match Result",
    left: (s) => s.htResult === RESULT.HOME,
    right: (s) => s.ftResult === RESULT.HOME,
    leftLabel: "Home leads at half-time",
    rightLabel: "Home wins full-time",
    leftFloor: 0.4,
    rightFloor: 0.52,
    componentGate: (left, right) => left >= 0.4 || right >= 0.52,
    lossCondition: "Home neither leads at half-time nor wins at full-time.",
    paired: false
  }),
  marketDefinition({
    key: "first-half-or-match-draw",
    market: "1st Half Result or Match Result",
    selection: "Draw",
    family: "Half or Match Result",
    left: (s) => s.htResult === RESULT.DRAW,
    right: (s) => s.ftResult === RESULT.DRAW,
    leftLabel: "First half is drawn",
    rightLabel: "Full-time is drawn",
    leftFloor: 0.48,
    rightFloor: 0.28,
    componentGate: (left, right) => left >= 0.48 || right >= 0.28,
    lossCondition: "Neither half-time nor full-time finishes level.",
    paired: false
  }),
  marketDefinition({
    key: "first-half-or-match-away",
    market: "1st Half Result or Match Result",
    selection: "Away",
    family: "Half or Match Result",
    left: (s) => s.htResult === RESULT.AWAY,
    right: (s) => s.ftResult === RESULT.AWAY,
    leftLabel: "Away leads at half-time",
    rightLabel: "Away wins full-time",
    leftFloor: 0.4,
    rightFloor: 0.52,
    componentGate: (left, right) => left >= 0.4 || right >= 0.52,
    lossCondition: "Away neither leads at half-time nor wins at full-time.",
    paired: false
  }),
  ...[
    ["home", RESULT.HOME, "Home Team", "Home fails to win"],
    ["draw", RESULT.DRAW, "Draw", "The match is not drawn"],
    ["away", RESULT.AWAY, "Away", "Away fails to win"]
  ].flatMap(([side, resultKey, label, failure]) => [
    marketDefinition({
      key: `${side}-or-over-25`,
      market: `${side === "away" ? "Away" : label} or Over 2.5`,
      selection: "Yes",
      family: "Result or Total",
      left: (s) => s.ftResult === resultKey,
      right: (s) => s.total >= 3,
      leftLabel: `${label} result`,
      rightLabel: "Over 2.5",
      leftFloor: side === "draw" ? 0.25 : 0.45,
      rightFloor: side === "draw" ? 0.6 : 0.58,
      lossCondition: `${failure} and the match stays Under 2.5.`
    }),
    marketDefinition({
      key: `${side}-or-under-25`,
      market: `${side === "away" ? "Away" : label} or Under 2.5`,
      selection: "Yes",
      family: "Result or Total",
      left: (s) => s.ftResult === resultKey,
      right: (s) => s.total <= 2,
      leftLabel: `${label} result`,
      rightLabel: "Under 2.5",
      leftFloor: side === "draw" ? 0.27 : 0.45,
      rightFloor: 0.6,
      lossCondition: `${failure} and the match goes Over 2.5.`
    }),
    marketDefinition({
      key: `${side}-or-gg`,
      market: `${side === "away" ? "Away Team" : label} or GG`,
      selection: "Yes",
      family: "Result or GG",
      left: (s) => s.ftResult === resultKey,
      right: (s) => s.gg,
      leftLabel: `${label} result`,
      rightLabel: "GG",
      leftFloor: side === "draw" ? 0.25 : 0.43,
      rightFloor: side === "draw" ? 0.62 : 0.6,
      lossCondition: `${failure} and at least one team does not score.`
    }),
    marketDefinition({
      key: `${side}-or-any-clean-sheet`,
      market: `${side === "away" ? "Away Team" : label} or Any Clean Sheet`,
      selection: "Yes",
      family: "Result or Clean Sheet",
      left: (s) => s.ftResult === resultKey,
      right: (s) => s.cleanSheet,
      leftLabel: `${label} result`,
      rightLabel: "Any clean sheet",
      leftFloor: side === "draw" ? 0.27 : 0.45,
      rightFloor: 0.6,
      lossCondition: `${failure} and both teams score.`
    })
  ])
]);

function weightedRows(games = []) {
  const rows = games.map(normaliseGame).filter(Boolean).slice(0, FLASH_MAX_SPLIT_MATCHES);
  if (!rows.length) return [];
  const rawWeights = rows.map((_row, index) => index < 5 ? 0.14 : 0.06);
  const total = rawWeights.reduce((sum, weight) => sum + weight, 0);
  return rows.map((row, index) => ({ row, weight: rawWeights[index] / total }));
}

function weightedAverage(rows, getter) {
  const totalWeight = rows.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return 0;
  return rows.reduce((sum, item) => sum + item.weight * Number(getter(item.row) || 0), 0) / totalWeight;
}

function sideRates(games = [], side = RESULT.HOME) {
  const weighted = weightedRows(games);
  const isHome = side === RESULT.HOME;
  const goalsFor = (s) => isHome ? s.ftHome : s.ftAway;
  const goalsAgainst = (s) => isHome ? s.ftAway : s.ftHome;
  const htFor = (s) => isHome ? s.htHome : s.htAway;
  const htAgainst = (s) => isHome ? s.htAway : s.htHome;
  return {
    matches: weighted.length,
    gf: weightedAverage(weighted, goalsFor),
    ga: weightedAverage(weighted, goalsAgainst),
    htGf: weightedAverage(weighted.filter((item) => htFor(item.row) != null), htFor),
    htGa: weightedAverage(weighted.filter((item) => htAgainst(item.row) != null), htAgainst),
    ppg: weightedAverage(weighted, (s) => {
      const r = isHome ? s.ftResult : s.ftResult === RESULT.HOME ? RESULT.AWAY : s.ftResult === RESULT.AWAY ? RESULT.HOME : RESULT.DRAW;
      return r === RESULT.HOME ? 3 : r === RESULT.DRAW ? 1 : 0;
    })
  };
}

function poisson(lambda, max) {
  const values = [Math.exp(-lambda)];
  for (let k = 1; k <= max; k += 1) values.push(values[k - 1] * lambda / k);
  const mass = values.reduce((sum, value) => sum + value, 0);
  values[max] += Math.max(0, 1 - mass);
  return values;
}

function expectedGoalModel(homeGames, awayGames, league = {}) {
  const home = sideRates(homeGames, RESULT.HOME);
  const away = sideRates(awayGames, RESULT.AWAY);
  const leagueHome = Number(league.homeGoals) || 1.42;
  const leagueAway = Number(league.awayGoals) || 1.12;
  const rawHome = (home.gf + away.ga) / 2;
  const rawAway = (away.gf + home.ga) / 2;
  const lambdaHome = clamp(rawHome * 0.78 + leagueHome * 0.22, 0.18, 3.8);
  const lambdaAway = clamp(rawAway * 0.78 + leagueAway * 0.22, 0.12, 3.4);
  const rawHtHome = (home.htGf + away.htGa) / 2;
  const rawHtAway = (away.htGf + home.htGa) / 2;
  const htHome = clamp(rawHtHome * 0.82 + lambdaHome * 0.18 * 0.44, 0.05, lambdaHome * 0.68);
  const htAway = clamp(rawHtAway * 0.82 + lambdaAway * 0.18 * 0.44, 0.04, lambdaAway * 0.68);
  return {
    home,
    away,
    lambdaHome,
    lambdaAway,
    htHome,
    htAway,
    shHome: Math.max(0.05, lambdaHome - htHome),
    shAway: Math.max(0.05, lambdaAway - htAway)
  };
}

function simulatedStates(model) {
  const hh = poisson(model.htHome, 4);
  const ha = poisson(model.htAway, 4);
  const sh = poisson(model.shHome, 6);
  const sa = poisson(model.shAway, 6);
  const states = [];
  let totalMass = 0;
  for (let h = 0; h < hh.length; h += 1) {
    for (let a = 0; a < ha.length; a += 1) {
      for (let h2 = 0; h2 < sh.length; h2 += 1) {
        for (let a2 = 0; a2 < sa.length; a2 += 1) {
          const probability = hh[h] * ha[a] * sh[h2] * sa[a2];
          const row = normaliseGame({ htHome: h, htAway: a, ftHome: h + h2, ftAway: a + a2 });
          states.push({ ...row, probability });
          totalMass += probability;
        }
      }
    }
  }
  return states.map((state) => ({ ...state, probability: state.probability / totalMass }));
}

function probability(states, predicate) {
  return states.reduce((sum, state) => sum + (predicate(state) ? state.probability : 0), 0);
}

function directRate(games, market) {
  const rows = weightedRows(games);
  if (!rows.length) return 0;
  return rows.reduce((sum, item) => sum + (market.wins(item.row) ? item.weight : 0), 0);
}

function h2hRate(games, market) {
  const rows = weightedRows(games);
  if (!rows.length) return null;
  return rows.reduce((sum, item) => sum + (market.wins(item.row) ? item.weight : 0), 0);
}

function fairYesProbability(yesOdds, noOdds) {
  const yes = finitePrice(yesOdds);
  const no = finitePrice(noOdds);
  if (!yes || !no) return null;
  const yesImplied = 1 / yes;
  const noImplied = 1 / no;
  return yesImplied / (yesImplied + noImplied);
}

function fairThreeWayProbability(key, prices) {
  if (!key.startsWith("first-half-or-match-")) return null;
  const outcomes = ["home", "draw", "away"]
    .map((side) => finitePrice(prices[`first-half-or-match-${side}`]));
  const selected = finitePrice(prices[key]);
  if (!selected || outcomes.some((price) => !price)) return null;
  const totalImplied = outcomes.reduce((sum, price) => sum + 1 / price, 0);
  return (1 / selected) / totalImplied;
}

function dataQuality(homeCount, awayCount) {
  const coverage = Math.min(1, (homeCount + awayCount) / (FLASH_MAX_SPLIT_MATCHES * 2));
  return 0.65 + coverage * 0.35;
}

function rejection(reason, details = {}) {
  return { passed: false, reason, ...details };
}

function candidateAudit({ market, states, homeGames, awayGames, h2hGames, prices, quality }) {
  const odds = finitePrice(prices[market.key]);
  if (!odds) return rejection("SportyBet has no live price for this Flash market");
  if (odds < FLASH_ODDS_MIN || odds > FLASH_ODDS_MAX) {
    return rejection(`SportyBet odds ${odds.toFixed(2)} are outside 1.20–1.85`, { odds });
  }
  const noOdds = finitePrice(prices[`${market.key}-no`]);
  if (market.paired && !noOdds) {
    return rejection("The matching SportyBet No price is missing, so the market cannot be de-vigged", { odds });
  }

  const leftProbability = probability(states, market.left);
  const rightProbability = probability(states, market.right);
  const simulatedProbability = probability(states, market.wins);
  const componentPass = market.componentGate
    ? market.componentGate(leftProbability, rightProbability)
    : leftProbability >= market.leftFloor && rightProbability >= market.rightFloor;
  if (!componentPass) {
    return rejection("The two component routes did not clear their individual probability gates", {
      odds,
      leftProbability,
      rightProbability
    });
  }

  const rescueGain = simulatedProbability - Math.max(leftProbability, rightProbability);
  if (rescueGain < FLASH_RESCUE_MIN) {
    return rejection("The second leg adds less than 10 percentage points of real cover", {
      odds,
      rescueGain,
      leftProbability,
      rightProbability
    });
  }

  const homeDirect = directRate(homeGames, market);
  const awayDirect = directRate(awayGames, market);
  const combinedDirect = (homeDirect + awayDirect) / 2;
  if (homeDirect < FLASH_DIRECT_SIDE_MIN || awayDirect < FLASH_DIRECT_SIDE_MIN) {
    return rejection("Home and away split samples do not both reach the 70% direct-hit gate", {
      odds,
      homeDirect,
      awayDirect,
      combinedDirect
    });
  }
  if (combinedDirect < FLASH_DIRECT_COMBINED_MIN) {
    return rejection("The combined split hit rate is below 75%", {
      odds,
      homeDirect,
      awayDirect,
      combinedDirect
    });
  }

  const h2h = h2hRate(h2hGames, market);
  const modelProbability = h2hGames.length >= 3 && h2h != null
    ? simulatedProbability * 0.67 + combinedDirect * 0.28 + h2h * 0.05
    : simulatedProbability * 0.7 + combinedDirect * 0.3;
  const modelSpread = Math.abs(simulatedProbability - combinedDirect);
  if (modelSpread > 0.2) {
    return rejection("Scoreline model and direct split evidence disagree by more than 20 points", {
      odds,
      modelProbability,
      simulatedProbability,
      combinedDirect
    });
  }
  if (modelProbability < FLASH_MODEL_MIN) {
    return rejection("The combined model probability is below 75%", { odds, modelProbability });
  }

  const fairProbability = market.paired
    ? fairYesProbability(odds, noOdds)
    : fairThreeWayProbability(market.key, prices) || 1 / odds;
  const edge = modelProbability - fairProbability;
  const expectedValue = modelProbability * odds;
  if (expectedValue < FLASH_EV_MIN || edge < 0.03) {
    return rejection("The SportyBet price does not leave a 4% EV index and 3-point model edge", {
      odds,
      modelProbability,
      fairProbability,
      edge,
      expectedValue
    });
  }

  const lowerEstimate = clamp(
    modelProbability - (1 - quality) * 0.08 - modelSpread * 0.12 - 0.03
  );
  if (lowerEstimate < FLASH_LOWER_MIN) {
    return rejection("The lower confidence estimate is below 68%", { odds, lowerEstimate });
  }
  const confidence = 100 * (
    modelProbability * 0.55 +
    combinedDirect * 0.25 +
    quality * 0.2
  );
  if (confidence < FLASH_CONFIDENCE_MIN) {
    return rejection("The evidence-weighted confidence score is below 80", { odds, confidence });
  }

  return {
    passed: true,
    key: market.key,
    family: market.family,
    market: market.market,
    selection: market.selection,
    odds,
    noOdds,
    modelProbability,
    simulatedProbability,
    lowerEstimate,
    fairProbability,
    edge,
    expectedValue,
    confidence,
    dataConfidence: quality * 100,
    homeDirect,
    awayDirect,
    combinedDirect,
    h2hRate: h2h,
    rescueGain,
    componentProbabilities: {
      left: leftProbability,
      right: rightProbability,
      leftLabel: market.leftLabel,
      rightLabel: market.rightLabel
    },
    lossCondition: market.lossCondition
  };
}

function noPick(reasons, audit = {}) {
  return {
    available: false,
    key: "no-pick",
    market: "No Pick",
    selection: "SKIP",
    score: 0,
    confidence: 0,
    qualified: false,
    reasons: Array.isArray(reasons) ? reasons : [reasons],
    cautions: Array.isArray(reasons) ? reasons : [reasons],
    engine: FLASH_ENGINE_NAME,
    engineKey: "flash",
    engineVersion: FLASH_ENGINE_VERSION,
    internalAudit: audit
  };
}

export function selectFlashPick({
  homeName = "Home",
  awayName = "Away",
  homeGames = [],
  awayGames = [],
  h2hGames = [],
  league = {},
  odds = {},
  redFlags = []
} = {}) {
  const homeRows = homeGames.map(normaliseGame).filter(Boolean).slice(0, FLASH_MAX_SPLIT_MATCHES);
  const awayRows = awayGames.map(normaliseGame).filter(Boolean).slice(0, FLASH_MAX_SPLIT_MATCHES);
  if (homeRows.length < FLASH_MIN_SPLIT_MATCHES || awayRows.length < FLASH_MIN_SPLIT_MATCHES) {
    return noPick(
      `Flash needs at least five home and five away split matches. It found ${homeRows.length} and ${awayRows.length}.`,
      { homeMatches: homeRows.length, awayMatches: awayRows.length }
    );
  }
  const hardFlag = (redFlags || []).find((flag) =>
    ["EARLY_SEASON", "UNSUPPORTED_COMPETITION"].includes(String(flag?.code || "").toUpperCase()) ||
    String(flag?.severity || "").toLowerCase() === "block"
  );
  if (hardFlag) return noPick(hardFlag.reason || "A hard fixture-risk flag blocked Flash.", { redFlags });

  const prices = odds?.odds && typeof odds.odds === "object" ? { ...odds, ...odds.odds } : odds;
  const model = expectedGoalModel(homeRows, awayRows, league);
  const states = simulatedStates(model);
  const quality = dataQuality(homeRows.length, awayRows.length);
  const audits = FLASH_MARKETS.map((market) => ({
    market,
    audit: candidateAudit({
      market,
      states,
      homeGames: homeRows,
      awayGames: awayRows,
      h2hGames: h2hGames.map(normaliseGame).filter(Boolean).slice(0, 5),
      prices,
      quality
    })
  }));
  const passed = audits
    .filter((row) => row.audit.passed)
    .map((row) => ({ ...row.audit, marketDefinition: row.market }))
    .sort((left, right) =>
      right.modelProbability - left.modelProbability ||
      right.confidence - left.confidence ||
      right.expectedValue - left.expectedValue ||
      left.key.localeCompare(right.key)
    );

  if (!passed.length) {
    const counts = {};
    for (const row of audits) counts[row.audit.reason] = (counts[row.audit.reason] || 0) + 1;
    const reason = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
      "No Flash market cleared every probability, split, rescue, odds and value gate.";
    return noPick(reason, {
      version: FLASH_ENGINE_VERSION,
      expectedGoals: { home: model.lambdaHome, away: model.lambdaAway },
      dataConfidence: quality * 100,
      rejectionCounts: counts,
      redFlags
    });
  }

  const picks = passed.map((winner) => qualifyFlashMarket(winner, model, quality, h2hGames.length, passed.length));
  return { ...picks[0], picks };
}

function qualifyFlashMarket(winner, model, quality, h2hCount, candidateCount) {
  const left = winner.componentProbabilities;
  const explanation = `${winner.market} has two independently supported routes: ${left.leftLabel} ${Math.round(left.left * 100)}% and ${left.rightLabel} ${Math.round(left.right * 100)}%. The combined split evidence hit ${Math.round(winner.combinedDirect * 100)}%.`;
  return {
    available: true,
    key: winner.key,
    family: winner.family,
    market: winner.market,
    selection: winner.selection,
    odds: round(winner.odds, 2),
    noOdds: winner.noOdds ? round(winner.noOdds, 2) : null,
    book: "SportyBet",
    score: round(winner.confidence, 1),
    confidence: round(winner.confidence, 1),
    modelProbability: round(winner.modelProbability, 4),
    lowerEstimate: round(winner.lowerEstimate, 4),
    fairProbability: round(winner.fairProbability, 4),
    edge: round(winner.edge, 4),
    expectedValue: round(winner.expectedValue, 4),
    rescueGain: round(winner.rescueGain, 4),
    directHitRates: {
      home: round(winner.homeDirect, 4),
      away: round(winner.awayDirect, 4),
      combined: round(winner.combinedDirect, 4)
    },
    componentProbabilities: {
      ...left,
      left: round(left.left, 4),
      right: round(left.right, 4)
    },
    lossCondition: winner.lossCondition,
    qualified: true,
    tier: winner.confidence >= 86 ? "FLASH PRIME" : "FLASH QUALIFIED",
    reasons: [explanation, `The second route adds ${Math.round(winner.rescueGain * 100)} points of genuine cover.`],
    cautions: [`Main losing zone: ${winner.lossCondition}`],
    explanationParagraph: explanation,
    publicExplanation: explanation,
    engine: FLASH_ENGINE_NAME,
    engineKey: "flash",
    engineVersion: FLASH_ENGINE_VERSION,
    internalAudit: {
      version: FLASH_ENGINE_VERSION,
      expectedGoals: { home: round(model.lambdaHome), away: round(model.lambdaAway) },
      dataConfidence: round(quality * 100, 1),
      candidateCount,
      h2hWeightApplied: h2hCount >= 3
    }
  };
}
