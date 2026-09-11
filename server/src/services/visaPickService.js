import { PREDICTABLE_STATUSES } from "../config.js";
import {
  VISA_ENGINE_NAME,
  VISA_ENGINE_VERSION,
  VISA_FATAL_LOSS_MIN,
  VISA_GOAL_RATE_MIN,
  VISA_LOW_LOSS_MAX,
  VISA_MIN_MATCHES,
  VISA_WIN_MIN,
  selectVisaPick
} from "../engine/visaEngine.js";
import { buildLeagueMap } from "../engine/totalGoalsBankerEngine.js";
import { loadSportyBetVisaOdds } from "../providers/sportyBetOdds.js";
import { loadPublicFixturesForDate } from "./publicService.js";
import { fetchAllRows } from "./supabaseHelpers.js";

const CACHE_TTL_MS = 60_000;
const cache = new Map();

function completeGame(row) {
  return row?.fulltime_home != null && row?.fulltime_away != null &&
    Number.isFinite(Number(row.fulltime_home)) && Number.isFinite(Number(row.fulltime_away));
}

function perspectiveGame(row, venue) {
  const home = venue === "home";
  return {
    date: row.fixture_date,
    ftFor: Number(home ? row.fulltime_home : row.fulltime_away),
    ftAgainst: Number(home ? row.fulltime_away : row.fulltime_home)
  };
}

/** Keep only the home team's last five home matches and the away team's last five away matches. */
export function venueHistoryForFixture(rows = [], fixture = {}) {
  const leagueId = Number(fixture.league?.id);
  const season = Number(fixture.season ?? fixture.league?.season);
  const homeId = Number(fixture.home?.id);
  const awayId = Number(fixture.away?.id);
  const cutoff = new Date(fixture.kickoff).getTime();
  const relevant = rows
    .filter((row) => {
      const stamp = new Date(row.fixture_date).getTime();
      if (!Number.isFinite(stamp) || stamp >= cutoff || !completeGame(row)) return false;
      if (Number(row.league_id) !== leagueId) return false;
      if (Number.isFinite(season) && Number(row.season) !== season) return false;
      return true;
    })
    .sort((left, right) => new Date(right.fixture_date) - new Date(left.fixture_date));

  return {
    homeGames: relevant
      .filter((row) => Number(row.home_team_id) === homeId)
      .slice(0, VISA_MIN_MATCHES)
      .map((row) => perspectiveGame(row, "home")),
    awayGames: relevant
      .filter((row) => Number(row.away_team_id) === awayId)
      .slice(0, VISA_MIN_MATCHES)
      .map((row) => perspectiveGame(row, "away"))
  };
}

async function loadVenueHistory(supabase, fixtures) {
  const leagueIds = [...new Set(fixtures
    .map((fixture) => Number(fixture.league?.id))
    .filter(Number.isFinite))];
  const kickoffs = fixtures
    .map((fixture) => new Date(fixture.kickoff).getTime())
    .filter(Number.isFinite);
  if (!leagueIds.length || !kickoffs.length) return [];

  return fetchAllRows(() => supabase
    .from("fixtures")
    .select("id,league_id,season,fixture_date,home_team_id,away_team_id,fulltime_home,fulltime_away,status")
    .in("league_id", leagueIds)
    .lt("fixture_date", new Date(Math.max(...kickoffs)).toISOString())
    .eq("status", "FT"));
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
    engine: VISA_ENGINE_NAME,
    engineKey: "visa",
    engineVersion: VISA_ENGINE_VERSION,
    sportyBetUrl: odds?.url || null,
    sportyBetEventId: odds?.eventId || null,
    ...pick
  };
}

export async function getVisaPicks(supabase, date, { force = false } = {}) {
  const cached = cache.get(date);
  if (!force && cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return { ...cached.value, cached: true };
  }

  const fixtures = (await loadPublicFixturesForDate(supabase, date)).filter((fixture) =>
    PREDICTABLE_STATUSES.has(fixture.status)
  );
  const historyRows = await loadVenueHistory(supabase, fixtures);
  const histories = new Map(fixtures.map((fixture) => [
    Number(fixture.id),
    venueHistoryForFixture(historyRows, fixture)
  ]));
  const oddsEligible = fixtures.filter((fixture) => {
    const history = histories.get(Number(fixture.id));
    return history?.homeGames?.length >= VISA_MIN_MATCHES &&
      history?.awayGames?.length >= VISA_MIN_MATCHES;
  });
  const sportyOdds = await loadSportyBetVisaOdds(oddsEligible, { force }).catch(() => new Map());

  const picks = [];
  const rejectionCounts = {};
  for (const fixture of fixtures) {
    const history = histories.get(Number(fixture.id)) || {};
    const odds = sportyOdds.get(Number(fixture.id)) || {};
    const pick = selectVisaPick({
      homeName: fixture.home?.name || "Home",
      awayName: fixture.away?.name || "Away",
      homeGames: history.homeGames || [],
      awayGames: history.awayGames || [],
      odds
    });
    if (!pick.available) {
      const reason = pick.reasons?.[0] || "No Visa route qualified";
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
    engine: VISA_ENGINE_NAME,
    engineVersion: VISA_ENGINE_VERSION,
    rules: {
      splitWindow: VISA_MIN_MATCHES,
      lossGrades: [60, 80, 100],
      fatalLossMin: VISA_FATAL_LOSS_MIN,
      lowLossMaxExclusive: VISA_LOW_LOSS_MAX,
      dualWinMin: VISA_WIN_MIN,
      goalEvidenceMin: VISA_GOAL_RATE_MIN,
      onePickPerFixture: true
    },
    reviewedFixtures: fixtures.length,
    historyQualifiedFixtures: oddsEligible.length,
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
