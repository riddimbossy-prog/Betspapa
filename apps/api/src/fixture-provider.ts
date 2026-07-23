import { fetchUpcomingFixtures as fetchApiFootballFixtures } from './football-api.js';
import { betExplorerConfiguration, fetchBetExplorerFixtures, type BetExplorerSyncReport } from './betexplorer.js';
import type { UpcomingFixture, UpcomingOdds } from './forecast-types.js';

export type FixtureProviderMode = 'api-football' | 'betexplorer' | 'hybrid';
export type ProviderSyncReport = {
  mode: FixtureProviderMode;
  fixtures: number;
  apiFootball: { enabled: boolean; fixtures: number; error?: string };
  betExplorer: BetExplorerSyncReport;
  matchedAcrossProviders: number;
  unmatchedBetExplorer: number;
  unmatchedApiFootball: number;
  warnings: string[];
};

let lastReport: ProviderSyncReport | null = null;

function mode(): FixtureProviderMode {
  const value = String(process.env.FIXTURE_PROVIDER || 'betexplorer').toLowerCase();
  return value === 'betexplorer' || value === 'api-football' ? value : 'hybrid';
}

function aliases() {
  try {
    const raw = JSON.parse(process.env.TEAM_ALIASES_JSON || '{}') as Record<string, string>;
    return new Map(Object.entries(raw).map(([key, value]) => [normalizeName(key), normalizeName(value)]));
  } catch {
    return new Map<string, string>();
  }
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(fc|cf|sc|afc|club|calcio|fk|sk|the)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function canonicalName(value: string, map: Map<string, string>) {
  const normalized = normalizeName(value);
  return map.get(normalized) || normalized;
}

function diceSimilarity(a: string, b: string) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const bigrams = (value: string) => {
    const output = new Map<string, number>();
    for (let index = 0; index < value.length - 1; index += 1) {
      const pair = value.slice(index, index + 2);
      output.set(pair, (output.get(pair) || 0) + 1);
    }
    return output;
  };
  const left = bigrams(a);
  const right = bigrams(b);
  let overlap = 0;
  for (const [pair, count] of left) overlap += Math.min(count, right.get(pair) || 0);
  const total = [...left.values()].reduce((sum, count) => sum + count, 0) + [...right.values()].reduce((sum, count) => sum + count, 0);
  return total ? (2 * overlap) / total : 0;
}

function sameFixture(a: UpcomingFixture, b: UpcomingFixture, map: Map<string, string>) {
  if (a.date !== b.date) return false;
  const home = diceSimilarity(canonicalName(a.homeTeam, map), canonicalName(b.homeTeam, map));
  const away = diceSimilarity(canonicalName(a.awayTeam, map), canonicalName(b.awayTeam, map));
  if (home < 0.72 || away < 0.72) return false;
  const timeDifference = Math.abs(new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
  return timeDifference <= 4 * 60 * 60 * 1000;
}

function mergeOdds(apiOdds: UpcomingOdds, betExplorerOdds: UpcomingOdds) {
  // BetExplorer is authoritative for the 1X2 values it exposes on its fixture listing.
  // API-Football remains the source for extended markets not present there.
  return { ...apiOdds, ...betExplorerOdds };
}

function mergeFixtures(apiFixtures: UpcomingFixture[], betFixtures: UpcomingFixture[]) {
  const aliasMap = aliases();
  const usedApi = new Set<number>();
  const output: UpcomingFixture[] = [];
  let matched = 0;

  for (const betFixture of betFixtures) {
    let bestIndex = -1;
    let bestScore = 0;
    for (let index = 0; index < apiFixtures.length; index += 1) {
      if (usedApi.has(index)) continue;
      const apiFixture = apiFixtures[index];
      if (!sameFixture(betFixture, apiFixture, aliasMap)) continue;
      const score = diceSimilarity(canonicalName(betFixture.homeTeam, aliasMap), canonicalName(apiFixture.homeTeam, aliasMap))
        + diceSimilarity(canonicalName(betFixture.awayTeam, aliasMap), canonicalName(apiFixture.awayTeam, aliasMap));
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    if (bestIndex >= 0) {
      const apiFixture = apiFixtures[bestIndex];
      usedApi.add(bestIndex);
      matched += 1;
      output.push({
        ...apiFixture,
        provider: 'hybrid',
        providerUrl: betFixture.providerUrl,
        oddsSource: 'betexplorer+api-football',
        dataQuality: Math.min(100, Math.max(apiFixture.dataQuality || 70, betFixture.dataQuality || 60) + 8),
        odds: mergeOdds(apiFixture.odds, betFixture.odds),
        rawOdds: {
          apiFootball: apiFixture.rawOdds ?? null,
          betExplorer: betFixture.rawOdds ?? null
        },
        updatedAt: new Date().toISOString()
      });
    } else {
      output.push(betFixture);
    }
  }

  for (let index = 0; index < apiFixtures.length; index += 1) {
    if (!usedApi.has(index)) output.push(apiFixtures[index]);
  }

  return {
    fixtures: output,
    matched,
    unmatchedBetExplorer: betFixtures.length - matched,
    unmatchedApiFootball: apiFixtures.length - matched
  };
}

function filterFixtures(fixtures: UpcomingFixture[]) {
  const excludedCountries = new Set((process.env.EXCLUDED_COUNTRIES || '').split(',').map((value: string) => normalizeName(value)).filter(Boolean));
  const excludedLeagues = new Set((process.env.EXCLUDED_LEAGUE_IDS || '').split(',').map((value: string) => value.trim()).filter(Boolean));
  const includeCountries = new Set((process.env.INCLUDED_COUNTRIES || '').split(',').map((value: string) => normalizeName(value)).filter(Boolean));
  return fixtures.filter((fixture) => {
    if (excludedCountries.has(normalizeName(fixture.country))) return false;
    if (excludedLeagues.has(String(fixture.leagueId)) || excludedLeagues.has(fixture.leagueCode)) return false;
    if (includeCountries.size && !includeCountries.has(normalizeName(fixture.country))) return false;
    return true;
  });
}

export async function fetchMultiLeagueUpcomingFixtures(from: string, to: string) {
  const selectedMode = mode();
  let apiFixtures: UpcomingFixture[] = [];
  let apiError: string | undefined;
  let betExplorerResult = selectedMode === 'betexplorer' || selectedMode === 'hybrid'
    ? await fetchBetExplorerFixtures(from, to)
    : {
        fixtures: [] as UpcomingFixture[],
        report: {
          provider: 'betexplorer' as const,
          enabled: false,
          requestedPages: 0,
          parsedFixtures: 0,
          fixturesWith1X2: 0,
          pages: [],
          warnings: []
        }
      };

  if (selectedMode === 'api-football' || selectedMode === 'hybrid') {
    if (process.env.API_FOOTBALL_KEY?.trim()) {
      try {
        apiFixtures = (await fetchApiFootballFixtures(from, to)).map((fixture) => ({
          ...fixture,
          provider: 'api-football',
          oddsSource: 'api-football',
          dataQuality: Object.keys(fixture.odds).length >= 5 ? 85 : Object.keys(fixture.odds).length >= 3 ? 72 : 58
        }));
      } catch (error) {
        apiError = error instanceof Error ? error.message : String(error);
      }
    } else {
      apiError = 'API_FOOTBALL_KEY is not configured.';
    }
  }

  if (selectedMode === 'api-football') {
    betExplorerResult = { ...betExplorerResult, fixtures: [] };
  }
  if (selectedMode === 'betexplorer') {
    apiFixtures = [];
    apiError = undefined;
  }

  const merged = selectedMode === 'hybrid'
    ? mergeFixtures(apiFixtures, betExplorerResult.fixtures)
    : {
        fixtures: selectedMode === 'betexplorer' ? betExplorerResult.fixtures : apiFixtures,
        matched: 0,
        unmatchedBetExplorer: selectedMode === 'betexplorer' ? betExplorerResult.fixtures.length : 0,
        unmatchedApiFootball: selectedMode === 'api-football' ? apiFixtures.length : 0
      };

  const fixtures = filterFixtures(merged.fixtures)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  const warnings = [...betExplorerResult.report.warnings];
  if (apiError) warnings.push(apiError);
  if (selectedMode === 'hybrid' && !betExplorerResult.fixtures.length) warnings.push('Hybrid mode continued with API-Football because BetExplorer returned no usable fixtures.');
  if (selectedMode === 'hybrid' && !apiFixtures.length) warnings.push('Hybrid mode continued with BetExplorer-only fixtures because API-Football returned no usable fixtures.');

  lastReport = {
    mode: selectedMode,
    fixtures: fixtures.length,
    apiFootball: { enabled: selectedMode !== 'betexplorer', fixtures: apiFixtures.length, error: apiError },
    betExplorer: betExplorerResult.report,
    matchedAcrossProviders: merged.matched,
    unmatchedBetExplorer: merged.unmatchedBetExplorer,
    unmatchedApiFootball: merged.unmatchedApiFootball,
    warnings
  };

  if (!fixtures.length) {
    throw new Error(`No upcoming fixtures were returned. API-Football: ${apiError || '0 fixtures'}. BetExplorer: ${betExplorerResult.report.parsedFixtures} parsed. Check /api/v1/providers/status for the retained diagnostics.`);
  }

  return { fixtures, report: lastReport };
}

export function providerConfiguration() {
  return {
    mode: mode(),
    leagueMode: process.env.API_FOOTBALL_LEAGUE_IDS?.trim() ? 'selected' : 'all',
    apiFootball: {
      enabled: Boolean(process.env.API_FOOTBALL_KEY?.trim()) && mode() !== 'betexplorer',
      selectedLeagueIds: (process.env.API_FOOTBALL_LEAGUE_IDS || '').split(',').map((value: string) => value.trim()).filter(Boolean)
    },
    betExplorer: betExplorerConfiguration(),
    lastReport
  };
}
