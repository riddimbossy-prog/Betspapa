import { ENGINE_VERSION } from "../config.js";
import { dateRangeUtc } from "../utils/date.js";
import { fetchAllRows, throwIfSupabaseError } from "./supabaseHelpers.js";

export async function listPublicPredictions(supabase, date) {
  const { start, end } = dateRangeUtc(date);
  const fixtures = await fetchAllRows(() =>
    supabase
      .from("fixtures")
      .select("*")
      .gte("fixture_date", start)
      .lt("fixture_date", end)
      .order("fixture_date", { ascending: true })
  );
  if (!fixtures.length) return [];

  const fixtureIds = fixtures.map((fixture) => fixture.id);
  const { data: predictions, error } = await supabase
    .from("predictions")
    .select("*")
    .in("fixture_id", fixtureIds)
    .eq("engine_version", ENGINE_VERSION)
    .eq("published", true)
    .order("confidence", { ascending: false });
  throwIfSupabaseError(error, "Unable to load public predictions");

  const teamIds = [...new Set(fixtures.flatMap((f) => [f.home_team_id, f.away_team_id]))];
  const leagueIds = [...new Set(fixtures.map((f) => f.league_id))];
  const [{ data: teams, error: teamError }, { data: leagues, error: leagueError }] = await Promise.all([
    supabase.from("teams").select("id,name,logo_url").in("id", teamIds),
    supabase.from("leagues").select("id,name,country,logo_url,season").in("id", leagueIds)
  ]);
  throwIfSupabaseError(teamError, "Unable to load public teams");
  throwIfSupabaseError(leagueError, "Unable to load public leagues");

  const fixtureMap = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const teamMap = new Map((teams || []).map((team) => [team.id, team]));
  const leagueMap = new Map((leagues || []).map((league) => [league.id, league]));

  return (predictions || []).map((prediction) => {
    const fixture = fixtureMap.get(prediction.fixture_id);
    const league = leagueMap.get(fixture.league_id);
    const home = teamMap.get(fixture.home_team_id);
    const away = teamMap.get(fixture.away_team_id);
    return {
      id: prediction.id,
      fixtureId: fixture.external_fixture_id,
      kickoff: fixture.fixture_date,
      status: fixture.status,
      league,
      home,
      away,
      primary: {
        market: prediction.primary_market,
        selection: prediction.primary_selection,
        probability: prediction.probability,
        confidence: prediction.confidence,
        tier: prediction.confidence_tier
      },
      strongestTransition: {
        code: prediction.strongest_transition,
        probability: prediction.transition_probability
      },
      goalScores: {
        ggYes: prediction.gg_score,
        over15: prediction.over_15_score,
        over25: prediction.over_25_score,
        under35: prediction.under_35_score,
        homeGoalSupport: prediction.home_goal_support,
        awayGoalSupport: prediction.away_goal_support
      },
      transitionMatrix: prediction.transition_matrix,
      reasons: prediction.reasons,
      warnings: prediction.warnings,
      engine: prediction.market_scores
    };
  });
}

export async function listFixtures(supabase, date) {
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
