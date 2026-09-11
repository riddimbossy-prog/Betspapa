import { PREDICTABLE_STATUSES } from "../config.js";
import {
  VISA_AWAY_LOSS_RATE_MIN,
  VISA_COMPETITIVE_RANK_MAX,
  VISA_CONCEDE_AVG_MIN,
  VISA_ENGINE_NAME,
  VISA_ENGINE_VERSION,
  VISA_HOME_SCORE_AVG_MIN,
  VISA_HOME_WIN_RATE_MIN,
  VISA_MIN_MATCHES,
  VISA_MIN_SPLIT_PLAYED,
  VISA_MIN_SPLIT_TABLE,
  VISA_SCORE_AVG_MIN,
  VISA_TOP_RANK_MAX,
  VISA_WIN_ODDS_MAX,
  selectVisaPick
} from "../engine/visaEngine.js";
import { rankSplitTable } from "../engine/ppgEngine.js";
import { buildLeagueMap } from "../engine/totalGoalsBankerEngine.js";
import { loadSportyBetVisaOdds } from "../providers/sportyBetOdds.js";
import { loadPublicFixturesForDate } from "./publicService.js";
import { fetchAllRows } from "./supabaseHelpers.js";

const CACHE_TTL_MS = 60_000;
const dailyCache = new Map();
const weekCache = new Map();

export function visaWeekDates(startDate, days = 7) {
  const requestedDays = Math.trunc(Number(days));
  const dayCount = Number.isFinite(requestedDays)
    ? Math.max(1, Math.min(requestedDays, 7))
    : 7;
  const start = new Date(`${startDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== startDate) {
    throw new RangeError("Visa week start must be a valid ISO date");
  }
  return Array.from({ length: dayCount }, (_, offset) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  });
}

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

/** Resolve the home-only and away-only league positions at this fixture's kickoff. */
export function splitStandingsForFixture(rows = [], fixture = {}) {
  const leagueId = Number(fixture.league?.id);
  const season = Number(fixture.season ?? fixture.league?.season);
  const cutoff = new Date(fixture.kickoff).getTime();
  const options = {
    leagueId: Number.isFinite(leagueId) ? leagueId : undefined,
    season: Number.isFinite(season) ? season : undefined,
    cutoff
  };
  const homeTable = rankSplitTable(rows, { ...options, venue: "home" });
  const awayTable = rankSplitTable(rows, { ...options, venue: "away" });
  return {
    homeStanding: homeTable.find((row) => Number(row.teamId) === Number(fixture.home?.id)) || {},
    awayStanding: awayTable.find((row) => Number(row.teamId) === Number(fixture.away?.id)) || {}
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

function buildVisaSlate(date, fixtures, histories, sportyOdds) {
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
      homeStanding: history.homeStanding || {},
      awayStanding: history.awayStanding || {},
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
  const historyQualifiedFixtures = fixtures.filter((fixture) => {
    const history = histories.get(Number(fixture.id));
    return history?.homeGames?.length >= VISA_MIN_MATCHES &&
      history?.awayGames?.length >= VISA_MIN_MATCHES;
  });
  const oddsMatchedFixtures = fixtures.filter((fixture) =>
    sportyOdds.has(Number(fixture.id))
  );
  return {
    date,
    generatedAt: new Date().toISOString(),
    engine: VISA_ENGINE_NAME,
    engineVersion: VISA_ENGINE_VERSION,
    rules: {
      splitWindow: VISA_MIN_MATCHES,
      splitTableMinimum: VISA_MIN_SPLIT_TABLE,
      splitPlayedMinimum: VISA_MIN_SPLIT_PLAYED,
      winBankerTopRank: VISA_TOP_RANK_MAX,
      winBankerOddsMax: VISA_WIN_ODDS_MAX,
      competitiveOpponentTopRank: VISA_COMPETITIVE_RANK_MAX,
      competitiveOpponentMarket: "draw-no-bet",
      winOpponentOutsideTop: VISA_COMPETITIVE_RANK_MAX,
      bottomOpponentRank: 3,
      bottomOpponentSides: ["home", "away"],
      bottomThreeConflict: "skip",
      over25ScoreAverageMin: VISA_SCORE_AVG_MIN,
      over25ConcedeAverageMin: VISA_CONCEDE_AVG_MIN,
      awayConcedeMarket: "home-over-15",
      awayLossRateMin: VISA_AWAY_LOSS_RATE_MIN,
      awayLossMarket: "home",
      homeScoreAverageMin: VISA_HOME_SCORE_AVG_MIN,
      homeWinRateMinExclusive: VISA_HOME_WIN_RATE_MIN,
      dualTriggerSureVisa: true,
      onePickPerFixture: true
    },
    reviewedFixtures: fixtures.length,
    historyQualifiedFixtures: historyQualifiedFixtures.length,
    oddsMatchedFixtures: oddsMatchedFixtures.length,
    pickCount: picks.length,
    rejectedCount: fixtures.length - picks.length,
    rejectionCounts,
    leagueMap: buildLeagueMap(picks),
    picks
  };
}

async function loadVisaSlates(supabase, dates, { force = false } = {}) {
  const fixtureGroups = await Promise.all(dates.map(async (date) => ({
    date,
    fixtures: (await loadPublicFixturesForDate(supabase, date)).filter((fixture) =>
      PREDICTABLE_STATUSES.has(fixture.status)
    )
  })));
  const fixtures = fixtureGroups.flatMap((group) => group.fixtures);
  const historyRows = await loadVenueHistory(supabase, fixtures);
  const competitionRows = new Map();
  for (const row of historyRows) {
    const key = `${Number(row.league_id)}:${Number(row.season)}`;
    if (!competitionRows.has(key)) competitionRows.set(key, []);
    competitionRows.get(key).push(row);
  }
  const histories = new Map(fixtures.map((fixture) => {
    const key = `${Number(fixture.league?.id)}:${Number(fixture.season ?? fixture.league?.season)}`;
    const rows = competitionRows.get(key) || [];
    return [
      Number(fixture.id),
      {
        ...venueHistoryForFixture(rows, fixture),
        ...splitStandingsForFixture(rows, fixture)
      }
    ];
  }));
  const oddsEligible = fixtures.filter((fixture) => {
    const history = histories.get(Number(fixture.id));
    return history?.homeGames?.length >= VISA_MIN_MATCHES &&
      history?.awayGames?.length >= VISA_MIN_MATCHES;
  });
  const sportyOdds = await loadSportyBetVisaOdds(oddsEligible, { force }).catch(() => new Map());
  const createdAt = Date.now();
  return fixtureGroups.map(({ date, fixtures: dateFixtures }) => {
    const value = buildVisaSlate(date, dateFixtures, histories, sportyOdds);
    dailyCache.set(date, { createdAt, value });
    return value;
  });
}

export async function getVisaPicks(supabase, date, { force = false } = {}) {
  const cached = dailyCache.get(date);
  if (!force && cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return { ...cached.value, cached: true };
  }
  const [value] = await loadVisaSlates(supabase, [date], { force });
  return { ...value, cached: false };
}

export async function getVisaWeek(supabase, startDate, { days = 7, force = false } = {}) {
  const dates = visaWeekDates(startDate, days);
  const cacheKey = `${dates[0]}:${dates.length}`;
  const cached = weekCache.get(cacheKey);
  if (!force && cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return { ...cached.value, cached: true };
  }

  const slates = await loadVisaSlates(supabase, dates, { force });
  const totals = slates.reduce((summary, slate) => ({
    reviewedFixtures: summary.reviewedFixtures + slate.reviewedFixtures,
    historyQualifiedFixtures: summary.historyQualifiedFixtures + slate.historyQualifiedFixtures,
    oddsMatchedFixtures: summary.oddsMatchedFixtures + slate.oddsMatchedFixtures,
    pickCount: summary.pickCount + slate.pickCount,
    rejectedCount: summary.rejectedCount + slate.rejectedCount
  }), {
    reviewedFixtures: 0,
    historyQualifiedFixtures: 0,
    oddsMatchedFixtures: 0,
    pickCount: 0,
    rejectedCount: 0
  });
  const value = {
    startDate: dates[0],
    endDate: dates.at(-1),
    dayCount: dates.length,
    generatedAt: new Date().toISOString(),
    engine: VISA_ENGINE_NAME,
    engineVersion: VISA_ENGINE_VERSION,
    totals,
    days: slates
  };
  weekCache.set(cacheKey, { createdAt: Date.now(), value });
  return { ...value, cached: false };
}
