#!/usr/bin/env node

const API_BASE = String(
  process.env.BETSPAPA_API_BASE || "https://api.betspapa.com"
).replace(/\/+$/, "");
const ADMIN_SECRET = String(process.env.ADMIN_SYNC_SECRET || "").trim();

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

async function request(path, body) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-admin-secret": ADMIN_SECRET
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const text = await response.text();
      const payload = text ? JSON.parse(text) : {};
      if (!response.ok) {
        throw new Error(payload.message || payload.error || `${response.status}`);
      }
      return payload;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 2500));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function refreshAndSettle(date) {
  const payload = await request("/api/admin/settle-date", { date });
  console.log(
    `${date}: imported ${payload.synced?.imported || 0}, ` +
    `finished ${payload.graded?.finishedFixtures || 0}, ` +
    `settled ${payload.graded?.graded || 0}`
  );
}

const today = isoDate(new Date());
const yesterday = addDays(today, -1);

console.log(`BetsPapa live settlement through ${API_BASE}`);
await refreshAndSettle(yesterday);
await refreshAndSettle(today);
console.log("Live status and settlement refresh complete.");
