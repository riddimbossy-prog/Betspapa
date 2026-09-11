import { PREDICTABLE_STATUSES } from "../config.js";
import {
  FLASH_ENGINE_NAME,
  FLASH_ENGINE_VERSION,
  FLASH_ODDS_MAX,
  FLASH_ODDS_MIN,
  selectFlashPick
} from "../engine/flashCoverEngine.js";
import { buildLeagueMap } from "../engine/totalGoalsBankerEngine.js";
import { loadSportyBetFlashOdds } from "../providers/sportyBetOdds.js";
import { nextUtcDate } from "../utils/date.js";
import { loadFixtureRiskPack } from "./fixtureRiskService.js";
import { loadPreparedBoardData } from "./publicService.js";
import { fetchAllRows } from "./supabaseHelpers.js";

const CACHE_TTL_MS = 60_000;
const cache = new Map();

function completeGame(row) {
  return row?.fulltime_home != null && row?.fulltime_away != null &&
    Number.isFinite(Number(row.fulltime_home)) && Number.isFinite(Number(row.fulltime_away));
}

function gameRow(row, reverse = false) {
  return {
    date: row.fixture_date,
    ftHome: Number(reverse ? row.fulltime_away : row.fulltime_home),
    ftAway: Number(reverse ? row.fulltime_home : row.fulltime_away),
    htHome: row.halftime_home == null
      ? null
      : Number(reverse ? row.halftime_away : row.halftime_home),
    htAway: row.halftime_away == null
      ? null
      : Number(reverse ? row.halftime_home : row.halftime_away)
  };
}

export function historyPackage(rows, fixture, leagueIdsByExternal = new Map()) {
  const leagueId = Number(fixture.league?.id);
  const externalLeagueId = Number(fixture.league?.external_league_id);
  const allowedLeagueIds = leagueIdsByExternal.get(externalLeagueId) || new Set([leagueId]);
  const homeId = Number(fixture.home?.id);
  const awayId = Number(fixture.away?.id);
  const cutoff = new Date(fixture.kickoff).getTime();
  const relevant = (rows || [])
    .filter((row) =>
      allowedLeagueIds.has(Number(row.league_id)) &&
      new Date(row.fixture_date).getTime() < cutoff &&
      completeGame(row)
    )
    .sort((left, right) => new Date(right.fixture_date) - new Date(left.fixture_date));

  const homeGames = relevant
    .filter((row) => Number(row.home_team_id) === homeId)
    .slice(0, 10)
    .map((row) => gameRow(row));
  const awayGames = relevant
    .filter((row) => Number(row.away_team_id) === awayId)
    .slice(0, 10)
    .map((row) => gameRow(row));
  const h2hGames = relevant
    .filter((row) => {
      const normal = Number(row.home_team_id) === homeId && Number(row.away_team_id) === awayId;
      const reverse = Number(row.home_team_id) === awayId && Number(row.away_team_id) === homeId;
      return normal || reverse;
    })
    .slice(0, 5)
    .map((row) => gameRow(row, Number(row.home_team_id) !== homeId));

  const leagueRows = relevant.slice(0, 240);
  const divisor = Math.max(1, leagueRows.length);
  return {
    homeGames,
    awayGames,
    h2hGames,
    league: {
      matches: leagueRows.length,
      homeGoals: leagueRows.reduce((sum, row) => sum + Number(row.fulltime_home || 0), 0) / divisor,
      awayGoals: leagueRows.reduce((sum, row) => sum + Number(row.fulltime_away || 0), 0) / divisor
    }
  };
}

async function loadHistoryRows(supabase, fixtures) {
  const externalLeagueIds = [...new Set(fixtures
    .map((fixture) => Number(fixture.league?.external_league_id))
    .filter(Number.isFinite))];
  if (!externalLeagueIds.length) return { rows: [], leagueIdsByExternal: new Map() };

  const leagueRows = await fetchAllRows(() =>
    supabase
      .from("leagues")
      .select("id,external_league_id,season")
      .in("external_league_id", externalLeagueIds)
      .order("season", { ascending: false })
  );
  const leagueIdsByExternal = new Map();
  for (const league of leagueRows) {
    const external = Number(league.external_league_id);
    if (!leagueIdsByExternal.has(external)) leagueIdsByExternal.set(external, new Set());
    leagueIdsByExternal.get(external).add(Number(league.id));
  }
  const leagueIds = leagueRows.map((league) => league.id).filter(Boolean);
  if (!leagueIds.length) return { rows: [], leagueIdsByExternal };

  const kickoffs = fixtures.map((fixture) => new Date(fixture.kickoff).getTime()).filter(Number.isFinite);
  const latestKickoff = Math.max(...kickoffs);
  const historyStart = new Date(latestKickoff - 730 * 24 * 60 * 60 * 1000).toISOString();
  const historyEnd = new Date(latestKickoff).toISOString();
  const rows = await fetchAllRows(() =>
    supabase
      .from("fixtures")
      .select("id,league_id,season,fixture_date,home_team_id,away_team_id,fulltime_home,fulltime_away,halftime_home,halftime_away,status")
      .in("league_id", leagueIds)
      .gte("fixture_date", historyStart)
      .lt("fixture_date", historyEnd)
      .eq("status", "FT")
  );
  return { rows, leagueIdsByExternal };
}

function publicPick(fixture, pick, odds, risk) {
  const redFlags = risk.redFlags || fixture.redFlags || [];
  return {
    fixtureId: fixture.fixtureId,
    internalFixtureId: fixture.id,
    kickoff: fixture.kickoff,
    status: fixture.status,
    matchState: fixture.matchState,
    league: fixture.league,
    home: fixture.home,
    away: fixture.away,
    engine: FLASH_ENGINE_NAME,
    engineKey: "flash",
    engineVersion: FLASH_ENGINE_VERSION,
    sportyBetUrl: odds?.url || null,
    sportyBetEventId: odds?.eventId || null,
    redFlags,
    earlySeason: redFlags.find((flag) => flag.code === "EARLY_SEASON") || null,
    topFiveClash: redFlags.find((flag) => flag.code === "TOP5_CLASH") || null,
    table: risk.table || null,
    venueForm: risk.venueForm || null,
    ...pick
  };
}

export async function getFlashPicks(supabase, date, { force = false } = {}) {
  const first = await buildFlashPicks(supabase, date, { force });
  if (first.pickCount > 0) return first;
  const rolled = nextUtcDate(date);
  const second = await buildFlashPicks(supabase, rolled, { force });
  return chooseFlashBoard(first, second, date);
}

export function chooseFlashBoard(first, second, requestedDate) {
  if (first?.pickCount > 0) return first;
  if (second?.pickCount > 0) {
    return { ...second, requestedDate, rolledForward: true };
  }
  if (first?.reviewedFixtures > 0) return first;
  if (second?.reviewedFixtures > 0) {
    return { ...second, requestedDate, rolledForward: true };
  }
  return first;
}

async function buildFlashPicks(supabase, date, { force = false } = {}) {
  const cached = cache.get(date);
  if (!force && cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return { ...cached.value, cached: true };
  }

  const board = await loadPreparedBoardData(supabase, date);
  const fixtures = (board.fixtures || []).filter((fixture) =>
    PREDICTABLE_STATUSES.has(fixture.status)
  );
  const rawFixtures = fixtures.map((fixture) => ({
    id: fixture.id,
    league_id: fixture.league?.id,
    season: fixture.season ?? fixture.league?.season,
    fixture_date: fixture.kickoff,
    home_team_id: fixture.home?.id,
    away_team_id: fixture.away?.id,
    status: fixture.status
  }));
  const teamMap = new Map();
  for (const fixture of fixtures) {
    if (fixture.home?.id) teamMap.set(Number(fixture.home.id), fixture.home);
    if (fixture.away?.id) teamMap.set(Number(fixture.away.id), fixture.away);
  }

  const [historyData, riskPack] = await Promise.all([
    loadHistoryRows(supabase, fixtures),
    loadFixtureRiskPack(supabase, rawFixtures, teamMap)
  ]);
  const history = new Map(fixtures.map((fixture) => [
    Number(fixture.id),
    historyPackage(historyData.rows, fixture, historyData.leagueIdsByExternal)
  ]));
  const oddsEligible = fixtures.filter((fixture) => {
    const pack = history.get(Number(fixture.id));
    return pack?.homeGames?.length >= 5 && pack?.awayGames?.length >= 5;
  });
  const sportyOdds = await loadSportyBetFlashOdds(oddsEligible, { force }).catch(() => new Map());

  const picks = [];
  const rejectionCounts = {};
  let rejectedFixtures = 0;
  for (const fixture of fixtures) {
    const pack = history.get(Number(fixture.id)) || {};
    const risk = riskPack.get(Number(fixture.id)) || {};
    const odds = sportyOdds.get(Number(fixture.id)) || {};
    const result = selectFlashPick({
      homeName: fixture.home?.name || "Home",
      awayName: fixture.away?.name || "Away",
      homeGames: pack.homeGames || [],
      awayGames: pack.awayGames || [],
      h2hGames: pack.h2hGames || [],
      league: pack.league || {},
      odds,
      redFlags: risk.redFlags || fixture.redFlags || []
    });
    if (!result.available) {
      const reason = result.reasons?.[0] || "No Flash market passed every gate";
      rejectionCounts[reason] = (rejectionCounts[reason] || 0) + 1;
      rejectedFixtures += 1;
      continue;
    }
    const bundle = Array.isArray(result.picks) && result.picks.length ? result.picks : [result];
    for (const item of bundle) {
      const { picks: _ignored, ...clean } = item;
      picks.push(publicPick(fixture, clean, odds, risk));
    }
  }

  picks.sort((left, right) =>
    Number(right.modelProbability || 0) - Number(left.modelProbability || 0) ||
    Number(right.confidence || 0) - Number(left.confidence || 0)
  );
  const value = {
    date,
    generatedAt: new Date().toISOString(),
    engine: FLASH_ENGINE_NAME,
    engineVersion: FLASH_ENGINE_VERSION,
    oddsBand: { min: FLASH_ODDS_MIN, max: FLASH_ODDS_MAX },
    reviewedFixtures: fixtures.length,
    oddsMatchedFixtures: sportyOdds.size,
    pickCount: picks.length,
    rejectedCount: rejectedFixtures,
    rejectionCounts,
    leagueMap: buildLeagueMap(picks),
    picks
  };
  cache.set(date, { createdAt: Date.now(), value });
  return { ...value, cached: false };
}
