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
import { loadSportyBetEvents } from "../providers/sportyBet.js";
import { loadSportyBetGoalOdds } from "../providers/sportyBetOdds.js";
import { nextUtcDate } from "../utils/date.js";
import { loadPublicFixturesForDate } from "./publicService.js";
import { fetchAllRows } from "./supabaseHelpers.js";

const CACHE_TTL_MS = 60_000;
export const PPG_HORIZON_DAYS = 5;
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

function dateSequence(startDate, days) {
  const dates = [startDate];
  while (dates.length < days) dates.push(nextUtcDate(dates.at(-1)));
  return dates;
}

export function combinePpgBoards(slates, requestedDate) {
  const boards = (slates || []).filter(Boolean);
  const picks = boards
    .flatMap((slate) => (slate.picks || []).map((pick) => ({
      ...pick,
      boardDate: slate.date
    })))
    .sort((left, right) =>
      new Date(left.kickoff || 0) - new Date(right.kickoff || 0) ||
      Number(right.score || 0) - Number(left.score || 0)
    );
  const rejectionCounts = boards.reduce((combined, slate) => {
    for (const [reason, count] of Object.entries(slate.rejectionCounts || {})) {
      combined[reason] = (combined[reason] || 0) + Number(count || 0);
    }
    return combined;
  }, {});
  const fromDate = boards[0]?.date || requestedDate;
  const toDate = boards.at(-1)?.date || requestedDate;

  return {
    date: requestedDate,
    requestedDate,
    fromDate,
    toDate,
    horizonDays: boards.length,
    generatedAt: new Date().toISOString(),
    engine: boards[0]?.engine || PPG_ENGINE_NAME,
    engineVersion: boards[0]?.engineVersion || PPG_ENGINE_VERSION,
    rules: boards[0]?.rules || {},
    reviewedFixtures: boards.reduce((sum, slate) => sum + Number(slate.reviewedFixtures || 0), 0),
    oddsMatchedFixtures: boards.reduce((sum, slate) => sum + Number(slate.oddsMatchedFixtures || 0), 0),
    pickCount: picks.length,
    rejectedCount: boards.reduce((sum, slate) => sum + Number(slate.rejectedCount || 0), 0),
    rejectionCounts,
    dayCount: boards.length,
    days: boards.map((slate) => ({
      date: slate.date,
      reviewedFixtures: Number(slate.reviewedFixtures || 0),
      oddsMatchedFixtures: Number(slate.oddsMatchedFixtures || 0),
      pickCount: Number(slate.pickCount || 0),
      rejectedCount: Number(slate.rejectedCount || 0)
    })),
    leagueMap: buildLeagueMap(picks),
    picks,
    cached: boards.length > 0 && boards.every((slate) => slate.cached)
  };
}

export async function getPpgPicks(supabase, date, {
  force = false,
  days = PPG_HORIZON_DAYS
} = {}) {
  const safeDays = Math.max(
    1,
    Math.min(Math.trunc(Number(days) || PPG_HORIZON_DAYS), PPG_HORIZON_DAYS)
  );
  const dates = dateSequence(date, safeDays);

  // Warm the shared SportyBet catalogue before parallel date reads so the
  // five-day request performs one provider fetch instead of one per date.
  await loadSportyBetEvents({ force }).catch(() => []);
  const slates = await Promise.all(
    dates.map((boardDate) => buildPpgPicks(supabase, boardDate, { force }))
  );
  return combinePpgBoards(slates, date);
}

async function buildPpgPicks(supabase, date, { force = false } = {}) {
  const cached = cache.get(date);
  if (!force && cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return { ...cached.value, cached: true };
  }

  const fixtures = (await loadPublicFixturesForDate(supabase, date)).filter((fixture) =>
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
