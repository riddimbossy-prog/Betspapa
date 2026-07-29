import { Router } from "express";
import { demoFixtures } from "../data/demoFixtures.js";
import { predictMatch } from "../engine/transitionEngine.js";
import { getSupabaseAdmin } from "../supabase.js";
import { getAthenaPicks, invalidateAthenaPickCache } from "../services/athenaPickService.js";
import { assertIsoDate, todayUtc } from "../utils/date.js";
import {
  ENGINE_KEYS,
  getResultsIntelligence,
  selectBankerSlate
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
import { getPreparedEngineBoard, isVisibleBoardPick } from "../services/boardSnapshotService.js";
import { getPapaLockHistory, getPapaLockPicks, invalidatePapaLockCache } from "../services/papaLockPickService.js";

export const publicRouter = Router();

const refreshJobs = new Map();
const dashboardCache = new Map();
const resultsCache = new Map();
const bankersCache = new Map();


function publicAthenaPick(pick) {
  if (!pick || typeof pick !== "object") return pick;
  const {
    internalAudit,
    routeAudit,
    arbitration,
    ...publicPick
  } = pick;
  return publicPick;
}

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
  invalidateAthenaPickCache(date);
  invalidatePapaLockCache(date);
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


function mainBoardRow(map, item) {
  const key = String(item.fixtureId ?? item.internalFixtureId ?? item.id ?? "");
  if (!map.has(key)) {
    map.set(key, {
      id: item.id ?? null,
      fixtureId: item.fixtureId ?? null,
      internalFixtureId: item.internalFixtureId ?? item.id ?? null,
      kickoff: item.kickoff ?? null,
      status: item.status ?? null,
      matchState: item.matchState ?? null,
      settlement: item.settlement ?? null,
      engineOutcomes: item.engineOutcomes || {},
      venue: item.venue ?? null,
      league: item.league ?? null,
      home: item.home ?? null,
      away: item.away ?? null,
      engines: {},
      processing: {},
      athena: null
    });
  }
  const row = map.get(key);
  for (const field of ["id", "fixtureId", "internalFixtureId", "kickoff", "status", "matchState", "settlement", "venue", "league", "home", "away"]) {
    if (row[field] == null && item[field] != null) row[field] = item[field];
  }
  row.engineOutcomes = { ...row.engineOutcomes, ...(item.engineOutcomes || {}) };
  return row;
}

function normalizedAthenaForMainBoard(pick) {
  return {
    key: pick.marketId || "athena-pick",
    market: pick.market || "Athena",
    selection: pick.selection,
    confidence: Number(pick.score || 0),
    score: Number(pick.score || 0),
    qualified: true,
    available: true,
    grade: pick.grade || "QUALIFIED",
    engineName: "Athena",
    explanationParagraph: pick.explanation?.summary || pick.story || "Athena found a supported HT/FT and half-goal route.",
    reasons: pick.explanation?.whyPick || pick.explanation?.reasons || [],
    cautions: pick.explanation?.cautions || [],
    outcome: pick.settlement?.outcome || null
  };
}

publicRouter.get("/main-board/today", async (req, res, next) => {
  try {
    const date = assertIsoDate(req.query.date || todayUtc());
    const force = ["1", "true", "force", "reload"].includes(String(req.query.force || "").toLowerCase());
    const supabase = getSupabaseAdmin();

    // Load primary first. A primary refresh warms all four PapaSense snapshots,
    // avoiding four duplicate database refreshes on the all-engine board.
    const primary = await getPreparedEngineBoard(supabase, date, "primary", { force });
    const [safer, aggressive, venue, athenaResult] = await Promise.all([
      getPreparedEngineBoard(supabase, date, "safer", { force: false }),
      getPreparedEngineBoard(supabase, date, "aggressive", { force: false }),
      getPreparedEngineBoard(supabase, date, "venue", { force: false }),
      getAthenaPicks(supabase, date, { force })
    ]);

    const boards = { primary, safer, aggressive, venue };
    const rows = new Map();
    for (const [engineKey, board] of Object.entries(boards)) {
      for (const item of board.items || []) {
        const row = mainBoardRow(rows, item);
        row.engines[engineKey] = item.pick || null;
        row.processing[engineKey] = item.pick ? null : {
          state: item.processingState || board.processing?.state || "scheduled",
          message: item.processingMessage || board.processing?.message || "Waiting for the prepared board."
        };
      }
    }

    const publicAthena = (athenaResult.picks || []).map(publicAthenaPick);
    for (const pick of publicAthena) {
      const row = mainBoardRow(rows, pick);
      row.athena = pick;
      row.engines.athena = normalizedAthenaForMainBoard(pick);
      if (pick.settlement?.outcome) row.engineOutcomes.athena = pick.settlement.outcome;
    }

    const athenaReviewed = Number(athenaResult.reviewedFixtures || 0) > 0;
    const mergedItems = [...rows.values()].map((row) => {
      if (!("athena" in row.engines)) {
        row.engines.athena = athenaReviewed ? {
          key: "no-pick",
          market: "Athena",
          selection: "No Athena pick",
          confidence: 0,
          score: 0,
          qualified: false,
          available: false,
          engineName: "Athena",
          explanationParagraph: "Athena did not find a safe shared HT/FT, swing and goals-by-half route for this fixture.",
          reasons: ["No Athena market cleared every swing, half-goal and safety gate."],
          cautions: []
        } : null;
        row.processing.athena = athenaReviewed ? null : {
          state: "scheduled",
          message: "Athena is waiting for a complete prepared review."
        };
      }
      return row;
    }).sort((a, b) => new Date(a.kickoff || 0) - new Date(b.kickoff || 0));

    // Public boards are picks-only. A fixture remains visible when at least one
    // engine has a real selection; all-withheld and all-preparing fixtures stay
    // in diagnostics and preparation counts but are not sent to the public board.
    const items = mergedItems.filter((row) =>
      Object.values(row.engines || {}).some((pick) => isVisibleBoardPick(pick))
    );
    const hiddenFixtures = Math.max(0, mergedItems.length - items.length);

    const picks = items.flatMap((item) => Object.values(item.engines || {}));
    const readySelections = picks.filter((pick) => pick && pick.available !== false && pick.key !== "no-pick").length;
    const withheldSelections = picks.filter((pick) => pick && (pick.available === false || pick.key === "no-pick")).length;
    const strongSelections = picks.filter((pick) => pick && pick.available !== false && pick.key !== "no-pick" && pick.qualified !== false).length;
    const preparingSelections = items.length * 5 - picks.filter(Boolean).length;
    const engineCounts = Object.fromEntries(["primary", "safer", "aggressive", "venue", "athena"].map((key) => [key, {
      ready: items.filter((item) => item.engines?.[key] && item.engines[key].available !== false && item.engines[key].key !== "no-pick").length,
      withheld: items.filter((item) => item.engines?.[key] && (item.engines[key].available === false || item.engines[key].key === "no-pick")).length,
      preparing: items.filter((item) => !item.engines?.[key]).length
    }]));

    setPublicCache(res, 30, 300);
    res.set("Vary", "Origin, Accept-Encoding");
    return res.json({
      date,
      generatedAt: new Date().toISOString(),
      engineVersion: primary.engineVersion,
      athenaEngineVersion: athenaResult.engineVersion,
      engines: ["primary", "safer", "aggressive", "venue", "athena"],
      summary: {
        fixtures: items.length,
        hiddenFixtures,
        readySelections,
        strongSelections,
        withheldSelections,
        preparingSelections
      },
      engineCounts,
      matchStates: summarizeMatchStates(items),
      athenaStatus: athenaResult.status,
      athenaRejections: athenaResult.rejections || [],
      items
    });
  } catch (error) {
    next(error);
  }
});

// v1.18.2 fast prepared-board endpoint. It never refreshes providers,
// downloads history, grades results or generates predictions.
publicRouter.get("/boards/:engineKey", preparedBoardHandler);

// Backward-compatible alias for older PWA clients.
publicRouter.get("/engines/:engineKey", preparedBoardHandler);

async function athenaPicksHandler(req, res, next) {
  try {
    const date = assertIsoDate(req.query.date || todayUtc());
    const force = ["1", "true", "force", "reload"].includes(
      String(req.query.force || "").toLowerCase()
    );
    const result = await getAthenaPicks(getSupabaseAdmin(), date, { force });
    setPublicCache(res, result.cached ? 60 : 20, 900);
    res.set("Vary", "Origin, Accept-Encoding");
    const publicPicks = (result.picks || []).map(publicAthenaPick);
    res.json({
      ...result,
      picks: publicPicks,
      matchStates: summarizeMatchStates(publicPicks),
      liveRefresh: { refreshed: false, skipped: true, reason: "Athena prepared-pick reader" }
    });
  } catch (error) {
    next(error);
  }
}

publicRouter.get("/athena/today", athenaPicksHandler);
// Backward-compatible alias for installed clients that still request Boss Picks.
publicRouter.get("/boss-picks/today", athenaPicksHandler);

publicRouter.get("/bankers/today", async (req, res, next) => {
  try {
    const date = assertIsoDate(req.query.date || todayUtc());
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 3, 3));
    const force = ["1", "true", "force", "reload"].includes(
      String(req.query.force || "").toLowerCase()
    );
    const slate = await getPapaLockPicks(getSupabaseAdmin(), date, { force, limit });

    setPublicCache(res, slate.cached ? 60 : 20, 300);
    res.json({
      ...slate,
      liveRefresh: { refreshed: false, skipped: true, reason: "PapaLock prepared-engine reader" }
    });
  } catch (error) {
    next(error);
  }
});

publicRouter.get("/bankers/history", async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 30, 100));
    const history = await getPapaLockHistory(getSupabaseAdmin(), { limit });
    setPublicCache(res, 60, 600);
    res.json({
      engine: "PapaLock Banker Engine",
      generatedAt: new Date().toISOString(),
      ...history
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
