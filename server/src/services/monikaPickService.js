import { loadBetExplorerFixtures } from "../providers/betExplorer.js";
import {
  MONIKA_ENGINE_NAME,
  MONIKA_ENGINE_VERSION,
  runMonika
} from "../engine/monikaEngine.js";

const CACHE_TTL_MS = 4 * 60_000;
let cache = { createdAt: 0, value: null };

function publicPick(pick) {
  return {
    fixtureId: `be-${pick.fixtureId}`,
    kickoff: pick.kickoff,
    league: { name: pick.league, country: pick.country },
    home: { name: pick.home },
    away: { name: pick.away },
    engine: MONIKA_ENGINE_NAME,
    engineKey: "monika",
    engineVersion: MONIKA_ENGINE_VERSION,
    market: pick.market,
    selection: pick.selection,
    key: pick.key,
    odds: pick.odds,
    confidence: pick.confidence,
    score: pick.confidence,
    modelProbability: pick.confidence,
    expectedValue: 0,
    directHitRates: { combined: pick.strike },
    betExplorerUrl: pick.url,
    publicExplanation: pick.why || pick.note,
    why: pick.why || pick.note,
    reasons: [pick.trigger],
    step: pick.step,
    trigger: pick.trigger,
    homeOdd: pick.homeOdd,
    drawOdd: pick.drawOdd,
    awayOdd: pick.awayOdd,
    odds1x2: { home: pick.homeOdd, draw: pick.drawOdd, away: pick.awayOdd }
  };
}

export async function getMonikaPicks({ force = false } = {}) {
  if (!force && cache.value && Date.now() - cache.createdAt < CACHE_TTL_MS) {
    return { ...cache.value, cached: true };
  }
  const fixtures = await loadBetExplorerFixtures({ force, days: 2 });
  const picks = runMonika(fixtures).map(publicPick);
  const value = {
    generatedAt: new Date().toISOString(),
    engine: MONIKA_ENGINE_NAME,
    engineVersion: MONIKA_ENGINE_VERSION,
    source: "betexplorer",
    reviewedFixtures: fixtures.length,
    pickCount: picks.length,
    picks
  };
  cache = { createdAt: Date.now(), value };
  return { ...value, cached: false };
}
