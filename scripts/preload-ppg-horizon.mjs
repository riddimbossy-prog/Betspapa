#!/usr/bin/env node

const API_BASE = String(
  process.env.BETSPAPA_API_BASE || "https://api.betspapa.com"
).replace(/\/+$/, "");
const ADMIN_SECRET = String(process.env.ADMIN_SYNC_SECRET || "").trim();
const CUSTOM_DATE = String(process.env.PIPELINE_DATE || "").trim();
const HORIZON_DAYS = 5;
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

function assertDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid PPG start date: ${value}. Use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || isoDate(parsed) !== value) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
  return value;
}

function addDays(dateString, amount) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return isoDate(date);
}

const startDate = assertDate(CUSTOM_DATE || isoDate(new Date()));
const dates = Array.from({ length: HORIZON_DAYS }, (_, index) => addDays(startDate, index));

async function request(path, {
  method = "GET",
  body,
  admin = true,
  timeoutMs = REQUEST_TIMEOUT_MS
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
      throw new Error(payload.message || payload.error || payload.raw || `${response.status} ${response.statusText}`);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function compactError(error) {
  return error?.message || String(error);
}

async function main() {
  console.log("\n=== Preload PPG five-day SportyBet horizon ===");
  console.log(`API: ${API_BASE}`);
  console.log(`Dates: ${dates[0]} through ${dates.at(-1)}`);

  const health = await request("/api/health", { admin: false, timeoutMs: 45000 });
  if (health.status !== "ok" || health.database !== "connected") {
    throw new Error("BetsPapa API or Supabase is not healthy.");
  }

  const results = [];
  for (const date of dates) {
    try {
      const payload = await request("/api/admin/sync-date", {
        method: "POST",
        body: { date }
      });
      const result = payload.result || {};
      results.push({ date, ok: true, ...result });
      console.log(
        `[loaded] ${date} | ${result.source || "unknown"} | provider=${result.providerResults || 0} | imported=${result.imported || 0}`
      );
    } catch (error) {
      results.push({ date, ok: false, error: compactError(error) });
      console.log(`::warning::[waiting] ${date} | ${compactError(error)}`);
    }
  }

  const board = await request(
    `/api/ppg/today?date=${encodeURIComponent(startDate)}&days=${HORIZON_DAYS}&force=1`,
    { admin: false, timeoutMs: 300000 }
  );
  console.log(
    `PPG board: ${board.pickCount || 0} picks | ${board.reviewedFixtures || 0} fixtures | ${board.oddsMatchedFixtures || 0} SportyBet matches`
  );

  const successfulDates = results.filter((result) => result.ok).length;
  if (!successfulDates && !Number(board.reviewedFixtures || 0)) {
    throw new Error("No PPG fixtures could be loaded for the five-day horizon.");
  }

  console.log(`PPG horizon ready: ${successfulDates}/${HORIZON_DAYS} dates synced.`);
}

main().catch((error) => {
  console.error(`\nPPG HORIZON PRELOAD FAILED\n${compactError(error)}`);
  process.exit(1);
});
