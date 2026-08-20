import { fetchAllRows } from "./supabaseHelpers.js";
import { buildEarlySeasonFlag } from "../engine/earlySeasonFlag.js";
import { buildTopFiveClashFlag, rankLeagueTable } from "../engine/topFiveClashFlag.js";

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
    const home = table.find((row) => Number(row.teamId) === Number(fixture.home_team_id)) || {
      rank: null,
      played: 0
    };
    const away = table.find((row) => Number(row.teamId) === Number(fixture.away_team_id)) || {
      rank: null,
      played: 0
    };
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
    pack.set(Number(fixture.id), {
      earlySeason,
      topFiveClash,
      redFlags,
      table: {
        size: table.length,
        homeRank: home.rank,
        awayRank: away.rank,
        homePlayed: home.played || 0,
        awayPlayed: away.played || 0
      }
    });
  }
  return pack;
}
