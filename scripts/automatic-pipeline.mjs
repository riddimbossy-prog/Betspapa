#!/usr/bin/env node

const API_BASE = String(
  process.env.BETSPAPA_API_BASE || "https://api.betspapa.com"
).replace(/\/+$/, "");

const ADMIN_SECRET = String(process.env.ADMIN_SYNC_SECRET || "").trim();
const CUSTOM_DATE = String(process.env.PIPELINE_DATE || "").trim();
const MODE = String(process.env.PIPELINE_MODE || "today").trim().toLowerCase();
const RUN_ID = String(process.env.PIPELINE_RUN_ID || Date.now()).trim();
const FORCE_HYDRATION =
  String(process.env.FORCE_HYDRATION || "false").toLowerCase() === "true";

const MAX_HYDRATION_TEAMS = Math.max(
  1,
  Math.min(Number(process.env.MAX_HYDRATION_TEAMS || 40), 200)
);
const HYDRATION_WORKERS = Math.max(
  1,
  Math.min(Number(process.env.HYDRATION_WORKERS || 4), 6)
);
const REQUEST_TIMEOUT_MS = Math.max(
  30000,
  Math.min(Number(process.env.REQUEST_TIMEOUT_MS || 180000), 600000)
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
    throw new Error(`Invalid PIPELINE_DATE: ${value}`);
  }
  return value;
}

const baseDate = assertDate(CUSTOM_DATE || isoDate(new Date()));
const targetDate =
  MODE === "tomorrow"
    ? addDays(baseDate, 1)
    : MODE === "results"
      ? addDays(baseDate, -1)
      : baseDate;
const runKey = `${RUN_ID}:${MODE}:${targetDate}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function heading(message) {
  console.log(`\n=== ${message} ===`);
}

function compactError(error) {
  return error?.message || String(error);
}

async function request(path, {
  method = "GET",
  body,
  timeoutMs = REQUEST_TIMEOUT_MS,
  admin = true,
  retries = 3
} = {}) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
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
        const error = new Error(`${method} ${path} failed: ${message}`);
        error.status = response.status;
        throw error;
      }

      return payload;
    } catch (error) {
      lastError = error;
      const retryable =
        error?.name === "AbortError" ||
        Number(error?.status) === 429 ||
        Number(error?.status) >= 500 ||
        /aborted|timeout|fetch failed|socket/i.test(compactError(error));

      if (!retryable || attempt >= retries) throw error;

      const wait = attempt * 2500;
      console.log(
        `Retry ${attempt}/${retries - 1} after ${compactError(error)}`
      );
      await sleep(wait);
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}

async function bestEffortProgress(stage, status, completedStages, progress = {}, lastError = null) {
  try {
    await request("/api/admin/pipeline-progress", {
      method: "POST",
      body: {
        runKey,
        date: targetDate,
        mode: MODE,
        stage,
        status,
        completedStages,
        progress,
        lastError
      },
      timeoutMs: 30000,
      retries: 1
    });
  } catch (error) {
    console.log(`Pipeline ledger warning: ${compactError(error)}`);
  }
}

async function loadCompletedStages() {
  try {
    const payload = await request(
      `/api/admin/pipeline-status?runKey=${encodeURIComponent(runKey)}`,
      { timeoutMs: 30000, retries: 1 }
    );
    return Array.isArray(payload.result?.completed_stages)
      ? payload.result.completed_stages
      : [];
  } catch {
    return [];
  }
}

async function runStage(name, completedStages, worker) {
  if (completedStages.includes(name)) {
    console.log(`Resume: ${name} was already completed`);
    return null;
  }

  await bestEffortProgress(name, "running", completedStages);
  try {
    const result = await worker();
    completedStages.push(name);
    await bestEffortProgress(
      name,
      "running",
      completedStages,
      { [name]: result || {} }
    );
    return result;
  } catch (error) {
    await bestEffortProgress(
      name,
      "failed",
      completedStages,
      {},
      compactError(error)
    );
    throw error;
  }
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
    Array.from({ length: Math.min(limit, items.length) }, () => run())
  );
  return results;
}

async function syncDate(date) {
  const payload = await request("/api/admin/sync-date", {
    method: "POST",
    body: { date }
  });
  const result = payload.result || {};
  console.log(
    `Fixtures imported: ${result.imported || 0} | Provider results: ${result.providerResults || 0}`
  );
  return result;
}

async function hydrateDate(date) {
  const force = FORCE_HYDRATION ? "true" : "false";
  const planPayload = await request(
    `/api/admin/hydration-plan?date=${encodeURIComponent(date)}&force=${force}`
  );
  const plan = planPayload.result || {};
  const needed = (plan.teams || []).filter((team) => team.needsHydration);

  console.log(
    `Teams ready: ${plan.readyTeams || 0} | Need history: ${needed.length}`
  );

  if (!needed.length) {
    return { attempted: 0, ready: plan.readyTeams || 0, failed: 0 };
  }

  const offset = new Date().getUTCHours() % needed.length;
  const rotated = [...needed.slice(offset), ...needed.slice(0, offset)];
  const queue = rotated.slice(0, MAX_HYDRATION_TEAMS);

  let ready = 0;
  let failed = 0;
  let completed = 0;

  await mapPool(queue, HYDRATION_WORKERS, async (team) => {
    const label = team.teamName || `Team ${team.teamId}`;

    try {
      const payload = await request("/api/admin/hydrate-team", {
        method: "POST",
        body: {
          date,
          teamId: Number(team.teamId),
          force: FORCE_HYDRATION
        },
        timeoutMs: 180000,
        retries: 2
      });

      const audit = payload.result?.audits?.[0];
      if (audit?.ready) {
        ready += 1;
        console.log(`[ready] ${label}`);
      } else {
        failed += 1;
        console.log(`[not ready] ${label}`);
      }
    } catch (error) {
      failed += 1;
      console.log(`[error] ${label}: ${compactError(error)}`);
    } finally {
      completed += 1;
      console.log(`Hydration ${completed}/${queue.length}`);
    }
  });

  return { attempted: queue.length, ready, failed };
}

async function generateDate(date) {
  const payload = await request("/api/admin/generate-predictions", {
    method: "POST",
    body: {
      date,
      skipHydration: true
    },
    timeoutMs: 420000,
    retries: 3
  });
  const result = payload.result || {};
  console.log(
    `Generated: ${result.generated || 0} | Published: ${result.published || 0} | Skipped: ${result.skipped?.length || 0}`
  );
  return result;
}

async function gradeDate(date) {
  const payload = await request("/api/admin/grade-results", {
    method: "POST",
    body: { date },
    timeoutMs: 180000,
    retries: 3
  });
  return payload.result || {};
}

async function notify(eventType, date, summary = {}) {
  try {
    const payload = await request("/api/admin/dispatch-notifications", {
      method: "POST",
      body: {
        eventType,
        date,
        eventKey: `${eventType}:${date}:${RUN_ID}`,
        summary
      },
      timeoutMs: 120000,
      retries: 2
    });
    console.log(
      `${eventType} notifications sent: ${payload.result?.sent || 0}`
    );
    return payload.result || {};
  } catch (error) {
    console.log(`Notification warning: ${compactError(error)}`);
    return { warning: compactError(error) };
  }
}

async function main() {
  heading("BetsPapa resumable automatic pipeline");
  console.log(`Mode: ${MODE}`);
  console.log(`Date: ${targetDate}`);
  console.log(`Run key: ${runKey}`);

  const health = await request("/api/health", {
    admin: false,
    timeoutMs: 45000
  });

  if (health.status !== "ok" || health.database !== "connected") {
    throw new Error("BetsPapa API or Supabase is unhealthy.");
  }

  const completedStages = await loadCompletedStages();
  await bestEffortProgress("starting", "running", completedStages);

  if (MODE === "results") {
    await runStage("sync-results", completedStages, () => syncDate(targetDate));
    const graded = await runStage(
      "grade-results",
      completedStages,
      () => gradeDate(targetDate)
    );
    await runStage(
      "notify-results",
      completedStages,
      () => notify("results", targetDate, graded || {})
    );
  } else {
    await runStage("sync-fixtures", completedStages, () => syncDate(targetDate));
    await runStage("hydrate-teams", completedStages, () => hydrateDate(targetDate));
    const generated = await runStage(
      "generate-picks",
      completedStages,
      () => generateDate(targetDate)
    );

    if (MODE === "today") {
      await runStage(
        "notify-papa-picks",
        completedStages,
        () => notify("papa-picks", targetDate, {
          count: generated?.published || 0
        })
      );
      await runStage(
        "notify-bankers",
        completedStages,
        () => notify("bankers", targetDate, {
          count: generated?.published || 0
        })
      );
    }
  }

  await bestEffortProgress(
    "complete",
    "complete",
    completedStages,
    { completedAt: new Date().toISOString() }
  );

  heading("Pipeline complete");
}

main().catch(async (error) => {
  console.error(`\nPIPELINE FAILED\n${compactError(error)}`);
  await bestEffortProgress(
    "failed",
    "failed",
    [],
    {},
    compactError(error)
  );
  process.exit(1);
});
