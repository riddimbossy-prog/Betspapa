#!/usr/bin/env node

const API_BASE = String(
  process.env.BETSPAPA_API_BASE || "https://api.betspapa.com"
).replace(/\/+$/, "");

const ADMIN_SECRET = String(process.env.ADMIN_SYNC_SECRET || "").trim();
const CUSTOM_DATE = String(process.env.PIPELINE_DATE || "").trim();
const FORCE_HYDRATION =
  String(process.env.FORCE_HYDRATION || "false").toLowerCase() === "true";
const MAX_HYDRATION_TEAMS = Math.max(
  1,
  Math.min(Number(process.env.MAX_HYDRATION_TEAMS || 40), 200)
);
const REQUEST_TIMEOUT_MS = Math.max(
  30000,
  Math.min(Number(process.env.REQUEST_TIMEOUT_MS || 180000), 600000)
);
const HYDRATION_WORKERS = Math.max(
  1,
  Math.min(Number(process.env.HYDRATION_WORKERS || 4), 6)
);

if (!ADMIN_SECRET) {
  console.error(
    "ADMIN_SYNC_SECRET is missing. Add it at GitHub → Settings → Secrets and variables → Actions."
  );
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
    throw new Error(`Invalid PIPELINE_DATE: ${value}. Use YYYY-MM-DD.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || isoDate(date) !== value) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
  return value;
}

const targetDate = assertDate(CUSTOM_DATE || isoDate(new Date()));
const yesterday = addDays(targetDate, -1);
const tomorrow = addDays(targetDate, 1);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function run() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => run())
  );
  return results;
}

async function request(path, {
  method = "GET",
  body,
  timeoutMs = REQUEST_TIMEOUT_MS,
  admin = true
} = {}) {
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
  } finally {
    clearTimeout(timer);
  }
}

function heading(message) {
  console.log(`\n=== ${message} ===`);
}

function compactError(error) {
  return error?.message || String(error);
}

async function syncDate(date) {
  heading(`Sync fixtures: ${date}`);
  const payload = await request("/api/admin/sync-date", {
    method: "POST",
    body: { date }
  });
  const result = payload.result || {};
  console.log(
    `Provider results: ${result.providerResults || 0} | Imported: ${result.imported || 0}`
  );
  if (result.quota) {
    console.log(
      `API quota remaining: ${result.quota.dailyRemaining ?? "unknown"}`
    );
  }
  return result;
}

async function gradeDate(date) {
  heading(`Grade results: ${date}`);
  const payload = await request("/api/admin/grade-results", {
    method: "POST",
    body: { date }
  });
  const result = payload.result || {};
  console.log(
    `Graded: ${result.graded ?? result.updated ?? 0} | Skipped: ${
      Array.isArray(result.skipped) ? result.skipped.length : 0
    }`
  );
  return result;
}

async function getHydrationPlan(date) {
  const force = FORCE_HYDRATION ? "true" : "false";
  return request(
    `/api/admin/hydration-plan?date=${encodeURIComponent(date)}&force=${force}`
  );
}

async function hydrateDate(date) {
  heading(`Prepare individual team histories: ${date}`);
  const planPayload = await getHydrationPlan(date);
  const plan = planPayload.result || {};
  const allTeams = Array.isArray(plan.teams) ? plan.teams : [];
  const needed = allTeams.filter((team) => team.needsHydration);

  console.log(`Fixtures: ${planPayload.fixtures || 0}`);
  console.log(`Teams checked: ${plan.teamsChecked || allTeams.length}`);
  console.log(`Already ready: ${plan.readyTeams || 0}`);
  console.log(`Need history: ${needed.length}`);

  if (!needed.length) {
    return {
      checked: allTeams.length,
      attempted: 0,
      ready: plan.readyTeams || allTeams.length,
      failed: 0,
      importedFixtures: 0
    };
  }

  // Rotate the starting point by UTC hour so a permanently unavailable team
  // cannot prevent later teams from being attempted on every scheduled run.
  const offset = new Date().getUTCHours() % needed.length;
  const rotated = [...needed.slice(offset), ...needed.slice(0, offset)];
  const queue = rotated.slice(0, MAX_HYDRATION_TEAMS);

  let ready = 0;
  let failed = 0;
  let importedFixtures = 0;
  let completed = 0;

  console.log(`Hydration workers: ${HYDRATION_WORKERS}`);

  await mapPool(queue, HYDRATION_WORKERS, async (team) => {
    const label = team.teamName || `Team ${team.teamId}`;
    const slot = completed + 1;
    console.log(`[start ${slot}/${queue.length}] ${label}`);

    try {
      const payload = await request("/api/admin/hydrate-team", {
        method: "POST",
        body: {
          date,
          teamId: Number(team.teamId),
          force: FORCE_HYDRATION
        }
      });
      const result = payload.result || {};
      const audit = Array.isArray(result.audits) ? result.audits[0] : null;

      importedFixtures += Number(result.importedFixtures || 0);
      if (audit?.ready) {
        ready += 1;
        console.log(
          `[ready] ${label} | provider=${audit.providerResults || 0} | imported=${result.importedFixtures || 0}`
        );
      } else {
        failed += 1;
        console.log(`[not ready] ${label} | ${audit?.error || "insufficient history"}`);
      }
    } catch (error) {
      failed += 1;
      console.log(`[error] ${label} | ${compactError(error)}`);
    } finally {
      completed += 1;
      console.log(`Hydration progress: ${completed}/${queue.length}`);
      await sleep(120);
    }
  });

  console.log(
    `Hydration attempted: ${queue.length} | Ready: ${ready} | Not ready/errors: ${failed}`
  );

  return {
    checked: allTeams.length,
    attempted: queue.length,
    ready,
    failed,
    importedFixtures
  };
}

async function generateDate(date) {
  heading(`Generate PapaSense picks: ${date}`);
  const payload = await request("/api/admin/generate-predictions", {
    method: "POST",
    body: { date },
    timeoutMs: 300000
  });
  const result = payload.result || {};
  console.log(`Generated: ${result.generated || 0}`);
  console.log(`Published: ${result.published || 0}`);
  console.log(
    `Withheld/skipped: ${Array.isArray(result.skipped) ? result.skipped.length : 0}`
  );
  return result;
}

async function processPredictionDate(date) {
  await syncDate(date);
  await hydrateDate(date);
  await generateDate(date);
}

async function main() {
  heading("BetsPapa automatic pipeline");
  console.log(`API: ${API_BASE}`);
  console.log(`Target date: ${targetDate}`);
  console.log(`Tomorrow: ${tomorrow}`);
  console.log(`Previous results date: ${yesterday}`);
  console.log(`Maximum team-history requests this run: ${MAX_HYDRATION_TEAMS}`);
  console.log(`Parallel hydration workers: ${HYDRATION_WORKERS}`);
  console.log(`Force hydration: ${FORCE_HYDRATION}`);

  const health = await request("/api/health", {
    admin: false,
    timeoutMs: 45000
  });
  console.log(
    `Health: ${health.status} | Version: ${health.version} | Database: ${health.database}`
  );

  if (health.status !== "ok" || health.database !== "connected") {
    throw new Error("BetsPapa API or Supabase is not healthy.");
  }

  // Update yesterday first so final scores and result grading are current.
  try {
    await syncDate(yesterday);
    await gradeDate(yesterday);
  } catch (error) {
    console.log(`Yesterday update warning: ${compactError(error)}`);
  }

  // Today's games and tomorrow's early catalogue are always refreshed.
  await processPredictionDate(targetDate);
  try {
    await gradeDate(targetDate);
  } catch (error) {
    console.log(`Today grading warning: ${compactError(error)}`);
  }

  await processPredictionDate(tomorrow);

  heading("Pipeline complete");
  console.log("The website can now load completed picks from Supabase.");
}

main().catch((error) => {
  console.error(`\nPIPELINE FAILED\n${compactError(error)}`);
  process.exit(1);
});
