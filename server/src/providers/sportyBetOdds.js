const BASE = (process.env.SPORTYBET_BASE_URL || "https://www.sportybet.com/api/gh/factsCenter").replace(/\/$/, "");
const MARKET = process.env.SPORTYBET_MARKET || "gh";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const CACHE_TTL_MS = 10 * 60 * 1000;
const EVENT_CONCURRENCY = 5;

const cache = new Map();

const LINE_KEYS = {
  "1.5": { over: "over-15", under: "under-15" },
  "2.5": { over: "over-25", under: "under-25" },
  "3.5": { over: "over-35", under: "under-35" }
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const NAME_ALIASES = {
  mancity: "manchestercity",
  manutd: "manchesterunited",
  manunited: "manchesterunited",
  manchesterutd: "manchesterunited",
  spurs: "tottenhamhotspur",
  tottenham: "tottenhamhotspur",
  psg: "parissaintgermain",
  inter: "intermilan",
  athleticbilbao: "athleticclub",
  wolverhampton: "wolves",
  wolverhamptonwanderers: "wolves",
  nottinghamforest: "nottforest",
  nottsforest: "nottforest"
};

export function normalizeTeamName(value) {
  const compact = String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/\b(fc|cf|sc|afc|ac|as|fk|nk|sk|cd|ud|rcd|rc|the|club)\b/g, " ")
    .replace(/[^a-z0-9]/g, "");
  return NAME_ALIASES[compact] || compact;
}

function bigrams(value) {
  const text = normalizeTeamName(value);
  const grams = new Set();
  for (let index = 0; index < text.length - 1; index += 1) {
    grams.add(text.slice(index, index + 2));
  }
  return grams;
}

export function nameSimilarity(left, right) {
  const a = normalizeTeamName(left);
  const b = normalizeTeamName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.92;
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let overlap = 0;
  for (const gram of A) {
    if (B.has(gram)) overlap += 1;
  }
  return (2 * overlap) / (A.size + B.size);
}

export function totalsFromSportyMarkets(markets = []) {
  const odds = {};
  for (const market of markets) {
    const id = String(market?.id || "");
    const label = String(market?.name || market?.desc || "");
    const isTotals = id === "18" || /^over\/under$/i.test(label);
    if (!isTotals) continue;
    const specifier = String(market?.specifier || "");
    const line = specifier.match(/total=([0-9.]+)/i)?.[1];
    const keys = LINE_KEYS[line];
    if (!keys) continue;
    for (const outcome of market.outcomes || []) {
      const desc = String(outcome?.desc || "").toLowerCase();
      const price = Number(outcome?.odds);
      if (!Number.isFinite(price) || price <= 1) continue;
      if (desc.startsWith("over")) odds[keys.over] = price;
      if (desc.startsWith("under")) odds[keys.under] = price;
    }
  }
  return odds;
}

async function sportyGet(path, params = {}) {
  const url = new URL(`${BASE}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent": USER_AGENT,
      Referer: `https://www.sportybet.com/${MARKET}/sport/football`,
      Origin: "https://www.sportybet.com"
    },
    signal: AbortSignal.timeout(20000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || Number(payload?.bizCode) !== 10000) {
    throw new Error(payload?.message || payload?.innerMsg || `SportyBet ${path} failed`);
  }
  return payload.data;
}

async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) || 0 }, run));
  return results;
}

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key, value) {
  cache.set(key, { at: Date.now(), value });
  return value;
}

export async function loadSportyBetCatalog() {
  const cached = cacheGet("catalog");
  if (cached) return cached;
  const sports = await sportyGet("sportList");
  const football = (sports || []).find((sport) => sport.id === "sr:sport:1") || (sports || [])[0];
  const tournaments = [];
  for (const category of football?.categories || []) {
    for (const tournament of category.tournaments || []) {
      tournaments.push({
        id: tournament.id,
        name: tournament.name,
        country: category.name,
        eventSize: tournament.eventSize
      });
    }
  }
  return cacheSet("catalog", tournaments);
}

function leagueNeedles(fixtures = []) {
  const needles = [];
  for (const fixture of fixtures) {
    const league = fixture.league || {};
    needles.push({
      country: normalizeTeamName(league.country),
      name: normalizeTeamName(league.name)
    });
  }
  return needles;
}

function tournamentMatchesLeague(tournament, needles) {
  const country = normalizeTeamName(tournament.country);
  const name = normalizeTeamName(tournament.name);
  return needles.some((needle) => {
    if (needle.country && country && needle.country !== country && !country.includes(needle.country) && !needle.country.includes(country)) {
      return false;
    }
    if (!needle.name || !name) return false;
    return name === needle.name || name.includes(needle.name) || needle.name.includes(name) || nameSimilarity(tournament.name, needle.name) >= 0.72;
  });
}

async function loadTournamentEvents(tournamentId) {
  const key = `tour:${tournamentId}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  try {
    const data = await sportyGet("commonThumbnailEvents", {
      tournamentId,
      sportId: "sr:sport:1",
      timeline: 168
    });
    const events = [];
    for (const row of data || []) {
      for (const event of row.events || []) {
        events.push({
          eventId: event.eventId,
          home: event.homeTeamName,
          away: event.awayTeamName,
          kickoff: Number(event.estimateStartTime) || null,
          tournament: row.name
        });
      }
    }
    return cacheSet(key, events);
  } catch {
    return cacheSet(key, []);
  }
}

async function loadEventTotals(eventId) {
  const key = `event:${eventId}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  try {
    const data = await sportyGet("event", { eventId, productId: 3 });
    return cacheSet(key, totalsFromSportyMarkets(data?.markets || []));
  } catch {
    try {
      const data = await sportyGet("event", { eventId });
      return cacheSet(key, totalsFromSportyMarkets(data?.markets || []));
    } catch {
      return cacheSet(key, {});
    }
  }
}

function kickoffClose(eventStamp, fixtureKickoff) {
  const event = Number(eventStamp);
  const fixture = Date.parse(fixtureKickoff || 0);
  if (!Number.isFinite(event) || event <= 0) return true;
  if (!Number.isFinite(fixture) || fixture <= 0) return true;
  return Math.abs(event - fixture) <= 48 * 3600 * 1000;
}

function bestSportyEvent(fixture, events) {
  const home = fixture.home?.name;
  const away = fixture.away?.name;
  let best = null;
  for (const event of events) {
    if (event.kickoff && !kickoffClose(event.kickoff, fixture.kickoff || fixture.fixture_date)) continue;
    const homeScore = nameSimilarity(home, event.home);
    const awayScore = nameSimilarity(away, event.away);
    if (homeScore < 0.62 || awayScore < 0.62) continue;
    const score = homeScore + awayScore;
    if (!best || score > best.score) best = { event, score };
  }
  return best?.event || null;
}

export async function loadSportyBetGoalOdds(fixtures = [], date) {
  const map = new Map();
  if (!fixtures.length) return map;
  let tournaments = [];
  try {
    tournaments = await loadSportyBetCatalog();
  } catch {
    return map;
  }
  const needles = leagueNeedles(fixtures);
  const wanted = tournaments.filter((tournament) => tournamentMatchesLeague(tournament, needles));
  const selected = wanted.length ? wanted : tournaments.slice(0, 40);
  const eventLists = await mapPool(selected, 6, async (tournament) => {
    const events = await loadTournamentEvents(tournament.id);
    await sleep(40);
    return events;
  });
  const events = eventLists.flat();
  const matched = [];
  for (const fixture of fixtures) {
    const event = bestSportyEvent(fixture, events);
    if (event) matched.push({ fixture, event });
  }
  const totals = await mapPool(matched, EVENT_CONCURRENCY, async ({ fixture, event }) => {
    const odds = await loadEventTotals(event.eventId);
    await sleep(30);
    return { fixture, event, odds };
  });
  for (const row of totals) {
    if (!row?.odds || !Object.keys(row.odds).length) continue;
    map.set(Number(row.fixture.id), {
      ...row.odds,
      source: "sportybet",
      book: "SportyBet",
      eventId: row.event.eventId
    });
  }
  return map;
}
