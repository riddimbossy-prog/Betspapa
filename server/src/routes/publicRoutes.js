import { Router } from "express";
import { demoFixtures } from "../data/demoFixtures.js";
import { predictMatch } from "../engine/transitionEngine.js";
import { getSupabaseAdmin } from "../supabase.js";
import { getBossPicks, invalidateBossPickCache } from "../services/bossPickService.js";
import { assertIsoDate, todayUtc } from "../utils/date.js";
import {
  ENGINE_KEYS,
  getResultsIntelligence,
  selectBankerSlate,
  selectConsensusBankers
} from "../services/intelligenceService.js";
import {
  getBackgroundProcessingStatus,
  getBoardPreparationStatus,
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
import { getPreparedEngineBoard } from "../services/boardSnapshotService.js";

export const publicRouter = Router();

const refreshJobs = new Map();
const dashboardCache = new Map();
const resultsCache = new Map();
const bankersCache = new Map();

function setPublicCache(res, maxAge, staleWhileRevalidate) {
  res.set("Cache-Control", `public, max-age=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`);
}

async function cachedValue(cache, key, loader, {
  ttlMs,
  staleMs
}) {
  const now = Date.now();
  const existing = cache.get(key);

  if (existing?.value && now - existing.createdAt < ttlMs) {
    return { ...existing.value, cacheState: "fresh" };
  }

  if (existing?.value && now - existing.createdAt < staleMs) {
    if (!existing.pending) {
      const pending = Promise.resolve()
        .then(loader)
        .then((value) => {
          cache.set(key, { value, createdAt: Date.now(), pending: null });
          return value;
        })
        .catch((error) => {
          const current = cache.get(key);
          if (current) current.pending = null;
          console.error(`Background cache refresh failed for ${key}:`, error?.message || error);
          return existing.value;
        });
      cache.set(key, { ...existing, pending });
    }
    return { ...existing.value, cacheState: "stale" };
  }

  if (existing?.pending) return existing.pending;

  const pending = Promise.resolve()
    .then(loader)
    .then((value) => {
      cache.set(key, { value, createdAt: Date.now(), pending: null });
      return { ...value, cacheState: "miss" };
    })
    .catch((error) => {
      cache.delete(key);
      throw error;
    });

  cache.set(key, {
    value: existing?.value || null,
    createdAt: existing?.createdAt || 0,
    pending
  });
  return pending;
}

function invalidateDateCaches(date) {
  dashboardCache.delete(date);
  resultsCache.clear();
  for (const key of bankersCache.keys()) {
    if (key.startsWith(`${date}:`)) bankersCache.delete(key);
  }
  invalidateBossPickCache(date);
}

function queueMatchRefresh(date) {
  const existing = refreshJobs.get(date);
  if (existing) return existing;

  const pending = Promise.resolve()
    .then(() => refreshCurrentMatchData(getSupabaseAdmin(), date))
    .then((result) => {
      if (result?.refreshed) invalidateDateCaches(date);
      return result;
    })
    .catch((error) => {
      console.error(`Live match refresh failed for ${date}:`, error?.message || error);
      return { refreshed: false, warning: error?.message || String(error) };
    })
    .finally(() => refreshJobs.delete(date));

  refreshJobs.set(date, pending);
  return pending;
}

async function maybeRefreshMatches(req, date) {
  const mode = String(req.query?.refresh ?? "background").toLowerCase();

  if (["0", "false", "off", "skip"].includes(mode)) {
    return { refreshed: false, skipped: true, reason: "Refresh disabled" };
  }

  if (["1", "true", "wait", "force"].includes(mode)) {
    return queueMatchRefresh(date);
  }

  queueMatchRefresh(date);
  return { refreshed: false, queued: true, reason: "Refresh running in background" };
}

function dashboardForDate(date) {
  return cachedValue(
    dashboardCache,
    date,
    () => getDashboardData(getSupabaseAdmin(), date),
    { ttlMs: 20_000, staleMs: 5 * 60_000 }
  );
}

function intelligenceForDays(days) {
  const key = String(days);
  return cachedValue(
    resultsCache,
    key,
    () => getResultsIntelligence(getSupabaseAdmin(), days),
    { ttlMs: 60_000, staleMs: 10 * 60_000 }
  );
}

function consensusBankersForDate(date, limit) {
  const key = `${date}:${limit}`;
  return cachedValue(
    bankersCache,
    key,
    async () => {
      const predictions = await listPublicPredictions(getSupabaseAdmin(), date);
      return {
        predictionsReviewed: predictions.length,
        matchStates: summarizeMatchStates(predictions),
        ...selectConsensusBankers(predictions, { limit })
      };
    },
    { ttlMs: 20_000, staleMs: 5 * 60_000 }
  );
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


publicRouter.get("/board-preparation/status", async (req, res, next) => {
  try {
    const date = assertIsoDate(req.query.date || todayUtc());
    const status = await getBoardPreparationStatus(getSupabaseAdmin(), date);
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.json({
      generatedAt: new Date().toISOString(),
      ...status
    });
  } catch (error) {
    next(error);
  }
});

publicRouter.get("/dashboard/today", async (req, res, next) => {
  try {
    const date = assertIsoDate(req.query.date || todayUtc());
    const refresh = await maybeRefreshMatches(req, date);
    const dashboard = await dashboardForDate(date);
    setPublicCache(res, 15, 120);
    res.json({ ...dashboard, liveRefresh: refresh });
  } catch (error) {
    next(error);
  }
});

async function preparedBoardHandler(req, res, next) {
  try {
    const engineKey = String(req.params.engineKey || "").toLowerCase();
    if (!ENGINE_KEYS.includes(engineKey)) {
      return res.status(400).json({
        error: "Unknown engine",
        allowed: ENGINE_KEYS
      });
    }

    const date = assertIsoDate(req.query.date || todayUtc());
    const force = ["1", "true", "force", "reload"].includes(
      String(req.query.force || "").toLowerCase()
    );
    const snapshot = await getPreparedEngineBoard(
      getSupabaseAdmin(),
      date,
      engineKey,
      { force }
    );

    const maxAge = snapshot.pending ? 15 : 60;
    const staleAge = snapshot.pending ? 60 : 900;
    setPublicCache(res, maxAge, staleAge);
    res.set("Vary", "Origin, Accept-Encoding");
    res.set("Last-Modified", snapshot.generatedAt);
    return res.json(snapshot);
  } catch (error) {
    return next(error);
  }
}

// v1.18.2 fast prepared-board endpoint. It never refreshes providers,
// downloads history, grades results or generates predictions.
publicRouter.get("/boards/:engineKey", preparedBoardHandler);

// Backward-compatible alias for older PWA clients.
publicRouter.get("/engines/:engineKey", preparedBoardHandler);

publicRouter.get("/boss-picks/today", async (req, res, next) => {
  try {
    const date = assertIsoDate(req.query.date || todayUtc());
    const refresh = { refreshed: false, skipped: true, reason: "Prepared pick reader" };
    const result = await getBossPicks(getSupabaseAdmin(), date);
    setPublicCache(res, 15, 120);
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
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 12, 20));
    const refresh = { refreshed: false, skipped: true, reason: "Prepared pick reader" };
    const slate = await consensusBankersForDate(date, limit);

    setPublicCache(res, 15, 120);
    res.json({
      date,
      generatedAt: new Date().toISOString(),
      liveRefresh: refresh,
      methodology: "Exact-selection consensus plus exceptional qualified single-engine picks",
      ...slate
    });
  } catch (error) {
    next(error);
  }
});

// Legacy per-engine banker slate retained for diagnostics and older clients.
publicRouter.get("/bankers/by-engine", async (req, res, next) => {
  try {
    const date = assertIsoDate(req.query.date || todayUtc());
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 3, 5));
    const supabase = getSupabaseAdmin();
    const predictions = await listPublicPredictions(supabase, date);
    const slate = selectBankerSlate(predictions, { limit });

    setPublicCache(res, 15, 120);
    res.json({
      date,
      generatedAt: new Date().toISOString(),
      predictionsReviewed: predictions.length,
      matchStates: summarizeMatchStates(predictions),
      ...slate
    });
  } catch (error) {
    next(error);
  }
});

publicRouter.get("/results/intelligence", async (req, res, next) => {
  try {
    const days = Math.max(1, Math.min(Number(req.query.days) || 30, 90));
    const result = await intelligenceForDays(days);
    setPublicCache(res, 30, 300);
    res.json(result);
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
    setPublicCache(res, 15, 120);
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
    setPublicCache(res, 15, 120);
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
    setPublicCache(res, 10, 60);
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
    setPublicCache(res, 30, 300);
    res.json({ count: results.length, results });
  } catch (error) {
    next(error);
  }
});

publicRouter.get("/stats/engine", async (_req, res, next) => {
  try {
    const stats = await getDashboardStats(getSupabaseAdmin());
    setPublicCache(res, 30, 300);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});
