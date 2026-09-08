import { PREDICTABLE_STATUSES } from "../config.js";
import {
  PPG_ENGINE_NAME,
  PPG_ENGINE_VERSION,
  PPG_FAVOURITE_ODDS_MAX,
  PPG_UNDERDOG_ODDS_MIN,
  rankSplitTable,
  selectPpgPick
} from "../engine/ppgEngine.js";
import { buildLeagueMap } from "../engine/totalGoalsBankerEngine.js";
import { loadSportyBetGoalOdds } from "../providers/sportyBetOdds.js";
import { nextUtcDate } from "../utils/date.js";
import { loadPreparedBoardData } from "./publicService.js";
import { fetchAllRows } from "./supabaseHelpers.js";

const CACHE_TTL_MS = 60_000;
const cache = new Map();

async function loadSplitHistory(supabase, fixtures) {
  const leagueIds = [...new Set(fixtures
    .map((fixture) => Number(fixture.league?.id))
    .filter(Number.isFinite))];
  if (!leagueIds.length) return [];

  const kickoffs = fixtures
    .map((fixture) => new Date(fixture.kickoff).getTime())
    .filter(Number.isFinite);
  if (!kickoffs.length) return [];

  return fetchAllRows(() => supabase
    .from("fixtures")
    .select("id,league_id,season,fixture_date,home_team_id,away_team_id,fulltime_home,fulltime_away,status")
    .in("league_id", leagueIds)
    .lt("fixture_date", new Date(Math.max(...kickoffs)).toISOString())
    .eq("status", "FT"));
}

function standingsForFixture(rows, fixture) {
  const options = {
    leagueId: fixture.league?.id,
    season: fixture.season ?? fixture.league?.season,
    cutoff: new Date(fixture.kickoff).getTime()
  };
  const homeTable = rankSplitTable(rows, { ...options, venue: "home" });
  const awayTable = rankSplitTable(rows, { ...options, venue: "away" });
  return {
    home: homeTable.find((row) => Number(row.teamId) === Number(fixture.home?.id)) || {},
    away: awayTable.find((row) => Number(row.teamId) === Number(fixture.away?.id)) || {}
  };
}

function publicPick(fixture, pick, odds) {
  return {
    fixtureId: fixture.fixtureId,
    internalFixtureId: fixture.id,
    kickoff: fixture.kickoff,
    status: fixture.status,
    matchState: fixture.matchState,
    league: fixture.league,
    home: fixture.home,
    away: fixture.away,
    engine: PPG_ENGINE_NAME,
    engineKey: "ppg",
    engineVersion: PPG_ENGINE_VERSION,
    sportyBetUrl: odds?.url || null,
    sportyBetEventId: odds?.eventId || null,
    ...pick
  };
}

export function choosePpgBoard(first, second, requestedDate) {
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

export async function getPpgPicks(supabase, date, { force = false } = {}) {
  const first = await buildPpgPicks(supabase, date, { force });
  if (first.pickCount > 0) return first;
  const second = await buildPpgPicks(supabase, nextUtcDate(date), { force });
  return choosePpgBoard(first, second, date);
}

async function buildPpgPicks(supabase, date, { force = false } = {}) {
  const cached = cache.get(date);
  if (!force && cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return { ...cached.value, cached: true };
  }

  const board = await loadPreparedBoardData(supabase, date);
  const fixtures = (board.fixtures || []).filter((fixture) =>
    PREDICTABLE_STATUSES.has(fixture.status)
  );
  const [history, sportyOdds] = await Promise.all([
    loadSplitHistory(supabase, fixtures),
    loadSportyBetGoalOdds(fixtures).catch(() => new Map())
  ]);

  const picks = [];
  const rejectionCounts = {};
  for (const fixture of fixtures) {
    const split = standingsForFixture(history, fixture);
    const odds = sportyOdds.get(Number(fixture.id)) || {};
    const pick = selectPpgPick({
      homeName: fixture.home?.name || "Home",
      awayName: fixture.away?.name || "Away",
      homeStanding: split.home,
      awayStanding: split.away,
      odds
    });
    if (!pick.available) {
      const reason = pick.reasons?.[0] || "No PPG route qualified";
      rejectionCounts[reason] = (rejectionCounts[reason] || 0) + 1;
      continue;
    }
    picks.push(publicPick(fixture, pick, odds));
  }

  picks.sort((left, right) =>
    Number(right.score || 0) - Number(left.score || 0) ||
    new Date(left.kickoff || 0) - new Date(right.kickoff || 0)
  );
  const value = {
    date,
    generatedAt: new Date().toISOString(),
    engine: PPG_ENGINE_NAME,
    engineVersion: PPG_ENGINE_VERSION,
    rules: {
      topWindow: 3,
      bottomWindow: 3,
      winStrongPpgMin: 2,
      winWeakPpgMaxExclusive: 1,
      goalsStrongPpgMinExclusive: 1.5,
      favouriteOddsMax: PPG_FAVOURITE_ODDS_MAX,
      underdogOddsMin: PPG_UNDERDOG_ODDS_MIN
    },
    reviewedFixtures: fixtures.length,
    oddsMatchedFixtures: sportyOdds.size,
    pickCount: picks.length,
    rejectedCount: fixtures.length - picks.length,
    rejectionCounts,
    leagueMap: buildLeagueMap(picks),
    picks
  };
  cache.set(date, { createdAt: Date.now(), value });
  return { ...value, cached: false };
}
