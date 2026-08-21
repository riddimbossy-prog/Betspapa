export const TOTAL_GOALS_BANKER_VERSION = "goals-banker-v1.2.0";
export const TOTAL_GOALS_BANKER_NAME = "Total Goals Banker";
export const ODDS_MIN = 1.2;
export const ODDS_MAX = 1.55;
export const MIN_LEAGUE_SAMPLE = 60;
export const MIN_TEAM_SEASON = 8;
export const MIN_TEAM_RECENT = 5;

const SEASON_RATE_KEYS = new Set(["over15Rate", "over25Rate", "under25Rate", "under35Rate"]);

export const GOAL_MARKETS = [
  { key: "over-05", label: "Over 0.5 Goals", market: "Total Goals", direction: "over", rateKey: "over05Rate", floor: 0.82 },
  { key: "over-15", label: "Over 1.5 Goals", market: "Total Goals", direction: "over", rateKey: "over15Rate", floor: 0.7 },
  { key: "over-25", label: "Over 2.5 Goals", market: "Total Goals", direction: "over", rateKey: "over25Rate", floor: 0.645 },
  { key: "over-35", label: "Over 3.5 Goals", market: "Total Goals", direction: "over", rateKey: "over35Rate", floor: 0.58 },
  { key: "under-15", label: "Under 1.5 Goals", market: "Total Goals", direction: "under", rateKey: "under15Rate", floor: 0.58 },
  { key: "under-25", label: "Under 2.5 Goals", market: "Total Goals", direction: "under", rateKey: "under25Rate", floor: 0.645 },
  { key: "under-35", label: "Under 3.5 Goals", market: "Total Goals", direction: "under", rateKey: "under35Rate", floor: 0.7 },
  { key: "under-45", label: "Under 4.5 Goals", market: "Total Goals", direction: "under", rateKey: "under45Rate", floor: 0.78 },
  { key: "btts-yes", label: "Both Teams to Score — Yes", market: "Both Teams To Score", direction: "over", rateKey: "bttsRate", floor: 0.64 },
  { key: "btts-no", label: "Both Teams to Score — No", market: "Both Teams To Score", direction: "under", rateKey: "bttsNoRate", floor: 0.6 },
  { key: "fh-over-05", label: "1st Half Over 0.5 Goals", market: "First-Half Goals", direction: "over", rateKey: "fhOver05Rate", floor: 0.72 },
  { key: "fh-under-15", label: "1st Half Under 1.5 Goals", market: "First-Half Goals", direction: "under", rateKey: "fhUnder15Rate", floor: 0.66 },
  {
    key: "home-over-05",
    label: "Home Over 0.5 Goals",
    market: "Team Goals",
    direction: "over",
    homeRateKey: "scoredRate",
    awayRateKey: "concededRate",
    floor: 0.72,
    labelOf: (home) => `${home} Over 0.5 Goals`
  },
  {
    key: "home-over-15",
    label: "Home Over 1.5 Goals",
    market: "Team Goals",
    direction: "over",
    homeRateKey: "scored15Rate",
    awayRateKey: "conceded15Rate",
    floor: 0.58,
    labelOf: (home) => `${home} Over 1.5 Goals`
  },
  {
    key: "away-over-05",
    label: "Away Over 0.5 Goals",
    market: "Team Goals",
    direction: "over",
    homeRateKey: "concededRate",
    awayRateKey: "scoredRate",
    floor: 0.7,
    labelOf: (_home, away) => `${away} Over 0.5 Goals`
  },
  {
    key: "away-over-15",
    label: "Away Over 1.5 Goals",
    market: "Team Goals",
    direction: "over",
    homeRateKey: "conceded15Rate",
    awayRateKey: "scored15Rate",
    floor: 0.55,
    labelOf: (_home, away) => `${away} Over 1.5 Goals`
  }
];

export const GOAL_MARKET_KEYS = GOAL_MARKETS.map((market) => market.key);

const ODDS_ALIASES = {
  "over-05": ["over05", "over_0_5", "over0.5", "OVER_0_5"],
  "over-15": ["over15", "over_1_5", "over_15", "over1.5", "over 1.5", "o15", "OVER_1_5"],
  "over-25": ["over25", "over_2_5", "over_25", "over2.5", "over 2.5", "o25", "OVER_2_5"],
  "over-35": ["over35", "over_3_5", "over3.5", "OVER_3_5"],
  "under-15": ["under15", "under_1_5", "under1.5", "UNDER_1_5"],
  "under-25": ["under25", "under_2_5", "under_25", "under2.5", "under 2.5", "u25", "UNDER_2_5"],
  "under-35": ["under35", "under_3_5", "under_35", "under3.5", "under 3.5", "u35", "UNDER_3_5"],
  "under-45": ["under45", "under_4_5", "under4.5", "UNDER_4_5"],
  "btts-yes": ["bttsyes", "gg", "btts_yes", "BTTS_YES"],
  "btts-no": ["bttsno", "ng", "btts_no", "BTTS_NO"]
};

function rate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

export function impliedOdds(hitRate) {
  const value = rate(hitRate);
  if (value <= 0) return null;
  return round(1 / value, 3);
}

export function inBankerOddsBand(odds) {
  const value = Number(odds);
  return Number.isFinite(value) && value >= ODDS_MIN && value <= ODDS_MAX;
}

export function normaliseGoalRates(source = {}) {
  const over15Rate = rate(source.over15Rate ?? source.over_15_rate);
  const over25Rate = rate(source.over25Rate ?? source.over_25_rate);
  const under35Rate = rate(source.under35Rate ?? source.under_35_rate);
  const over05Rate = rate(source.over05Rate ?? source.over_05_rate);
  const over35Rate = rate(source.over35Rate ?? source.over_35_rate);
  const under15Rate = rate(source.under15Rate ?? source.under_15_rate) ||
    (over15Rate > 0 ? round(1 - over15Rate, 4) : 0);
  const under25Rate = rate(source.under25Rate ?? source.under_25_rate) ||
    (over25Rate > 0 ? round(1 - over25Rate, 4) : 0);
  const under45Rate = rate(source.under45Rate ?? source.under_45_rate);
  return {
    over05Rate,
    over15Rate,
    over25Rate,
    over35Rate,
    under15Rate,
    under25Rate,
    under35Rate,
    under45Rate,
    bttsRate: rate(source.bttsRate ?? source.btts_rate),
    bttsNoRate: rate(source.bttsNoRate ?? source.btts_no_rate),
    scoredRate: rate(source.scoredRate ?? source.scored_rate),
    concededRate: rate(source.concededRate ?? source.conceded_rate),
    scored15Rate: rate(source.scored15Rate ?? source.scored_15_rate),
    conceded15Rate: rate(source.conceded15Rate ?? source.conceded_15_rate),
    fhOver05Rate: rate(source.fhOver05Rate ?? source.fh_over_05_rate),
    fhUnder15Rate: rate(source.fhUnder15Rate ?? source.fh_under_15_rate),
    matches: rate(source.matches ?? source.matches_played),
    fhMatches: rate(source.fhMatches ?? source.fh_matches)
  };
}

export function ratesFromMatches(games = []) {
  let matches = 0;
  let over05 = 0;
  let over15 = 0;
  let over25 = 0;
  let over35 = 0;
  let over45 = 0;
  let under15 = 0;
  let under25 = 0;
  let under35 = 0;
  let under45 = 0;
  let btts = 0;
  let bttsNo = 0;
  let scored = 0;
  let conceded = 0;
  let scored15 = 0;
  let conceded15 = 0;
  let pairMatches = 0;
  let fhMatches = 0;
  let fhOver05 = 0;
  let fhUnder15 = 0;

  for (const game of games) {
    const scoredGoals = Number(game.ftFor);
    const concededGoals = Number(game.ftAgainst);
    const total = Number(
      game.totalGoals ??
      (Number.isFinite(scoredGoals) && Number.isFinite(concededGoals)
        ? scoredGoals + concededGoals
        : Number(game.fulltime_home) + Number(game.fulltime_away))
    );
    if (!Number.isFinite(total)) continue;
    matches += 1;
    if (total >= 1) over05 += 1;
    if (total >= 2) over15 += 1;
    if (total >= 3) over25 += 1;
    if (total >= 4) over35 += 1;
    if (total >= 5) over45 += 1;
    if (total <= 1) under15 += 1;
    if (total <= 2) under25 += 1;
    if (total <= 3) under35 += 1;
    if (total <= 4) under45 += 1;

    if (Number.isFinite(scoredGoals) && Number.isFinite(concededGoals)) {
      pairMatches += 1;
      if (scoredGoals > 0) scored += 1;
      if (concededGoals > 0) conceded += 1;
      if (scoredGoals >= 2) scored15 += 1;
      if (concededGoals >= 2) conceded15 += 1;
      if (scoredGoals > 0 && concededGoals > 0) btts += 1;
      else bttsNo += 1;
    }

    const htFor = Number(game.htFor ?? game.halftime_home);
    const htAgainst = Number(game.htAgainst ?? game.halftime_away);
    if (Number.isFinite(htFor) && Number.isFinite(htAgainst)) {
      fhMatches += 1;
      const half = htFor + htAgainst;
      if (half >= 1) fhOver05 += 1;
      if (half <= 1) fhUnder15 += 1;
    }
  }

  if (!matches) return normaliseGoalRates();
  const pairs = pairMatches || 0;
  return {
    over05Rate: over05 / matches,
    over15Rate: over15 / matches,
    over25Rate: over25 / matches,
    over35Rate: over35 / matches,
    over45Rate: over45 / matches,
    under15Rate: under15 / matches,
    under25Rate: under25 / matches,
    under35Rate: under35 / matches,
    under45Rate: under45 / matches,
    bttsRate: pairs ? btts / pairs : 0,
    bttsNoRate: pairs ? bttsNo / pairs : 0,
    scoredRate: pairs ? scored / pairs : 0,
    concededRate: pairs ? conceded / pairs : 0,
    scored15Rate: pairs ? scored15 / pairs : 0,
    conceded15Rate: pairs ? conceded15 / pairs : 0,
    fhOver05Rate: fhMatches ? fhOver05 / fhMatches : 0,
    fhUnder15Rate: fhMatches ? fhUnder15 / fhMatches : 0,
    matches,
    fhMatches
  };
}

function walkOdds(node, aliases, depth = 0) {
  if (!node || depth > 5) return null;
  if (typeof node === "number" && node > 1) return node;
  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = walkOdds(entry, aliases, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  for (const [key, value] of Object.entries(node)) {
    const collapsed = String(key).toLowerCase().replace(/[_\s.-]/g, "");
    if (aliases.some((alias) => collapsed === alias.replace(/[_\s.-]/g, "").toLowerCase())) {
      const number = Number(value?.odds ?? value?.price ?? value);
      if (Number.isFinite(number) && number > 1) return number;
    }
    const nested = walkOdds(value, aliases, depth + 1);
    if (nested) return nested;
  }
  return null;
}

export function extractGoalOdds(source, marketKey) {
  if (!source || !ODDS_ALIASES[marketKey]) return null;
  const found = walkOdds(source, ODDS_ALIASES[marketKey]);
  return Number.isFinite(found) && found > 1 ? Number(found) : null;
}

export function leagueAllowsMarket(climateLabel, market) {
  if (climateLabel === "high") return market.direction === "over";
  if (climateLabel === "low") return market.direction === "under";
  return true;
}

export function teamAgrees(rates, market, { floorFudge = 0 } = {}) {
  const value = rate(normaliseGoalRates(rates)[market.rateKey]);
  return value >= market.floor - floorFudge;
}

function sideAgrees(rates, rateKey, floor, fudge = 0) {
  if (!rateKey) return true;
  return rate(normaliseGoalRates(rates)[rateKey]) >= floor - fudge;
}

function bothSidesAgree(homeRates, awayRates, market, fudge = 0) {
  if (market.homeRateKey || market.awayRateKey) {
    return sideAgrees(homeRates, market.homeRateKey, market.floor, fudge)
      && sideAgrees(awayRates, market.awayRateKey, market.floor, fudge);
  }
  return teamAgrees(homeRates, market, { floorFudge: fudge })
    && teamAgrees(awayRates, market, { floorFudge: fudge });
}

function seasonSupports(seasonRates, market) {
  if (!seasonRates.matches) return true;
  const key = market.rateKey;
  if (!key || !SEASON_RATE_KEYS.has(key)) return true;
  return teamAgrees(seasonRates, market);
}

export function selectLeagueGoalPatterns(leagueRates, climateLabel = "neutral") {
  const rates = normaliseGoalRates(leagueRates);
  return GOAL_MARKETS
    .filter((market) => leagueAllowsMarket(climateLabel, market))
    .map((market) => {
      const homeKey = market.homeRateKey || market.rateKey;
      const hitRate = rates[homeKey] || rates[market.rateKey] || 0;
      const implied = impliedOdds(hitRate);
      return {
        ...market,
        hitRate,
        impliedOdds: implied,
        inBand: inBankerOddsBand(implied)
      };
    })
    .filter((pattern) => pattern.hitRate >= pattern.floor)
    .sort((left, right) => right.hitRate - left.hitRate);
}

export function selectTotalGoalsBanker({
  leagueRates = {},
  climateLabel = "neutral",
  climateSource = null,
  leagueSample = 0,
  homeSeason = {},
  awaySeason = {},
  homeRecent = {},
  awayRecent = {},
  odds = {},
  redFlags = [],
  homeName = "Home",
  awayName = "Away"
} = {}) {
  const flags = (redFlags || []).filter(Boolean);
  if (flags.length) {
    return {
      available: false,
      key: "no-pick",
      reasons: flags.map((flag) => flag.reason || flag.label || "Red flag")
    };
  }
  const sample = rate(leagueSample || leagueRates.matches);
  const trustedClimate = ["current", "previous", "blend", "thin-current"].includes(String(climateSource || ""));
  if (sample < 20 || (sample < MIN_LEAGUE_SAMPLE && !trustedClimate)) {
    return { available: false, key: "no-pick", reasons: ["League sample is too thin for a goals banker"] };
  }

  const homeSeasonRates = normaliseGoalRates(homeSeason);
  const awaySeasonRates = normaliseGoalRates(awaySeason);
  const homeRecentRates = normaliseGoalRates(homeRecent);
  const awayRecentRates = normaliseGoalRates(awayRecent);

  if (homeSeasonRates.matches && homeSeasonRates.matches < MIN_TEAM_SEASON) {
    return { available: false, key: "no-pick", reasons: ["Home season goal sample is too thin"] };
  }
  if (awaySeasonRates.matches && awaySeasonRates.matches < MIN_TEAM_SEASON) {
    return { available: false, key: "no-pick", reasons: ["Away season goal sample is too thin"] };
  }
  if (homeRecentRates.matches < MIN_TEAM_RECENT || awayRecentRates.matches < MIN_TEAM_RECENT) {
    return { available: false, key: "no-pick", reasons: ["Both teams need five finished matches pointing the same way"] };
  }

  const patterns = selectLeagueGoalPatterns(leagueRates, climateLabel);
  if (!patterns.length) {
    return { available: false, key: "no-pick", reasons: ["League scoring pattern does not support a goals banker"] };
  }

  const bookOddsMap = odds?.odds && typeof odds.odds === "object" ? odds.odds : odds;
  const hasSportyBet = bookOddsMap && GOAL_MARKETS.some((market) => Number(bookOddsMap[market.key]) > 1);
  if (!hasSportyBet) {
    return { available: false, key: "no-pick", reasons: ["No SportyBet goal price was found for this match"] };
  }

  const candidates = [];
  for (const pattern of patterns) {
    if (!seasonSupports(homeSeasonRates, pattern) || !seasonSupports(awaySeasonRates, pattern)) continue;
    if (!bothSidesAgree(homeRecentRates, awayRecentRates, pattern, 0.1)) continue;

    const bookOdds = Number(bookOddsMap?.[pattern.key]);
    if (!Number.isFinite(bookOdds) || bookOdds <= 1) continue;
    if (!inBankerOddsBand(bookOdds)) continue;

    const homeKey = pattern.homeRateKey || pattern.rateKey;
    const awayKey = pattern.awayRateKey || pattern.rateKey;
    const conservative = Math.min(
      pattern.hitRate || 1,
      rate(homeRecentRates[homeKey]) || 0,
      rate(awayRecentRates[awayKey]) || 0,
      SEASON_RATE_KEYS.has(pattern.rateKey) && homeSeasonRates.matches ? homeSeasonRates[pattern.rateKey] : 1,
      SEASON_RATE_KEYS.has(pattern.rateKey) && awaySeasonRates.matches ? awaySeasonRates[pattern.rateKey] : 1
    );

    const selection = typeof pattern.labelOf === "function"
      ? pattern.labelOf(homeName, awayName)
      : pattern.label;

    candidates.push({
      available: true,
      key: pattern.key,
      market: pattern.market,
      selection,
      direction: pattern.direction,
      qualified: true,
      tier: "Banker",
      odds: round(bookOdds, 3),
      oddsSource: "sportybet",
      book: "SportyBet",
      sportyBetUrl: odds.url || null,
      conservativeRate: round(conservative, 4),
      leagueRate: round(pattern.hitRate, 4),
      homeSeasonRate: round(homeSeasonRates[pattern.rateKey] || homeRecentRates[homeKey], 4),
      awaySeasonRate: round(awaySeasonRates[pattern.rateKey] || awayRecentRates[awayKey], 4),
      homeRecentRate: round(homeRecentRates[homeKey], 4),
      awayRecentRate: round(awayRecentRates[awayKey], 4),
      score: round(conservative * 100 - Math.abs(bookOdds - 1.33) * 8, 2),
      reasons: [
        `League ${selection} hits ${Math.round(pattern.hitRate * 100)}%.`,
        `Both sides point the same way: home last five ${Math.round(rate(homeRecentRates[homeKey]) * 100)}%, away last five ${Math.round(rate(awayRecentRates[awayKey]) * 100)}%.`,
        `SportyBet ${round(bookOdds, 2)} sits inside the 1.20–1.55 banker band.`
      ]
    });
  }

  if (!candidates.length) {
    return {
      available: false,
      key: "no-pick",
      reasons: ["SportyBet has no 1.20–1.55 goal price that matches the league direction and both teams"]
    };
  }

  return candidates.sort((left, right) => right.score - left.score)[0];
}

export function buildLeagueMap(picks = []) {
  const map = new Map();
  for (const pick of picks) {
    const league = pick.league || {};
    const groupKey = `${league.country || ""}:${league.name || "Unknown"}`;
    if (!map.has(groupKey)) {
      map.set(groupKey, {
        country: league.country || null,
        name: league.name || "Unknown",
        market: pick.market,
        selection: pick.selection,
        key: pick.key,
        direction: pick.direction,
        climate: pick.leagueScoring?.label || null,
        over25Rate: pick.leagueScoring?.over25Rate ?? null,
        picks: 0,
        teams: new Set(),
        matches: [],
        markets: new Set()
      });
    }
    const row = map.get(groupKey);
    row.picks += 1;
    row.markets.add(pick.selection);
    if (pick.home?.name) row.teams.add(pick.home.name);
    if (pick.away?.name) row.teams.add(pick.away.name);
    row.matches.push({
      fixtureId: pick.fixtureId || null,
      home: pick.home?.name || "Home",
      away: pick.away?.name || "Away",
      selection: pick.selection || null,
      odds: pick.odds ?? null
    });
    if (row.markets.size > 1) {
      row.selection = `${row.markets.size} goal markets`;
    }
  }
  return [...map.values()]
    .map((row) => {
      const { markets, teams, ...rest } = row;
      return {
        ...rest,
        teamCount: teams.size,
        teams: [...teams].sort((left, right) => String(left).localeCompare(String(right)))
      };
    })
    .sort((left, right) => right.picks - left.picks || String(left.name).localeCompare(String(right.name)));
}
