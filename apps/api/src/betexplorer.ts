import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';
import type { UpcomingFixture, UpcomingOdds } from './forecast-types.js';

const BASE_URL = process.env.BETEXPLORER_BASE_URL?.trim() || 'https://www.betexplorer.com';
const DEFAULT_TEMPLATE = `${BASE_URL}/football/?year={YYYY}&month={MM}&day={DD}`;
const DEFAULT_FALLBACK_TEMPLATES = [
  `${BASE_URL}/next/soccer/?year={YYYY}&month={MM}&day={DD}`,
  `${BASE_URL}/?year={YYYY}&month={MM}&day={DD}`
];
const DEFAULT_DISCOVERY_URLS = [
  `${BASE_URL}/football/`,
  `${BASE_URL}/next/soccer/`
];

export type BetExplorerPageReport = {
  date: string;
  requestedUrl: string;
  finalUrl: string;
  status: number;
  fixtures: number;
  fixturesWith1X2?: number;
  tableFixtures?: number;
  jsonFixtures?: number;
  bodyBytes?: number;
  title?: string;
  rowCandidates?: number;
  jsonCandidates?: number;
  redirected?: boolean;
  interstitial?: boolean;
  error?: string;
};

export type BetExplorerSyncReport = {
  provider: 'betexplorer';
  enabled: boolean;
  requestedPages: number;
  parsedFixtures: number;
  fixturesWith1X2: number;
  pages: BetExplorerPageReport[];
  warnings: string[];
};

type ParsedPage = {
  fixtures: UpcomingFixture[];
  tableFixtures: number;
  jsonFixtures: number;
};

const cleanText = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(fc|cf|sc|afc|club|the)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function configuredEnabled() {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env.BETEXPLORER_ENABLED ?? '').toLowerCase());
}

function dayParts(date: string) {
  const [year, month, day] = date.split('-');
  return { year, month, day };
}

function renderTemplate(template: string, date: string) {
  const { year, month, day } = dayParts(date);
  return template
    .replaceAll('{DATE}', date)
    .replaceAll('{YYYY}', year)
    .replaceAll('{MM}', month)
    .replaceAll('{DD}', day);
}

function splitConfig(value: string | undefined) {
  return String(value || '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);
}

function fixtureTemplates() {
  const primary = process.env.BETEXPLORER_FIXTURE_URL_TEMPLATE?.trim() || DEFAULT_TEMPLATE;
  const configuredFallbacks = splitConfig(process.env.BETEXPLORER_FALLBACK_URL_TEMPLATES);
  return [...new Set([primary, ...configuredFallbacks, ...DEFAULT_FALLBACK_TEMPLATES])];
}

function discoveryUrls() {
  const configured = splitConfig(process.env.BETEXPLORER_DISCOVERY_URLS);
  return [...new Set(configured.length ? configured : DEFAULT_DISCOVERY_URLS)];
}

function assertAllowedUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:') throw new Error('BetExplorer collector only allows HTTPS.');
  if (!(url.hostname === 'betexplorer.com' || url.hostname.endsWith('.betexplorer.com'))) {
    throw new Error(`BetExplorer collector refused unexpected host: ${url.hostname}`);
  }
  return url.toString();
}

async function fetchHtml(rawUrl: string) {
  const url = assertAllowedUrl(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.BETEXPLORER_TIMEOUT_MS || 25000));
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        accept: 'text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.5',
        'accept-language': 'en-GB,en;q=0.9',
        'cache-control': 'no-cache',
        pragma: 'no-cache',
        referer: `${BASE_URL}/football/`,
        'user-agent': process.env.BETEXPLORER_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!body || body.length < 500) throw new Error('Response did not contain a usable HTML page.');
    return { status: response.status, body, url: response.url || url };
  } finally {
    clearTimeout(timeout);
  }
}

function parseOdd(value: unknown) {
  const normalized = cleanText(value).replace(',', '.').replace(/[^0-9.]/g, '');
  if (!/^\d{1,3}(?:\.\d{1,3})?$/.test(normalized)) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 1.001 && parsed < 1000 ? Number(parsed.toFixed(3)) : undefined;
}

function stableNegativeId(value: string) {
  const hex = createHash('sha1').update(value).digest('hex').slice(0, 12);
  const numeric = Number.parseInt(hex, 16) % 8_000_000_000_000;
  return -(numeric || 1);
}

function stableFixtureId(value: string) {
  return createHash('sha1').update(`betexplorer|${value}`).digest('hex').slice(0, 20);
}

function leagueCode(country: string, league: string) {
  return `be-${createHash('sha1').update(`${country}|${league}`).digest('hex').slice(0, 10)}`;
}

function seasonFor(date: string) {
  const forced = process.env.BETEXPLORER_SEASON?.trim();
  if (forced) return forced;
  const [year, month] = date.split('-').map(Number);
  if (month >= 7) return `${year}-${String(year + 1).slice(-2)}`;
  return `${year - 1}-${String(year).slice(-2)}`;
}

function kickoffIso(date: string, time: string) {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  const hours = match ? Number(match[1]) : 12;
  const minutes = match ? Number(match[2]) : 0;
  const offsetMinutes = Number(process.env.BETEXPLORER_UTC_OFFSET_MINUTES || 0);
  const utc = new Date(`${date}T00:00:00.000Z`);
  utc.setUTCMinutes(hours * 60 + minutes - offsetMinutes);
  return utc.toISOString();
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function parseDateText(value: string, fallbackDate: string) {
  const text = cleanText(value);
  if (!text) return undefined;
  const iso = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const european = text.match(/\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/);
  if (european) return `${european[3]}-${european[2].padStart(2, '0')}-${european[1].padStart(2, '0')}`;
  if (/\btoday\b/i.test(text)) return fallbackDate;
  if (/\btomorrow\b/i.test(text)) return addDays(fallbackDate, 1);
  const timestamp = text.match(/\b(1\d{9}|1\d{12})\b/);
  if (timestamp) {
    const raw = Number(timestamp[1]);
    const date = new Date(timestamp[1].length === 10 ? raw * 1000 : raw);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  return undefined;
}

function rowDate($: cheerio.CheerioAPI, row: cheerio.Cheerio<any>, fallbackDate: string) {
  const values = [
    row.attr('data-date'),
    row.attr('data-dt'),
    row.attr('data-start'),
    row.attr('datetime'),
    row.find('time').first().attr('datetime'),
    row.find('[data-date]').first().attr('data-date'),
    row.find('[data-dt]').first().attr('data-dt')
  ].filter(Boolean).map(cleanText);
  for (const value of values) {
    const parsed = parseDateText(value, fallbackDate);
    if (parsed) return parsed;
  }
  const heading = cleanText(row.prevAll('[class*="date"], .table-main__heading, h2, h3, h4').first().text());
  return parseDateText(heading, fallbackDate) || fallbackDate;
}

function splitLeagueTitle(raw: string) {
  const title = cleanText(raw)
    .replace(/\s+odds.*$/i, '')
    .replace(/\s+fixtures.*$/i, '')
    .replace(/\s+results.*$/i, '');
  const split = title.split(/\s*[:|]\s*/, 2);
  if (split.length === 2) return { country: split[0], league: split[1] };
  const dashSplit = title.split(/\s+[–—-]\s+/, 2);
  if (dashSplit.length === 2 && dashSplit[0].length < 35) return { country: dashSplit[0], league: dashSplit[1] };
  return { country: '', league: title || 'Unknown league' };
}

function findSectionTitle($: cheerio.CheerioAPI, row: cheerio.Cheerio<any>) {
  const directLeague = cleanText(row.attr('data-league') || row.attr('data-competition') || row.attr('data-tournament'));
  const directCountry = cleanText(row.attr('data-country'));
  if (directLeague && directCountry) return `${directCountry}: ${directLeague}`;
  if (directLeague) return directLeague;
  if (directCountry) return directCountry;

  const section = row.closest('.wrap-section, .league, .competition, .tournament, section, [data-league]');
  const sectionHeading = cleanText(section.find('.wrap-section__header__title, .league-name, .competition-name, .tournament-name, [class*="league"], h2, h3, h4').first().text());
  if (sectionHeading) return sectionHeading;

  const table = row.closest('table');
  const beforeTable = cleanText(table.prevAll('.wrap-section__header, .league-name, .competition-name, .tournament-name, h2, h3, h4').first().text());
  if (beforeTable) return beforeTable;

  const previousHeading = cleanText(row.prevAll('.league-name, .competition-name, .tournament-name, .table-main__heading, h2, h3, h4').first().text());
  return previousHeading || 'Unknown league';
}

function parseTeams($: cheerio.CheerioAPI, row: cheerio.Cheerio<any>) {
  const explicitHome = cleanText(row.find('.participant-home, .team-home, [data-home-team], [class*="home-team"]').first().text() || row.attr('data-home-team'));
  const explicitAway = cleanText(row.find('.participant-away, .team-away, [data-away-team], [class*="away-team"]').first().text() || row.attr('data-away-team'));
  if (explicitHome && explicitAway) return { homeTeam: explicitHome, awayTeam: explicitAway };

  const combinedSelectors = [
    '.in-match',
    '.table-main__participant',
    '.match-link',
    '.event__participant',
    '.match-name',
    '[data-testid="match-participants"]',
    'a[href*="/match/"]'
  ];
  for (const selector of combinedSelectors) {
    const text = cleanText(row.find(selector).first().text());
    if (!text) continue;
    const noScore = text.replace(/\b\d+\s*[:–-]\s*\d+\b/g, '');
    const parts = noScore.split(/\s+(?:-|–|—|vs\.?|v)\s+/i).map(cleanText).filter(Boolean);
    if (parts.length >= 2) return { homeTeam: parts[0], awayTeam: parts[1] };
  }

  const candidates: string[] = [];
  const seen = new Set<string>();
  row.find('.participant-home, .participant-away, .team-home, .team-away, .table-main__participant a, .in-match a, [class*="participant"] a, a[href*="/soccer/"]').each((_index: number, node: any) => {
    const value = cleanText($(node).text());
    const key = normalizeName(value);
    if (!value || value.length < 2 || !key || seen.has(key)) return;
    if (/^(odds|preview|details|stats|h2h|1|x|2|today|tomorrow)$/i.test(value)) return;
    if (/^\d+(?:[.,]\d+)?$/.test(value)) return;
    seen.add(key);
    candidates.push(value);
  });
  return candidates.length >= 2 ? { homeTeam: candidates[0], awayTeam: candidates[1] } : null;
}

function parseTime($: cheerio.CheerioAPI, row: cheerio.Cheerio<any>) {
  const attributes = [
    row.attr('data-time'),
    row.attr('data-dt'),
    row.attr('data-date'),
    row.attr('data-start'),
    row.find('time').first().attr('datetime')
  ].filter(Boolean).map(cleanText);
  for (const value of attributes) {
    const match = value.match(/(?:T|\s)(\d{1,2}:\d{2})/);
    if (match) return match[1];
    if (/^\d{1,2}:\d{2}$/.test(value)) return value;
  }
  const text = cleanText(row.find('.table-main__time, .time, [class*="time"], td.h-text-right').first().text());
  const match = text.match(/\b(\d{1,2}:\d{2})\b/);
  return match?.[1] || '12:00';
}

function parseMatchUrl($: cheerio.CheerioAPI, row: cheerio.Cheerio<any>, pageUrl: string) {
  const href = row.find('a[href*="/match/"], .in-match a, .table-main__participant a, a[href*="/soccer/"]').first().attr('href');
  if (!href) return undefined;
  try {
    return new URL(href, pageUrl || BASE_URL).toString();
  } catch {
    return undefined;
  }
}

function parseOdds($: cheerio.CheerioAPI, row: cheerio.Cheerio<any>) {
  const values: number[] = [];
  const pushOdd = (candidate: unknown) => {
    const odd = parseOdd(candidate);
    if (!odd || values.includes(odd)) return;
    values.push(odd);
  };

  row.find('[data-odd], [data-odds], [data-value][class*="odd"], .table-main__odds, td[class*="odds"], td[class*="odd"], .odds, [data-testid*="odd"]').each((_index: number, node: any) => {
    const element = $(node);
    pushOdd(element.attr('data-odd') || element.attr('data-odds') || element.attr('data-value') || element.text());
  });

  if (values.length < 3) {
    row.find('td, [role="cell"]').each((_index: number, node: any) => {
      const element = $(node);
      const className = cleanText(element.attr('class'));
      const text = cleanText(element.text());
      if (/time|date|participant|team|score|round/i.test(className)) return;
      if (/^\d{1,3}[.,]\d{1,3}$/.test(text)) pushOdd(text);
    });
  }

  const odds: UpcomingOdds = {};
  if (values[0]) odds.home = values[0];
  if (values[1]) odds.draw = values[1];
  if (values[2]) odds.away = values[2];
  return odds;
}

function makeFixture(input: {
  date: string;
  time?: string;
  homeTeam: string;
  awayTeam: string;
  country?: string;
  league?: string;
  matchUrl?: string;
  pageUrl: string;
  sourceIdentity: string;
  odds?: UpcomingOdds;
  raw?: unknown;
}) {
  const country = cleanText(input.country);
  const league = cleanText(input.league) || 'Unknown league';
  const odds = input.odds || {};
  const time = input.time || '12:00';
  const sourceIdentity = input.sourceIdentity || `${input.date}|${league}|${input.homeTeam}|${input.awayTeam}`;
  return {
    id: stableFixtureId(sourceIdentity),
    providerFixtureId: stableNegativeId(sourceIdentity),
    provider: 'betexplorer' as const,
    providerUrl: input.matchUrl || input.pageUrl,
    oddsSource: 'betexplorer',
    dataQuality: Object.keys(odds).length >= 3 ? 80 : 55,
    leagueId: Math.abs(stableNegativeId(`league|${country}|${league}`)) % 2_000_000_000,
    leagueCode: leagueCode(country, league),
    leagueName: league,
    country,
    season: seasonFor(input.date),
    kickoff: kickoffIso(input.date, time),
    date: input.date,
    status: 'NS',
    homeTeam: cleanText(input.homeTeam),
    awayTeam: cleanText(input.awayTeam),
    odds,
    rawOdds: input.raw || {
      provider: 'betexplorer',
      pageUrl: input.pageUrl,
      matchUrl: input.matchUrl,
      listingOddsOnly: true
    },
    updatedAt: new Date().toISOString()
  } satisfies UpcomingFixture;
}

function parseTableFixtures(html: string, fallbackDate: string, pageUrl: string) {
  const $ = cheerio.load(html);
  const selectors = [
    'tr.table-main__row',
    'tr[data-def]',
    'tr[data-event-id]',
    'tr[data-dt]',
    '.table-main__row[data-def]',
    '[data-testid="match-row"]',
    '[class*="match-row"]',
    '[class*="event-row"]'
  ];
  const nodes = $(selectors.join(',')).toArray();
  const fixtures: UpcomingFixture[] = [];
  const duplicateGuard = new Set<string>();

  for (const node of nodes) {
    const row = $(node);
    if (row.hasClass('table-main__row--head') || row.find('th').length) continue;
    const teams = parseTeams($, row);
    if (!teams) continue;
    const date = rowDate($, row, fallbackDate);
    const time = parseTime($, row);
    const title = findSectionTitle($, row);
    const { country, league } = splitLeagueTitle(title);
    const matchUrl = parseMatchUrl($, row, pageUrl);
    const sourceIdentity = cleanText(row.attr('data-def') || row.attr('data-event-id') || row.attr('id') || matchUrl || `${date}|${league}|${teams.homeTeam}|${teams.awayTeam}`);
    const dedupeKey = `${date}|${normalizeName(teams.homeTeam)}|${normalizeName(teams.awayTeam)}`;
    if (duplicateGuard.has(dedupeKey)) continue;
    duplicateGuard.add(dedupeKey);
    fixtures.push(makeFixture({
      date,
      time,
      homeTeam: teams.homeTeam,
      awayTeam: teams.awayTeam,
      country,
      league,
      matchUrl,
      pageUrl,
      sourceIdentity,
      odds: parseOdds($, row)
    }));
  }
  return fixtures;
}

function objectName(value: any): string | undefined {
  if (typeof value === 'string') return cleanText(value);
  if (value && typeof value === 'object') {
    const candidate = value.name || value.title || value.shortName || value.displayName || value.label;
    if (typeof candidate === 'string') return cleanText(candidate);
  }
  return undefined;
}

function numberFrom(value: any) {
  if (typeof value === 'number') return parseOdd(value);
  if (typeof value === 'string') return parseOdd(value);
  if (value && typeof value === 'object') return parseOdd(value.value ?? value.odds ?? value.decimal ?? value.price);
  return undefined;
}

function extractOddsFromObject(node: any): UpcomingOdds {
  const odds: UpcomingOdds = {};
  const source = node?.odds || node?.prices || node?.market || node?.markets || node?.bookmakerOdds || node;
  if (!source || typeof source !== 'object') return odds;

  const directHome = numberFrom(source.home ?? source.homeWin ?? source['1']);
  const directDraw = numberFrom(source.draw ?? source['x'] ?? source['X']);
  const directAway = numberFrom(source.away ?? source.awayWin ?? source['2']);
  if (directHome) odds.home = directHome;
  if (directDraw) odds.draw = directDraw;
  if (directAway) odds.away = directAway;

  if (Array.isArray(source)) {
    for (const item of source) {
      const name = cleanText(item?.name ?? item?.label ?? item?.outcome ?? item?.selection).toLowerCase();
      const value = numberFrom(item);
      if (!value) continue;
      if (/^(1|home|home win)$/.test(name)) odds.home = value;
      else if (/^(x|draw)$/.test(name)) odds.draw = value;
      else if (/^(2|away|away win)$/.test(name)) odds.away = value;
    }
  }
  return odds;
}

function dateTimeFromObject(node: any, fallbackDate: string) {
  const raw = node?.startDate ?? node?.startTime ?? node?.kickoff ?? node?.date ?? node?.scheduled ?? node?.eventTime ?? node?.timestamp;
  if (typeof raw === 'number') {
    const date = new Date(raw < 10_000_000_000 ? raw * 1000 : raw);
    if (!Number.isNaN(date.getTime())) return { date: date.toISOString().slice(0, 10), time: date.toISOString().slice(11, 16) };
  }
  if (typeof raw === 'string') {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime()) && /20\d{2}/.test(raw)) return { date: parsed.toISOString().slice(0, 10), time: parsed.toISOString().slice(11, 16) };
    return { date: parseDateText(raw, fallbackDate) || fallbackDate, time: raw.match(/\b\d{1,2}:\d{2}\b/)?.[0] || '12:00' };
  }
  return { date: fallbackDate, time: '12:00' };
}

function eventFromObject(node: any, fallbackDate: string, pageUrl: string): UpcomingFixture | null {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return null;
  const home = objectName(node.homeTeam ?? node.home ?? node.participantHome ?? node.homeParticipant ?? node.team1);
  const away = objectName(node.awayTeam ?? node.away ?? node.participantAway ?? node.awayParticipant ?? node.team2);
  if (!home || !away || normalizeName(home) === normalizeName(away)) return null;
  const { date, time } = dateTimeFromObject(node, fallbackDate);
  const competition = objectName(node.league ?? node.competition ?? node.tournament ?? node.sportEvent?.tournament) || 'Unknown league';
  const country = objectName(node.country ?? node.category ?? node.region ?? node.league?.country ?? node.competition?.country) || '';
  const matchUrlRaw = node.url ?? node.href ?? node.link;
  let matchUrl: string | undefined;
  try {
    if (typeof matchUrlRaw === 'string') matchUrl = new URL(matchUrlRaw, pageUrl).toString();
  } catch {
    matchUrl = undefined;
  }
  const sourceIdentity = cleanText(node.id ?? node.eventId ?? node.matchId ?? node.uid ?? matchUrl ?? `${date}|${competition}|${home}|${away}`);
  return makeFixture({
    date,
    time,
    homeTeam: home,
    awayTeam: away,
    country,
    league: competition,
    matchUrl,
    pageUrl,
    sourceIdentity,
    odds: extractOddsFromObject(node),
    raw: { provider: 'betexplorer', embeddedJson: true, pageUrl, matchUrl }
  });
}

function walkJson(value: any, visitor: (value: any) => void, seen = new Set<any>(), depth = 0) {
  if (!value || typeof value !== 'object' || depth > 12 || seen.has(value)) return;
  seen.add(value);
  visitor(value);
  if (Array.isArray(value)) {
    for (const item of value) walkJson(item, visitor, seen, depth + 1);
  } else {
    for (const item of Object.values(value)) walkJson(item, visitor, seen, depth + 1);
  }
}

function parseJsonFixtures(html: string, fallbackDate: string, pageUrl: string) {
  const $ = cheerio.load(html);
  const fixtures: UpcomingFixture[] = [];
  const duplicateGuard = new Set<string>();
  const scripts = $('script[type="application/ld+json"], script[type="application/json"], script#__NEXT_DATA__, script[data-hid="__NUXT_DATA__"]').toArray();

  for (const script of scripts) {
    const text = $(script).html()?.trim();
    if (!text || text.length < 2) continue;
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }
    walkJson(parsed, (node) => {
      const fixture = eventFromObject(node, fallbackDate, pageUrl);
      if (!fixture) return;
      const key = `${fixture.date}|${normalizeName(fixture.homeTeam)}|${normalizeName(fixture.awayTeam)}`;
      if (duplicateGuard.has(key)) return;
      duplicateGuard.add(key);
      fixtures.push(fixture);
    });
  }
  return fixtures;
}

function mergeParsedFixtures(fixtures: UpcomingFixture[]) {
  const map = new Map<string, UpcomingFixture>();
  for (const fixture of fixtures) {
    const key = `${fixture.date}|${normalizeName(fixture.homeTeam)}|${normalizeName(fixture.awayTeam)}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, fixture);
      continue;
    }
    const mergedOdds = { ...existing.odds, ...fixture.odds };
    map.set(key, {
      ...existing,
      ...fixture,
      id: existing.id,
      providerFixtureId: existing.providerFixtureId,
      providerUrl: fixture.providerUrl || existing.providerUrl,
      odds: mergedOdds,
      dataQuality: Object.keys(mergedOdds).length >= 3 ? Math.max(existing.dataQuality || 0, fixture.dataQuality || 0, 82) : Math.max(existing.dataQuality || 0, fixture.dataQuality || 0)
    });
  }
  return [...map.values()];
}

export function parseBetExplorerHtmlDetailed(html: string, fallbackDate: string, pageUrl = BASE_URL): ParsedPage {
  const table = parseTableFixtures(html, fallbackDate, pageUrl);
  const json = parseJsonFixtures(html, fallbackDate, pageUrl);
  return {
    fixtures: mergeParsedFixtures([...table, ...json]),
    tableFixtures: table.length,
    jsonFixtures: json.length
  };
}

export function parseBetExplorerHtml(html: string, date: string, pageUrl = BASE_URL): UpcomingFixture[] {
  return parseBetExplorerHtmlDetailed(html, date, pageUrl).fixtures;
}

function htmlDiagnostics(html: string, requestedUrl: string, finalUrl: string) {
  const $ = cheerio.load(html);
  const title = cleanText($('title').first().text()).slice(0, 180);
  const rowCandidates = $('tr.table-main__row, tr[data-def], tr[data-event-id], tr[data-dt], .table-main__row[data-def], [data-testid="match-row"], [class*="match-row"], [class*="event-row"]').length;
  const jsonCandidates = $('script[type="application/ld+json"], script[type="application/json"], script#__NEXT_DATA__, script[data-hid="__NUXT_DATA__"]').length;
  const lower = html.toLowerCase();
  const interstitial = /captcha|verify you are human|access denied|cloudflare|consent|enable javascript/.test(lower);
  return {
    bodyBytes: Buffer.byteLength(html, 'utf8'),
    title,
    rowCandidates,
    jsonCandidates,
    redirected: requestedUrl !== finalUrl,
    interstitial
  };
}

function datesBetween(from: string, to: string) {
  const dates: string[] = [];
  const start = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

function dateFromUrl(rawUrl: string, fallbackDate: string) {
  try {
    const url = new URL(rawUrl, BASE_URL);
    const year = url.searchParams.get('year');
    const month = url.searchParams.get('month');
    const day = url.searchParams.get('day');
    if (year && month && day) return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    return parseDateText(url.pathname + url.search, fallbackDate);
  } catch {
    return undefined;
  }
}

function discoverDateLinks(html: string, pageUrl: string, from: string, to: string) {
  const $ = cheerio.load(html);
  const links = new Map<string, string[]>();
  $('a[href]').each((_index: number, node: any) => {
    const href = $(node).attr('href');
    if (!href) return;
    let absolute: string;
    try {
      absolute = assertAllowedUrl(new URL(href, pageUrl).toString());
    } catch {
      return;
    }
    const date = dateFromUrl(absolute, from);
    if (!date || date < from || date > to) return;
    const current = links.get(date) || [];
    if (!current.includes(absolute)) current.push(absolute);
    links.set(date, current);
  });
  return links;
}

function inWindow(fixture: UpcomingFixture, from: string, to: string) {
  return fixture.date >= from && fixture.date <= to;
}

export async function fetchBetExplorerFixtures(from: string, to: string) {
  const report: BetExplorerSyncReport = {
    provider: 'betexplorer',
    enabled: configuredEnabled(),
    requestedPages: 0,
    parsedFixtures: 0,
    fixturesWith1X2: 0,
    pages: [],
    warnings: []
  };
  if (!report.enabled) return { fixtures: [] as UpcomingFixture[], report };

  const rateMs = Math.max(900, Number(process.env.BETEXPLORER_RATE_MS || 1800));
  const maxPages = Math.max(1, Math.min(60, Number(process.env.BETEXPLORER_MAX_PAGES || 24)));
  const allFixtures: UpcomingFixture[] = [];
  const discoveredLinks = new Map<string, string[]>();
  const fetchedUrls = new Set<string>();

  const requestPage = async (url: string, fallbackDate: string, discovery = false) => {
    const normalized = assertAllowedUrl(url);
    if (fetchedUrls.has(normalized) || report.requestedPages >= maxPages) return [] as UpcomingFixture[];
    fetchedUrls.add(normalized);
    report.requestedPages += 1;
    try {
      const response = await fetchHtml(normalized);
      const parsed = parseBetExplorerHtmlDetailed(response.body, fallbackDate, response.url);
      const fixtures = parsed.fixtures.filter((fixture) => inWindow(fixture, from, to));
      const diagnostics = htmlDiagnostics(response.body, normalized, response.url);
      report.pages.push({
        date: fallbackDate,
        requestedUrl: normalized,
        finalUrl: response.url,
        status: response.status,
        fixtures: fixtures.length,
        fixturesWith1X2: fixtures.filter((fixture) => fixture.odds.home && fixture.odds.draw && fixture.odds.away).length,
        tableFixtures: parsed.tableFixtures,
        jsonFixtures: parsed.jsonFixtures,
        ...diagnostics
      });
      if (diagnostics.redirected) report.warnings.push(`BetExplorer redirected ${normalized} to ${response.url}.`);
      if (diagnostics.interstitial) report.warnings.push(`BetExplorer returned an interstitial or access page for ${response.url}; no bypass was attempted.`);
      if (discovery) {
        for (const [date, links] of discoverDateLinks(response.body, response.url, from, to)) {
          const current = discoveredLinks.get(date) || [];
          for (const link of links) if (!current.includes(link)) current.push(link);
          discoveredLinks.set(date, current);
        }
      }
      return fixtures;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report.pages.push({ date: fallbackDate, requestedUrl: normalized, finalUrl: normalized, status: 0, fixtures: 0, error: message });
      if (/HTTP (403|429)/.test(message)) report.warnings.push('BetExplorer refused automated access. No attempt was made to bypass the block.');
      return [] as UpcomingFixture[];
    } finally {
      await sleep(rateMs);
    }
  };

  // First inspect BetExplorer's football landing pages. They sometimes contain the full upcoming board
  // or links to the currently supported daily URLs.
  for (const url of discoveryUrls()) {
    if (report.requestedPages >= maxPages) break;
    allFixtures.push(...await requestPage(url, from, true));
  }

  // Then request each day using discovered links and several configurable URL templates.
  for (const date of datesBetween(from, to)) {
    if (report.requestedPages >= maxPages) break;
    const candidates = [
      ...(discoveredLinks.get(date) || []),
      ...fixtureTemplates().map((template) => renderTemplate(template, date))
    ];
    let foundForDate = allFixtures.some((fixture) => fixture.date === date && fixture.odds.home && fixture.odds.draw && fixture.odds.away);
    for (const candidate of [...new Set(candidates)]) {
      if (foundForDate || report.requestedPages >= maxPages) break;
      const parsed = await requestPage(candidate, date);
      allFixtures.push(...parsed);
      if (parsed.some((fixture) => fixture.date === date && fixture.odds.home && fixture.odds.draw && fixture.odds.away)) foundForDate = true;
    }
  }

  const fixtures = mergeParsedFixtures(allFixtures)
    .filter((fixture) => inWindow(fixture, from, to))
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  report.parsedFixtures = fixtures.length;
  report.fixturesWith1X2 = fixtures.filter((fixture) => fixture.odds.home && fixture.odds.draw && fixture.odds.away).length;

  if (!fixtures.length) {
    report.warnings.push('No fixtures were parsed. Review finalUrl, title, rowCandidates, jsonCandidates and interstitial in report.pages.');
  } else if (!report.fixturesWith1X2) {
    report.warnings.push('Fixtures were parsed, but no complete Home/Draw/Away prices were found. The page may expose odds through a different data structure.');
  }

  return { fixtures, report };
}

export function betExplorerConfiguration() {
  return {
    enabled: configuredEnabled(),
    baseUrl: BASE_URL,
    fixtureUrlTemplate: process.env.BETEXPLORER_FIXTURE_URL_TEMPLATE?.trim() || DEFAULT_TEMPLATE,
    fallbackUrlTemplates: fixtureTemplates().slice(1),
    discoveryUrls: discoveryUrls(),
    rateMs: Math.max(900, Number(process.env.BETEXPLORER_RATE_MS || 1800)),
    mode: 'public-html-only',
    bypassesAccessControls: false
  };
}
