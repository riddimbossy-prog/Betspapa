import { Router } from "express";
import { demoFixtures } from "../data/demoFixtures.js";
import { predictMatch } from "../engine/transitionEngine.js";
import { getSupabaseAdmin } from "../supabase.js";
import { getLatestPipelineStatus } from "../services/pipelineService.js";
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

export const publicRouter = Router();

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
    const dashboard = await getDashboardData(getSupabaseAdmin(), date);
    res.set("Cache-Control", "public, max-age=20, stale-while-revalidate=120");
    res.json(dashboard);
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
      items
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
    const predictions = await listPublicPredictions(supabase, date);
    const slate = selectBankerSlate(predictions, { limit });

    res.json({
      date,
      generatedAt: new Date().toISOString(),
      predictionsReviewed: predictions.length,
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
    const result = await getResultsIntelligence(supabase, days);
    res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=300");
    res.json(result);
  } catch (error) {
    next(error);
  }
});


publicRouter.get("/pipeline/latest", async (_req, res, next) => {
  try {
    const rows = await getLatestPipelineStatus(getSupabaseAdmin());
    res.json({
      updatedAt: rows[0]?.updated_at || null,
      runs: rows.map((row) => ({
        mode: row.mode,
        date: row.target_date,
        stage: row.stage,
        status: row.status,
        updatedAt: row.updated_at,
        completedAt: row.completed_at
      }))
    });
  } catch (error) {
    // Keep the public prediction pages available before the v1.11 migration.
    res.json({
      updatedAt: null,
      runs: [],
      migrationRequired: true
    });
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
    const predictions = await listPublicPredictions(getSupabaseAdmin(), date);
    res.json({ date, count: predictions.length, predictions });
  } catch (error) {
    next(error);
  }
});

publicRouter.get("/fixtures/today", async (req, res, next) => {
  try {
    const date = assertIsoDate(req.query.date || todayUtc());
    const fixtures = await listFixtures(getSupabaseAdmin(), date);
    res.json({ date, count: fixtures.length, fixtures });
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
