#!/usr/bin/env node

const API_BASE = String(
  process.env.BETSPAPA_API_BASE || "https://api.betspapa.com"
).replace(/\/+$/, "");

const ADMIN_SECRET = String(process.env.ADMIN_SYNC_SECRET || "").trim();
const CUSTOM_DATE = String(process.env.BOARD_DATE || "").trim();
const FORCE_HYDRATION =
  String(process.env.FORCE_HYDRATION || "false").toLowerCase() === "true";
const MAX_HYDRATION_TEAMS = Math.max(
  1,
  Math.min(Number(process.env.MAX_HYDRATION_TEAMS || 100), 240)
);
const HYDRATION_WORKERS = Math.max(
  1,
  Math.min(Number(process.env.HYDRATION_WORKERS || 6), 8)
);
const PREPARATION_ROUNDS = Math.max(
  1,
  Math.min(Number(process.env.PREPARATION_ROUNDS || 2), 4)
);
const REQUEST_TIMEOUT_MS = Math.max(
  30000,
  Math.min(Number(process.env.REQUEST_TIMEOUT_MS || 240000), 600000)
);

if (!ADMIN_SECRET) {
  console.error("ADMIN_SYNC_SECRET is missing.");
  process.exit(1);
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(dateString, amount) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return isoDate(date);
}

function assertDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid date: ${value}. Use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || isoDate(parsed) !== value) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
  return value;
}

const today = isoDate(new Date());
const targetDate = assertDate(CUSTOM_DATE || addDays(today, 1));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function run() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, run)
  );
  return results;
}

async function request(path, {
  method = "GET",
  body,
  admin = true,
  timeoutMs = REQUEST_TIMEOUT_MS,
  retries = 2
} = {}) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(admin ? { "x-admin-secret": ADMIN_SECRET } : {})
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });

      const text = await response.text();
      let payload = {};
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = { raw: text };
      }

      if (!response.ok) {
        const message =
          payload?.message ||
          payload?.error ||
          payload?.raw ||
          `${response.status} ${response.statusText}`;
        throw new Error(`${method} ${path} failed: ${message}`);
      }

      return payload;
    } catch (error) {
      lastError = error;
      if (attempt >= retries) throw error;
      await sleep(2500 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}

function heading(message) {
  console.log(`\n=== ${message} ===`);
}

async function syncBoard() {
  heading(`Import tomorrow's fixtures: ${targetDate}`);
  const payload = await request("/api/admin/sync-date", {
    method: "POST",
    body: { date: targetDate }
  });
  const result = payload.result || {};
  console.log(
    `Provider results: ${result.providerResults || 0} | Imported: ${result.imported || 0}`
  );
  if (result.quota) {
    console.log(`API quota remaining: ${result.quota.dailyRemaining ?? "unknown"}`);
  }
  return result;
}

async function hydrationPlan() {
  return request(
    `/api/admin/hydration-plan?date=${encodeURIComponent(targetDate)}&force=${FORCE_HYDRATION ? "true" : "false"}`
  );
}

async function hydrateRound(round) {
  heading(`History preparation round ${round}/${PREPARATION_ROUNDS}`);
  const payload = await hydrationPlan();
  const plan = payload.result || {};
  const teams = Array.isArray(plan.teams) ? plan.teams : [];
  const needed = teams.filter((team) => team.needsHydration);

  console.log(`Fixtures: ${payload.fixtures || 0}`);
  console.log(`Teams checked: ${plan.teamsChecked || teams.length}`);
  console.log(`Already ready: ${plan.readyTeams || 0}`);
  console.log(`Need history: ${needed.length}`);

  if (!needed.length) {
    return { attempted: 0, ready: plan.readyTeams || teams.length, failed: 0 };
  }

  const queue = needed.slice(0, MAX_HYDRATION_TEAMS);
  let ready = 0;
  let failed = 0;
  let completed = 0;

  console.log(`Hydration workers: ${HYDRATION_WORKERS}`);
  console.log(`Hydration queue: ${queue.length}`);

  await mapPool(queue, HYDRATION_WORKERS, async (team) => {
    const label = team.teamName || `Team ${team.teamId}`;
    try {
      const resultPayload = await request("/api/admin/hydrate-team", {
        method: "POST",
        body: {
          date: targetDate,
          teamId: Number(team.teamId),
          force: FORCE_HYDRATION
        },
        retries: 1
      });
      const result = resultPayload.result || {};
      const audit = Array.isArray(result.audits) ? result.audits[0] : null;
      if (audit?.ready) {
        ready += 1;
        console.log(`[ready] ${label}`);
      } else {
        failed += 1;
        console.log(`[waiting] ${label} | ${audit?.error || "insufficient history"}`);
      }
    } catch (error) {
      failed += 1;
      console.log(`[error] ${label} | ${error.message}`);
    } finally {
      completed += 1;
      if (completed % 10 === 0 || completed === queue.length) {
        console.log(`History progress: ${completed}/${queue.length}`);
      }
      await sleep(100);
    }
  });

  return { attempted: queue.length, ready, failed };
}

async function generateBoard() {
  heading(`Generate tomorrow's PapaSense board: ${targetDate}`);
  const payload = await request("/api/admin/generate-predictions", {
    method: "POST",
    body: { date: targetDate },
    timeoutMs: 360000,
    retries: 1
  });
  const result = payload.result || {};
  console.log(`Generated: ${result.generated || 0}`);
  console.log(`Published: ${result.published || 0}`);
  console.log(
    `Waiting/skipped: ${Array.isArray(result.skipped) ? result.skipped.length : 0}`
  );
  return result;
}

async function boardStatus() {
  return request(
    `/api/board-preparation/status?date=${encodeURIComponent(targetDate)}`,
    { admin: false, timeoutMs: 60000 }
  );
}

async function warmPreparedBoard() {
  heading(`Warm public board snapshot: ${targetDate}`);
  const payload = await request("/api/admin/warm-board", {
    method: "POST",
    body: { date: targetDate },
    timeoutMs: 120000,
    retries: 1
  });
  const engines = payload.result?.engines || {};
  console.log(`Warmed engines: ${Object.keys(engines).join(", ") || "none"}`);
  return payload.result || {};
}

async function main() {
  heading("BetsPapa day-ahead board preparation");
  console.log(`API: ${API_BASE}`);
  console.log(`Today UTC: ${today}`);
  console.log(`Board date: ${targetDate}`);
  console.log(`Rounds: ${PREPARATION_ROUNDS}`);
  console.log(`Maximum history requests per round: ${MAX_HYDRATION_TEAMS}`);

  const health = await request("/api/health", {
    admin: false,
    timeoutMs: 45000
  });

  console.log(
    `Health: ${health.status} | Version: ${health.version} | Engine: ${health.engineVersion || "unknown"} | Database: ${health.database}`
  );

  if (health.status !== "ok" || health.database !== "connected") {
    throw new Error("BetsPapa API or Supabase is not healthy.");
  }

  await syncBoard();

  let status = await boardStatus();
  for (let round = 1; round <= PREPARATION_ROUNDS; round += 1) {
    if (status.prepared) break;
    await hydrateRound(round);
    await generateBoard();
    status = await boardStatus();

    console.log(
      `Coverage after round ${round}: ${status.readyPredictions}/${status.fixturesFound} (${status.coveragePercent}%)`
    );
  }

  await warmPreparedBoard();

  heading("Tomorrow board summary");
  console.log(`State: ${status.state}`);
  console.log(`Fixtures: ${status.fixturesFound}`);
  console.log(`Ready picks: ${status.readyPredictions}`);
  console.log(`Waiting for history: ${status.waitingForHistory}`);
  console.log(`Coverage: ${status.coveragePercent}%`);
  console.log(status.message);

  if (status.fixturesFound === 0) {
    throw new Error("No fixtures were imported for tomorrow.");
  }

  if (status.readyPredictions === 0) {
    throw new Error("Tomorrow's fixtures were imported, but zero picks were prepared.");
  }

  if (!status.prepared) {
    console.log(
      "::warning::Tomorrow's board is partially prepared. The later scheduled pass will retry missing teams."
    );
  }

  console.log("\nBOARD PREPARATION COMPLETE");
}

main().catch((error) => {
  console.error(`\nBOARD PREPARATION FAILED\n${error?.message || error}`);
  process.exit(1);
});
