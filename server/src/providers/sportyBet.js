const DEFAULT_BASE = "https://www.sportybet.com/api/ng";
const PAGE_SIZE = 100;
const MAX_PAGES = 12;
const CACHE_TTL_MS = 6 * 60_000;
const KICKOFF_WINDOW_MS = 18 * 60 * 60 * 1000;

const cache = { loadedAt: 0, events: [] };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const NAME_ALIASES = {
  mancity: "manchestercity",
  manutd: "manchesterunited",
  manunited: "manchesterunited",
  spurs: "tottenhamhotspur",
  tottenham: "tottenhamhotspur",
  psg: "parissaintgermain",
  vaalerenga: "valerenga",
  valerengaif: "valerenga"
};

export function normalizeTeamName(value) {
  const compact = String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/\b(fc|cf|sc|afc|cfc|fk|if|bk|sk|ac|as|ss|ud|cd|rcd|rc|club|de|the|women|u17|u18|u19|u20|u21|u23|reserves)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
  return NAME_ALIASES[compact] || compact;
}

export function nameSimilarity(left, right) {
  const a = normalizeTeamName(left);
  const b = normalizeTeamName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.92;
  const grams = (value) => {
    const set = new Set();
    for (let i = 0; i < value.length - 1; i += 1) set.add(value.slice(i, i + 2));
    return set;
  };
  const A = grams(a);
  const B = grams(b);
  if (!A.size || !B.size) return 0;
  let overlap = 0;
  for (const gram of A) {
    if (B.has(gram)) overlap += 1;
  }
  return (2 * overlap) / (A.size + B.size);
}

function namesAlign(left, right) {
  return nameSimilarity(left, right) >= 0.62;
}

export function totalsFromSportyMarkets(markets = []) {
  return parseTotals({ markets });
}

function lineSuffix(specifier) {
  const line = String(specifier || "").match(/total=([0-9.]+)/i)?.[1];
  if (!line || !line.includes(".")) return null;
  return line.replace(".", "");
}

function writeOutcome(odds, prefix, specifier, outcome) {
  const suffix = lineSuffix(specifier);
  if (!suffix) return;
  const price = Number(outcome.odds);
  if (!Number.isFinite(price) || price <= 1) return;
  const over = String(outcome.id) === "12" || /^over/i.test(String(outcome.desc || ""));
  const key = `${prefix ? `${prefix}-` : ""}${over ? "over" : "under"}-${suffix}`;
  odds[key] = price;
}

function parseTotals(event) {
  const odds = {};
  for (const market of event.markets || []) {
    const id = String(market.id);
    if (id === "18") {
      for (const outcome of market.outcomes || []) writeOutcome(odds, "", market.specifier, outcome);
      continue;
    }
    if (id === "68") {
      for (const outcome of market.outcomes || []) writeOutcome(odds, "fh", market.specifier, outcome);
      continue;
    }
    if (id === "19") {
      for (const outcome of market.outcomes || []) writeOutcome(odds, "home", market.specifier, outcome);
      continue;
    }
    if (id === "20") {
      for (const outcome of market.outcomes || []) writeOutcome(odds, "away", market.specifier, outcome);
      continue;
    }
    if (id === "29") {
      for (const outcome of market.outcomes || []) {
        const price = Number(outcome.odds);
        if (!Number.isFinite(price) || price <= 1) continue;
        const desc = String(outcome.desc || "").toLowerCase();
        if (desc === "yes" || String(outcome.id) === "74") odds["btts-yes"] = price;
        if (desc === "no" || String(outcome.id) === "76") odds["btts-no"] = price;
      }
    }
  }
  return odds;
}

function eventKickoff(event) {
  const stamp = Number(event.estimateStartTime);
  return Number.isFinite(stamp) ? stamp : null;
}

export function sportyEventRecord(event, tournamentName = "") {
  const odds = parseTotals(event);
  return {
    eventId: event.eventId,
    tournament: tournamentName || event.sport?.category?.tournament?.name || null,
    country: event.sport?.category?.name || null,
    home: event.homeTeamName,
    away: event.awayTeamName,
    homeKey: normalizeTeamName(event.homeTeamName),
    awayKey: normalizeTeamName(event.awayTeamName),
    kickoffMs: eventKickoff(event),
    odds,
    url: event.eventId
      ? `https://www.sportybet.com/ng/sport/football/event/${encodeURIComponent(event.eventId)}`
      : "https://www.sportybet.com/ng/sport/football"
  };
}

function flatten(payload) {
  const records = [];
  for (const tournament of payload?.data?.tournaments || []) {
    for (const event of tournament.events || []) {
      records.push(sportyEventRecord(event, tournament.name));
    }
  }
  return records;
}

async function fetchPage(pageNum) {
  const base = (process.env.SPORTYBET_API_BASE || DEFAULT_BASE).replace(/\/$/, "");
  const operId = process.env.SPORTYBET_OPER_ID || "2";
  const url = `${base}/factsCenter/pcUpcomingEvents?sportId=sr:sport:1&marketId=18,29,68,19,20&pageSize=${PAGE_SIZE}&pageNum=${pageNum}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      OperId: String(operId),
      Platform: "web",
      Referer: "https://www.sportybet.com/ng/sport/football",
      Origin: "https://www.sportybet.com",
      "User-Agent": "Mozilla/5.0 BetsPapaGoalsBanker"
    },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) {
    throw new Error(`SportyBet page ${pageNum} failed (${response.status})`);
  }
  const payload = await response.json();
  if (Number(payload?.bizCode) !== 10000) {
    throw new Error(payload?.message || `SportyBet page ${pageNum} rejected`);
  }
  return flatten(payload);
}

export async function loadSportyBetEvents({ force = false } = {}) {
  if (!force && cache.events.length && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache.events;
  }
  const pages = [];
  for (let page = 1; page <= MAX_PAGES; page += 3) {
    const chunk = [page, page + 1, page + 2].filter((value) => value <= MAX_PAGES);
    const results = await Promise.allSettled(chunk.map((num) => fetchPage(num)));
    let empty = 0;
    for (const result of results) {
      if (result.status === "fulfilled" && result.value.length) {
        pages.push(...result.value);
      } else {
        empty += 1;
      }
    }
    if (empty === chunk.length) break;
    await sleep(80);
  }
  cache.events = pages;
  cache.loadedAt = Date.now();
  return cache.events;
}

export function matchSportyBetOdds(events, fixture) {
  const homeKey = normalizeTeamName(fixture.home?.name);
  const awayKey = normalizeTeamName(fixture.away?.name);
  const kickoff = new Date(fixture.kickoff || fixture.fixture_date || 0).getTime();
  let best = null;
  let bestScore = 0;
  for (const event of events) {
    const homeOk = namesAlign(homeKey, event.homeKey);
    const awayOk = namesAlign(awayKey, event.awayKey);
    const reversed = namesAlign(homeKey, event.awayKey) && namesAlign(awayKey, event.homeKey);
    if (!(homeOk && awayOk) && !reversed) continue;
    let score = homeOk && awayOk ? 80 : 50;
    if (Number.isFinite(kickoff) && Number.isFinite(event.kickoffMs)) {
      const delta = Math.abs(kickoff - event.kickoffMs);
      if (delta > KICKOFF_WINDOW_MS) continue;
      score += Math.max(0, 20 - delta / 3600000);
    }
    if (score > bestScore) {
      bestScore = score;
      best = event;
    }
  }
  if (!best) return null;
  return {
    source: "sportybet",
    eventId: best.eventId,
    url: best.url,
    home: best.home,
    away: best.away,
    odds: best.odds
  };
}
