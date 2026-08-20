export const HIGH_OVER25 = 0.54;
export const LOW_OVER25 = 0.43;
export const HIGH_UNDER35 = 0.58;
export const LOW_OVER15 = 0.7;
export const LOW_UNDER35 = 0.8;

const UNDER_KEYS = new Set([
  "under-15", "under-25", "under-35",
  "under_1_5", "under_2_5", "under_3_5",
  "UNDER_1_5", "UNDER_2_5", "UNDER_3_5",
  "first-half-under-15", "FIRST_HALF_UNDER_1_5",
  "match-under-1.5", "match-under-2.5", "match-under-3.5"
]);

const OVER_SHARP_KEYS = new Set([
  "over-25", "over-35",
  "over_2_5", "over_3_5",
  "OVER_2_5", "OVER_3_5",
  "match-over-2.5", "match-over-3.5"
]);

const OVER_BROAD_KEYS = new Set([
  "over-15", "over_1_5", "OVER_1_5", "match-over-1.5"
]);

function rate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function pct(value) {
  return `${Math.round(rate(value) * 100)}%`;
}

function collapse(value) {
  return String(value || "")
    .trim()
    .replace(/_/g, "-")
    .replace(/(\d)[.-](\d)/g, "$1$2")
    .toLowerCase();
}

export function classifyLeagueScoringFromMatches(rows = []) {
  let over15 = 0;
  let over25 = 0;
  let under35 = 0;
  let matches = 0;
  const seen = new Set();
  for (const row of rows) {
    const id = row.id || row.external_fixture_id || `${row.fixture_date}:${row.home_team_id}:${row.away_team_id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const total = Number(row.fulltime_home) + Number(row.fulltime_away);
    if (!Number.isFinite(total)) continue;
    matches += 1;
    if (total >= 2) over15 += 1;
    if (total >= 3) over25 += 1;
    if (total <= 3) under35 += 1;
  }
  if (!matches) return classifyLeagueScoring();
  return classifyLeagueScoring({
    over15Rate: over15 / matches,
    over25Rate: over25 / matches,
    under35Rate: under35 / matches,
    matches
  });
}

export const CURRENT_SEASON_TRUST = 80;
export const PREVIOUS_SEASON_TRUST = 80;

export function scoringTrendDelta(current, previous) {
  if (!current?.matches || !previous?.matches) return null;
  const over25Delta = Number((current.over25Rate - previous.over25Rate).toFixed(3));
  const direction = over25Delta >= 0.04 ? "rising" : over25Delta <= -0.04 ? "falling" : "stable";
  return {
    over15Delta: Number((current.over15Rate - previous.over15Rate).toFixed(3)),
    over25Delta,
    under35Delta: Number((current.under35Rate - previous.under35Rate).toFixed(3)),
    direction
  };
}

export function resolveLeagueScoringTrend(currentRates = null, previousRates = null) {
  const current = currentRates ? classifyLeagueScoring(currentRates) : classifyLeagueScoring();
  const previous = previousRates ? classifyLeagueScoring(previousRates) : classifyLeagueScoring();
  const trend = scoringTrendDelta(current, previous);

  if (current.matches >= CURRENT_SEASON_TRUST) {
    return { ...current, source: "current", previous, trend };
  }
  if (current.matches >= 20 && previous.matches >= PREVIOUS_SEASON_TRUST) {
    const weight = Math.min(0.55, current.matches / CURRENT_SEASON_TRUST);
    const blended = classifyLeagueScoring({
      over15Rate: current.over15Rate * weight + previous.over15Rate * (1 - weight),
      over25Rate: current.over25Rate * weight + previous.over25Rate * (1 - weight),
      under35Rate: current.under35Rate * weight + previous.under35Rate * (1 - weight),
      matches: current.matches + previous.matches
    });
    return { ...blended, source: "blend", current, previous, trend };
  }
  if (previous.matches >= PREVIOUS_SEASON_TRUST) {
    return { ...previous, source: "previous", current, previous, trend };
  }
  if (current.matches > 0) {
    return { ...current, source: "thin-current", previous, trend };
  }
  if (previous.matches > 0) {
    return { ...previous, source: "previous", current, previous, trend };
  }
  return { ...classifyLeagueScoring(), source: "unknown", current, previous, trend: null };
}

export function classifyLeagueScoring(goals = {}) {
  const over15Rate = rate(goals.over15Rate ?? goals.over_15_rate);
  const over25Rate = rate(goals.over25Rate ?? goals.over_25_rate);
  const under35Rate = rate(goals.under35Rate ?? goals.under_35_rate);
  const matches = rate(goals.matches ?? goals.matches_played);
  let label = "neutral";
  if (over25Rate >= HIGH_OVER25 || (under35Rate > 0 && under35Rate <= HIGH_UNDER35)) {
    label = "high";
  } else if (
    (over25Rate > 0 && over25Rate <= LOW_OVER25) ||
    (over15Rate > 0 && over15Rate <= LOW_OVER15 && under35Rate >= LOW_UNDER35)
  ) {
    label = "low";
  }
  return { label, over15Rate, over25Rate, under35Rate, matches };
}

export function totalsSideFromPick(pick = {}) {
  const keys = [pick.key, pick.marketId, pick.canonicalKey];
  if (keys.some((key) => UNDER_KEYS.has(key) || UNDER_KEYS.has(collapse(key)))) return "under";
  if (keys.some((key) => OVER_SHARP_KEYS.has(key) || OVER_SHARP_KEYS.has(collapse(key)))) return "over_sharp";
  if (keys.some((key) => OVER_BROAD_KEYS.has(key) || OVER_BROAD_KEYS.has(collapse(key)))) return "over_broad";

  const text = [pick.market, pick.selection]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!text) return null;
  if (/(team|home|away).*(over|under)/.test(text) && !/match/.test(text)) return null;
  if (/under\s*[123]\.5/.test(text)) return "under";
  if (/over\s*[23]\.5/.test(text)) return "over_sharp";
  if (/over\s*1\.5/.test(text) && !/half/.test(text)) return "over_broad";
  return null;
}

export function buildLeagueGoalsFlag(pick, climate) {
  if (!pick || pick.available === false || pick.key === "no-pick") return null;
  if (!climate || climate.label === "neutral") return null;
  const side = totalsSideFromPick(pick);
  if (!side) return null;

  if (climate.label === "high" && side === "under") {
    return {
      level: "red",
      code: "HIGH_LEAGUE_UNDER",
      label: "LEAGUE GOALS",
      climate: "high",
      side: "under",
      reason: `Red flag: high-scoring league (Over 2.5 ${pct(climate.over25Rate)}, Under 3.5 ${pct(climate.under35Rate)}) so an Under totals tip is against the league climate.`
    };
  }

  if (
    climate.label === "low" &&
    (side === "over_sharp" || (side === "over_broad" && climate.over15Rate <= LOW_OVER15))
  ) {
    return {
      level: "red",
      code: "LOW_LEAGUE_OVER",
      label: "LEAGUE GOALS",
      climate: "low",
      side: "over",
      reason: `Red flag: low-scoring league (Over 2.5 ${pct(climate.over25Rate)}, Over 1.5 ${pct(climate.over15Rate)}) so an Over totals tip is against the league climate.`
    };
  }
  return null;
}

export function isContradictingTotalsKey(key, climate) {
  return Boolean(buildLeagueGoalsFlag({ key, available: true }, climate));
}

export function applyLeagueScoringGuard(pick, climate) {
  const flag = buildLeagueGoalsFlag(pick, climate);
  if (!pick || !flag) return pick;
  return {
    ...pick,
    available: false,
    key: "no-pick",
    market: "No Pick",
    selection: "NO PICK",
    qualified: false,
    leagueGoalsFlag: flag,
    cautions: [...new Set([...(pick.cautions || []), flag.reason])],
    reasons: [flag.reason, ...(pick.reasons || [])],
    explanationParagraph: flag.reason,
    publicExplanation: flag.reason
  };
}
