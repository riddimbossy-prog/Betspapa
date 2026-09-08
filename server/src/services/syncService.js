import { fetchFixturesByDate, fetchLeagueFixtures } from "../providers/apiFootball.js";
import {
  loadSportyBetEvents,
  nameSimilarity,
  normalizeTeamName,
  sportyBetProviderFixtures
} from "../providers/sportyBet.js";
import { resolveProviderCompetitionTypes } from "./competitionMetadataService.js";
import { fetchAllRows, throwIfSupabaseError } from "./supabaseHelpers.js";

function uniqueBy(items, keyFn) {
  const map = new Map();
  for (const item of items) map.set(keyFn(item), item);
  return [...map.values()];
}

function normalizedCountry(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function selectNameMatch(rows, name, country = null) {
  const target = normalizeTeamName(name);
  if (!target) return null;
  const countryKey = normalizedCountry(country);
  const candidates = (rows || []).filter((row) => Number.isFinite(Number(row.external_team_id)));
  const exact = candidates.filter((row) => normalizeTeamName(row.name) === target);
  if (exact.length) {
    return exact.find((row) => countryKey && normalizedCountry(row.country) === countryKey) || exact[0];
  }

  const ranked = candidates
    .map((row) => ({
      row,
      similarity: nameSimilarity(name, row.name),
      sameCountry: Boolean(countryKey && normalizedCountry(row.country) === countryKey)
    }))
    .filter((entry) => entry.similarity >= 0.92)
    .sort((left, right) =>
      Number(right.sameCountry) - Number(left.sameCountry) || right.similarity - left.similarity
    );
  if (!ranked.length) return null;
  if (ranked[1] && ranked[0].similarity === ranked[1].similarity && ranked[0].sameCountry === ranked[1].sameCountry) {
    return null;
  }
  return ranked[0].row;
}

function selectLeagueMatch(rows, league) {
  const target = normalizeTeamName(league?.name);
  const countryKey = normalizedCountry(league?.country);
  const season = Number(league?.season);
  const matches = (rows || [])
    .filter((row) =>
      Number(row.season) <= season &&
      normalizeTeamName(row.name) === target
    )
    .sort((left, right) => {
      const leftCountry = Boolean(countryKey && normalizedCountry(left.country) === countryKey);
      const rightCountry = Boolean(countryKey && normalizedCountry(right.country) === countryKey);
      return Number(rightCountry) - Number(leftCountry) ||
        Number(Number(right.season) === season) - Number(Number(left.season) === season) ||
        Number(right.season) - Number(left.season);
    });
  return matches[0] || null;
}

function storedProviderType(value) {
  if (value === "LEAGUE") return "League";
  if (value === "CUP") return "Cup";
  if (value === "FRIENDLY") return "Friendly";
  return null;
}

/** Reuse API-Football identities already in Supabase so SportyBet fixtures retain historical profiles. */
export function alignSportyBetReferences(providerItems, { teams = [], leagues = [] } = {}) {
  let matchedTeams = 0;
  let matchedLeagues = 0;
  const response = (providerItems || []).map((item) => {
    const home = selectNameMatch(teams, item?.teams?.home?.name, item?.league?.country);
    const away = selectNameMatch(teams, item?.teams?.away?.name, item?.league?.country);
    const league = selectLeagueMatch(leagues, item?.league);
    if (home) matchedTeams += 1;
    if (away) matchedTeams += 1;
    if (league) matchedLeagues += 1;
    return {
      ...item,
      league: league
        ? {
            ...item.league,
            id: Number(league.external_league_id),
            name: league.name || item.league.name,
            country: league.country || item.league.country,
            logo: league.logo_url || item.league.logo,
            type: storedProviderType(league.competition_type) || item.league.type
          }
        : item.league,
      teams: {
        home: home
          ? {
              ...item.teams.home,
              id: Number(home.external_team_id),
              name: home.name || item.teams.home.name,
              logo: home.logo_url || item.teams.home.logo
            }
          : item.teams.home,
        away: away
          ? {
              ...item.teams.away,
              id: Number(away.external_team_id),
              name: away.name || item.teams.away.name,
              logo: away.logo_url || item.teams.away.logo
            }
          : item.teams.away
      }
    };
  });
  return { response, matchedTeams, matchedLeagues };
}

async function loadStoredReferences(supabase, providerItems) {
  const seasons = [...new Set(providerItems.map((item) => Number(item?.league?.season)).filter(Number.isFinite))];
  const latestSeason = seasons.length ? Math.max(...seasons) : null;
  const [teams, leagues] = await Promise.all([
    fetchAllRows(() =>
      supabase
        .from("teams")
        .select("id,external_team_id,name,country,logo_url")
        .order("id", { ascending: true })
    ),
    latestSeason != null
      ? fetchAllRows(() =>
          supabase
            .from("leagues")
            .select("id,external_league_id,season,name,country,logo_url,competition_type")
            .lte("season", latestSeason)
            .order("id", { ascending: true })
        )
      : []
  ]);
  return { teams, leagues };
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
      logoUrl: league.logo || null,
      providerType: league.type || null
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

async function upsertReferenceData(supabase, fixtures, competitionMetadata = new Map()) {
  const leagueRows = uniqueBy(
    fixtures.map((f) => {
      const competition = competitionMetadata.get(`${f.league.providerLeagueId}:${f.league.season}`) || {
        competition_type: "UNKNOWN",
        prediction_enabled: false,
        prediction_exclusion_reason: "Competition type awaiting verification"
      };
      return {
        external_league_id: f.league.providerLeagueId,
        name: f.league.name,
        country: f.league.country,
        season: f.league.season,
        logo_url: f.league.logoUrl,
        ...competition,
        updated_at: new Date().toISOString()
      };
    }),
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

  const competitionMetadata = await resolveProviderCompetitionTypes(supabase, providerItems);
  const { leagueMap, teamMap } = await upsertReferenceData(supabase, fixtures, competitionMetadata);
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
    .select("id,external_fixture_id,league_id,season,status,fixture_date,home_team_id,away_team_id,halftime_home,halftime_away,fulltime_home,fulltime_away");
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
  let sportyWarning = null;
  try {
    const events = await loadSportyBetEvents({ force: true });
    const catalogue = sportyBetProviderFixtures(events, date);
    if (catalogue.length) {
      const references = await loadStoredReferences(supabase, catalogue);
      const aligned = alignSportyBetReferences(catalogue, references);
      const persisted = await persistProviderFixtures(supabase, aligned.response);
      return {
        date,
        source: "sportybet",
        providerResults: catalogue.length,
        quota: null,
        referenceMatches: {
          teams: aligned.matchedTeams,
          leagues: aligned.matchedLeagues
        },
        ...persisted
      };
    }
    sportyWarning = `SportyBet returned no fixtures for ${date}`;
  } catch (error) {
    sportyWarning = error?.message || String(error);
  }

  try {
    const provider = await fetchFixturesByDate(date);
    const persisted = await persistProviderFixtures(supabase, provider.response);
    return {
      date,
      source: "api-football",
      fallbackReason: sportyWarning,
      providerResults: provider.results,
      quota: provider.quota,
      ...persisted
    };
  } catch (error) {
    throw new Error(
      `SportyBet catalogue failed (${sportyWarning}); API-Football fallback failed (${error?.message || String(error)})`
    );
  }
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
