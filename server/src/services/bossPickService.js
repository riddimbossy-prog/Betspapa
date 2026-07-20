import { createRequire } from "node:module";

import {
  BOSS_ENGINE_VERSION,
  FINISHED_PROFILE_STATUSES
} from "../config.js";
import { dateRangeUtc } from "../utils/date.js";
import { fetchFixtureEvents } from "../providers/apiFootball.js";
import { fixtureMatchState } from "./matchStateService.js";
import { fetchAllRows, throwIfSupabaseError } from "./supabaseHelpers.js";

const require = createRequire(import.meta.url);
const {
  runEngine,
  ENGINE_NAME: OMNI_ENGINE_NAME,
  ENGINE_VERSION: OMNI_ENGINE_VERSION,
  CORE_MARKETS
} = require("../engine/omni_htft_engine.cjs");

const MIN_OVERALL_MATCHES = 8;
const MIN_VENUE_MATCHES = 6;
const MIN_LEAGUE_MATCHES = 30;
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();
const eventCache = new Map();
const BOSS_VISIBLE_STATUSES = new Set([
  "NS", "TBD", "1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE",
  "FT", "AET", "PEN"
]);

function cleanFinite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validFinishedFixture(fixture) {
  return (
    FINISHED_PROFILE_STATUSES.has(fixture?.status) &&
    cleanFinite(fixture.halftime_home) !== null &&
    cleanFinite(fixture.halftime_away) !== null &&
    cleanFinite(fixture.fulltime_home) !== null &&
    cleanFinite(fixture.fulltime_away) !== null
  );
}

function fixtureKey(fixture) {
  return Number(fixture.id || fixture.external_fixture_id || 0);
}

function newestFirst(rows) {
  return [...rows].sort(
    (a, b) => new Date(b.fixture_date) - new Date(a.fixture_date)
  );
}

export function inferScoreOrder({ goalsFor, goalsAgainst, htFor, htAgainst }) {
  if (goalsFor === 0 && goalsAgainst === 0) return null;

  if (htFor > 0 && htAgainst === 0) return true;
  if (htAgainst > 0 && htFor === 0) return false;

  if (goalsFor > 0 && goalsAgainst === 0) return true;
  if (goalsAgainst > 0 && goalsFor === 0) return false;

  return undefined;
}

export function toTeamMatch(fixture, teamId) {
  const homePerspective = Number(fixture.home_team_id) === Number(teamId);
  const goalsFor = Number(
    homePerspective ? fixture.fulltime_home : fixture.fulltime_away
  );
  const goalsAgainst = Number(
    homePerspective ? fixture.fulltime_away : fixture.fulltime_home
  );
  const halfTimeGoalsFor = Number(
    homePerspective ? fixture.halftime_home : fixture.halftime_away
  );
  const halfTimeGoalsAgainst = Number(
    homePerspective ? fixture.halftime_away : fixture.halftime_home
  );

  const scoredFirst = inferScoreOrder({
    goalsFor,
    goalsAgainst,
    htFor: halfTimeGoalsFor,
    htAgainst: halfTimeGoalsAgainst
  });

  const ledAnyTime =
    halfTimeGoalsFor > halfTimeGoalsAgainst ||
    goalsFor > goalsAgainst ||
    scoredFirst === true
      ? true
      : undefined;

  const trailedAnyTime =
    halfTimeGoalsFor < halfTimeGoalsAgainst ||
    goalsFor < goalsAgainst ||
    scoredFirst === false
      ? true
      : undefined;

  return {
    date: fixture.fixture_date,
    venue: homePerspective ? "home" : "away",
    goalsFor,
    goalsAgainst,
    halfTimeGoalsFor,
    halfTimeGoalsAgainst,
    ...(scoredFirst === undefined ? {} : { scoredFirst }),
    ...(ledAnyTime === undefined ? {} : { ledAnyTime }),
    ...(trailedAnyTime === undefined ? {} : { trailedAnyTime })
  };
}

export function toLeagueMatch(fixture) {
  return {
    date: fixture.fixture_date,
    homeGoals: Number(fixture.fulltime_home),
    awayGoals: Number(fixture.fulltime_away),
    halfTimeHomeGoals: Number(fixture.halftime_home),
    halfTimeAwayGoals: Number(fixture.halftime_away)
  };
}

export function marketGroup(marketId) {
  const id = String(marketId || "");
  if (id.startsWith("MATCH_OVER") || id.startsWith("MATCH_UNDER")) return "Total Goals";
  if (id.startsWith("HOME_OVER") || id.startsWith("AWAY_OVER") || id.startsWith("HOME_UNDER") || id.startsWith("AWAY_UNDER")) return "Team Goals";
  if (id.startsWith("BTTS")) return "Both Teams to Score";
  if (id.includes("DNB") || id.startsWith("DOUBLE_CHANCE") || ["HOME_WIN", "AWAY_WIN", "DRAW"].includes(id)) return "Match Result";
  if (id.startsWith("FIRST_HALF")) return "First Half";
  if (id.startsWith("SECOND_HALF")) return "Second Half";
  if (id.includes("WIN_EITHER_HALF")) return "Win Either Half";
  if (id.includes("SCORE_BOTH_HALVES")) return "Score in Both Halves";
  if (id.includes("SCORE_FIRST") || id === "NO_GOAL") return "First Team to Score";
  if (id.includes("LEAD_ANYTIME")) return "Lead at Any Time";
  if (id.includes("CLEAN_SHEET") || id.includes("WIN_TO_NIL")) return "Clean Sheet";
  return "OMNI Market";
}

export function selectionLabel(marketName, homeName, awayName) {
  let label = String(marketName || "Boss Pick");
  label = label.replaceAll("Home Team", homeName).replaceAll("Away Team", awayName);
  label = label.replace(/^Home Win$/, `${homeName} to Win`);
  label = label.replace(/^Away Win$/, `${awayName} to Win`);
  label = label.replace(/^Home Draw No Bet$/, `${homeName} Draw No Bet`);
  label = label.replace(/^Away Draw No Bet$/, `${awayName} Draw No Bet`);
  label = label.replace(/^Home Win to Nil$/, `${homeName} Win to Nil`);
  label = label.replace(/^Away Win to Nil$/, `${awayName} Win to Nil`);
  return label;
}

function explanationFor(result, samples) {
  const selected = result.selected;
  const breakdown = selected.scoreBreakdown || {};
  const reasons = [
    `The mandatory HT/FT gate passed and contributed ${Number(breakdown.htft || 0).toFixed(1)} of 40 rule points.`,
    `Market-specific evidence contributed ${Number(breakdown.components || 0).toFixed(1)} of 35 rule points.`,
    `Current overall and venue streaks contributed ${Number(breakdown.streaks || 0).toFixed(1)} of 15 rule points.`,
    `Context and data quality contributed ${Number(breakdown.context || 0).toFixed(1)} of 10 rule points.`,
    result.selectionRule || "This was the safest eligible core market after conflict checks."
  ];

  const cautions = [
    ...(selected.contradictions || []),
    "The OMNI score is a rule score out of 100, not a predicted win probability.",
    "OMNI v2.5.2 evaluates 44 active markets, but only six audited core markets may become the final Boss Pick.",
    "Full-match Over 0.5 has been removed because its typical price was judged too low to offer worthwhile value.",
    "BetsPapa runs OMNI in available-data mode. Missing required xG or event-order evidence blocks the dependent market."
  ];

  return {
    summary: `OMNI v2.5.2 selected this core market after HT/FT, market evidence, streaks, context and contradiction checks produced a ${Number(selected.score || 0).toFixed(1)} out of 100 rule score.`,
    reasons,
    cautions,
    samples
  };
}

async function loadDateFixtures(supabase, date) {
  const { start, end } = dateRangeUtc(date);
  return fetchAllRows(() =>
    supabase
      .from("fixtures")
      .select("*")
      .gte("fixture_date", start)
      .lt("fixture_date", end)
      .order("fixture_date", { ascending: true })
  );
}

async function loadEntities(supabase, fixtures) {
  const teamIds = [...new Set(fixtures.flatMap((fixture) => [
    fixture.home_team_id,
    fixture.away_team_id
  ]).filter(Boolean))];
  const leagueIds = [...new Set(fixtures.map((fixture) => fixture.league_id).filter(Boolean))];

  const [teamsResult, leaguesResult] = await Promise.all([
    teamIds.length
      ? supabase.from("teams")
          .select("id,external_team_id,name,country,logo_url")
          .in("id", teamIds)
      : Promise.resolve({ data: [], error: null }),
    leagueIds.length
      ? supabase.from("leagues")
          .select("id,external_league_id,name,country,season,logo_url")
          .in("id", leagueIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  throwIfSupabaseError(teamsResult.error, "Unable to load Boss Pick teams");
  throwIfSupabaseError(leaguesResult.error, "Unable to load Boss Pick leagues");

  return {
    teamMap: new Map((teamsResult.data || []).map((team) => [Number(team.id), team])),
    leagueMap: new Map((leaguesResult.data || []).map((league) => [Number(league.id), league]))
  };
}

async function loadTeamHistory(supabase, teamIds) {
  if (!teamIds.length) return [];

  const select = "id,league_id,season,fixture_date,home_team_id,away_team_id,halftime_home,halftime_away,fulltime_home,fulltime_away,status";
  const [homeRows, awayRows] = await Promise.all([
    fetchAllRows(() =>
      supabase
        .from("fixtures")
        .select(select)
        .in("status", [...FINISHED_PROFILE_STATUSES])
        .in("home_team_id", teamIds)
        .order("fixture_date", { ascending: false })
    ),
    fetchAllRows(() =>
      supabase
        .from("fixtures")
        .select(select)
        .in("status", [...FINISHED_PROFILE_STATUSES])
        .in("away_team_id", teamIds)
        .order("fixture_date", { ascending: false })
    )
  ]);

  const map = new Map();
  for (const fixture of [...homeRows, ...awayRows]) {
    if (validFinishedFixture(fixture)) map.set(fixtureKey(fixture), fixture);
  }
  return newestFirst([...map.values()]);
}

async function loadLeagueSamples(supabase, fixtures) {
  const pairs = new Map();
  for (const fixture of fixtures) {
    pairs.set(`${fixture.league_id}:${fixture.season}`, {
      leagueId: Number(fixture.league_id),
      season: Number(fixture.season)
    });
  }

  const output = new Map();
  for (const item of pairs.values()) {
    const { data, error } = await supabase
      .from("fixtures")
      .select("id,league_id,season,fixture_date,home_team_id,away_team_id,halftime_home,halftime_away,fulltime_home,fulltime_away,status")
      .eq("league_id", item.leagueId)
      .eq("season", item.season)
      .in("status", [...FINISHED_PROFILE_STATUSES])
      .order("fixture_date", { ascending: false })
      .limit(80);

    throwIfSupabaseError(error, "Unable to load Boss Pick league history");
    output.set(
      `${item.leagueId}:${item.season}`,
      newestFirst((data || []).filter(validFinishedFixture))
    );
  }
  return output;
}

function rejectionCounter(rows) {
  const counts = new Map();
  for (const row of rows) {
    const key = row.reason || "No OMNI market reached 80";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

export function rankBossPicks(rows) {
  return [...rows]
    .sort((a, b) => {
      const gradeA = a.grade === "PRIME" ? 1 : 0;
      const gradeB = b.grade === "PRIME" ? 1 : 0;
      if (gradeB !== gradeA) return gradeB - gradeA;
      if (Number(b.score) !== Number(a.score)) return Number(b.score) - Number(a.score);
      return new Date(a.kickoff) - new Date(b.kickoff);
    });
}


function bossScoreParts(fixture) {
  const h = Number(fixture.fulltime_home);
  const a = Number(fixture.fulltime_away);
  const hh = Number(fixture.halftime_home);
  const ha = Number(fixture.halftime_away);
  if (![h, a, hh, ha].every(Number.isFinite)) return null;
  return {
    h,
    a,
    hh,
    ha,
    sh: h - hh,
    sa: a - ha
  };
}

async function fixtureGoalEvents(externalFixtureId) {
  const key = Number(externalFixtureId);
  const cached = eventCache.get(key);
  if (cached && Date.now() - cached.createdAt < 24 * 60 * 60 * 1000) {
    return cached.events;
  }

  const payload = await fetchFixtureEvents(key);
  const events = (payload.response || [])
    .filter((event) => event?.type === "Goal" && !/missed/i.test(String(event?.detail || "")))
    .sort((a, b) => {
      const minuteA = Number(a?.time?.elapsed || 0) * 100 + Number(a?.time?.extra || 0);
      const minuteB = Number(b?.time?.elapsed || 0) * 100 + Number(b?.time?.extra || 0);
      return minuteA - minuteB;
    });

  eventCache.set(key, { createdAt: Date.now(), events });
  return events;
}

async function settleBossPick({ fixture, selected, home, away }) {
  if (!FINISHED_PROFILE_STATUSES.has(fixture.status)) return null;

  const score = bossScoreParts(fixture);
  if (!score) {
    return {
      outcome: "REVIEW",
      reason: "Final or half-time score is incomplete",
      persisted: false
    };
  }

  const { h, a, hh, ha, sh, sa } = score;
  const marketId = String(selected.marketId || "");
  let outcome = null;
  let reason = "Settled from the confirmed half-time and full-time scores";

  if (marketId === "FIRST_HALF_OVER_0_5") {
    outcome = hh + ha >= 1 ? "WIN" : "LOSS";
  } else if (marketId === "SECOND_HALF_OVER_0_5") {
    outcome = sh + sa >= 1 ? "WIN" : "LOSS";
  } else if (marketId === "HOME_WIN_EITHER_HALF") {
    outcome = hh > ha || sh > sa ? "WIN" : "LOSS";
  } else if (marketId === "AWAY_WIN_EITHER_HALF") {
    outcome = ha > hh || sa > sh ? "WIN" : "LOSS";
  } else if (marketId === "HOME_LEAD_ANYTIME" || marketId === "AWAY_LEAD_ANYTIME") {
    const wantsHome = marketId === "HOME_LEAD_ANYTIME";
    const targetLedAtKnownCheckpoint = wantsHome ? hh > ha || h > a : ha > hh || a > h;

    if (targetLedAtKnownCheckpoint) {
      outcome = "WIN";
      reason = "The selected team led at half-time or full-time";
    } else {
      try {
        const events = await fixtureGoalEvents(fixture.external_fixture_id);
        let homeGoals = 0;
        let awayGoals = 0;
        let led = false;
        const homeProviderId = Number(home.external_team_id);
        const awayProviderId = Number(away.external_team_id);

        for (const event of events) {
          const teamId = Number(event?.team?.id);
          if (teamId === homeProviderId) homeGoals += 1;
          if (teamId === awayProviderId) awayGoals += 1;
          if (wantsHome ? homeGoals > awayGoals : awayGoals > homeGoals) {
            led = true;
            break;
          }
        }

        outcome = led ? "WIN" : "LOSS";
        reason = events.length
          ? "Settled from the provider's chronological goal events"
          : "No confirmed goal event showed the selected team taking the lead";
      } catch (error) {
        outcome = "REVIEW";
        reason = `Event-order settlement is waiting: ${error.message || String(error)}`;
      }
    }
  } else {
    outcome = "REVIEW";
    reason = "This Boss market needs a manual settlement rule";
  }

  return {
    outcome,
    reason,
    fulltimeScore: `${h}-${a}`,
    halftimeScore: `${hh}-${ha}`,
    settledAt: outcome === "REVIEW" ? null : new Date().toISOString(),
    persisted: false
  };
}

export function invalidateBossPickCache(date = null) {
  if (!date) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (String(key).endsWith(`:${date}`)) cache.delete(key);
  }
}

async function buildBossPicks(supabase, date) {
  const allDateFixtures = await loadDateFixtures(supabase, date);
  const fixtures = allDateFixtures.filter((fixture) =>
    BOSS_VISIBLE_STATUSES.has(fixture.status)
  );

  if (!fixtures.length) {
    return {
      date,
      generatedAt: new Date().toISOString(),
      engine: OMNI_ENGINE_NAME,
      engineVersion: BOSS_ENGINE_VERSION,
      mode: "available-data",
      reviewedFixtures: 0,
      qualifiedCount: 0,
      primeCount: 0,
      rejectedCount: 0,
      criteria: {
        minimumOverallMatches: MIN_OVERALL_MATCHES,
        minimumVenueMatches: MIN_VENUE_MATCHES,
        minimumLeagueMatches: MIN_LEAGUE_MATCHES,
        qualifiedScore: 80,
        primeScore: 87,
        selectionPolicy: "core-only-all-qualified",
        activeMarketsEvaluated: 44,
        selectableCoreMarkets: [...CORE_MARKETS],
        fullMatchOver05Removed: true
      },
      picks: [],
      rejections: [],
      status: "No scheduled fixtures were available for this date."
    };
  }

  const { teamMap, leagueMap } = await loadEntities(supabase, fixtures);
  const teamIds = [...new Set(fixtures.flatMap((fixture) => [
    Number(fixture.home_team_id),
    Number(fixture.away_team_id)
  ]))];
  const [history, leagueSamples] = await Promise.all([
    loadTeamHistory(supabase, teamIds),
    loadLeagueSamples(supabase, fixtures)
  ]);

  const historyByTeam = new Map(teamIds.map((teamId) => [teamId, []]));
  for (const past of history) {
    if (historyByTeam.has(Number(past.home_team_id))) {
      historyByTeam.get(Number(past.home_team_id)).push(past);
    }
    if (historyByTeam.has(Number(past.away_team_id))) {
      historyByTeam.get(Number(past.away_team_id)).push(past);
    }
  }

  const accepted = [];
  const rejected = [];

  for (const fixture of fixtures) {
    const home = teamMap.get(Number(fixture.home_team_id));
    const away = teamMap.get(Number(fixture.away_team_id));
    const league = leagueMap.get(Number(fixture.league_id));

    if (!home || !away || !league) {
      rejected.push({ fixtureId: fixture.external_fixture_id, reason: "Team or league record is unresolved" });
      continue;
    }

    const kickoffTime = new Date(fixture.fixture_date).getTime();
    const homeMatches = newestFirst(historyByTeam.get(Number(fixture.home_team_id)) || [])
      .filter((row) => new Date(row.fixture_date).getTime() < kickoffTime)
      .slice(0, 40)
      .map((row) => toTeamMatch(row, fixture.home_team_id));
    const awayMatches = newestFirst(historyByTeam.get(Number(fixture.away_team_id)) || [])
      .filter((row) => new Date(row.fixture_date).getTime() < kickoffTime)
      .slice(0, 40)
      .map((row) => toTeamMatch(row, fixture.away_team_id));
    const homeVenue = homeMatches.filter((match) => match.venue === "home").length;
    const awayVenue = awayMatches.filter((match) => match.venue === "away").length;
    const leagueRows = leagueSamples.get(`${fixture.league_id}:${fixture.season}`) || [];

    const samples = {
      homeOverall: homeMatches.length,
      homeVenue,
      awayOverall: awayMatches.length,
      awayVenue,
      league: leagueRows.length
    };

    const sampleFailures = [];
    if (homeMatches.length < MIN_OVERALL_MATCHES) sampleFailures.push(`${home.name} has fewer than ${MIN_OVERALL_MATCHES} completed matches`);
    if (awayMatches.length < MIN_OVERALL_MATCHES) sampleFailures.push(`${away.name} has fewer than ${MIN_OVERALL_MATCHES} completed matches`);
    if (homeVenue < MIN_VENUE_MATCHES) sampleFailures.push(`${home.name} has fewer than ${MIN_VENUE_MATCHES} home matches`);
    if (awayVenue < MIN_VENUE_MATCHES) sampleFailures.push(`${away.name} has fewer than ${MIN_VENUE_MATCHES} away matches`);
    if (leagueRows.length < MIN_LEAGUE_MATCHES) sampleFailures.push(`League sample is below ${MIN_LEAGUE_MATCHES} matches`);

    if (sampleFailures.length) {
      rejected.push({
        fixtureId: fixture.external_fixture_id,
        reason: sampleFailures[0],
        failures: sampleFailures
      });
      continue;
    }

    try {
      const result = runEngine({
        match: {
          homeTeam: home.name,
          awayTeam: away.name
        },
        strict: false,
        homeMatches,
        awayMatches,
        leagueMatches: leagueRows.map(toLeagueMatch),
        context: {
          weatherRisk: 0,
          lineupRisk: 0,
          motivationRisk: 0,
          pitchRisk: 0,
          rotationRisk: 0
        },
        metadata: {
          fixtureId: fixture.external_fixture_id,
          date,
          source: "BetsPapa Supabase fixture history"
        }
      });

      if (result.decision !== "BET" || !result.selected?.accepted) {
        rejected.push({
          fixtureId: fixture.external_fixture_id,
          reason: result.reason || "No selectable OMNI core market reached 80",
          failures: result.failures || [],
          blockedAcceptedMarkets: (result.blockedAcceptedMarkets || []).map((item) => ({
            marketId: item.marketId,
            marketName: item.marketName,
            score: item.score
          }))
        });
        continue;
      }

      const selected = result.selected;
      const selection = selectionLabel(selected.marketName, home.name, away.name);
      const settlement = await settleBossPick({ fixture, selected, home, away });
      accepted.push({
        fixtureId: fixture.external_fixture_id,
        internalFixtureId: fixture.id,
        kickoff: fixture.fixture_date,
        status: fixture.status,
        matchState: fixtureMatchState(fixture, settlement),
        settlement,
        score: {
          halftime: {
            home: fixture.halftime_home,
            away: fixture.halftime_away
          },
          current: {
            home: fixture.fulltime_home,
            away: fixture.fulltime_away
          }
        },
        venue: fixture.venue || null,
        home,
        away,
        league,
        engine: OMNI_ENGINE_NAME,
        engineVersion: BOSS_ENGINE_VERSION,
        runtimeEngineVersion: OMNI_ENGINE_VERSION,
        mode: "available-data",
        grade: selected.grade,
        score: Number(selected.score || 0),
        marketId: selected.marketId,
        market: marketGroup(selected.marketId),
        selection,
        selected,
        selectionRule: result.selectionRule,
        selectionPolicy: result.selectionPolicy,
        selectableCoreMarkets: [...CORE_MARKETS],
        alternatives: (result.alternatives || []).slice(0, 3).map((item) => ({
          marketId: item.marketId,
          marketName: item.marketName,
          score: item.score,
          grade: item.grade
        })),
        explanation: explanationFor(result, samples),
        samples,
        dataQuality: {
          xgKnown: Number.isFinite(result.context?.derived?.homeXgEdge),
          scoreOrderCoverage: result.context?.availability?.scoreOrder ? "complete" : "partial",
          leadOrderCoverage: result.context?.availability?.leadOrder ? "complete" : "partial",
          strictMode: false
        }
      });
    } catch (error) {
      rejected.push({
        fixtureId: fixture.external_fixture_id,
        reason: error.message || "OMNI evaluation failed"
      });
    }
  }

  const picks = rankBossPicks(accepted);

  return {
    date,
    generatedAt: new Date().toISOString(),
    engine: OMNI_ENGINE_NAME,
    engineVersion: BOSS_ENGINE_VERSION,
    runtimeEngineVersion: OMNI_ENGINE_VERSION,
    mode: "available-data",
    reviewedFixtures: fixtures.length,
    qualifiedCount: picks.length,
    primeCount: picks.filter((pick) => pick.grade === "PRIME").length,
    rejectedCount: rejected.length,
    criteria: {
      minimumOverallMatches: MIN_OVERALL_MATCHES,
      minimumVenueMatches: MIN_VENUE_MATCHES,
      minimumLeagueMatches: MIN_LEAGUE_MATCHES,
      qualifiedScore: 80,
      primeScore: 87,
      selectionPolicy: "core-only-all-qualified",
      activeMarketsEvaluated: 44,
      selectableCoreMarkets: [...CORE_MARKETS],
      fullMatchOver05Removed: true
    },
    picks,
    rejections: rejectionCounter(rejected),
    status: picks.length
      ? `${picks.length} Papa's Boss Pick${picks.length === 1 ? "" : "s"} passed every required gate.`
      : "NO BOSS PICK — no fixture passed the full OMNI gatekeeper."
  };
}

export async function getBossPicks(supabase, date) {
  const key = `${BOSS_ENGINE_VERSION}:${date}`;
  const cached = cache.get(key);

  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return { ...cached.value, cached: true };
  }

  if (cached?.pending) return cached.pending;

  const pending = buildBossPicks(supabase, date)
    .then((value) => {
      cache.set(key, { createdAt: Date.now(), value });
      return { ...value, cached: false };
    })
    .catch((error) => {
      cache.delete(key);
      throw error;
    });

  cache.set(key, { createdAt: Date.now(), pending });
  return pending;
}
