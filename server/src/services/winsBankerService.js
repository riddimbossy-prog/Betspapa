import { PREDICTABLE_STATUSES } from "../config.js";
import { nextUtcDate } from "../utils/date.js";
import { loadPreparedBoardData } from "./publicService.js";
import { loadFixtureRiskPack } from "./fixtureRiskService.js";
import { loadSportyBetGoalOdds } from "../providers/sportyBetOdds.js";
import {
  WINS_BANKER_NAME,
  WINS_BANKER_VERSION,
  FAV_ODDS_MAX,
  FAV_ODDS_MIN,
  selectWinsBanker
} from "../engine/winsBankerEngine.js";
import { buildLeagueMap } from "../engine/totalGoalsBankerEngine.js";

const CACHE_TTL_MS = 60_000;
const cache = new Map();

function pickLiveOdds(sporty) {
  if (!sporty) return {};
  if (!(Number(sporty.home) > 1 && Number(sporty.away) > 1)) return {};
  return {
    ...sporty,
    odds: sporty,
    source: "sportybet",
    book: "SportyBet",
    url: sporty.url || null
  };
}

function publicPick(fixture, pick, risk) {
  const redFlags = risk.redFlags || [];
  return {
    fixtureId: fixture.fixtureId,
    internalFixtureId: fixture.id,
    kickoff: fixture.kickoff,
    status: fixture.status,
    matchState: fixture.matchState,
    league: fixture.league,
    home: fixture.home,
    away: fixture.away,
    engine: WINS_BANKER_NAME,
    engineKey: "wins-banker",
    engineVersion: WINS_BANKER_VERSION,
    redFlags,
    earlySeason: redFlags.find((flag) => flag.code === "EARLY_SEASON") || null,
    topFiveClash: redFlags.find((flag) => flag.code === "TOP5_CLASH") || null,
    table: risk.table || null,
    ...pick
  };
}

export async function getWinsBankers(supabase, date, { force = false } = {}) {
  const first = await buildWinsBankers(supabase, date, { force });
  if (first.reviewedFixtures > 0) return first;
  const rolled = nextUtcDate(date);
  const second = await buildWinsBankers(supabase, rolled, { force });
  if (second.reviewedFixtures > 0) {
    return { ...second, requestedDate: date, rolledForward: true };
  }
  return first;
}

async function buildWinsBankers(supabase, date, { force = false } = {}) {
  const cached = cache.get(date);
  if (!force && cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return { ...cached.value, cached: true };
  }

  const board = await loadPreparedBoardData(supabase, date);
  const fixtures = (board.fixtures || []).filter((fixture) =>
    PREDICTABLE_STATUSES.has(fixture.status)
  );
  const raw = fixtures.map((fixture) => ({
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

  const [riskPack, sportyOdds] = await Promise.all([
    loadFixtureRiskPack(supabase, raw, teamMap),
    loadSportyBetGoalOdds(fixtures).catch(() => new Map())
  ]);

  const picks = [];
  const rejectionCounts = {};

  for (const fixture of fixtures) {
    const risk = riskPack.get(Number(fixture.id)) || {};
    const table = risk.table || {};
    const lastFive = risk.lastFive || { home: [], away: [] };
    const pick = selectWinsBanker({
      homeName: fixture.home?.name || "Home",
      awayName: fixture.away?.name || "Away",
      homeRank: table.homeRank,
      awayRank: table.awayRank,
      tableSize: table.size,
      homePlayed: table.homePlayed,
      awayPlayed: table.awayPlayed,
      homePpg: table.homePpg,
      awayPpg: table.awayPpg,
      homeGpg: table.homeGpg,
      awayGpg: table.awayGpg,
      homeLastFive: lastFive.home,
      awayLastFive: lastFive.away,
      odds: pickLiveOdds(sportyOdds.get(Number(fixture.id))),
      redFlags: risk.redFlags || fixture.redFlags || []
    });
    if (!pick.available) {
      const reason = pick.reasons?.[0] || "No wins banker";
      rejectionCounts[reason] = (rejectionCounts[reason] || 0) + 1;
      continue;
    }
    picks.push(publicPick(fixture, pick, risk));
  }

  picks.sort((left, right) => Number(right.score || 0) - Number(left.score || 0));
  const value = {
    date,
    generatedAt: new Date().toISOString(),
    engine: WINS_BANKER_NAME,
    engineVersion: WINS_BANKER_VERSION,
    oddsBand: { min: FAV_ODDS_MIN, max: FAV_ODDS_MAX },
    reviewedFixtures: fixtures.length,
    pickCount: picks.length,
    rejectedCount: fixtures.length - picks.length,
    rejectionCounts,
    leagueMap: buildLeagueMap(picks),
    picks
  };
  cache.set(date, { createdAt: Date.now(), value });
  return { ...value, cached: false };
}
