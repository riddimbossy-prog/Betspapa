import { ENGINE_VERSION, PREDICTABLE_STATUSES } from "../config.js";
import { buildEngineBoardItems, loadPreparedBoardData } from "./publicService.js";
import { summarizeMatchStates } from "./matchStateService.js";

const snapshots = new Map();
const FRESH_MS = 60 * 1000;
const STALE_MS = 30 * 60 * 1000;

function keyFor(date, engineKey) {
  return `${ENGINE_VERSION}:${date}:${engineKey}`;
}

function compactBoardItem(item) {
  return {
    id: item.id ?? null,
    fixtureId: item.fixtureId ?? null,
    internalFixtureId: item.internalFixtureId ?? item.id ?? null,
    kickoff: item.kickoff ?? null,
    status: item.status ?? null,
    matchState: item.matchState ?? null,
    settlement: item.settlement ?? null,
    engineOutcomes: item.engineOutcomes ?? null,
    venue: item.venue ?? null,
    league: item.league ?? null,
    home: item.home ?? null,
    away: item.away ?? null,
    activeEngine: item.activeEngine ?? null,
    processing: Boolean(item.processing),
    processingState: item.processingState ?? null,
    processingMessage: item.processingMessage ?? null,
    pick: item.pick ?? null
  };
}

function processingSummary(items) {
  const ready = items.filter((item) => Boolean(item.pick)).length;
  const pending = Math.max(0, items.length - ready);
  return {
    state: pending ? "scheduled" : "complete",
    totalFixtures: items.length,
    readyPredictions: ready,
    pending,
    withheld: 0,
    startedAt: null,
    completedAt: pending ? null : new Date().toISOString(),
    message: pending
      ? "This fixture is waiting for the scheduled board-preparation workflow. Public visitors do not trigger prediction generation."
      : "The prepared board is ready."
  };
}

export function createEngineBoardSnapshot({
  date,
  engineKey,
  fixtures = [],
  predictions = [],
  generatedAt = new Date().toISOString()
}) {
  const predictable = fixtures.filter((fixture) =>
    PREDICTABLE_STATUSES.has(fixture.status) ||
    predictions.some((prediction) => Number(prediction.internalFixtureId) === Number(fixture.id))
  );
  const items = buildEngineBoardItems({
    fixtures: predictable,
    predictions,
    engineKey,
    processing: {
      state: "scheduled",
      message: "Waiting for the scheduled board-preparation workflow."
    }
  }).map(compactBoardItem);
  const processing = processingSummary(items);
  return {
    date,
    engineKey,
    engineVersion: ENGINE_VERSION,
    generatedAt,
    snapshot: true,
    count: processing.readyPredictions,
    fixturesFound: items.length,
    ready: processing.readyPredictions,
    pending: processing.pending,
    processing,
    matchStates: summarizeMatchStates(items),
    liveRefresh: {
      refreshed: false,
      skipped: true,
      reason: "Prepared-board reader: live refresh runs separately"
    },
    items
  };
}

async function buildAllSnapshots(supabase, date) {
  const data = await loadPreparedBoardData(supabase, date);
  const generatedAt = new Date().toISOString();
  const result = new Map();
  for (const engineKey of ["primary", "aggressive", "safer", "venue"]) {
    result.set(engineKey, createEngineBoardSnapshot({
      date,
      engineKey,
      fixtures: data.fixtures,
      predictions: data.predictions,
      generatedAt
    }));
  }
  return result;
}

async function refreshDate(supabase, date) {
  const all = await buildAllSnapshots(supabase, date);
  const createdAt = Date.now();
  for (const [engineKey, value] of all) {
    snapshots.set(keyFor(date, engineKey), {
      value,
      createdAt,
      pending: null
    });
  }
  return all;
}

export async function getPreparedEngineBoard(supabase, date, engineKey, {
  force = false
} = {}) {
  const cacheKey = keyFor(date, engineKey);
  const existing = snapshots.get(cacheKey);
  const age = existing ? Date.now() - existing.createdAt : Number.POSITIVE_INFINITY;

  if (!force && existing?.value && age < FRESH_MS) {
    return { ...existing.value, cacheState: "fresh" };
  }

  if (!force && existing?.value && age < STALE_MS) {
    if (!existing.pending) {
      const pending = refreshDate(supabase, date)
        .catch((error) => {
          console.error(`Prepared board refresh failed for ${date}:`, error?.message || error);
        })
        .finally(() => {
          const current = snapshots.get(cacheKey);
          if (current) current.pending = null;
        });
      existing.pending = pending;
    }
    return { ...existing.value, cacheState: "stale" };
  }

  if (existing?.pending) {
    await existing.pending;
    const refreshed = snapshots.get(cacheKey)?.value;
    if (refreshed) return { ...refreshed, cacheState: "refreshed" };
  }

  const pending = refreshDate(supabase, date);
  snapshots.set(cacheKey, {
    value: existing?.value || null,
    createdAt: existing?.createdAt || 0,
    pending
  });
  const all = await pending;
  return { ...all.get(engineKey), cacheState: force ? "forced" : "miss" };
}

export async function warmPreparedBoards(supabase, date) {
  const all = await refreshDate(supabase, date);
  return {
    date,
    engineVersion: ENGINE_VERSION,
    warmedAt: new Date().toISOString(),
    engines: Object.fromEntries(
      [...all.entries()].map(([engineKey, snapshot]) => [engineKey, {
        ready: snapshot.ready,
        pending: snapshot.pending,
        fixturesFound: snapshot.fixturesFound
      }])
    )
  };
}

export function invalidatePreparedBoards(date = null) {
  if (!date) {
    const count = snapshots.size;
    snapshots.clear();
    return count;
  }
  let removed = 0;
  for (const key of [...snapshots.keys()]) {
    if (key.includes(`:${date}:`)) {
      snapshots.delete(key);
      removed += 1;
    }
  }
  return removed;
}
