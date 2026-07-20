import { fetchTeamRecentFixtures } from "../providers/apiFootball.js";
import { rebuildProfiles } from "./profileService.js";
import { persistProviderFixtures } from "./syncService.js";
import { fetchAllRows } from "./supabaseHelpers.js";

const MIN_OVERALL_MATCHES = 6;
const MIN_VENUE_MATCHES = 3;
const TEAM_HISTORY_LAST = 24;
const HYDRATION_CONCURRENCY = 4;

function sideScopes(sideSet) {
  const scopes = [];
  if (sideSet.has("home")) scopes.push("home");
  if (sideSet.has("away")) scopes.push("away");
  return scopes;
}

function summarizeCoverage(rows, sideSet) {
  const overall = rows
    .filter((row) => row.scope === "overall")
    .reduce((sum, row) => sum + Number(row.matches_played || 0), 0);

  const recent = rows
    .filter((row) => row.scope === "recent6")
    .reduce((max, row) => Math.max(max, Number(row.matches_played || 0)), 0);

  const venue = Object.fromEntries(
    sideScopes(sideSet).map((scope) => [
      scope,
      rows
        .filter((row) => row.scope === scope)
        .reduce((sum, row) => sum + Number(row.matches_played || 0), 0)
    ])
  );

  const venueReady = Object.values(venue).every(
    (matches) => matches >= MIN_VENUE_MATCHES
  );

  return {
    overall,
    recent,
    venue,
    ready: overall >= MIN_OVERALL_MATCHES && venueReady
  };
}

export async function loadTeamCoverage(supabase, teamId, sideSet) {
  const rows = await fetchAllRows(() =>
    supabase
      .from("team_htft_profiles")
      .select("team_id,league_id,season,scope,matches_played,updated_at")
      .eq("team_id", teamId)
  );

  return {
    rows,
    coverage: summarizeCoverage(rows, sideSet)
  };
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function run() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => run())
  );
  return results;
}

function uniqueLeagueSeasons(items) {
  const map = new Map();
  for (const item of items || []) {
    map.set(`${item.leagueId}:${item.season}`, item);
  }
  return [...map.values()];
}


export async function planHydrationForFixtures(
  supabase,
  fixtures,
  teams,
  { force = false } = {}
) {
  const requirements = new Map();

  for (const fixture of fixtures) {
    if (!requirements.has(fixture.home_team_id)) {
      requirements.set(fixture.home_team_id, new Set());
    }
    if (!requirements.has(fixture.away_team_id)) {
      requirements.set(fixture.away_team_id, new Set());
    }
    requirements.get(fixture.home_team_id).add("home");
    requirements.get(fixture.away_team_id).add("away");
  }

  const teamIds = [...requirements.keys()].map(Number);
  const profileRows = teamIds.length
    ? await fetchAllRows(() =>
        supabase
          .from("team_htft_profiles")
          .select("team_id,league_id,season,scope,matches_played,updated_at")
          .in("team_id", teamIds)
      )
    : [];

  const rowsByTeam = new Map();
  for (const row of profileRows) {
    const teamId = Number(row.team_id);
    if (!rowsByTeam.has(teamId)) rowsByTeam.set(teamId, []);
    rowsByTeam.get(teamId).push(row);
  }

  const teamsPlan = [...requirements.entries()]
    .map(([teamId, sides]) => {
      const numericTeamId = Number(teamId);
      const team = teams.get(numericTeamId);
      const coverage = summarizeCoverage(
        rowsByTeam.get(numericTeamId) || [],
        sides
      );

      return {
        teamId: numericTeamId,
        externalTeamId: team?.external_team_id || null,
        teamName: team?.name || `Team ${numericTeamId}`,
        sides: [...sides],
        coverage,
        ready: coverage.ready,
        needsHydration: force || !coverage.ready,
        issue: team?.external_team_id
          ? null
          : "External API-Football team ID is missing."
      };
    })
    .sort((a, b) => a.teamName.localeCompare(b.teamName));

  return {
    teamsChecked: teamsPlan.length,
    readyTeams: teamsPlan.filter((team) => team.ready).length,
    teamsNeedingHydration: teamsPlan.filter((team) => team.needsHydration).length,
    teams: teamsPlan
  };
}

export async function hydrateProfilesForFixtures(
  supabase,
  fixtures,
  teams,
  {
    force = false,
    targetTeamIds = null
  } = {}
) {
  const requirements = new Map();

  for (const fixture of fixtures) {
    if (!requirements.has(fixture.home_team_id)) {
      requirements.set(fixture.home_team_id, new Set());
    }
    if (!requirements.has(fixture.away_team_id)) {
      requirements.set(fixture.away_team_id, new Set());
    }
    requirements.get(fixture.home_team_id).add("home");
    requirements.get(fixture.away_team_id).add("away");
  }

  const targetSet = Array.isArray(targetTeamIds) && targetTeamIds.length
    ? new Set(targetTeamIds.map(Number))
    : null;

  const jobs = [...requirements.entries()]
    .filter(([teamId]) => !targetSet || targetSet.has(Number(teamId)))
    .map(([teamId, sides]) => ({
      teamId: Number(teamId),
      sides,
      team: teams.get(Number(teamId))
    }));

  const rebuildCache = new Set();
  let providerCalls = 0;
  let importedFixtures = 0;
  let lastQuota = null;

  const audits = await mapLimit(jobs, HYDRATION_CONCURRENCY, async (job) => {
    const before = await loadTeamCoverage(supabase, job.teamId, job.sides);

    if (before.coverage.ready && !force) {
      return {
        teamId: job.teamId,
        externalTeamId: job.team?.external_team_id || null,
        teamName: job.team?.name || `Team ${job.teamId}`,
        sides: [...job.sides],
        source: "supabase-profile-cache",
        hydrated: false,
        before: before.coverage,
        after: before.coverage,
        ready: true,
        providerResults: 0,
        error: null
      };
    }

    if (!job.team?.external_team_id) {
      return {
        teamId: job.teamId,
        externalTeamId: null,
        teamName: job.team?.name || `Team ${job.teamId}`,
        sides: [...job.sides],
        source: "missing-provider-team-id",
        hydrated: false,
        before: before.coverage,
        after: before.coverage,
        ready: false,
        providerResults: 0,
        error: "External API-Football team ID is missing."
      };
    }

    try {
      providerCalls += 1;
      const provider = await fetchTeamRecentFixtures({
        teamId: job.team.external_team_id,
        last: TEAM_HISTORY_LAST
      });
      lastQuota = provider.quota || lastQuota;

      const persisted = await persistProviderFixtures(
        supabase,
        provider.response || []
      );
      importedFixtures += Number(persisted.imported || 0);

      for (const item of uniqueLeagueSeasons(persisted.leagueSeasons)) {
        const key = `${item.leagueId}:${item.season}`;
        if (rebuildCache.has(key)) continue;
        rebuildCache.add(key);
        await rebuildProfiles(supabase, item.leagueId, item.season);
      }

      const after = await loadTeamCoverage(supabase, job.teamId, job.sides);
      return {
        teamId: job.teamId,
        externalTeamId: job.team.external_team_id,
        teamName: job.team.name,
        sides: [...job.sides],
        source: "api-football-team-history",
        hydrated: true,
        before: before.coverage,
        after: after.coverage,
        ready: after.coverage.ready,
        providerResults: Number(provider.results || 0),
        error: after.coverage.ready
          ? null
          : "Provider history was imported, but the minimum individual sample was not reached."
      };
    } catch (error) {
      return {
        teamId: job.teamId,
        externalTeamId: job.team.external_team_id,
        teamName: job.team.name,
        sides: [...job.sides],
        source: "api-football-team-history",
        hydrated: false,
        before: before.coverage,
        after: before.coverage,
        ready: before.coverage.ready,
        providerResults: 0,
        error: error.message || String(error)
      };
    }
  });

  const byTeamId = Object.fromEntries(
    audits.map((audit) => [String(audit.teamId), audit])
  );

  return {
    attempted: audits.some((audit) => audit.hydrated || audit.error),
    teamsChecked: audits.length,
    readyTeams: audits.filter((audit) => audit.ready).length,
    hydratedTeams: audits.filter((audit) => audit.hydrated).length,
    providerCalls,
    importedFixtures,
    rebuiltLeagueSeasons: rebuildCache.size,
    lastQuota,
    audits,
    byTeamId
  };
}
