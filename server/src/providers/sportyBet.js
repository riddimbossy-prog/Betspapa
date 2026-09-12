const DEFAULT_BASE = "https://www.sportybet.com/api/gh";
const PAGE_SIZE = 100;
const MAX_PAGES = 12;
const CACHE_TTL_MS = 6 * 60_000;
const KICKOFF_WINDOW_MS = 18 * 60 * 60 * 1000;

const cache = { loadedAt: 0, events: [] };
const eventDetailCache = new Map();

const SYNTHETIC_ID_RANGES = Object.freeze({
  fixture: { base: 1_000_000_000, span: 100_000_000 },
  league: { base: 1_200_000_000, span: 100_000_000 },
  team: { base: 1_400_000_000, span: 300_000_000 }
});

const FLASH_MARKET_NAMES = new Map([
  ["1st half result or match result", "first-half-or-match"],
  ["home team or over 2.5", "home-or-over-25"],
  ["home or over 2.5", "home-or-over-25"],
  ["home team or under 2.5", "home-or-under-25"],
  ["home or under 2.5", "home-or-under-25"],
  ["draw or over 2.5", "draw-or-over-25"],
  ["draw or under 2.5", "draw-or-under-25"],
  ["away team or over 2.5", "away-or-over-25"],
  ["away or over 2.5", "away-or-over-25"],
  ["away team or under 2.5", "away-or-under-25"],
  ["away or under 2.5", "away-or-under-25"],
  ["home team or gg", "home-or-gg"],
  ["home or gg", "home-or-gg"],
  ["home team or both teams to score", "home-or-gg"],
  ["draw or gg", "draw-or-gg"],
  ["draw or both teams to score", "draw-or-gg"],
  ["away team or gg", "away-or-gg"],
  ["away or gg", "away-or-gg"],
  ["away team or both teams to score", "away-or-gg"],
  ["home team or any clean sheet", "home-or-any-clean-sheet"],
  ["home or any clean sheet", "home-or-any-clean-sheet"],
  ["draw or any clean sheet", "draw-or-any-clean-sheet"],
  ["away team or any clean sheet", "away-or-any-clean-sheet"],
  ["away or any clean sheet", "away-or-any-clean-sheet"]
]);

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

function normaliseMarketLabel(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/both teams to score/g, "both teams to score")
    .trim();
}

/** Parse only exact, named SportyBet Flash markets. Unknown names fail closed. */
export function flashFromSportyMarkets(markets = []) {
  const odds = {};
  for (const market of markets || []) {
    const baseKey = FLASH_MARKET_NAMES.get(normaliseMarketLabel(market?.desc));
    if (!baseKey) continue;
    for (const outcome of market.outcomes || []) {
      if (outcome?.isActive === 0 || outcome?.isActive === false) continue;
      const price = Number(outcome?.odds);
      if (!Number.isFinite(price) || price <= 1) continue;
      const desc = normaliseMarketLabel(outcome?.desc);
      const id = String(outcome?.id || "");
      if (baseKey === "first-half-or-match") {
        if (desc === "home" || id === "1") odds["first-half-or-match-home"] = price;
        if (desc === "draw" || id === "2") odds["first-half-or-match-draw"] = price;
        if (desc === "away" || id === "3") odds["first-half-or-match-away"] = price;
        continue;
      }
      if (desc === "yes" || id === "74") odds[baseKey] = price;
      if (desc === "no" || id === "76") odds[`${baseKey}-no`] = price;
    }
  }
  return odds;
}

function compactOutcomeLabel(value) {
  return normaliseMarketLabel(value)
    .replace(/\s*(?:\/|\bor\b)\s*/g, "-")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9-]/g, "");
}

/** Parse the exact SportyBet 1X2 and totals prices used by Visa. */
export function visaFromSportyMarkets(markets = []) {
  const odds = totalsFromSportyMarkets(markets);
  for (const market of markets || []) {
    const label = normaliseMarketLabel(market?.desc);
    const isDoubleChance = label === "double chance";
    const isDrawNoBet = label === "draw no bet" || label === "draw no bet - regular time";
    if (!isDoubleChance && !isDrawNoBet) continue;

    for (const outcome of market.outcomes || []) {
      if (outcome?.isActive === 0 || outcome?.isActive === false) continue;
      const price = Number(outcome?.odds);
      if (!Number.isFinite(price) || price <= 1) continue;
      const outcomeLabel = compactOutcomeLabel(outcome?.desc);

      if (isDoubleChance) {
        if (["1x", "home-draw", "homeordraw"].includes(outcomeLabel)) {
          odds["home-or-draw"] = price;
        }
        if (["x2", "draw-away", "draworaway"].includes(outcomeLabel)) {
          odds["draw-or-away"] = price;
        }
        continue;
      }

      if (outcomeLabel === "home" || String(outcome?.id || "") === "1") {
        odds["home-dnb"] = price;
      }
      if (outcomeLabel === "away" || String(outcome?.id || "") === "3") {
        odds["away-dnb"] = price;
      }
    }
  }
  return odds;
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
  const odds = flashFromSportyMarkets(event.markets || []);
  for (const market of event.markets || []) {
    const id = String(market.id);
    if (id === "1") {
      for (const outcome of market.outcomes || []) {
        const price = Number(outcome.odds);
        if (!Number.isFinite(price) || price <= 1) continue;
        const desc = String(outcome.desc || "").toLowerCase();
        if (String(outcome.id) === "1" || desc === "home") odds.home = price;
        if (String(outcome.id) === "2" || desc === "draw") odds.draw = price;
        if (String(outcome.id) === "3" || desc === "away") odds.away = price;
      }
      continue;
    }
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
    if (id === "11") {
      for (const outcome of market.outcomes || []) {
        const price = Number(outcome.odds);
        if (!Number.isFinite(price) || price <= 1) continue;
        const desc = String(outcome.desc || "").toLowerCase();
        if (String(outcome.id) === "1" || desc === "home") odds["home-dnb"] = price;
        if (String(outcome.id) === "3" || desc === "away") odds["away-dnb"] = price;
      }
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

function stableSyntheticId(namespace, value) {
  const range = SYNTHETIC_ID_RANGES[namespace];
  if (!range) throw new Error(`Unknown SportyBet ID namespace: ${namespace}`);
  let hash = 2166136261;
  for (const character of String(value || "unknown")) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return -(range.base + (hash % range.span));
}

function seasonForKickoff(kickoffMs) {
  const kickoff = new Date(kickoffMs);
  const year = kickoff.getUTCFullYear();
  return kickoff.getUTCMonth() >= 6 ? year : year - 1;
}

export function sportyEventRecord(event, tournamentName = "") {
  const odds = parseTotals(event);
  const tournament = event.sport?.category?.tournament || {};
  return {
    eventId: event.eventId,
    tournamentId: tournament.id || event.tournamentId || null,
    tournament: tournamentName || tournament.name || null,
    country: event.sport?.category?.name || null,
    homeTeamId: event.homeTeamId || event.homeTeam?.id || null,
    awayTeamId: event.awayTeamId || event.awayTeam?.id || null,
    home: event.homeTeamName,
    away: event.awayTeamName,
    homeKey: normalizeTeamName(event.homeTeamName),
    awayKey: normalizeTeamName(event.awayTeamName),
    kickoffMs: eventKickoff(event),
    odds,
    url: event.eventId
      ? `https://www.sportybet.com/gh/sport/football/event/${encodeURIComponent(event.eventId)}`
      : "https://www.sportybet.com/gh/sport/football"
  };
}

/** Convert SportyBet's upcoming catalogue into the provider shape used by syncService. */
export function sportyBetProviderFixtures(events = [], date) {
  const records = new Map();
  for (const event of events || []) {
    if (!event?.eventId || !event?.home || !event?.away || !Number.isFinite(event?.kickoffMs)) continue;
    const kickoff = new Date(event.kickoffMs);
    if (Number.isNaN(kickoff.getTime()) || kickoff.toISOString().slice(0, 10) !== date) continue;

    const leagueIdentity = event.tournamentId || `${event.country || ""}:${event.tournament || "Unknown League"}`;
    const homeIdentity = event.homeTeamId || `${event.country || ""}:${normalizeTeamName(event.home)}`;
    const awayIdentity = event.awayTeamId || `${event.country || ""}:${normalizeTeamName(event.away)}`;
    const season = seasonForKickoff(event.kickoffMs);
    records.set(String(event.eventId), {
      source: "sportybet",
      sportyBetEventId: String(event.eventId),
      fixture: {
        id: stableSyntheticId("fixture", event.eventId),
        date: kickoff.toISOString(),
        status: { short: "NS" },
        venue: { name: null }
      },
      league: {
        id: stableSyntheticId("league", leagueIdentity),
        name: event.tournament || "Unknown League",
        country: event.country || null,
        season,
        logo: null,
        // Explicit names such as Cup and Friendly are still rejected by the
        // competition policy. Ordinary SportyBet tournaments are league play.
        type: "League"
      },
      teams: {
        home: {
          id: stableSyntheticId("team", homeIdentity),
          name: event.home,
          logo: null
        },
        away: {
          id: stableSyntheticId("team", awayIdentity),
          name: event.away,
          logo: null
        }
      },
      goals: { home: null, away: null },
      score: {
        halftime: { home: null, away: null },
        fulltime: { home: null, away: null }
      }
    });
  }
  return [...records.values()];
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
  const operId = process.env.SPORTYBET_OPER_ID || "3";
  // The compact feed discovers events through stable core markets. Flash then
  // reads the full event market list and matches exact names, never guessed IDs.
  const url = `${base}/factsCenter/pcUpcomingEvents?sportId=sr:sport:1&marketId=1,18,29,11,68,19,20&pageSize=${PAGE_SIZE}&pageNum=${pageNum}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      OperId: String(operId),
      Platform: "web",
      Referer: "https://www.sportybet.com/gh/sport/football",
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

export async function loadSportyBetEventMarkets(eventId, { force = false } = {}) {
  const key = String(eventId || "");
  if (!key) return [];
  const cached = eventDetailCache.get(key);
  if (!force && cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.markets;

  const base = (process.env.SPORTYBET_API_BASE || DEFAULT_BASE).replace(/\/$/, "");
  const operId = process.env.SPORTYBET_OPER_ID || "3";
  const url = `${base}/factsCenter/event?productId=3&eventId=${encodeURIComponent(key)}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      OperId: String(operId),
      Platform: "web",
      Referer: "https://www.sportybet.com/gh/sport/football",
      Origin: "https://www.sportybet.com",
      "User-Agent": "Mozilla/5.0 BetsPapaFlash"
    },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`SportyBet event detail failed (${response.status})`);
  const payload = await response.json();
  if (Number(payload?.bizCode) !== 10000) {
    throw new Error(payload?.message || "SportyBet event detail was rejected");
  }
  const markets = payload?.data?.markets || payload?.data?.event?.markets || [];
  eventDetailCache.set(key, { loadedAt: Date.now(), markets });
  return markets;
}

export async function loadSportyBetEvents({ force = false } = {}) {
  if (!force && cache.events.length && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache.events;
  }
  const pages = [];
  let successfulPages = 0;
  let failedPages = 0;
  for (let page = 1; page <= MAX_PAGES; page += 3) {
    const chunk = [page, page + 1, page + 2].filter((value) => value <= MAX_PAGES);
    const results = await Promise.allSettled(chunk.map((num) => fetchPage(num)));
    let empty = 0;
    for (const result of results) {
      if (result.status === "fulfilled") {
        successfulPages += 1;
        if (result.value.length) pages.push(...result.value);
      } else {
        failedPages += 1;
        empty += 1;
      }
    }
    if (empty === chunk.length) break;
    await sleep(80);
  }
  if (!successfulPages && failedPages) {
    throw new Error("SportyBet upcoming catalogue is unavailable");
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
