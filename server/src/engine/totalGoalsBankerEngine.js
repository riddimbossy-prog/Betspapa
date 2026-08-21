export const TOTAL_GOALS_BANKER_VERSION = "goals-banker-v1.1.0";
export const TOTAL_GOALS_BANKER_NAME = "Total Goals Banker";
export const ODDS_MIN = 1.2;
export const ODDS_MAX = 1.55;
export const MIN_LEAGUE_SAMPLE = 60;
export const MIN_TEAM_SEASON = 8;
export const MIN_TEAM_RECENT = 5;

export const GOAL_MARKETS = [
  {
    key: "over-15",
    label: "Over 1.5 Goals",
    market: "Total Goals",
    direction: "over",
    rateKey: "over15Rate",
    climate: "high",
    floor: 0.7
  },
  {
    key: "over-25",
    label: "Over 2.5 Goals",
    market: "Total Goals",
    direction: "over",
    rateKey: "over25Rate",
    climate: "high",
    floor: 0.645
  },
  {
    key: "under-25",
    label: "Under 2.5 Goals",
    market: "Total Goals",
    direction: "under",
    rateKey: "under25Rate",
    climate: "low",
    floor: 0.645
  },
  {
    key: "under-35",
    label: "Under 3.5 Goals",
    market: "Total Goals",
    direction: "under",
    rateKey: "under35Rate",
    climate: "low",
    floor: 0.7
  }
];

const ODDS_ALIASES = {
  "over-15": ["over15", "over_1_5", "over_15", "over1.5", "over 1.5", "o15", "OVER_1_5"],
  "over-25": ["over25", "over_2_5", "over_25", "over2.5", "over 2.5", "o25", "OVER_2_5"],
  "under-25": ["under25", "under_2_5", "under_25", "under2.5", "under 2.5", "u25", "UNDER_2_5"],
  "under-35": ["under35", "under_3_5", "under_35", "under3.5", "under 3.5", "u35", "UNDER_3_5"]
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
  const under25Rate = rate(source.under25Rate ?? source.under_25_rate) ||
    (over25Rate > 0 ? round(1 - over25Rate, 4) : 0);
  return {
    over15Rate,
    over25Rate,
    under25Rate,
    under35Rate,
    matches: rate(source.matches ?? source.matches_played)
  };
}

export function ratesFromMatches(games = []) {
  let over15 = 0;
  let over25 = 0;
  let under25 = 0;
  let under35 = 0;
  let matches = 0;
  for (const game of games) {
    const total = Number(
      game.totalGoals ??
      (Number.isFinite(Number(game.ftFor)) && Number.isFinite(Number(game.ftAgainst))
        ? Number(game.ftFor) + Number(game.ftAgainst)
        : Number(game.fulltime_home) + Number(game.fulltime_away))
    );
    if (!Number.isFinite(total)) continue;
    matches += 1;
    if (total >= 2) over15 += 1;
    if (total >= 3) over25 += 1;
    if (total <= 2) under25 += 1;
    if (total <= 3) under35 += 1;
  }
  if (!matches) return normaliseGoalRates();
  return {
    over15Rate: over15 / matches,
    over25Rate: over25 / matches,
    under25Rate: under25 / matches,
    under35Rate: under35 / matches,
    matches
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

export function selectLeagueGoalPatterns(leagueRates, climateLabel = "neutral") {
  const rates = normaliseGoalRates(leagueRates);
  return GOAL_MARKETS
    .filter((market) => leagueAllowsMarket(climateLabel, market))
    .map((market) => {
      const hitRate = rates[market.rateKey];
      const implied = impliedOdds(hitRate);
      return {
        ...market,
        hitRate,
        impliedOdds: implied,
        inBand: inBankerOddsBand(implied)
      };
    })
    .filter((pattern) => pattern.inBand && pattern.hitRate >= pattern.floor)
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
  redFlags = []
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
    return { available: false, key: "no-pick", reasons: ["No league totals market sits inside 1.20–1.55"] };
  }

  const candidates = [];
  for (const pattern of patterns) {
    const homeSeasonOk = !homeSeasonRates.matches || teamAgrees(homeSeasonRates, pattern);
    const awaySeasonOk = !awaySeasonRates.matches || teamAgrees(awaySeasonRates, pattern);
    const homeRecentOk = teamAgrees(homeRecentRates, pattern, { floorFudge: 0.1 });
    const awayRecentOk = teamAgrees(awayRecentRates, pattern, { floorFudge: 0.1 });
    if (!homeSeasonOk || !awaySeasonOk || !homeRecentOk || !awayRecentOk) continue;

    const bookOdds = Number(odds?.[pattern.key]);
    if (!Number.isFinite(bookOdds) || bookOdds <= 1) continue;
    if (!inBankerOddsBand(bookOdds)) continue;

    const conservative = Math.min(
      pattern.hitRate,
      homeRecentRates[pattern.rateKey],
      awayRecentRates[pattern.rateKey],
      homeSeasonRates.matches ? homeSeasonRates[pattern.rateKey] : 1,
      awaySeasonRates.matches ? awaySeasonRates[pattern.rateKey] : 1
    );

    const bookName = odds.sourceName || odds.book || "book";
    candidates.push({
      available: true,
      key: pattern.key,
      market: pattern.market,
      selection: pattern.label,
      direction: pattern.direction,
      qualified: true,
      tier: "Banker",
      odds: round(bookOdds, 3),
      oddsSource: odds.source || "bookmaker",
      book: bookName,
      conservativeRate: round(conservative, 4),
      leagueRate: round(pattern.hitRate, 4),
      homeSeasonRate: round(homeSeasonRates[pattern.rateKey], 4),
      awaySeasonRate: round(awaySeasonRates[pattern.rateKey], 4),
      homeRecentRate: round(homeRecentRates[pattern.rateKey], 4),
      awayRecentRate: round(awayRecentRates[pattern.rateKey], 4),
      score: round(conservative * 100 - Math.abs(bookOdds - 1.33) * 8, 2),
      reasons: [
        `League ${pattern.label} hits ${Math.round(pattern.hitRate * 100)}%.`,
        `Both teams point the same way: home last five ${Math.round(homeRecentRates[pattern.rateKey] * 100)}%, away last five ${Math.round(awayRecentRates[pattern.rateKey] * 100)}%.`,
        `${bookName} ${round(bookOdds, 2)} sits inside the 1.20–1.55 banker band.`
      ]
    });
  }

  if (!candidates.length) {
    return {
      available: false,
      key: "no-pick",
      reasons: ["No live book price in 1.20–1.55, or both teams do not agree on the league totals tip"]
    };
  }

  return candidates.sort((left, right) => right.score - left.score)[0];
}

export function buildLeagueMap(picks = []) {
  const map = new Map();
  for (const pick of picks) {
    const league = pick.league || {};
    const key = `${league.country || ""}:${league.name || "Unknown"}`;
    if (!map.has(key)) {
      map.set(key, {
        country: league.country || null,
        name: league.name || "Unknown",
        market: pick.market,
        selection: pick.selection,
        key: pick.key,
        direction: pick.direction,
        climate: pick.leagueScoring?.label || null,
        over25Rate: pick.leagueScoring?.over25Rate ?? null,
        picks: 0
      });
    }
    map.get(key).picks += 1;
  }
  return [...map.values()].sort((left, right) => right.picks - left.picks || String(left.name).localeCompare(String(right.name)));
}
