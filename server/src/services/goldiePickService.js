import { loadBetExplorerFixtures } from "../providers/betExplorer.js";
import {
  GOLDIE_ENGINE_NAME,
  GOLDIE_ENGINE_VERSION,
  GOLDIE_MIN_HIT_RATE,
  runGoldie
} from "../engine/goldieEngine.js";

const CACHE_TTL_MS = 4 * 60_000;
let cache = { createdAt: 0, value: null };

function publicPick(pick) {
  return {
    fixtureId: `be-${pick.fixtureId}`,
    kickoff: pick.kickoff,
    league: { name: pick.league, country: pick.country },
    home: { name: pick.home },
    away: { name: pick.away },
    engine: GOLDIE_ENGINE_NAME,
    engineKey: "goldie",
    engineVersion: GOLDIE_ENGINE_VERSION,
    market: pick.market,
    selection: pick.selection,
    key: pick.key,
    odds: pick.odds,
    confidence: pick.hitRate,
    score: pick.hitRate,
    modelProbability: pick.hitRate,
    expectedValue: 0,
    directHitRates: { combined: pick.hitRate },
    betExplorerUrl: pick.url,
    publicExplanation: pick.why,
    why: pick.why,
    reasons: [pick.note],
    trigger: pick.note,
    homeOdd: pick.homeOdd,
    drawOdd: pick.drawOdd,
    awayOdd: pick.awayOdd,
    odds1x2: { home: pick.homeOdd, draw: pick.drawOdd, away: pick.awayOdd },
    tier: pick.tier === 1 ? "GOLD" : pick.tier === 2 ? "ELITE" : pick.tier === 3 ? "CORE" : "ANCHOR",
    ruleId: pick.ruleId
  };
}

export async function getGoldiePicks({ force = false } = {}) {
  if (!force && cache.value && Date.now() - cache.createdAt < CACHE_TTL_MS) {
    return { ...cache.value, cached: true };
  }
  const fixtures = await loadBetExplorerFixtures({ force, days: 2 });
  const picks = runGoldie(fixtures).map(publicPick);
  const value = {
    generatedAt: new Date().toISOString(),
    engine: GOLDIE_ENGINE_NAME,
    engineVersion: GOLDIE_ENGINE_VERSION,
    minHitRate: GOLDIE_MIN_HIT_RATE,
    source: "betexplorer",
    reviewedFixtures: fixtures.length,
    pickCount: picks.length,
    picks
  };
  cache = { createdAt: Date.now(), value };
  return { ...value, cached: false };
}
