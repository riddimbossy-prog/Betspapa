const SITE = "https://www.betexplorer.com";
const CACHE_TTL_MS = 4 * 6e4;
const END = 800;
const cache = { loadedAt: 0, fixtures: [] };
function headers() {
  return {
    Accept: "text/html, */*; q=0.01",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: `${SITE}/`,
    Origin: SITE,
    "X-Requested-With": "XMLHttpRequest",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
  };
}
function num(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 1 ? n : 0;
}
function parseDt(raw) {
  const parts = String(raw || "").split(",").map((x) => Number(x));
  if (parts.length < 5 || parts.some((n) => !Number.isFinite(n))) return null;
  const [day, month, year, hour, minute] = parts;
  const iso = new Date(Date.UTC(year, month - 1, day, hour, minute)).toISOString();
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}
function decode(html) {
  return html.replace(/&/g, "&").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/"/g, '"').trim();
}
function oddsFromBlock(block, market) {
  const prices = [...block.matchAll(/data-odd="([0-9.]+)"/g)].map((m) => num(m[1]));
  const lineRaw = block.match(/table-main__oddOU"[^>]*>\s*([0-9.]+)/)?.[1];
  const line = Number(lineRaw);
  if (market === "1x2") {
    return { home: prices[0] || 0, draw: prices[1] || 0, away: prices[2] || 0 };
  }
  if (market === "dc") {
    return { dc1x: prices[0] || 0, dc12: prices[1] || 0, dcx2: prices[2] || 0 };
  }
  if (market === "ou") {
    return { over: prices[0] || 0, under: prices[1] || 0, ouLine: Number.isFinite(line) ? line : 2.5 };
  }
  return { bttsYes: prices[0] || 0, bttsNo: prices[1] || 0 };
}
function parseBetExplorerHtml(html, market) {
  const fixtures = [];
  const lists = html.split(/<ul class="leagues-list/);
  for (const list of lists.slice(1)) {
    const countryAttr = list.match(/data-country="([^"]+)"/)?.[1] || "";
    const chunks = list.split(/data-league-name="/);
    let country = countryAttr;
    let league = "";
    for (const chunk of chunks) {
      const leagueHit = chunk.match(/^([^"]+)"[\s\S]*?data-country-name="([^"]+)"/);
      if (leagueHit) {
        league = decode(leagueHit[1]);
        country = decode(leagueHit[2] || countryAttr);
      }
      const events = chunk.split(/data-event-id="/).slice(1);
      for (const event of events) {
        const id = event.match(/^([^"]+)"/)?.[1];
        if (!id) continue;
        const dt = event.match(/data-dt="([^"]+)"/)?.[1] || "";
        const kickoff = parseDt(dt);
        if (!kickoff) continue;
        if (Date.parse(kickoff) < Date.now() - 2 * 60 * 60 * 1e3) continue;
        const home = decode(event.match(/table-main__participantHome[\s\S]*?<p[^>]*>\s*([^<]+)/)?.[1] || "");
        const away = decode(event.match(/table-main__participantAway[\s\S]*?<p[^>]*>\s*([^<]+)/)?.[1] || "");
        const href = event.match(/href="(\/football\/[^"]+\/)"/)?.[1] || "";
        if (!home || !away) continue;
        const close = event.indexOf("</ul>");
        const sliced = event.slice(0, close === -1 ? 4e3 : close + 5);
        const odds = oddsFromBlock(sliced, market);
        fixtures.push({
          id,
          home,
          away,
          country,
          league,
          kickoff,
          url: href ? `${SITE}${href}` : SITE,
          odds: {
            home: 0,
            draw: 0,
            away: 0,
            dc1x: 0,
            dc12: 0,
            dcx2: 0,
            bttsYes: 0,
            bttsNo: 0,
            ...odds
          }
        });
      }
    }
  }
  return fixtures;
}
function merge(base, incoming) {
  for (const row of incoming) {
    const prev = base.get(row.id);
    if (!prev) {
      base.set(row.id, row);
      continue;
    }
    prev.odds = { ...prev.odds, ...pickDefined(row.odds) };
    if (row.league && !prev.league) prev.league = row.league;
    if (row.country && !prev.country) prev.country = row.country;
    if (row.url && row.url !== SITE) prev.url = row.url;
  }
}
function pickDefined(odds) {
  const out = {};
  for (const [key, value] of Object.entries(odds)) {
    if (typeof value === "number" && (key === "ouLine" ? value > 0 : value > 1)) {
      out[key] = value;
    }
  }
  return out;
}
function dateParts(iso) {
  const [year, month, day] = iso.split("-");
  return { year, month: String(Number(month)), day: String(Number(day)) };
}
async function fetchMarket(betType, date) {
  const parts = date ? dateParts(date) : null;
  const query = new URLSearchParams({
    tab: "all",
    betType,
    lang: "en",
    tz: "+0:00",
    start: "0",
    end: String(END)
  });
  if (parts) {
    query.set("year", parts.year);
    query.set("month", parts.month);
    query.set("day", parts.day);
  }
  const url = `${SITE}/gres/ajax/homepage-data.php?${query.toString()}`;
  const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(25e3) });
  if (!res.ok) throw new Error(`BetExplorer ${betType} failed (${res.status})`);
  const html = await res.text();
  return parseBetExplorerHtml(html, betType);
}
function utcDateOffset(days) {
  const d = /* @__PURE__ */ new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days)).toISOString().slice(0, 10);
}
async function loadBetExplorerFixtures({ force = false, days = 2 } = {}) {
  if (!force && cache.fixtures.length && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache.fixtures;
  }
  const markets = ["1x2", "ou", "dc", "bts"];
  const jobs = markets.map((m) => fetchMarket(m).catch(() => []));
  if (days > 1) {
    const tomorrow = utcDateOffset(1);
    for (const m of markets) jobs.push(fetchMarket(m, tomorrow).catch(() => []));
  }
  const chunks = await Promise.all(jobs);
  const map = /* @__PURE__ */ new Map();
  for (const chunk of chunks) merge(map, chunk);
  const fixtures = [...map.values()].filter((row) => row.odds.home > 1 && row.odds.draw > 1 && row.odds.away > 1);
  cache.fixtures = fixtures;
  cache.loadedAt = Date.now();
  return fixtures;
}
export {
  loadBetExplorerFixtures,
  parseBetExplorerHtml
};
