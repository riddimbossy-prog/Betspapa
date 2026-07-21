import { Router } from "express";
import { demoFixtures } from "../data/demoFixtures.js";
import { predictMatch } from "../engine/transitionEngine.js";
import { getSupabaseAdmin } from "../supabase.js";
import { assertIsoDate, todayUtc } from "../utils/date.js";
import {
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
    res.json(dashboard);
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
