import { fetchAllRows } from "./supabaseHelpers.js";
import { resolveLeagueScoringTrend } from "../engine/leagueScoringPolicy.js";

function addRow(totals, row) {
  const key = `${row.league_id}:${row.season}`;
  if (!totals.has(key)) {
    totals.set(key, { matches: 0, over15: 0, over25: 0, under35: 0 });
  }
  const sample = Number(row.matches_played || 0);
  if (!sample) return;
  const bucket = totals.get(key);
  bucket.matches += sample;
  bucket.over15 += Number(row.over_15_rate || 0) * sample;
  bucket.over25 += Number(row.over_25_rate || 0) * sample;
  bucket.under35 += Number(row.under_35_rate || 0) * sample;
}

function ratesFromBucket(bucket) {
  if (!bucket?.matches) return null;
  return {
    over15Rate: bucket.over15 / bucket.matches,
    over25Rate: bucket.over25 / bucket.matches,
    under35Rate: bucket.under35 / bucket.matches,
    matches: bucket.matches
  };
}

export async function loadLeagueScoringByFixture(supabase, fixtures = []) {
  const climates = new Map();
  if (!fixtures.length) return climates;

  const leagueIds = [...new Set(fixtures.map((fixture) => fixture.league_id).filter(Boolean))];
  const seasons = [...new Set(fixtures.map((fixture) => Number(fixture.season)).filter(Number.isFinite))];
  if (!leagueIds.length || !seasons.length) return climates;

  const querySeasons = [...new Set(seasons.flatMap((season) => [season, season - 1]))];

  let rows = [];
  try {
    rows = await fetchAllRows(() =>
      supabase
        .from("team_goal_profiles")
        .select("league_id,season,scope,matches_played,over_15_rate,over_25_rate,under_35_rate")
        .in("league_id", leagueIds)
        .in("season", querySeasons)
        .eq("scope", "overall")
    );
  } catch {
    return climates;
  }

  const totals = new Map();
  for (const row of rows || []) addRow(totals, row);

  for (const fixture of fixtures) {
    const season = Number(fixture.season);
    const current = ratesFromBucket(totals.get(`${fixture.league_id}:${season}`));
    const previous = Number.isFinite(season)
      ? ratesFromBucket(totals.get(`${fixture.league_id}:${season - 1}`))
      : null;
    const climate = resolveLeagueScoringTrend(current, previous);
    if (climate.source === "unknown") continue;
    climates.set(Number(fixture.id), climate);
  }
  return climates;
}
