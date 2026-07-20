import { fetchFixturesByDate, fetchLeagueFixtures } from "../providers/apiFootball.js";
import { throwIfSupabaseError } from "./supabaseHelpers.js";

function uniqueBy(items, keyFn) {
  const map = new Map();
  for (const item of items) map.set(keyFn(item), item);
  return [...map.values()];
}

function normalizeProviderFixture(item) {
  const fixture = item?.fixture || {};
  const league = item?.league || {};
  const teams = item?.teams || {};
  const score = item?.score || {};
  const goals = item?.goals || {};
  const status = fixture.status?.short || "NS";
  const terminal = ["FT", "AET", "PEN"].includes(status);
  const providerHome = Number.isFinite(goals.home) ? Number(goals.home) : null;
  const providerAway = Number.isFinite(goals.away) ? Number(goals.away) : null;
  const fulltimeHome = terminal && Number.isFinite(score.fulltime?.home)
    ? Number(score.fulltime.home)
    : providerHome ?? (Number.isFinite(score.fulltime?.home) ? Number(score.fulltime.home) : null);
  const fulltimeAway = terminal && Number.isFinite(score.fulltime?.away)
    ? Number(score.fulltime.away)
    : providerAway ?? (Number.isFinite(score.fulltime?.away) ? Number(score.fulltime.away) : null);

  if (!fixture.id || !league.id || !teams.home?.id || !teams.away?.id) return null;

  return {
    providerFixtureId: Number(fixture.id),
    kickoff: fixture.date,
    status,
    venue: fixture.venue?.name || null,
    season: Number(league.season),
    league: {
      providerLeagueId: Number(league.id),
      name: league.name || "Unknown League",
      country: league.country || null,
      season: Number(league.season),
      logoUrl: league.logo || null
    },
    home: {
      providerTeamId: Number(teams.home.id),
      name: teams.home.name || "Home Team",
      logoUrl: teams.home.logo || null,
      country: league.country || null
    },
    away: {
      providerTeamId: Number(teams.away.id),
      name: teams.away.name || "Away Team",
      logoUrl: teams.away.logo || null,
      country: league.country || null
    },
    halftimeHome: Number.isFinite(score.halftime?.home) ? Number(score.halftime.home) : null,
    halftimeAway: Number.isFinite(score.halftime?.away) ? Number(score.halftime.away) : null,
    fulltimeHome,
    fulltimeAway
  };
}

async function upsertReferenceData(supabase, fixtures) {
  const leagueRows = uniqueBy(
    fixtures.map((f) => ({
      external_league_id: f.league.providerLeagueId,
      name: f.league.name,
      country: f.league.country,
      season: f.league.season,
      logo_url: f.league.logoUrl,
      updated_at: new Date().toISOString()
    })),
    (row) => `${row.external_league_id}:${row.season}`
  );

  const teamRows = uniqueBy(
    fixtures.flatMap((f) => [f.home, f.away]).map((team) => ({
      external_team_id: team.providerTeamId,
      name: team.name,
      country: team.country,
      logo_url: team.logoUrl,
      updated_at: new Date().toISOString()
    })),
    (row) => row.external_team_id
  );

  const { data: leagues, error: leagueError } = await supabase
    .from("leagues")
    .upsert(leagueRows, { onConflict: "external_league_id,season" })
    .select("id,external_league_id,season");
  throwIfSupabaseError(leagueError, "Unable to upsert leagues");

  const { data: teams, error: teamError } = await supabase
    .from("teams")
    .upsert(teamRows, { onConflict: "external_team_id" })
    .select("id,external_team_id");
  throwIfSupabaseError(teamError, "Unable to upsert teams");

  const leagueMap = new Map(
    (leagues || []).map((row) => [`${row.external_league_id}:${row.season}`, row.id])
  );
  const teamMap = new Map((teams || []).map((row) => [row.external_team_id, row.id]));

  return { leagueMap, teamMap };
}

export async function persistProviderFixtures(supabase, providerItems) {
  const fixtures = providerItems.map(normalizeProviderFixture).filter(Boolean);
  if (!fixtures.length) {
    return { imported: 0, leagues: [], seasons: [], providerFixtureIds: [] };
  }

  const { leagueMap, teamMap } = await upsertReferenceData(supabase, fixtures);
  const now = new Date().toISOString();

  const fixtureRows = fixtures.map((f) => ({
    external_fixture_id: f.providerFixtureId,
    league_id: leagueMap.get(`${f.league.providerLeagueId}:${f.league.season}`),
    season: f.season,
    fixture_date: f.kickoff,
    home_team_id: teamMap.get(f.home.providerTeamId),
    away_team_id: teamMap.get(f.away.providerTeamId),
    halftime_home: f.halftimeHome,
    halftime_away: f.halftimeAway,
    fulltime_home: f.fulltimeHome,
    fulltime_away: f.fulltimeAway,
    status: f.status,
    venue: f.venue,
    updated_at: now
  }));

  const invalid = fixtureRows.filter(
    (row) => !row.league_id || !row.home_team_id || !row.away_team_id
  );
  if (invalid.length) {
    throw new Error(`Unable to resolve internal IDs for ${invalid.length} fixture(s)`);
  }

  const { data, error } = await supabase
    .from("fixtures")
    .upsert(fixtureRows, { onConflict: "external_fixture_id" })
    .select("id,external_fixture_id,league_id,season,status,fixture_date");
  throwIfSupabaseError(error, "Unable to upsert fixtures");

  const leagueSeasons = uniqueBy(
    (data || []).map((row) => ({ leagueId: row.league_id, season: row.season })),
    (row) => `${row.leagueId}:${row.season}`
  );

  return {
    imported: data?.length || 0,
    leagueSeasons,
    providerFixtureIds: (data || []).map((row) => row.external_fixture_id),
    fixtures: data || []
  };
}

export async function syncDate(supabase, date) {
  const provider = await fetchFixturesByDate(date);
  const persisted = await persistProviderFixtures(supabase, provider.response);
  return { date, providerResults: provider.results, quota: provider.quota, ...persisted };
}

export async function syncLeagueHistory(supabase, input) {
  const provider = await fetchLeagueFixtures(input);
  const persisted = await persistProviderFixtures(supabase, provider.response);
  return {
    requestedLeagueId: Number(input.leagueId),
    season: Number(input.season),
    from: input.from,
    to: input.to,
    providerResults: provider.results,
    quota: provider.quota,
    ...persisted
  };
}
