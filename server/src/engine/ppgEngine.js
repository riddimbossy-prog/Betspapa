export const PPG_ENGINE_NAME = "PPG";
export const PPG_ENGINE_VERSION = "ppg-v1.0.0";
export const PPG_TOP_WINDOW = 3;
export const PPG_BOTTOM_WINDOW = 3;
export const PPG_MIN_PLAYED = 5;
export const PPG_MIN_TABLE = 6;
export const PPG_WIN_STRONG_MIN = 2;
export const PPG_WIN_WEAK_MAX = 1;
export const PPG_GOALS_STRONG_MIN = 1.5;
export const PPG_FAVOURITE_ODDS_MAX = 1.55;
export const PPG_UNDERDOG_ODDS_MIN = 5;

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function ensureTeam(stats, teamId) {
  const id = Number(teamId);
  if (!Number.isFinite(id)) return null;
  if (!stats.has(id)) {
    stats.set(id, { teamId: id, played: 0, points: 0, gf: 0, ga: 0, gd: 0, ppg: 0 });
  }
  return stats.get(id);
}

/** Build a league table using home results only or away results only. */
export function rankSplitTable(finishedRows = [], {
  leagueId,
  season,
  cutoff,
  venue = "home"
} = {}) {
  if (!new Set(["home", "away"]).has(venue)) {
    throw new TypeError("PPG split venue must be home or away");
  }

  const stats = new Map();
  const limit = Number.isFinite(Number(cutoff)) ? Number(cutoff) : Infinity;
  for (const row of finishedRows) {
    if (leagueId != null && Number(row.league_id) !== Number(leagueId)) continue;
    if (season != null && Number(row.season) !== Number(season)) continue;
    const stamp = new Date(row.fixture_date || row.date || 0).getTime();
    if (!Number.isFinite(stamp) || stamp >= limit) continue;

    const homeGoals = finite(row.fulltime_home);
    const awayGoals = finite(row.fulltime_away);
    if (homeGoals == null || awayGoals == null) continue;

    const team = ensureTeam(stats, venue === "home" ? row.home_team_id : row.away_team_id);
    if (!team) continue;
    const scored = venue === "home" ? homeGoals : awayGoals;
    const conceded = venue === "home" ? awayGoals : homeGoals;
    team.played += 1;
    team.gf += scored;
    team.ga += conceded;
    if (scored > conceded) team.points += 3;
    else if (scored === conceded) team.points += 1;
  }

  const ranked = [...stats.values()].map((row) => ({
    ...row,
    gd: row.gf - row.ga,
    ppg: round(row.points / Math.max(1, row.played), 3)
  })).sort((left, right) =>
    right.ppg - left.ppg ||
    right.points - left.points ||
    right.gd - left.gd ||
    right.gf - left.gf ||
    left.teamId - right.teamId
  );

  ranked.forEach((row, index) => {
    row.rank = index + 1;
    row.tableSize = ranked.length;
    row.venue = venue;
  });
  return ranked;
}

export function splitStandingZone(standing = {}) {
  const rank = Number(standing.rank);
  const tableSize = Number(standing.tableSize);
  const played = Number(standing.played);
  if (tableSize < PPG_MIN_TABLE || played < PPG_MIN_PLAYED || rank < 1 || rank > tableSize) {
    return "unqualified";
  }
  if (rank <= PPG_TOP_WINDOW) return "top-3";
  if (rank >= tableSize - PPG_BOTTOM_WINDOW + 1) return "bottom-3";
  return "middle";
}

function price(odds, key) {
  const value = Number(odds?.[key]);
  return Number.isFinite(value) && value > 1 ? value : null;
}

function auditRows(home, away) {
  return [
    {
      key: "home-split",
      label: "Home split",
      rule: "Top 3 or bottom 3 · 5+ played",
      value: `#${home.rank || "—"}/${home.tableSize || "—"} · ${Number(home.ppg || 0).toFixed(2)} PPG`,
      passed: splitStandingZone(home) !== "unqualified" && splitStandingZone(home) !== "middle"
    },
    {
      key: "away-split",
      label: "Away split",
      rule: "Top 3 or bottom 3 · 5+ played",
      value: `#${away.rank || "—"}/${away.tableSize || "—"} · ${Number(away.ppg || 0).toFixed(2)} PPG`,
      passed: splitStandingZone(away) !== "unqualified" && splitStandingZone(away) !== "middle"
    }
  ];
}

function result({ key, market, selection, odds, route, explanation, home, away, filters, score }) {
  return {
    available: true,
    key,
    market,
    selection,
    odds,
    book: "SportyBet",
    source: "sportybet",
    route,
    explanation,
    splitTable: { home, away },
    filters,
    score: round(score, 2),
    reasons: []
  };
}

function rejected(reason, home, away, filters = auditRows(home, away)) {
  return {
    available: false,
    engine: PPG_ENGINE_NAME,
    splitTable: { home, away },
    filters,
    reasons: [reason]
  };
}

/** Select exactly one PPG market for a fixture, or fail closed. */
export function selectPpgPick({
  homeName = "Home",
  awayName = "Away",
  homeStanding = {},
  awayStanding = {},
  odds = {}
} = {}) {
  const home = { ...homeStanding, zone: splitStandingZone(homeStanding) };
  const away = { ...awayStanding, zone: splitStandingZone(awayStanding) };
  const filters = auditRows(home, away);

  if (home.zone === "unqualified" || away.zone === "unqualified") {
    return rejected("Split table needs at least six teams and five venue matches per side", home, away, filters);
  }

  const homeWinRoute = home.zone === "top-3" && home.ppg >= PPG_WIN_STRONG_MIN &&
    away.zone === "bottom-3" && away.ppg < PPG_WIN_WEAK_MAX;
  const awayWinRoute = away.zone === "top-3" && away.ppg >= PPG_WIN_STRONG_MIN &&
    home.zone === "bottom-3" && home.ppg < PPG_WIN_WEAK_MAX;

  if (homeWinRoute || awayWinRoute) {
    const strong = homeWinRoute ? home : away;
    const weak = homeWinRoute ? away : home;
    const strongName = homeWinRoute ? homeName : awayName;
    const strongOdds = price(odds, homeWinRoute ? "home" : "away");
    const weakOdds = price(odds, homeWinRoute ? "away" : "home");
    const winFilters = filters.concat([
      {
        key: "strong-ppg",
        label: `${strongName} split PPG`,
        rule: "2.00 or more",
        value: Number(strong.ppg).toFixed(2),
        passed: true,
        required: true
      },
      {
        key: "winner-odds",
        label: "Winning-side odds",
        rule: "1.55 or shorter",
        value: strongOdds ?? "Missing",
        passed: strongOdds != null && strongOdds <= PPG_FAVOURITE_ODDS_MAX,
        required: true
      },
      {
        key: "loser-odds",
        label: "Losing-side odds",
        rule: "5.00 or longer",
        value: weakOdds ?? "Missing",
        passed: weakOdds != null && weakOdds >= PPG_UNDERDOG_ODDS_MIN,
        required: true
      }
    ]);
    if (strongOdds == null || weakOdds == null) {
      return rejected("SportyBet 1X2 prices are missing", home, away, winFilters);
    }
    if (strongOdds > PPG_FAVOURITE_ODDS_MAX) {
      return rejected("Winning-side SportyBet odds exceed 1.55", home, away, winFilters);
    }
    if (weakOdds < PPG_UNDERDOG_ODDS_MIN) {
      return rejected("Losing-side SportyBet odds are below 5.00", home, away, winFilters);
    }
    return result({
      key: homeWinRoute ? "home-win" : "away-win",
      market: "Match Result",
      selection: `${strongName} Win`,
      odds: strongOdds,
      route: "top-3-v-bottom-3",
      explanation: `${strongName} is top 3 on its venue split at ${Number(strong.ppg).toFixed(2)} PPG; the opponent is bottom 3 at ${Number(weak.ppg).toFixed(2)} PPG.`,
      home,
      away,
      filters: winFilters,
      score: (strong.ppg - weak.ppg) * 100
    });
  }

  const bottomPair = home.zone === "bottom-3" && away.zone === "bottom-3" &&
    home.ppg < PPG_WIN_WEAK_MAX && away.ppg < PPG_WIN_WEAK_MAX;
  if (bottomPair) {
    const underOdds = price(odds, "under-25");
    const underFilters = filters.concat({
      key: "bottom-pair",
      label: "Both split PPG",
      rule: "Below 1.00",
      value: `${Number(home.ppg).toFixed(2)} + ${Number(away.ppg).toFixed(2)}`,
      passed: true,
      required: true
    });
    if (underOdds == null) {
      return rejected("SportyBet Under 2.5 price is missing", home, away, underFilters);
    }
    return result({
      key: "under-25",
      market: "Total Goals",
      selection: "Under 2.5 Goals",
      odds: underOdds,
      route: "bottom-3-pair",
      explanation: `Both teams are bottom 3 on their venue splits and below 1.00 PPG (${Number(home.ppg).toFixed(2)} and ${Number(away.ppg).toFixed(2)}).`,
      home,
      away,
      filters: underFilters,
      score: (2 - home.ppg - away.ppg) * 100
    });
  }

  const topPair = home.zone === "top-3" && away.zone === "top-3" &&
    home.ppg > PPG_GOALS_STRONG_MIN && away.ppg > PPG_GOALS_STRONG_MIN;
  if (topPair) {
    const overOdds = price(odds, "over-15");
    const overFilters = filters.concat({
      key: "top-pair",
      label: "Both split PPG",
      rule: "Above 1.50",
      value: `${Number(home.ppg).toFixed(2)} + ${Number(away.ppg).toFixed(2)}`,
      passed: true,
      required: true
    });
    if (overOdds == null) {
      return rejected("SportyBet Over 1.5 price is missing", home, away, overFilters);
    }
    return result({
      key: "over-15",
      market: "Total Goals",
      selection: "Over 1.5 Goals",
      odds: overOdds,
      route: "top-3-pair",
      explanation: `Both teams are top 3 on their venue splits and above 1.50 PPG (${Number(home.ppg).toFixed(2)} and ${Number(away.ppg).toFixed(2)}).`,
      home,
      away,
      filters: overFilters,
      score: (home.ppg + away.ppg - 3) * 100
    });
  }

  return rejected("Fixture is not an approved PPG top-3/bottom-3 matchup", home, away, filters);
}
