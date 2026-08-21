import { apiFootballRequest } from "./apiFootball.js";

const LINE_KEYS = {
  "1.5": { over: "over-15", under: "under-15" },
  "2.5": { over: "over-25", under: "under-25" },
  "3.5": { over: "over-35", under: "under-35" }
};

export function totalsFromApiFootballBets(bookmakers = []) {
  const odds = {};
  for (const book of bookmakers) {
    for (const bet of book.bets || []) {
      const name = String(bet.name || "");
      if (!/over\s*\/\s*under|goals over\/under/i.test(name)) continue;
      for (const value of bet.values || []) {
        const label = String(value.value || "");
        const match = label.match(/^(over|under)\s+([0-9.]+)$/i);
        if (!match) continue;
        const keys = LINE_KEYS[match[2]];
        if (!keys) continue;
        const price = Number(value.odd ?? value.odds);
        if (!Number.isFinite(price) || price <= 1) continue;
        const key = match[1].toLowerCase() === "over" ? keys.over : keys.under;
        if (!odds[key]) odds[key] = price;
      }
    }
    if (Object.keys(odds).length) {
      return { ...odds, source: "api-football", book: book.name || "API-Football" };
    }
  }
  return null;
}

export async function loadApiFootballGoalOdds(date) {
  const map = new Map();
  try {
    const payload = await apiFootballRequest("/odds", { date, bet: 5 });
    for (const row of payload?.response || []) {
      const parsed = totalsFromApiFootballBets(row.bookmakers || []);
      const fixtureId = Number(row.fixture?.id);
      if (parsed && Number.isFinite(fixtureId)) map.set(fixtureId, parsed);
    }
  } catch {
    return map;
  }
  return map;
}
