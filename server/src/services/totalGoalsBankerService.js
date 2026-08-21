import { PREDICTABLE_STATUSES } from "../config.js";
import { dateRangeUtc } from "../utils/date.js";
import { fetchAllRows } from "./supabaseHelpers.js";
import { loadPreparedBoardData } from "./publicService.js";
import { loadLeagueScoringByFixture } from "./leagueScoringService.js";
import { loadFixtureRiskPack } from "./fixtureRiskService.js";
import { toPerspectiveGame } from "../engine/splitFormEngine.js";
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

async function loadOddsByFixture(supabase, fixtureIds) {
  const map = new Map();
  if (!fixtureIds.length) return map;
  const rows = await fetchAllRows(() =>
    supabase
      .from("fixtures")
      .select("id,market_odds,odds,bookmaker_odds")
      .in("id", fixtureIds)
  );
  for (const row of rows || []) {
    map.set(Number(row.id), row.market_odds || row.odds || row.bookmaker_odds || null);
  }
  return map;
}

async function loadTeamSeasonRates(supabase, fixtures) {
  const map = new Map();
  const teamIds = [...new Set(fixtures.flatMap((fixture) => [
    Number(fixture.home?.id || fixture.home_team_id),
    Number(fixture.away?.id || fixture.away_team_id)
  ]).filter(Number.isFinite))];
  if (!teamIds.length) return map;
  let rows = [];
  try {
    rows = await fetchAllRows(() =>
      supabase
        .from("team_goal_profiles")
        .select("team_id,league_id,season,scope,matches_played,over_15_rate,over_25_rate,under_35_rate")
        .in("team_id", teamIds)
        .eq("scope", "overall")
    );
  } catch {
    return map;
  }
  for (const row of rows || []) {
    map.set(`${row.team_id}:${row.league_id}:${row.season}`, profileRates(row));
  }
  return map;
}

async function loadRecentRatesByFixture(supabase, rawFixtures) {
  const map = new Map();
  if (!rawFixtures.length) return map;
  const leagueIds = [...new Set(rawFixtures.map((fixture) => fixture.league_id).filter(Boolean))];
  const seasons = [...new Set(rawFixtures.map((fixture) => fixture.season).filter((value) => value != null))];
  const rows = await fetchAllRows(() =>
    supabase
      .from("fixtures")
      .select("id,league_id,season,fixture_date,home_team_id,away_team_id,fulltime_home,fulltime_away,status")
      .in("league_id", leagueIds)
      .in("season", seasons)
      .eq("status", "FT")
  );

  for (const fixture of rawFixtures) {
    const cutoff = new Date(fixture.fixture_date).getTime();
    const forTeam = (teamId) => (rows || [])
      .filter((row) =>
        Number(row.league_id) === Number(fixture.league_id) &&
        Number(row.season) === Number(fixture.season) &&
        (Number(row.home_team_id) === Number(teamId) || Number(row.away_team_id) === Number(teamId)) &&
        new Date(row.fixture_date).getTime() < cutoff
      )
      .sort((left, right) => new Date(right.fixture_date) - new Date(left.fixture_date))
      .slice(0, 5)
      .map((row) => toPerspectiveGame(row, teamId));
    map.set(Number(fixture.id), {
      home: ratesFromMatches(forTeam(fixture.home_team_id)),
      away: ratesFromMatches(forTeam(fixture.away_team_id))
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
  const cacheKey = date;
  const cached = cache.get(cacheKey);
  if (!force && cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return { ...cached.value, cached: true };
  }

  const board = await loadPreparedBoardData(supabase, date);
  const fixtures = (board.fixtures || []).filter((fixture) =>
    PREDICTABLE_STATUSES.has(fixture.status)
  );
  const { start, end } = dateRangeUtc(date);
  const rawFixtures = await fetchAllRows(() =>
    supabase
      .from("fixtures")
      .select("id,league_id,season,fixture_date,home_team_id,away_team_id,status,market_odds,odds,bookmaker_odds")
      .gte("fixture_date", start)
      .lt("fixture_date", end)
  );
  const rawMap = new Map((rawFixtures || []).map((row) => [Number(row.id), row]));
  const teamMap = new Map();
  for (const fixture of fixtures) {
    if (fixture.home?.id) teamMap.set(Number(fixture.home.id), fixture.home);
    if (fixture.away?.id) teamMap.set(Number(fixture.away.id), fixture.away);
  }
  const climates = await loadLeagueScoringByFixture(supabase, rawFixtures || []);
  const riskPack = await loadFixtureRiskPack(supabase, rawFixtures || [], teamMap);
  const seasonRates = await loadTeamSeasonRates(supabase, fixtures);
  const recentRates = await loadRecentRatesByFixture(supabase, rawFixtures || []);
  const oddsMap = await loadOddsByFixture(supabase, fixtures.map((fixture) => fixture.id));

  const picks = [];
  const rejections = [];

  for (const fixture of fixtures) {
    const raw = rawMap.get(Number(fixture.id)) || {};
    const climate = climates.get(Number(fixture.id)) || fixture.leagueScoring || null;
    const risk = riskPack.get(Number(fixture.id)) || {};
    const redFlags = risk.redFlags || fixture.redFlags || [];
    const recent = recentRates.get(Number(fixture.id)) || { home: {}, away: {} };
    const oddsSource = oddsMap.get(Number(fixture.id)) || raw.market_odds || raw.odds || raw.bookmaker_odds;
    const odds = {
      "over-15": extractGoalOdds(oddsSource, "over-15"),
      "over-25": extractGoalOdds(oddsSource, "over-25"),
      "under-25": extractGoalOdds(oddsSource, "under-25"),
      "under-35": extractGoalOdds(oddsSource, "under-35")
    };
    const pick = selectTotalGoalsBanker({
      leagueRates: climate || {},
      climateLabel: climate?.label || "neutral",
      leagueSample: climate?.matches || 0,
      homeSeason: seasonRates.get(`${fixture.home?.id}:${raw.league_id}:${raw.season}`) || {},
      awaySeason: seasonRates.get(`${fixture.away?.id}:${raw.league_id}:${raw.season}`) || {},
      homeRecent: recent.home,
      awayRecent: recent.away,
      odds,
      redFlags
    });
    if (!pick.available) {
      rejections.push({
        fixtureId: fixture.fixtureId,
        league: fixture.league?.name,
        reason: pick.reasons?.[0] || "No totals banker"
      });
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
    rejectedCount: rejections.length,
    leagueMap: buildLeagueMap(picks),
    picks,
    rejections: rejections.slice(0, 40)
  };
  cache.set(cacheKey, { createdAt: Date.now(), value });
  return { ...value, cached: false };
}
