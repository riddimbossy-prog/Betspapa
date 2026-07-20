import { Router } from "express";
import { demoFixtures } from "../data/demoFixtures.js";
import { predictMatch } from "../engine/transitionEngine.js";
import { getSupabaseAdmin } from "../supabase.js";
import { getBossPicks, invalidateBossPickCache } from "../services/bossPickService.js";
import { assertIsoDate, todayUtc } from "../utils/date.js";
import {
  ENGINE_KEYS,
  getResultsIntelligence,
  selectBankerSlate
} from "../services/intelligenceService.js";
import {
  getBackgroundProcessingStatus,
  getDashboardData,
  getDashboardStats,
  listFixtures,
  listPublicPredictions,
  listRecentResults
} from "../services/publicService.js";
import {
  refreshCurrentMatchData,
  summarizeMatchStates
} from "../services/matchStateService.js";

export const publicRouter = Router();

async function maybeRefreshMatches(req, date) {
  if (String(req.query?.refresh || "1") === "0") {
    return { refreshed: false, skipped: true, reason: "Refresh disabled" };
  }
  try {
    return await refreshCurrentMatchData(getSupabaseAdmin(), date);
  } catch (error) {
    return {
      refreshed: false,
      warning: error.message || String(error)
    };
  }
}


publicRouter.get("/demo", (_req, res, next) => {
  try {
    const predictions = demoFixtures.map((fixture) => predictMatch(fixture));
    res.json({ fixtures: demoFixtures, predictions });
  } catch (error) {
    next(error);
  }
});

publicRouter.get("/demo/:fixtureId", (req, res, next) => {
  try {
    const fixture = demoFixtures.find((item) => item.fixtureId === req.params.fixtureId);
    if (!fixture) return res.status(404).json({ error: "Fixture not found" });
    return res.json({ fixture, prediction: predictMatch(fixture) });
  } catch (error) {
    next(error);
  }
});

publicRouter.post("/predict", (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "A JSON fixture object is required" });
    }
    return res.json(predictMatch(req.body));
  } catch (error) {
    next(error);
  }
});

publicRouter.get("/dashboard/today", async (req, res, next) => {
  try {
    const date = assertIsoDate(req.query.date || todayUtc());
    const refresh = await maybeRefreshMatches(req, date);
    const dashboard = await getDashboardData(getSupabaseAdmin(), date);
    res.json({ ...dashboard, liveRefresh: refresh });
  } catch (error) {
    next(error);
  }
});


publicRouter.get("/engines/:engineKey", async (req, res, next) => {
  try {
    const engineKey = String(req.params.engineKey || "").toLowerCase();
    if (!ENGINE_KEYS.includes(engineKey)) {
      return res.status(400).json({
        error: "Unknown engine",
        allowed: ENGINE_KEYS
      });
    }

    const date = assertIsoDate(req.query.date || todayUtc());
    const supabase = getSupabaseAdmin();
    const refresh = await maybeRefreshMatches(req, date);
    const predictions = await listPublicPredictions(supabase, date);

    const items = predictions
      .map((prediction) => {
        const pick = prediction.engines?.[engineKey];
        return pick
          ? {
              ...prediction,
              activeEngine: engineKey,
              pick
            }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => {
        const confidenceA = Number(a.pick?.confidence ?? a.pick?.score ?? 0);
        const confidenceB = Number(b.pick?.confidence ?? b.pick?.score ?? 0);
        return confidenceB - confidenceA;
      });

    res.json({
      date,
      engineKey,
      generatedAt: new Date().toISOString(),
      count: items.length,
      matchStates: summarizeMatchStates(items),
      liveRefresh: refresh,
      items
    });
  } catch (error) {
    next(error);
  }
});


publicRouter.get("/boss-picks/today", async (req, res, next) => {
  try {
    const date = assertIsoDate(req.query.date || todayUtc());
    const refresh = await maybeRefreshMatches(req, date);
    if (refresh.refreshed) invalidateBossPickCache(date);
    const result = await getBossPicks(getSupabaseAdmin(), date);
    res.json({
      ...result,
      matchStates: summarizeMatchStates(result.picks || []),
      liveRefresh: refresh
    });
  } catch (error) {
    next(error);
  }
});

publicRouter.get("/bankers/today", async (req, res, next) => {
  try {
    const date = assertIsoDate(req.query.date || todayUtc());
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 3, 5));
    const supabase = getSupabaseAdmin();
    const refresh = await maybeRefreshMatches(req, date);
    const predictions = await listPublicPredictions(supabase, date);
    const slate = selectBankerSlate(predictions, { limit });

    res.json({
      date,
      generatedAt: new Date().toISOString(),
      predictionsReviewed: predictions.length,
      matchStates: summarizeMatchStates(predictions),
      liveRefresh: refresh,
      ...slate
    });
  } catch (error) {
    next(error);
  }
});

publicRouter.get("/results/intelligence", async (req, res, next) => {
  try {
    const days = Math.max(1, Math.min(Number(req.query.days) || 30, 90));
    const supabase = getSupabaseAdmin();
    const refresh = await maybeRefreshMatches(req, todayUtc());
    const result = await getResultsIntelligence(supabase, days);
    res.json({ ...result, liveRefresh: refresh });
  } catch (error) {
    next(error);
  }
});

publicRouter.get("/processing/status", (req, res, next) => {
  try {
    const date = assertIsoDate(req.query.date || todayUtc());
    res.json({ date, processing: getBackgroundProcessingStatus(date) });
  } catch (error) {
    next(error);
  }
});

publicRouter.get("/predictions/today", async (req, res, next) => {
  try {
    const date = assertIsoDate(req.query.date || todayUtc());
    const refresh = await maybeRefreshMatches(req, date);
    const predictions = await listPublicPredictions(getSupabaseAdmin(), date);
    res.json({
      date,
      count: predictions.length,
      matchStates: summarizeMatchStates(predictions),
      liveRefresh: refresh,
      predictions
    });
  } catch (error) {
    next(error);
  }
});

publicRouter.get("/fixtures/today", async (req, res, next) => {
  try {
    const date = assertIsoDate(req.query.date || todayUtc());
    const refresh = await maybeRefreshMatches(req, date);
    const fixtures = await listFixtures(getSupabaseAdmin(), date);
    res.json({
      date,
      count: fixtures.length,
      matchStates: summarizeMatchStates(fixtures),
      liveRefresh: refresh,
      fixtures
    });
  } catch (error) {
    next(error);
  }
});

publicRouter.get("/matches/status", async (req, res, next) => {
  try {
    const date = assertIsoDate(req.query.date || todayUtc());
    const refresh = await maybeRefreshMatches(req, date);
    const fixtures = await listFixtures(getSupabaseAdmin(), date);
    res.json({
      date,
      generatedAt: new Date().toISOString(),
      liveRefresh: refresh,
      matchStates: summarizeMatchStates(fixtures),
      fixtures
    });
  } catch (error) {
    next(error);
  }
});

publicRouter.get("/results/recent", async (req, res, next) => {
  try {
    const results = await listRecentResults(getSupabaseAdmin(), req.query.limit);
    res.json({ count: results.length, results });
  } catch (error) {
    next(error);
  }
});

publicRouter.get("/stats/engine", async (_req, res, next) => {
  try {
    const stats = await getDashboardStats(getSupabaseAdmin());
    res.json(stats);
  } catch (error) {
    next(error);
  }
});
