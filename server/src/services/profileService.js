import { ATHENA_PROFILE_STATUSES, FINISHED_PROFILE_STATUSES } from "../config.js";
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
    firstHalfGoalsFor: 0,
    firstHalfGoalsAgainst: 0,
    secondHalfGoalsFor: 0,
    secondHalfGoalsAgainst: 0,
    firstHalfScoringMatches: 0,
    firstHalfConcedingMatches: 0,
    secondHalfScoringMatches: 0,
    secondHalfConcedingMatches: 0,
    firstHalfOver05Matches: 0,
    firstHalfOver15Matches: 0,
    secondHalfOver05Matches: 0,
    secondHalfOver15Matches: 0,
    scoredBothHalvesMatches: 0,
    goalsBothHalvesMatches: 0,
    secondHalfWins: 0,
    secondHalfDraws: 0,
    eventCoverageMatches: 0,
    goalsWhileTrailing: 0,
    equalisersScored: 0,
    winningGoalsAfterEqualising: 0,
    leadsSurrendered: 0,
    minute46_60For: 0,
    minute46_60Against: 0,
    minute61_75For: 0,
    minute61_75Against: 0,
    minute76_90For: 0,
    minute76_90Against: 0
  };
}

function addEventMetrics(acc, game) {
  if (!game.eventCoverageComplete) return;
  acc.eventCoverageMatches += 1;

  for (const event of game.events || []) {
    const forTeam = Number(event.scoring_team_id) === Number(game.teamId);
    if (forTeam && event.is_comeback_goal) acc.goalsWhileTrailing += 1;
    if (forTeam && event.is_equaliser) acc.equalisersScored += 1;
    if (forTeam && event.is_winning_goal_after_equalising) {
      acc.winningGoalsAfterEqualising += 1;
    }
    if (!forTeam && event.is_equaliser) acc.leadsSurrendered += 1;

    if (event.time_bucket === "46_60") {
      if (forTeam) acc.minute46_60For += 1;
      else acc.minute46_60Against += 1;
    }
    if (event.time_bucket === "61_75") {
      if (forTeam) acc.minute61_75For += 1;
      else acc.minute61_75Against += 1;
    }
    if (event.time_bucket === "76_90_PLUS") {
      if (forTeam) acc.minute76_90For += 1;
      else acc.minute76_90Against += 1;
    }
  }
}

function addGame(acc, game) {
  const ht = resultLetter(game.htFor, game.htAgainst);
  const ft = resultLetter(game.ftFor, game.ftAgainst);
  const transition = `${ht}${ft}`;
  const totalGoals = game.ftFor + game.ftAgainst;
  const firstHalfTotal = game.htFor + game.htAgainst;
  const secondHalfFor = Math.max(0, game.ftFor - game.htFor);
  const secondHalfAgainst = Math.max(0, game.ftAgainst - game.htAgainst);
  const secondHalfTotal = secondHalfFor + secondHalfAgainst;

  acc.matches += 1;
  acc.transitions[transition] += 1;
  acc.goalsScored += game.ftFor;
  acc.goalsConceded += game.ftAgainst;
  acc.firstHalfGoalsFor += game.htFor;
  acc.firstHalfGoalsAgainst += game.htAgainst;
  acc.secondHalfGoalsFor += secondHalfFor;
  acc.secondHalfGoalsAgainst += secondHalfAgainst;

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
  if (game.htAgainst > 0) acc.firstHalfConcedingMatches += 1;
  if (secondHalfFor > 0) acc.secondHalfScoringMatches += 1;
  if (secondHalfAgainst > 0) acc.secondHalfConcedingMatches += 1;
  if (firstHalfTotal >= 1) acc.firstHalfOver05Matches += 1;
  if (firstHalfTotal >= 2) acc.firstHalfOver15Matches += 1;
  if (secondHalfTotal >= 1) acc.secondHalfOver05Matches += 1;
  if (secondHalfTotal >= 2) acc.secondHalfOver15Matches += 1;
  if (game.htFor > 0 && secondHalfFor > 0) acc.scoredBothHalvesMatches += 1;
  if (firstHalfTotal > 0 && secondHalfTotal > 0) acc.goalsBothHalvesMatches += 1;
  if (secondHalfFor > secondHalfAgainst) acc.secondHalfWins += 1;
  if (secondHalfFor === secondHalfAgainst) acc.secondHalfDraws += 1;

  addEventMetrics(acc, game);
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

function toHalfGoalRow({ teamId, leagueId, season, scope, acc }) {
  return {
    team_id: teamId,
    league_id: leagueId,
    season,
    scope,
    matches_played: acc.matches,
    first_half_goals_for: acc.firstHalfGoalsFor,
    first_half_goals_against: acc.firstHalfGoalsAgainst,
    second_half_goals_for: acc.secondHalfGoalsFor,
    second_half_goals_against: acc.secondHalfGoalsAgainst,
    first_half_scoring_rate: rate(acc.firstHalfScoringMatches, acc.matches),
    first_half_conceding_rate: rate(acc.firstHalfConcedingMatches, acc.matches),
    second_half_scoring_rate: rate(acc.secondHalfScoringMatches, acc.matches),
    second_half_conceding_rate: rate(acc.secondHalfConcedingMatches, acc.matches),
    first_half_over_05_rate: rate(acc.firstHalfOver05Matches, acc.matches),
    first_half_over_15_rate: rate(acc.firstHalfOver15Matches, acc.matches),
    second_half_over_05_rate: rate(acc.secondHalfOver05Matches, acc.matches),
    second_half_over_15_rate: rate(acc.secondHalfOver15Matches, acc.matches),
    scored_both_halves_rate: rate(acc.scoredBothHalvesMatches, acc.matches),
    goals_both_halves_rate: rate(acc.goalsBothHalvesMatches, acc.matches),
    second_half_win_rate: rate(acc.secondHalfWins, acc.matches),
    second_half_draw_rate: rate(acc.secondHalfDraws, acc.matches),
    event_coverage_matches: acc.eventCoverageMatches,
    goals_while_trailing: acc.goalsWhileTrailing,
    equalisers_scored: acc.equalisersScored,
    winning_goals_after_equalising: acc.winningGoalsAfterEqualising,
    leads_surrendered: acc.leadsSurrendered,
    minute_46_60_for: acc.minute46_60For,
    minute_46_60_against: acc.minute46_60Against,
    minute_61_75_for: acc.minute61_75For,
    minute_61_75_against: acc.minute61_75Against,
    minute_76_90_for: acc.minute76_90For,
    minute_76_90_against: acc.minute76_90Against,
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

function isValidAthenaFixture(fixture) {
  return isValidFinishedFixture(fixture) && ATHENA_PROFILE_STATUSES.has(fixture.status);
}

function perspectiveGames(fixtures) {
  const map = new Map();
  const add = (teamId, game) => {
    if (!map.has(teamId)) map.set(teamId, []);
    map.get(teamId).push(game);
  };

  for (const fixture of fixtures.filter(isValidFinishedFixture)) {
    const shared = {
      date: fixture.fixture_date,
      events: fixture.events || [],
      eventCoverageComplete: fixture.eventCoverageStatus === "COMPLETE"
    };
    add(fixture.home_team_id, {
      ...shared,
      teamId: fixture.home_team_id,
      venue: "home",
      htFor: fixture.halftime_home,
      htAgainst: fixture.halftime_away,
      ftFor: fixture.fulltime_home,
      ftAgainst: fixture.fulltime_away
    });
    add(fixture.away_team_id, {
      ...shared,
      teamId: fixture.away_team_id,
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
  const athenaGamesByTeam = perspectiveGames(fixtures.filter(isValidAthenaFixture));
  const htftRows = [];
  const goalRows = [];
  const halfGoalRows = [];

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

    const athenaGames = athenaGamesByTeam.get(teamId) || [];
    const athenaScopeGames = {
      overall: athenaGames,
      home: athenaGames.filter((game) => game.venue === "home"),
      away: athenaGames.filter((game) => game.venue === "away"),
      recent6: athenaGames.slice(-6)
    };

    for (const [scope, selectedGames] of Object.entries(athenaScopeGames)) {
      const acc = aggregateGames(selectedGames);
      halfGoalRows.push(toHalfGoalRow({ teamId, leagueId, season, scope, acc }));
    }
  }

  return { htftRows, goalRows, halfGoalRows, teams: gamesByTeam.size };
}

function missingAthenaV3Tables(error) {
  const message = String(error?.message || error || "");
  return error?.code === "42P01" ||
    /fixture_goal_events|fixture_event_coverage|team_half_goal_profiles|relation .* does not exist/i.test(message);
}

async function attachEventContext(supabase, fixtures) {
  if (!fixtures.length) return { fixtures, eventTablesAvailable: true };
  const fixtureIds = fixtures.map((fixture) => fixture.id);

  try {
    const [events, coverage] = await Promise.all([
      fetchAllRows(() =>
        supabase
          .from("fixture_goal_events")
          .select("fixture_id,scoring_team_id,time_bucket,is_equaliser,is_comeback_goal,is_winning_goal_after_equalising")
          .in("fixture_id", fixtureIds)
      ),
      fetchAllRows(() =>
        supabase
          .from("fixture_event_coverage")
          .select("fixture_id,status")
          .in("fixture_id", fixtureIds)
      )
    ]);

    const eventsByFixture = new Map();
    for (const event of events) {
      const id = Number(event.fixture_id);
      if (!eventsByFixture.has(id)) eventsByFixture.set(id, []);
      eventsByFixture.get(id).push(event);
    }
    const coverageByFixture = new Map(
      coverage.map((row) => [Number(row.fixture_id), row.status])
    );

    return {
      fixtures: fixtures.map((fixture) => ({
        ...fixture,
        events: eventsByFixture.get(Number(fixture.id)) || [],
        eventCoverageStatus: coverageByFixture.get(Number(fixture.id)) || null
      })),
      eventTablesAvailable: true
    };
  } catch (error) {
    if (!missingAthenaV3Tables(error)) throw error;
    return {
      fixtures: fixtures.map((fixture) => ({ ...fixture, events: [], eventCoverageStatus: null })),
      eventTablesAvailable: false
    };
  }
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
  const withEvents = await attachEventContext(supabase, validFixtures);
  const { htftRows, goalRows, halfGoalRows, teams } = buildProfilesFromFixtures(
    withEvents.fixtures,
    leagueId,
    season
  );

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

  let halfGoalProfilesSaved = 0;
  let halfGoalWarning = null;
  if (halfGoalRows.length) {
    try {
      const { error } = await supabase
        .from("team_half_goal_profiles")
        .upsert(halfGoalRows, { onConflict: "team_id,league_id,season,scope" });
      if (error) throw error;
      halfGoalProfilesSaved = halfGoalRows.length;
    } catch (error) {
      if (!missingAthenaV3Tables(error)) throw error;
      halfGoalWarning = "Run supabase/BETSPAPA_V1_20_0_ATHENA_V3.sql to store Athena v3 half-goal profiles.";
    }
  }

  return {
    leagueId: Number(leagueId),
    season: Number(season),
    finishedFixtures: validFixtures.length,
    teams,
    htftProfiles: htftRows.length,
    goalProfiles: goalRows.length,
    halfGoalProfiles: halfGoalProfilesSaved,
    eventTablesAvailable: withEvents.eventTablesAvailable,
    warning: halfGoalWarning
  };
}
