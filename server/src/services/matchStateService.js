import { todayUtc } from "../utils/date.js";
import { gradePredictionsForDate } from "./gradingService.js";
import { syncDate } from "./syncService.js";

export const LIVE_STATUSES = new Set([
  "1H",
  "HT",
  "2H",
  "ET",
  "BT",
  "P",
  "INT",
  "LIVE"
]);

export const FINISHED_MATCH_STATUSES = new Set(["FT", "AET", "PEN"]);
export const PENDING_MATCH_STATUSES = new Set(["NS", "TBD"]);
export const DELAYED_MATCH_STATUSES = new Set(["PST", "SUSP"]);
export const CANCELLED_MATCH_STATUSES = new Set(["CANC", "ABD", "AWD", "WO"]);

const STATUS_LABELS = {
  NS: "Pending",
  TBD: "Time Pending",
  "1H": "1st Half Live",
  HT: "Half Time",
  "2H": "2nd Half Live",
  ET: "Extra Time Live",
  BT: "Extra-Time Break",
  P: "Penalties Live",
  INT: "Interrupted",
  LIVE: "Live",
  FT: "Full Time",
  AET: "After Extra Time",
  PEN: "After Penalties",
  PST: "Postponed",
  SUSP: "Suspended",
  CANC: "Cancelled",
  ABD: "Abandoned",
  AWD: "Awarded",
  WO: "Walkover"
};

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function fixtureMatchState(fixture, settlement = null) {
  const code = String(fixture?.status || "TBD").toUpperCase();
  const currentHome = finiteOrNull(fixture?.fulltime_home);
  const currentAway = finiteOrNull(fixture?.fulltime_away);
  const halftimeHome = finiteOrNull(fixture?.halftime_home);
  const halftimeAway = finiteOrNull(fixture?.halftime_away);
  const outcome = settlement?.outcome || null;

  const isLive = LIVE_STATUSES.has(code);
  const isFinished = FINISHED_MATCH_STATUSES.has(code);
  const isPending = PENDING_MATCH_STATUSES.has(code);
  const isDelayed = DELAYED_MATCH_STATUSES.has(code);
  const isCancelled = CANCELLED_MATCH_STATUSES.has(code);
  const isSettled = Boolean(outcome && ["WIN", "LOSS", "VOID"].includes(outcome));

  const category = isSettled
    ? "settled"
    : isLive
      ? "live"
      : isFinished
        ? "finished"
        : isPending
          ? "pending"
          : isDelayed
            ? "delayed"
            : isCancelled
              ? "cancelled"
              : "pending";

  return {
    code,
    label: isSettled ? `Settled · ${outcome}` : STATUS_LABELS[code] || code,
    category,
    isLive,
    isFinished,
    isPending,
    isDelayed,
    isCancelled,
    isSettled,
    canSettle: isFinished && !isCancelled,
    score:
      currentHome !== null && currentAway !== null
        ? `${currentHome}-${currentAway}`
        : null,
    halftimeScore:
      halftimeHome !== null && halftimeAway !== null
        ? `${halftimeHome}-${halftimeAway}`
        : null,
    outcome,
    updatedAt: fixture?.updated_at || settlement?.updated_at || null
  };
}

export function summarizeMatchStates(items) {
  const summary = {
    total: 0,
    pending: 0,
    live: 0,
    finished: 0,
    settled: 0,
    delayed: 0,
    cancelled: 0
  };

  for (const item of items || []) {
    const state = item?.matchState || item;
    const category = state?.category || "pending";
    summary.total += 1;
    if (Object.prototype.hasOwnProperty.call(summary, category)) {
      summary[category] += 1;
    }
  }

  return summary;
}

const refreshState = new Map();
const DEFAULT_REFRESH_MS = 2 * 60 * 1000;

export async function refreshCurrentMatchData(
  supabase,
  date,
  { force = false, minimumIntervalMs = DEFAULT_REFRESH_MS } = {}
) {
  if (date !== todayUtc()) {
    return {
      refreshed: false,
      skipped: true,
      reason: "Only today's match states are refreshed live",
      date
    };
  }

  const existing = refreshState.get(date);
  if (existing?.pending) return existing.pending;

  if (
    !force &&
    existing?.completedAt &&
    Date.now() - existing.completedAt < minimumIntervalMs
  ) {
    return {
      refreshed: false,
      cached: true,
      date,
      completedAt: new Date(existing.completedAt).toISOString(),
      sync: existing.sync || null,
      grading: existing.grading || null
    };
  }

  const pending = Promise.resolve()
    .then(async () => {
      const sync = await syncDate(supabase, date);
      const grading = await gradePredictionsForDate(supabase, date);
      const completedAt = Date.now();
      refreshState.set(date, { completedAt, sync, grading });
      return {
        refreshed: true,
        date,
        completedAt: new Date(completedAt).toISOString(),
        sync,
        grading
      };
    })
    .catch((error) => {
      refreshState.delete(date);
      throw error;
    });

  refreshState.set(date, {
    pending,
    completedAt: existing?.completedAt || 0,
    sync: existing?.sync || null,
    grading: existing?.grading || null
  });

  return pending;
}
