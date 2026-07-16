import { Router } from "express";
import { getSupabaseAdmin } from "../supabase.js";
import { requireAdmin } from "../middleware/adminAuth.js";
import { fetchProviderStatus } from "../providers/apiFootball.js";
import { assertIsoDate, assertReasonableRange, todayUtc } from "../utils/date.js";
import { HttpError } from "../utils/errors.js";
import { gradePredictionsForDate } from "../services/gradingService.js";
import { generatePredictionsForDate } from "../services/predictionService.js";
import { rebuildProfiles } from "../services/profileService.js";
import { syncDate, syncLeagueHistory } from "../services/syncService.js";
import {
  hydrateProfilesForFixtures,
  planHydrationForFixtures
} from "../services/historyHydrationService.js";
import { fetchAllRows } from "../services/supabaseHelpers.js";

export const adminRouter = Router();
adminRouter.use(requireAdmin);

function positiveInt(value, field) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new HttpError(400, `${field} must be a positive integer`);
  }
  return parsed;
}


async function loadHydrationContext(supabase, date) {
  const { dateRangeUtc } = await import("../utils/date.js");
  const { start, end } = dateRangeUtc(date);

  const fixtures = await fetchAllRows(() =>
    supabase
      .from("fixtures")
      .select("*")
      .gte("fixture_date", start)
      .lt("fixture_date", end)
      .order("fixture_date", { ascending: true })
  );

  const teamIds = [...new Set(
    fixtures.flatMap((fixture) => [
      fixture.home_team_id,
      fixture.away_team_id
    ])
  )];

  if (!teamIds.length) {
    return {
      fixtures,
      teams: new Map(),
      teamIds: []
    };
  }

  const { data: teamRows, error } = await supabase
    .from("teams")
    .select("id,external_team_id,name,country,logo_url")
    .in("id", teamIds);

  if (error) throw error;

  return {
    fixtures,
    teams: new Map((teamRows || []).map((team) => [team.id, team])),
    teamIds
  };
}

adminRouter.get("/provider-status", async (_req, res, next) => {
  try {
    const status = await fetchProviderStatus();
    res.json(status);
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/sync-date", async (req, res, next) => {
  try {
    const date = assertIsoDate(req.body?.date || todayUtc());
    const result = await syncDate(getSupabaseAdmin(), date);
    res.json({ status: "ok", action: "sync-date", result });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/sync-history", async (req, res, next) => {
  try {
    const leagueId = positiveInt(req.body?.leagueId, "leagueId");
    const season = positiveInt(req.body?.season, "season");
    const from = assertIsoDate(req.body?.from, "from");
    const to = assertIsoDate(req.body?.to, "to");
    assertReasonableRange(from, to);
    const supabase = getSupabaseAdmin();
    const synced = await syncLeagueHistory(supabase, { leagueId, season, from, to });

    let rebuilt = null;
    if (req.body?.rebuild !== false) {
      const internal = synced.leagueSeasons.find((item) => Number(item.season) === season);
      if (internal) rebuilt = await rebuildProfiles(supabase, internal.leagueId, season);
    }

    res.json({ status: "ok", action: "sync-history", synced, rebuilt });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/rebuild-profiles", async (req, res, next) => {
  try {
    const leagueId = positiveInt(req.body?.leagueId, "leagueId");
    const season = positiveInt(req.body?.season, "season");
    const result = await rebuildProfiles(getSupabaseAdmin(), leagueId, season);
    res.json({ status: "ok", action: "rebuild-profiles", result });
  } catch (error) {
    next(error);
  }
});


adminRouter.get("/hydration-plan", async (req, res, next) => {
  try {
    const date = assertIsoDate(req.query?.date || todayUtc());
    const force = String(req.query?.force || "").toLowerCase() === "true";
    const supabase = getSupabaseAdmin();
    const context = await loadHydrationContext(supabase, date);
    const result = await planHydrationForFixtures(
      supabase,
      context.fixtures,
      context.teams,
      { force }
    );

    res.json({
      status: "ok",
      action: "hydration-plan",
      date,
      fixtures: context.fixtures.length,
      result
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/hydrate-team", async (req, res, next) => {
  try {
    const date = assertIsoDate(req.body?.date || todayUtc());
    const teamId = positiveInt(req.body?.teamId, "teamId");
    const supabase = getSupabaseAdmin();
    const context = await loadHydrationContext(supabase, date);

    if (!context.teamIds.includes(teamId)) {
      throw new HttpError(
        404,
        `Team ${teamId} is not part of the fixtures for ${date}`
      );
    }

    const result = await hydrateProfilesForFixtures(
      supabase,
      context.fixtures,
      context.teams,
      {
        force: Boolean(req.body?.force),
        targetTeamIds: [teamId]
      }
    );

    res.json({
      status: "ok",
      action: "hydrate-team",
      date,
      teamId,
      result
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/hydrate-date", async (req, res, next) => {
  try {
    const date = assertIsoDate(req.body?.date || todayUtc());
    const supabase = getSupabaseAdmin();
    const context = await loadHydrationContext(supabase, date);
    const result = await hydrateProfilesForFixtures(
      supabase,
      context.fixtures,
      context.teams,
      { force: Boolean(req.body?.force) }
    );

    res.json({ status: "ok", action: "hydrate-date", date, result });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/generate-predictions", async (req, res, next) => {
  try {
    const date = assertIsoDate(req.body?.date || todayUtc());
    const result = await generatePredictionsForDate(getSupabaseAdmin(), date);
    res.json({ status: "ok", action: "generate-predictions", result });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/grade-results", async (req, res, next) => {
  try {
    const date = assertIsoDate(req.body?.date || todayUtc());
    const result = await gradePredictionsForDate(getSupabaseAdmin(), date);
    res.json({ status: "ok", action: "grade-results", result });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/bootstrap-league", async (req, res, next) => {
  try {
    const providerLeagueId = positiveInt(req.body?.leagueId, "leagueId");
    const season = positiveInt(req.body?.season, "season");
    const from = assertIsoDate(req.body?.from, "from");
    const to = assertIsoDate(req.body?.to, "to");
    const predictionDate = assertIsoDate(req.body?.predictionDate || todayUtc(), "predictionDate");
    assertReasonableRange(from, to);

    const supabase = getSupabaseAdmin();
    const history = await syncLeagueHistory(supabase, {
      leagueId: providerLeagueId,
      season,
      from,
      to
    });
    const internal = history.leagueSeasons.find((item) => Number(item.season) === season);
    if (!internal) throw new HttpError(422, "No league/season rows were imported from API-Football");
    const profiles = await rebuildProfiles(supabase, internal.leagueId, season);
    const upcoming = await syncDate(supabase, predictionDate);
    const predictions = await generatePredictionsForDate(supabase, predictionDate);

    res.json({
      status: "ok",
      action: "bootstrap-league",
      history,
      profiles,
      upcoming,
      predictions
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/run-daily", async (req, res, next) => {
  try {
    const date = assertIsoDate(req.body?.date || todayUtc());
    const supabase = getSupabaseAdmin();
    const synced = await syncDate(supabase, date);
    const rebuilt = [];

    for (const item of synced.leagueSeasons) {
      rebuilt.push(await rebuildProfiles(supabase, item.leagueId, item.season));
    }

    const graded = await gradePredictionsForDate(supabase, date);
    const predictions = await generatePredictionsForDate(supabase, date);

    res.json({ status: "ok", action: "run-daily", date, synced, rebuilt, graded, predictions });
  } catch (error) {
    next(error);
  }
});
