import { ENGINE_VERSION } from "../config.js";
import { dateRangeUtc } from "../utils/date.js";
import { fetchAllRows, throwIfSupabaseError } from "./supabaseHelpers.js";

function resultLetter(teamGoals, opponentGoals) {
  if (teamGoals > opponentGoals) return "W";
  if (teamGoals < opponentGoals) return "L";
  return "D";
}

function confirmedHtft(fixture) {
  const ht = resultLetter(fixture.halftime_home, fixture.halftime_away);
  const ft = resultLetter(fixture.fulltime_home, fixture.fulltime_away);
  const code = {
    WW: "1/1",
    WD: "1/X",
    WL: "1/2",
    DW: "X/1",
    DD: "X/X",
    DL: "X/2",
    LW: "2/1",
    LD: "2/X",
    LL: "2/2"
  };
  return code[`${ht}${ft}`];
}

function teamNameStarts(selection, name) {
  return String(selection || "").toLowerCase().startsWith(String(name || "").toLowerCase());
}

export function gradeMarket(key, prediction, fixture, homeName, awayName) {
  const h = Number(fixture.fulltime_home);
  const a = Number(fixture.fulltime_away);
  const hh = Number(fixture.halftime_home);
  const ha = Number(fixture.halftime_away);
  const total = h + a;
  const selection = prediction.primary_selection;

  switch (key) {
    case "home-1x": return h >= a ? "WIN" : "LOSS";
    case "away-x2": return a >= h ? "WIN" : "LOSS";
    case "no-draw": return h !== a ? "WIN" : "LOSS";
    case "home-dnb": return h === a ? "VOID" : h > a ? "WIN" : "LOSS";
    case "away-dnb": return h === a ? "VOID" : a > h ? "WIN" : "LOSS";
    case "home-win": return h > a ? "WIN" : "LOSS";
    case "away-win": return a > h ? "WIN" : "LOSS";
    case "ft-draw": return h === a ? "WIN" : "LOSS";
    case "home-win-either-half": {
      const secondHalfHome = h - hh;
      const secondHalfAway = a - ha;
      return hh > ha || secondHalfHome > secondHalfAway ? "WIN" : "LOSS";
    }
    case "away-win-either-half": {
      const secondHalfHome = h - hh;
      const secondHalfAway = a - ha;
      return ha > hh || secondHalfAway > secondHalfHome ? "WIN" : "LOSS";
    }
    case "ht-home-or-draw": return hh >= ha ? "WIN" : "LOSS";
    case "ht-away-or-draw": return ha >= hh ? "WIN" : "LOSS";
    case "ht-home": return hh > ha ? "WIN" : "LOSS";
    case "ht-draw": return hh === ha ? "WIN" : "LOSS";
    case "ht-away": return ha > hh ? "WIN" : "LOSS";
    case "exact-htft": return selection === confirmedHtft(fixture) ? "WIN" : "LOSS";
    case "gg-yes": return h > 0 && a > 0 ? "WIN" : "LOSS";
    case "gg-no": return h === 0 || a === 0 ? "WIN" : "LOSS";
    case "over-15": return total >= 2 ? "WIN" : "LOSS";
    case "under-15": return total <= 1 ? "WIN" : "LOSS";
    case "over-25": return total >= 3 ? "WIN" : "LOSS";
    case "under-25": return total <= 2 ? "WIN" : "LOSS";
    case "over-35": return total >= 4 ? "WIN" : "LOSS";
    case "under-35": return total <= 3 ? "WIN" : "LOSS";
    case "total-2-3": return total >= 2 && total <= 3 ? "WIN" : "LOSS";
    case "home-over-05": return h >= 1 ? "WIN" : "LOSS";
    case "away-over-05": return a >= 1 ? "WIN" : "LOSS";
    case "home-over-15": return h >= 2 ? "WIN" : "LOSS";
    case "away-over-15": return a >= 2 ? "WIN" : "LOSS";
    case "home-under-15": return h <= 1 ? "WIN" : "LOSS";
    case "away-under-15": return a <= 1 ? "WIN" : "LOSS";
    case "home-clean-sheet": return a === 0 ? "WIN" : "LOSS";
    case "away-clean-sheet": return h === 0 ? "WIN" : "LOSS";
    case "first-half-over-05": return hh + ha >= 1 ? "WIN" : "LOSS";
    case "second-half-over-05": return total - hh - ha >= 1 ? "WIN" : "LOSS";
    case "favourite-over-15": {
      const goals = teamNameStarts(selection, homeName)
        ? h
        : teamNameStarts(selection, awayName)
          ? a
          : null;
      return goals === null ? "UNABLE_TO_GRADE" : goals >= 2 ? "WIN" : "LOSS";
    }
    default:
      return "UNABLE_TO_GRADE";
  }
}

export async function gradePredictionsForDate(supabase, date) {
  const { start, end } = dateRangeUtc(date);
  const fixtures = await fetchAllRows(() =>
    supabase
      .from("fixtures")
      .select("*")
      .gte("fixture_date", start)
      .lt("fixture_date", end)
      .eq("status", "FT")
  );

  if (!fixtures.length) return { date, finishedFixtures: 0, graded: 0, results: [] };

  const fixtureIds = fixtures.map((fixture) => fixture.id);
  const { data: predictions, error: predictionError } = await supabase
    .from("predictions")
    .select("*")
    .in("fixture_id", fixtureIds)
    .eq("engine_version", ENGINE_VERSION);
  throwIfSupabaseError(predictionError, "Unable to load predictions for grading");

  const teamIds = [...new Set(fixtures.flatMap((f) => [f.home_team_id, f.away_team_id]))];
  const { data: teams, error: teamError } = await supabase
    .from("teams")
    .select("id,name")
    .in("id", teamIds);
  throwIfSupabaseError(teamError, "Unable to load teams for grading");
  const teamMap = new Map((teams || []).map((team) => [team.id, team.name]));
  const fixtureMap = new Map(fixtures.map((fixture) => [fixture.id, fixture]));

  const rows = [];
  for (const prediction of predictions || []) {
    const fixture = fixtureMap.get(prediction.fixture_id);
    if (!fixture) continue;
    const key = prediction.market_scores?.primaryKey;
    const outcome = gradeMarket(
      key,
      prediction,
      fixture,
      teamMap.get(fixture.home_team_id),
      teamMap.get(fixture.away_team_id)
    );
    rows.push({
      prediction_id: prediction.id,
      fixture_id: fixture.id,
      halftime_score: `${fixture.halftime_home}-${fixture.halftime_away}`,
      fulltime_score: `${fixture.fulltime_home}-${fixture.fulltime_away}`,
      confirmed_htft: confirmedHtft(fixture),
      outcome,
      profit_loss: 0,
      graded_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  if (rows.length) {
    const { error } = await supabase
      .from("prediction_results")
      .upsert(rows, { onConflict: "prediction_id" });
    throwIfSupabaseError(error, "Unable to save prediction results");
  }

  return {
    date,
    finishedFixtures: fixtures.length,
    graded: rows.length,
    wins: rows.filter((row) => row.outcome === "WIN").length,
    losses: rows.filter((row) => row.outcome === "LOSS").length,
    voids: rows.filter((row) => row.outcome === "VOID").length,
    results: rows
  };
}
