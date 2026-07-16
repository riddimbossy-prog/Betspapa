import { FINISHED_PROFILE_STATUSES } from "../config.js";
import { fetchAllRows, throwIfSupabaseError } from "./supabaseHelpers.js";

const TRANSITIONS = ["WW", "WD", "WL", "DW", "DD", "DL", "LW", "LD", "LL"];

function resultLetter(teamGoals, opponentGoals) {
  if (teamGoals > opponentGoals) return "W";
  if (teamGoals < opponentGoals) return "L";
  return "D";
}

function makeAccumulator() {
  return {
    matches: 0,
    transitions: Object.fromEntries(TRANSITIONS.map((key) => [key, 0])),
    goalsScored: 0,
    goalsConceded: 0,
    scoredMatches: 0,
    concededMatches: 0,
    failedToScoreMatches: 0,
    cleanSheetMatches: 0,
    bttsMatches: 0,
    over15Matches: 0,
    over25Matches: 0,
    under35Matches: 0,
    scored2PlusMatches: 0,
    conceded2PlusMatches: 0,
    firstHalfScoringMatches: 0,
    secondHalfScoringMatches: 0
  };
}

function addGame(acc, game) {
  const ht = resultLetter(game.htFor, game.htAgainst);
  const ft = resultLetter(game.ftFor, game.ftAgainst);
  const transition = `${ht}${ft}`;
  const totalGoals = game.ftFor + game.ftAgainst;
  const secondHalfFor = Math.max(0, game.ftFor - game.htFor);

  acc.matches += 1;
  acc.transitions[transition] += 1;
  acc.goalsScored += game.ftFor;
  acc.goalsConceded += game.ftAgainst;
  if (game.ftFor > 0) acc.scoredMatches += 1;
  if (game.ftAgainst > 0) acc.concededMatches += 1;
  if (game.ftFor === 0) acc.failedToScoreMatches += 1;
  if (game.ftAgainst === 0) acc.cleanSheetMatches += 1;
  if (game.ftFor > 0 && game.ftAgainst > 0) acc.bttsMatches += 1;
  if (totalGoals >= 2) acc.over15Matches += 1;
  if (totalGoals >= 3) acc.over25Matches += 1;
  if (totalGoals <= 3) acc.under35Matches += 1;
  if (game.ftFor >= 2) acc.scored2PlusMatches += 1;
  if (game.ftAgainst >= 2) acc.conceded2PlusMatches += 1;
  if (game.htFor > 0) acc.firstHalfScoringMatches += 1;
  if (secondHalfFor > 0) acc.secondHalfScoringMatches += 1;
}

function rate(count, matches) {
  return matches > 0 ? Number((count / matches).toFixed(6)) : 0;
}

function toHtftRow({ teamId, leagueId, season, scope, acc }) {
  return {
    team_id: teamId,
    league_id: leagueId,
    season,
    scope,
    matches_played: acc.matches,
    ww: acc.transitions.WW,
    wd: acc.transitions.WD,
    wl: acc.transitions.WL,
    dw: acc.transitions.DW,
    dd: acc.transitions.DD,
    dl: acc.transitions.DL,
    lw: acc.transitions.LW,
    ld: acc.transitions.LD,
    ll: acc.transitions.LL,
    updated_at: new Date().toISOString()
  };
}

function toGoalRow({ teamId, leagueId, season, scope, acc }) {
  return {
    team_id: teamId,
    league_id: leagueId,
    season,
    scope,
    matches_played: acc.matches,
    goals_scored: acc.goalsScored,
    goals_conceded: acc.goalsConceded,
    scoring_rate: rate(acc.scoredMatches, acc.matches),
    conceding_rate: rate(acc.concededMatches, acc.matches),
    failed_to_score_rate: rate(acc.failedToScoreMatches, acc.matches),
    clean_sheet_rate: rate(acc.cleanSheetMatches, acc.matches),
    btts_rate: rate(acc.bttsMatches, acc.matches),
    over_15_rate: rate(acc.over15Matches, acc.matches),
    over_25_rate: rate(acc.over25Matches, acc.matches),
    under_35_rate: rate(acc.under35Matches, acc.matches),
    scored_2plus_rate: rate(acc.scored2PlusMatches, acc.matches),
    conceded_2plus_rate: rate(acc.conceded2PlusMatches, acc.matches),
    first_half_scoring_rate: rate(acc.firstHalfScoringMatches, acc.matches),
    second_half_scoring_rate: rate(acc.secondHalfScoringMatches, acc.matches),
    updated_at: new Date().toISOString()
  };
}

function isValidFinishedFixture(fixture) {
  return (
    FINISHED_PROFILE_STATUSES.has(fixture.status) &&
    Number.isFinite(fixture.halftime_home) &&
    Number.isFinite(fixture.halftime_away) &&
    Number.isFinite(fixture.fulltime_home) &&
    Number.isFinite(fixture.fulltime_away)
  );
}

function perspectiveGames(fixtures) {
  const map = new Map();
  const add = (teamId, game) => {
    if (!map.has(teamId)) map.set(teamId, []);
    map.get(teamId).push(game);
  };

  for (const fixture of fixtures.filter(isValidFinishedFixture)) {
    add(fixture.home_team_id, {
      date: fixture.fixture_date,
      venue: "home",
      htFor: fixture.halftime_home,
      htAgainst: fixture.halftime_away,
      ftFor: fixture.fulltime_home,
      ftAgainst: fixture.fulltime_away
    });
    add(fixture.away_team_id, {
      date: fixture.fixture_date,
      venue: "away",
      htFor: fixture.halftime_away,
      htAgainst: fixture.halftime_home,
      ftFor: fixture.fulltime_away,
      ftAgainst: fixture.fulltime_home
    });
  }

  for (const games of map.values()) {
    games.sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  return map;
}

function aggregateGames(games) {
  const acc = makeAccumulator();
  for (const game of games) addGame(acc, game);
  return acc;
}

export function buildProfilesFromFixtures(fixtures, leagueId, season) {
  const gamesByTeam = perspectiveGames(fixtures);
  const htftRows = [];
  const goalRows = [];

  for (const [teamId, games] of gamesByTeam.entries()) {
    const scopeGames = {
      overall: games,
      home: games.filter((game) => game.venue === "home"),
      away: games.filter((game) => game.venue === "away"),
      recent6: games.slice(-6)
    };

    for (const [scope, selectedGames] of Object.entries(scopeGames)) {
      const acc = aggregateGames(selectedGames);
      htftRows.push(toHtftRow({ teamId, leagueId, season, scope, acc }));
      goalRows.push(toGoalRow({ teamId, leagueId, season, scope, acc }));
    }
  }

  return { htftRows, goalRows, teams: gamesByTeam.size };
}

export async function rebuildProfiles(supabase, leagueId, season) {
  const fixtures = await fetchAllRows(() =>
    supabase
      .from("fixtures")
      .select(
        "id,league_id,season,fixture_date,home_team_id,away_team_id,halftime_home,halftime_away,fulltime_home,fulltime_away,status"
      )
      .eq("league_id", leagueId)
      .eq("season", season)
      .order("fixture_date", { ascending: true })
  );

  const validFixtures = fixtures.filter(isValidFinishedFixture);
  const { htftRows, goalRows, teams } = buildProfilesFromFixtures(validFixtures, leagueId, season);

  if (htftRows.length) {
    const { error } = await supabase
      .from("team_htft_profiles")
      .upsert(htftRows, { onConflict: "team_id,league_id,season,scope" });
    throwIfSupabaseError(error, "Unable to save HT/FT profiles");
  }

  if (goalRows.length) {
    const { error } = await supabase
      .from("team_goal_profiles")
      .upsert(goalRows, { onConflict: "team_id,league_id,season,scope" });
    throwIfSupabaseError(error, "Unable to save goal profiles");
  }

  return {
    leagueId: Number(leagueId),
    season: Number(season),
    finishedFixtures: validFixtures.length,
    teams,
    htftProfiles: htftRows.length,
    goalProfiles: goalRows.length
  };
}
