import { PREDICTABLE_STATUSES } from "../config.js";
import { nextUtcDate } from "../utils/date.js";
import { fetchAllRows } from "./supabaseHelpers.js";
import { loadPreparedBoardData } from "./publicService.js";
import { loadFixtureRiskPack } from "./fixtureRiskService.js";
import { loadSportyBetGoalOdds } from "../providers/sportyBetOdds.js";
import { rankLeagueTable } from "../engine/topFiveClashFlag.js";
import { buildLeagueMap } from "../engine/totalGoalsBankerEngine.js";
import {
  DINARI_ENGINE_KEY,
  DINARI_ENGINE_NAME,
  DINARI_ENGINE_VERSION,
  DINARI_MIN_MATCHES,
  runDinari,
  selectDinariPicks
} from "../engine/dinariEngine.js";

const CACHE_TTL_MS = 60_000;
const cache = new Map();

function pickLiveOdds(sporty) {
  if (!sporty) return {};
  if (!(Number(sporty.draw) > 1)) return {};
  return {
    ...sporty,
    odds: sporty,
    source: "sportybet",
    book: "SportyBet",
    url: sporty.url || null
  };
}

function averagesFromTable(row) {
  const played = Number(row?.played || 0);
  const gf = Number(row?.gf || 0);
  const ga = Number(row?.ga || 0);
  return {
    played,
    gfAvg: played ? gf / played : null,
    gaAvg: played ? ga / played : null,
    gf,
    ga
  };
}

function publicPick(fixture, pick, risk, odds) {
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
    engine: DINARI_ENGINE_NAME,
    engineKey: DINARI_ENGINE_KEY,
    engineVersion: DINARI_ENGINE_VERSION,
    redFlags,
    earlySeason: redFlags.find((flag) => flag.code === "EARLY_SEASON") || null,
    topFiveClash: redFlags.find((flag) => flag.code === "TOP5_CLASH") || null,
    table: risk.table || null,
    sportyBetEventId: odds.eventId || null,
    sportyBetUrl: odds.url || null,
    book: odds.book || odds.source || null,
    ...pick
  };
}

export async function getDinariPicks(supabase, date, { force = false } = {}) {
  const first = await buildDinariPicks(supabase, date, { force });
  if (first.reviewedFixtures > 0) return first;
  const rolled = nextUtcDate(date);
  const second = await buildDinariPicks(supabase, rolled, { force });
  if (second.reviewedFixtures > 0) {
    return { ...second, requestedDate: date, rolledForward: true };
  }
  return first;
}

async function loadSeasonTables(supabase, fixtures) {
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
    const table = rankLeagueTable(rows || [], {
      leagueId: fixture.league?.id,
      season: fixture.season ?? fixture.league?.season,
      cutoff: new Date(fixture.kickoff || fixture.fixture_date).getTime()
    });
    const home = table.find((row) => Number(row.teamId) === Number(fixture.home?.id));
    const away = table.find((row) => Number(row.teamId) === Number(fixture.away?.id));
    map.set(Number(fixture.id), {
      home: averagesFromTable(home),
      away: averagesFromTable(away)
    });
  }
  return map;
}

async function buildDinariPicks(supabase, date, { force = false } = {}) {
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

  const [riskPack, sportyOdds, seasonTables] = await Promise.all([
    loadFixtureRiskPack(supabase, raw, teamMap),
    loadSportyBetGoalOdds(fixtures).catch(() => new Map()),
    loadSeasonTables(supabase, fixtures)
  ]);

  const snapshots = [];
  const rejectionCounts = {};
  const picks = [];

  for (const fixture of fixtures) {
    const risk = riskPack.get(Number(fixture.id)) || {};
    const season = seasonTables.get(Number(fixture.id)) || { home: {}, away: {} };
    const odds = pickLiveOdds(sportyOdds.get(Number(fixture.id)));
    const snapshot = {
      fixtureId: fixture.fixtureId,
      id: fixture.id,
      kickoff: fixture.kickoff,
      homeName: fixture.home?.name || "Home",
      awayName: fixture.away?.name || "Away",
      home: season.home,
      away: season.away,
      odds
    };
    snapshots.push(snapshot);
    const selected = selectDinariPicks(snapshot);
    if (!selected.length) {
      const homePlayed = Number(season.home?.played || 0);
      const awayPlayed = Number(season.away?.played || 0);
      let reason = "No Dinari totals banker";
      if (homePlayed < DINARI_MIN_MATCHES || awayPlayed < DINARI_MIN_MATCHES) {
        reason = "Fewer than five league matches";
      } else if (!(Number(odds.draw) > 1)) {
        reason = "No SportyBet draw price";
      }
      rejectionCounts[reason] = (rejectionCounts[reason] || 0) + 1;
      continue;
    }
    for (const pick of selected) {
      picks.push(publicPick(fixture, pick, risk, odds));
    }
  }

  picks.sort((left, right) =>
    Date.parse(left.kickoff || 0) - Date.parse(right.kickoff || 0) ||
    Number(right.score || 0) - Number(left.score || 0)
  );

  const value = {
    date,
    generatedAt: new Date().toISOString(),
    engine: DINARI_ENGINE_NAME,
    engineKey: DINARI_ENGINE_KEY,
    engineVersion: DINARI_ENGINE_VERSION,
    rules: {
      over25: "At least one team averages over 2.2 goals scored, the other not less than 1.3, draw odds over 3.60",
      over15: "One team averages over 2.2 and concedes less than 1, or both average not less than 1.80 scored and 1.5 conceded",
      under25: "At least one team averages less than 1 scored and conceded, or both do, and draw odds are not greater than 2.90",
      under35: "At least one team averages less than 1.4 scored and concedes less than 1, or both average under 1 scored and 1.2 conceded, draw odds not greater than 3.10"
    },
    minMatches: DINARI_MIN_MATCHES,
    reviewedFixtures: fixtures.length,
    pickCount: picks.length,
    rejectedCount: fixtures.length - new Set(picks.map((pick) => pick.internalFixtureId)).size,
    rejectionCounts,
    leagueMap: buildLeagueMap(picks),
    markets: {
      "over-15": picks.filter((pick) => pick.key === "over-15").length,
      "over-25": picks.filter((pick) => pick.key === "over-25").length,
      "under-25": picks.filter((pick) => pick.key === "under-25").length,
      "under-35": picks.filter((pick) => pick.key === "under-35").length
    },
    picks
  };
  cache.set(date, { createdAt: Date.now(), value });
  return { ...value, cached: false };
}

export { runDinari };
