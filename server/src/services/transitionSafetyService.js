import { fetchAllRows } from "./supabaseHelpers.js";
import { hydrateFixtureGoalEvents } from "./goalEventService.js";

const SAMPLE = 5;

function pct(hits, total) {
  return total ? Math.round((hits * 1000) / total) / 10 : null;
}

function missingEventTables(error) {
  const message = String(error?.message || error || "");
  return error?.code === "42P01" ||
    /fixture_goal_events|fixture_event_coverage|relation .* does not exist|schema cache/i.test(message);
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined))];
}

function recentVenueRows(rows, fixture, teamId, side) {
  const cutoff = new Date(fixture.fixture_date || fixture.kickoff || 0).getTime();
  return (rows || [])
    .filter((row) => {
      if (Number(row.league_id) !== Number(fixture.league_id)) return false;
      if (Number(row.season) !== Number(fixture.season)) return false;
      const time = new Date(row.fixture_date || 0).getTime();
      if (!Number.isFinite(time) || time >= cutoff) return false;
      return side === "home"
        ? Number(row.home_team_id) === Number(teamId)
        : Number(row.away_team_id) === Number(teamId);
    })
    .sort((left, right) => new Date(right.fixture_date) - new Date(left.fixture_date))
    .slice(0, SAMPLE);
}

function perspectiveScore(row, teamId) {
  const isHome = Number(row.home_team_id) === Number(teamId);
  const home = Number(row.fulltime_home);
  const away = Number(row.fulltime_away);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  return isHome ? { own: home, opp: away } : { own: away, opp: home };
}

function sortedEvents(events = []) {
  return [...events].sort((left, right) =>
    Number(left.minute || 0) - Number(right.minute || 0) ||
    Number(left.extra_minute || 0) - Number(right.extra_minute || 0) ||
    String(left.provider_event_key || "").localeCompare(String(right.provider_event_key || ""))
  );
}

function leadingAfter(event, row, teamId) {
  const isHome = Number(row.home_team_id) === Number(teamId);
  const own = Number(isHome ? event.home_score_after : event.away_score_after);
  const opp = Number(isHome ? event.away_score_after : event.home_score_after);
  return Number.isFinite(own) && Number.isFinite(opp) && own > opp;
}

function buildProfile(rows, teamId, eventMap, coverageMap) {
  let played = 0;
  let covered = 0;
  let scoredMatches = 0;
  let concededMatches = 0;
  let over15 = 0;
  let over25 = 0;
  let scoredFirst = 0;
  let concededFirst = 0;
  let scoreFirstWins = 0;
  let scoreFirstNonLosses = 0;
  let leadHeld = 0;
  let comebackWins = 0;
  let comebackNonLosses = 0;
  let stayDown = 0;

  for (const fixture of rows || []) {
    const score = perspectiveScore(fixture, teamId);
    if (!score) continue;
    played += 1;
    if (score.own > 0) scoredMatches += 1;
    if (score.opp > 0) concededMatches += 1;
    if (score.own + score.opp > 1.5) over15 += 1;
    if (score.own + score.opp > 2.5) over25 += 1;

    const coverage = coverageMap.get(Number(fixture.id));
    if (coverage?.status !== "COMPLETE") continue;
    covered += 1;

    const events = sortedEvents(eventMap.get(Number(fixture.id)) || []);
    if (!events.length) continue;
    const firstFor = Number(events[0].scoring_team_id) === Number(teamId);

    if (firstFor) {
      scoredFirst += 1;
      if (score.own > score.opp) scoreFirstWins += 1;
      if (score.own >= score.opp) scoreFirstNonLosses += 1;
      if (score.own > score.opp && events.every((event) => leadingAfter(event, fixture, teamId))) {
        leadHeld += 1;
      }
    } else {
      concededFirst += 1;
      if (score.own > score.opp) comebackWins += 1;
      if (score.own >= score.opp) comebackNonLosses += 1;
      if (score.own < score.opp) stayDown += 1;
    }
  }

  return {
    played,
    covered,
    ready: played >= SAMPLE && covered >= SAMPLE,
    scoredMatchRate: pct(scoredMatches, played),
    concededMatchRate: pct(concededMatches, played),
    over15Rate: pct(over15, played),
    over25Rate: pct(over25, played),
    scoredFirst,
    concededFirst,
    scoreFirstRate: pct(scoredFirst, played),
    concedeFirstRate: pct(concededFirst, played),
    scoreFirstWinRate: pct(scoreFirstWins, scoredFirst),
    scoreFirstNonLossRate: pct(scoreFirstNonLosses, scoredFirst),
    leadHoldRate: pct(leadHeld, scoredFirst),
    comebackWinRate: pct(comebackWins, concededFirst),
    comebackNonLossRate: pct(comebackNonLosses, concededFirst),
    stayDownRate: pct(stayDown, concededFirst)
  };
}

async function loadCoverageAndEvents(supabase, fixtureIds) {
  if (!fixtureIds.length) return { coverageMap: new Map(), eventMap: new Map() };
  const [coverageRows, eventRows] = await Promise.all([
    fetchAllRows(() =>
      supabase
        .from("fixture_event_coverage")
        .select("fixture_id,status,goals_expected,goals_recorded")
        .in("fixture_id", fixtureIds)
    ),
    fetchAllRows(() =>
      supabase
        .from("fixture_goal_events")
        .select("fixture_id,provider_event_key,scoring_team_id,minute,extra_minute,home_score_after,away_score_after")
        .in("fixture_id", fixtureIds)
    )
  ]);

  const coverageMap = new Map((coverageRows || []).map((row) => [Number(row.fixture_id), row]));
  const eventMap = new Map();
  for (const row of eventRows || []) {
    const key = Number(row.fixture_id);
    if (!eventMap.has(key)) eventMap.set(key, []);
    eventMap.get(key).push(row);
  }
  return { coverageMap, eventMap };
}

function emptyProfile() {
  return {
    played: 0,
    covered: 0,
    ready: false,
    scoredMatchRate: null,
    concededMatchRate: null,
    over15Rate: null,
    over25Rate: null,
    scoredFirst: 0,
    concededFirst: 0,
    scoreFirstRate: null,
    concedeFirstRate: null,
    scoreFirstWinRate: null,
    scoreFirstNonLossRate: null,
    leadHoldRate: null,
    comebackWinRate: null,
    comebackNonLossRate: null,
    stayDownRate: null
  };
}

export async function loadFixtureTransitionProfiles(supabase, fixtures = []) {
  const result = new Map();
  if (!fixtures.length) return result;

  const leagueIds = unique(fixtures.map((fixture) => fixture.league_id));
  const seasons = unique(fixtures.map((fixture) => fixture.season));
  if (!leagueIds.length || !seasons.length) return result;

  const history = await fetchAllRows(() =>
    supabase
      .from("fixtures")
      .select("id,external_fixture_id,league_id,season,fixture_date,home_team_id,away_team_id,fulltime_home,fulltime_away,status")
      .in("league_id", leagueIds)
      .in("season", seasons)
      .eq("status", "FT")
  );

  const samples = new Map();
  const needed = new Map();
  for (const fixture of fixtures) {
    const homeRows = recentVenueRows(history, fixture, fixture.home_team_id, "home");
    const awayRows = recentVenueRows(history, fixture, fixture.away_team_id, "away");
    samples.set(Number(fixture.id), { homeRows, awayRows });
    for (const row of [...homeRows, ...awayRows]) needed.set(Number(row.id), row);
  }

  const neededRows = [...needed.values()];
  try {
    // Reuse BetsPapa's validated provider hydration. It checks reconstructed
    // goal-event scores against the stored final score before marking coverage COMPLETE.
    if (neededRows.length) {
      await hydrateFixtureGoalEvents(supabase, neededRows, {
        limit: Math.min(80, neededRows.length)
      });
    }

    const { coverageMap, eventMap } = await loadCoverageAndEvents(
      supabase,
      neededRows.map((row) => Number(row.id))
    );

    for (const fixture of fixtures) {
      const sample = samples.get(Number(fixture.id)) || { homeRows: [], awayRows: [] };
      result.set(Number(fixture.id), {
        sampleBasis: "last-5-venue-split",
        home: buildProfile(sample.homeRows, fixture.home_team_id, eventMap, coverageMap),
        away: buildProfile(sample.awayRows, fixture.away_team_id, eventMap, coverageMap)
      });
    }
  } catch (error) {
    if (!missingEventTables(error)) throw error;
    for (const fixture of fixtures) {
      result.set(Number(fixture.id), {
        sampleBasis: "last-5-venue-split",
        unavailableReason: "fixture goal-event tables are unavailable",
        home: emptyProfile(),
        away: emptyProfile()
      });
    }
  }

  return result;
}
