import { PREDICTABLE_STATUSES } from "../config.js";
import { nextUtcDate } from "../utils/date.js";
import { fetchAllRows } from "./supabaseHelpers.js";
import { loadPreparedBoardData } from "./publicService.js";
import { loadLeagueScoringByFixture } from "./leagueScoringService.js";
import { loadFixtureRiskPack } from "./fixtureRiskService.js";
import { toPerspectiveGame } from "../engine/splitFormEngine.js";
import { loadSportyBetGoalOdds } from "../providers/sportyBetOdds.js";
import { loadApiFootballGoalOdds } from "../providers/apiFootballOdds.js";
import {
  TOTAL_GOALS_BANKER_NAME,
  TOTAL_GOALS_BANKER_VERSION,
  ODDS_MAX,
  ODDS_MIN,
  buildLeagueMap,
  extractGoalOdds,
  ratesFromMatches,
  selectTotalGoalsBanker
} from "../engine/totalGoalsBankerEngine.js";

const CACHE_TTL_MS = 60_000;
const cache = new Map();

function profileRates(row) {
  if (!row) return {};
  return {
    over15Rate: Number(row.over_15_rate || 0),
    over25Rate: Number(row.over_25_rate || 0),
    under35Rate: Number(row.under_35_rate || 0),
    matches: Number(row.matches_played || 0)
  };
}

function oddsFromUnknownShape(value) {
  if (!value) return null;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return null; }
  }
  return typeof value === "object" ? value : null;
}

function storedTotals(fixture) {
  const source = oddsFromUnknownShape(fixture.odds || fixture.marketOdds || fixture.bookmakerOdds);
  if (!source) return null;
  const odds = {
    "over-15": extractGoalOdds(source, "over-15"),
    "over-25": extractGoalOdds(source, "over-25"),
    "under-25": extractGoalOdds(source, "under-25"),
    "under-35": extractGoalOdds(source, "under-35"),
    source: "stored",
    book: "stored"
  };
  return ["over-15", "over-25", "under-25", "under-35"].some((key) => Number(odds[key]) > 1)
    ? odds
    : null;
}

function pickLiveOdds(sporty, apiFootball, stored) {
  for (const pack of [sporty, apiFootball, stored]) {
    if (!pack) continue;
    if (["over-15", "over-25", "under-25", "under-35"].some((key) => Number(pack[key]) > 1)) {
      return {
        ...pack,
        source: pack.source || "bookmaker",
        sourceName: pack.book || pack.source || "book"
      };
    }
  }
  return {};
}

async function loadTeamSeasonRates(supabase, fixtures) {
  const map = new Map();
  const teamIds = [...new Set(fixtures.flatMap((fixture) => [
    Number(fixture.home?.id),
    Number(fixture.away?.id)
  ]).filter(Number.isFinite))];
  if (!teamIds.length) return map;
  try {
    const rows = await fetchAllRows(() =>
      supabase
        .from("team_goal_profiles")
        .select("team_id,league_id,season,scope,matches_played,over_15_rate,over_25_rate,under_35_rate")
        .in("team_id", teamIds)
        .eq("scope", "overall")
    );
    for (const row of rows || []) {
      map.set(`${row.team_id}:${row.league_id}:${row.season}`, profileRates(row));
      map.set(`${row.team_id}:${row.league_id}`, profileRates(row));
    }
  } catch {
    return map;
  }
  return map;
}

async function loadRecentRatesByFixture(supabase, fixtures) {
  const map = new Map();
  if (!fixtures.length) return map;
  const leagueIds = [...new Set(fixtures.map((fixture) => fixture.league?.id).filter(Boolean))];
  const seasons = [...new Set(fixtures.map((fixture) =>
    fixture.season ?? fixture.league?.season
  ).filter((value) => value != null))];
  if (!leagueIds.length || !seasons.length) return map;

  let rows = [];
  try {
    rows = await fetchAllRows(() =>
      supabase
        .from("fixtures")
        .select("id,league_id,season,fixture_date,home_team_id,away_team_id,fulltime_home,fulltime_away,status")
        .in("league_id", leagueIds)
        .in("season", seasons)
        .eq("status", "FT")
    );
  } catch {
    return map;
  }

  for (const fixture of fixtures) {
    const leagueId = fixture.league?.id;
    const season = fixture.season ?? fixture.league?.season;
    const cutoff = new Date(fixture.kickoff || fixture.fixture_date).getTime();
    const forTeam = (teamId) => (rows || [])
      .filter((row) =>
        Number(row.league_id) === Number(leagueId) &&
        Number(row.season) === Number(season) &&
        (Number(row.home_team_id) === Number(teamId) || Number(row.away_team_id) === Number(teamId)) &&
        new Date(row.fixture_date).getTime() < cutoff
      )
      .sort((left, right) => new Date(right.fixture_date) - new Date(left.fixture_date))
      .slice(0, 5)
      .map((row) => toPerspectiveGame(row, teamId));
    map.set(Number(fixture.id), {
      home: ratesFromMatches(forTeam(fixture.home?.id)),
      away: ratesFromMatches(forTeam(fixture.away?.id))
    });
  }
  return map;
}

function publicPick(fixture, pick, climate, redFlags) {
  return {
    fixtureId: fixture.fixtureId,
    internalFixtureId: fixture.id,
    kickoff: fixture.kickoff,
    status: fixture.status,
    matchState: fixture.matchState,
    league: fixture.league,
    home: fixture.home,
    away: fixture.away,
    engine: TOTAL_GOALS_BANKER_NAME,
    engineKey: "goals-banker",
    engineVersion: TOTAL_GOALS_BANKER_VERSION,
    leagueScoring: climate || null,
    redFlags: redFlags || [],
    earlySeason: (redFlags || []).find((flag) => flag.code === "EARLY_SEASON") || null,
    topFiveClash: (redFlags || []).find((flag) => flag.code === "TOP5_CLASH") || null,
    ...pick
  };
}

export async function getTotalGoalsBankers(supabase, date, { force = false } = {}) {
  const first = await buildTotalGoalsBankers(supabase, date, { force });
  if (first.reviewedFixtures > 0) return first;
  const rolled = nextUtcDate(date);
  const second = await buildTotalGoalsBankers(supabase, rolled, { force });
  if (second.reviewedFixtures > 0) {
    return { ...second, requestedDate: date, rolledForward: true };
  }
  return first;
}

async function buildTotalGoalsBankers(supabase, date, { force = false } = {}) {
  const cacheKey = date;
  const cached = cache.get(cacheKey);
  if (!force && cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return { ...cached.value, cached: true };
  }

  const board = await loadPreparedBoardData(supabase, date);
  const fixtures = (board.fixtures || []).filter((fixture) =>
    PREDICTABLE_STATUSES.has(fixture.status)
  );
  const rawForClimate = fixtures.map((fixture) => ({
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

  const [climates, riskPack, seasonRates, recentRates, sportyOdds, apiOdds] = await Promise.all([
    loadLeagueScoringByFixture(supabase, rawForClimate),
    loadFixtureRiskPack(supabase, rawForClimate, teamMap),
    loadTeamSeasonRates(supabase, fixtures),
    loadRecentRatesByFixture(supabase, fixtures),
    loadSportyBetGoalOdds(fixtures, date).catch(() => new Map()),
    loadApiFootballGoalOdds(date).catch(() => new Map())
  ]);

  const picks = [];
  const rejectionCounts = {};

  for (const fixture of fixtures) {
    const climate = climates.get(Number(fixture.id)) || fixture.leagueScoring || null;
    const risk = riskPack.get(Number(fixture.id)) || {};
    const redFlags = risk.redFlags || fixture.redFlags || [];
    const recent = recentRates.get(Number(fixture.id)) || { home: {}, away: {} };
    const odds = pickLiveOdds(
      sportyOdds.get(Number(fixture.id)),
      apiOdds.get(Number(fixture.fixtureId)) || apiOdds.get(Number(fixture.external_fixture_id)),
      storedTotals(fixture)
    );
    const leagueId = fixture.league?.id;
    const season = fixture.season ?? fixture.league?.season;
    const pick = selectTotalGoalsBanker({
      leagueRates: climate || {},
      climateLabel: climate?.label || "neutral",
      climateSource: climate?.source || null,
      leagueSample: climate?.matches || 0,
      homeSeason: seasonRates.get(`${fixture.home?.id}:${leagueId}:${season}`) ||
        seasonRates.get(`${fixture.home?.id}:${leagueId}`) || {},
      awaySeason: seasonRates.get(`${fixture.away?.id}:${leagueId}:${season}`) ||
        seasonRates.get(`${fixture.away?.id}:${leagueId}`) || {},
      homeRecent: recent.home,
      awayRecent: recent.away,
      odds,
      redFlags
    });
    if (!pick.available) {
      const reason = pick.reasons?.[0] || "No totals banker";
      rejectionCounts[reason] = (rejectionCounts[reason] || 0) + 1;
      continue;
    }
    picks.push(publicPick(fixture, pick, climate, redFlags));
  }

  picks.sort((left, right) => Number(right.score || 0) - Number(left.score || 0));
  const value = {
    date,
    generatedAt: new Date().toISOString(),
    engine: TOTAL_GOALS_BANKER_NAME,
    engineVersion: TOTAL_GOALS_BANKER_VERSION,
    oddsBand: { min: ODDS_MIN, max: ODDS_MAX },
    reviewedFixtures: fixtures.length,
    pickCount: picks.length,
    rejectedCount: fixtures.length - picks.length,
    rejectionCounts,
    leagueMap: buildLeagueMap(picks),
    picks
  };
  cache.set(cacheKey, { createdAt: Date.now(), value });
  return { ...value, cached: false };
}
