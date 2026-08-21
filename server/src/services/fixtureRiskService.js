import { fetchAllRows } from "./supabaseHelpers.js";
import { buildEarlySeasonFlag } from "../engine/earlySeasonFlag.js";
import { buildTopFiveClashFlag, rankLeagueTable } from "../engine/topFiveClashFlag.js";
import { toPerspectiveGame } from "../engine/splitFormEngine.js";

export function collectRedFlags(...flags) {
  const unique = [];
  for (const flag of flags.flat().filter(Boolean)) {
    if (!unique.some((entry) => entry.code === flag.code)) unique.push(flag);
  }
  return unique.sort((left, right) => Number(left.number || 99) - Number(right.number || 99));
}

export function applyRedFlagsToPick(pick, redFlags = []) {
  if (!pick || !redFlags.length) return pick;
  const reasons = redFlags.map((flag) => flag.reason).filter(Boolean);
  return {
    ...pick,
    redFlags,
    cautions: [...new Set([...(pick.cautions || []), ...reasons])]
  };
}

function lastFiveResults(rows, fixture, teamId) {
  const leagueId = fixture.league_id;
  const season = fixture.season;
  const cutoff = new Date(fixture.fixture_date).getTime();
  return (rows || [])
    .filter((row) =>
      Number(row.league_id) === Number(leagueId) &&
      Number(row.season) === Number(season) &&
      (Number(row.home_team_id) === Number(teamId) || Number(row.away_team_id) === Number(teamId)) &&
      new Date(row.fixture_date).getTime() < cutoff
    )
    .sort((left, right) => new Date(right.fixture_date) - new Date(left.fixture_date))
    .slice(0, 5)
    .map((row) => toPerspectiveGame(row, teamId).ftResult)
    .filter(Boolean);
}

/** Last up-to-5 finished league matches at a specific venue for the team. */
function lastVenueFive(rows, fixture, teamId, venue) {
  const leagueId = fixture.league_id;
  const season = fixture.season;
  const cutoff = new Date(fixture.fixture_date).getTime();
  const wantHome = venue === "home";
  return (rows || [])
    .filter((row) => {
      if (Number(row.league_id) !== Number(leagueId)) return false;
      if (Number(row.season) !== Number(season)) return false;
      if (new Date(row.fixture_date).getTime() >= cutoff) return false;
      if (wantHome) return Number(row.home_team_id) === Number(teamId);
      return Number(row.away_team_id) === Number(teamId);
    })
    .sort((left, right) => new Date(right.fixture_date) - new Date(left.fixture_date))
    .slice(0, 5)
    .map((row) => toPerspectiveGame(row, teamId))
    .filter((game) => game.ftResult);
}

function venueFormStats(games = []) {
  const complete = games.filter((game) => game.ftResult);
  const played = complete.length;
  if (!played) {
    return { played: 0, points: 0, gf: 0, ga: 0, ppg: 0, gpg: 0, gapg: 0, form: [] };
  }
  const points = complete.reduce(
    (sum, game) => sum + (game.ftResult === "W" ? 3 : game.ftResult === "D" ? 1 : 0),
    0
  );
  const gf = complete.reduce((sum, game) => sum + Number(game.ftFor || 0), 0);
  const ga = complete.reduce((sum, game) => sum + Number(game.ftAgainst || 0), 0);
  return {
    played,
    points,
    gf,
    ga,
    ppg: points / played,
    gpg: gf / played,
    gapg: ga / played,
    form: complete.map((game) => game.ftResult)
  };
}

function sideStats(row) {
  const played = Number(row?.played || 0);
  const points = Number(row?.points || 0);
  const gf = Number(row?.gf || 0);
  return {
    rank: row?.rank ?? null,
    played,
    points,
    gf,
    ppg: played ? points / played : 0,
    gpg: played ? gf / played : 0
  };
}

export async function loadFixtureRiskPack(supabase, fixtures = [], teamMap = new Map()) {
  const pack = new Map();
  if (!fixtures.length) return pack;

  const leagueIds = [...new Set(fixtures.map((fixture) => fixture.league_id).filter(Boolean))];
  const seasons = [...new Set(fixtures.map((fixture) => fixture.season).filter((value) => value != null))];
  if (!leagueIds.length || !seasons.length) return pack;

  const rows = await fetchAllRows(() =>
    supabase
      .from("fixtures")
      .select("id,league_id,season,fixture_date,home_team_id,away_team_id,fulltime_home,fulltime_away,status")
      .in("league_id", leagueIds)
      .in("season", seasons)
      .eq("status", "FT")
  );

  for (const fixture of fixtures) {
    const cutoff = new Date(fixture.fixture_date).getTime();
    const table = rankLeagueTable(rows || [], {
      leagueId: fixture.league_id,
      season: fixture.season,
      cutoff
    });
    const homeRow = table.find((row) => Number(row.teamId) === Number(fixture.home_team_id));
    const awayRow = table.find((row) => Number(row.teamId) === Number(fixture.away_team_id));
    const home = sideStats(homeRow);
    const away = sideStats(awayRow);
    const homeName = teamMap.get(Number(fixture.home_team_id))?.name ||
      teamMap.get(fixture.home_team_id)?.name ||
      "Home";
    const awayName = teamMap.get(Number(fixture.away_team_id))?.name ||
      teamMap.get(fixture.away_team_id)?.name ||
      "Away";
    const earlySeason = buildEarlySeasonFlag({
      homePlayed: home.played || 0,
      awayPlayed: away.played || 0,
      homeName,
      awayName
    });
    const topFiveClash = buildTopFiveClashFlag({
      homeRank: home.rank,
      awayRank: away.rank,
      tableSize: table.length,
      homePlayed: home.played || 0,
      awayPlayed: away.played || 0,
      homeName,
      awayName
    });
    const redFlags = collectRedFlags(earlySeason, topFiveClash);

    const homeVenueGames = lastVenueFive(rows, fixture, fixture.home_team_id, "home");
    const awayVenueGames = lastVenueFive(rows, fixture, fixture.away_team_id, "away");
    const homeVenue = venueFormStats(homeVenueGames);
    const awayVenue = venueFormStats(awayVenueGames);

    pack.set(Number(fixture.id), {
      earlySeason,
      topFiveClash,
      redFlags,
      table: {
        size: table.length,
        homeRank: home.rank,
        awayRank: away.rank,
        homePlayed: home.played,
        awayPlayed: away.played,
        homePoints: home.points,
        awayPoints: away.points,
        homeGf: home.gf,
        awayGf: away.gf,
        homePpg: home.ppg,
        awayPpg: away.ppg,
        homeGpg: home.gpg,
        awayGpg: away.gpg
      },
      lastFive: {
        home: lastFiveResults(rows, fixture, fixture.home_team_id),
        away: lastFiveResults(rows, fixture, fixture.away_team_id)
      },
      venueForm: {
        home: {
          played: homeVenue.played,
          ppg: homeVenue.ppg,
          gpg: homeVenue.gpg,
          gapg: homeVenue.gapg,
          form: homeVenue.form
        },
        away: {
          played: awayVenue.played,
          ppg: awayVenue.ppg,
          gpg: awayVenue.gpg,
          gapg: awayVenue.gapg,
          form: awayVenue.form
        }
      }
    });
  }
  return pack;
}
