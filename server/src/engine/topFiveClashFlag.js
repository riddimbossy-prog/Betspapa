export const TOP_FIVE_WINDOW = 5;
export const TOP_FIVE_MIN_PLAYED = 5;
export const TOP_FIVE_MIN_TABLE = 10;

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function ensureTeam(stats, teamId) {
  const id = Number(teamId);
  if (!Number.isFinite(id)) return null;
  if (!stats.has(id)) {
    stats.set(id, { teamId: id, played: 0, points: 0, gf: 0, ga: 0, gd: 0 });
  }
  return stats.get(id);
}

export function rankLeagueTable(finishedRows = [], { leagueId, season, cutoff } = {}) {
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

    const home = ensureTeam(stats, row.home_team_id);
    const away = ensureTeam(stats, row.away_team_id);
    if (!home || !away) continue;

    home.played += 1;
    away.played += 1;
    home.gf += homeGoals;
    home.ga += awayGoals;
    away.gf += awayGoals;
    away.ga += homeGoals;
    if (homeGoals > awayGoals) home.points += 3;
    else if (homeGoals < awayGoals) away.points += 3;
    else {
      home.points += 1;
      away.points += 1;
    }
  }

  const ranked = [...stats.values()].map((row) => ({
    ...row,
    gd: row.gf - row.ga
  })).sort((left, right) =>
    right.points - left.points ||
    right.gd - left.gd ||
    right.gf - left.gf ||
    left.teamId - right.teamId
  );

  ranked.forEach((row, index) => {
    row.rank = index + 1;
  });
  return ranked;
}

export function buildTopFiveClashFlag({
  homeRank = null,
  awayRank = null,
  tableSize = 0,
  homePlayed = 0,
  awayPlayed = 0,
  homeName = "Home",
  awayName = "Away"
} = {}) {
  if (Number(tableSize) < TOP_FIVE_MIN_TABLE) return null;
  if (Number(homePlayed) < TOP_FIVE_MIN_PLAYED || Number(awayPlayed) < TOP_FIVE_MIN_PLAYED) return null;
  if (Number(homeRank) < 1 || Number(awayRank) < 1) return null;
  if (Number(homeRank) > TOP_FIVE_WINDOW || Number(awayRank) > TOP_FIVE_WINDOW) return null;

  return {
    level: "red",
    number: 2,
    code: "TOP5_CLASH",
    label: "TOP 5 CLASH",
    window: TOP_FIVE_WINDOW,
    homeRank: Number(homeRank),
    awayRank: Number(awayRank),
    tableSize: Number(tableSize),
    homePlayed: Number(homePlayed),
    awayPlayed: Number(awayPlayed),
    reason: `Red flag 2: ${homeName} (${homeRank}) and ${awayName} (${awayRank}) are both inside the top ${TOP_FIVE_WINDOW}. Two top-five teams in the same match.`
  };
}
