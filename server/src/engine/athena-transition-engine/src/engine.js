import { DEFAULT_CONFIG, ENGINE_NAME, ENGINE_VERSION, MARKETS } from './constants.js';
import { validateFixture } from './validation.js';
import { deriveTeamMetrics, buildCompatibleRoutes } from './metrics.js';
import { classifyMatch } from './classifier.js';
import { assessOddsConflict } from './odds.js';
import { scoreMarkets } from './marketScoring.js';

function chooseBanker(candidates, classification, config) {
  const acceptable = candidates.filter(c => !c.fatal && c.score >= config.minSupportingScore);
  const byMarket = new Map(acceptable.map(item => [item.market, item]));

  const teamEitherHalfMarkets = [MARKETS.HOME_WIN_EITHER_HALF, MARKETS.AWAY_WIN_EITHER_HALF];
  const teamProtectionMarkets = [MARKETS.HOME_DNB, MARKETS.AWAY_DNB, MARKETS.HOME_DOUBLE_CHANCE, MARKETS.AWAY_DOUBLE_CHANCE];

  let priority = [];
  switch (classification.type) {
    case 'MULTI_ROUTE_ADVANTAGE':
    case 'STABLE_LEADER':
    case 'LATE_SEPARATION':
      priority = [...teamEitherHalfMarkets, ...teamProtectionMarkets, MARKETS.OVER_1_5, MARKETS.UNDER_3_5];
      break;
    case 'DRAW_LOCK':
      priority = [MARKETS.UNDER_2_5, MARKETS.UNDER_3_5, MARKETS.HALF_TIME_DRAW, MARKETS.FULL_TIME_DRAW, MARKETS.FIRST_HALF_UNDER_1_5];
      break;
    case 'HIGH_EVENT_EARLY_SEPARATION':
      priority = classification.side && !classification.warnings.includes('DIRECTIONAL_CONFLICT')
        ? [...teamEitherHalfMarkets, MARKETS.OVER_2_5, MARKETS.OVER_1_5]
        : [MARKETS.OVER_2_5, MARKETS.OVER_1_5, ...teamEitherHalfMarkets];
      break;
    case 'SWING_GAME':
      priority = [MARKETS.OVER_1_5, MARKETS.OVER_2_5, ...teamEitherHalfMarkets];
      break;
    case 'FALSE_OVER_TRAP':
      priority = [MARKETS.FIRST_HALF_UNDER_1_5, MARKETS.HALF_TIME_DRAW, MARKETS.UNDER_3_5];
      break;
    case 'CONTROLLED_2_TO_3_GOALS':
      priority = [MARKETS.UNDER_3_5, MARKETS.OVER_1_5, MARKETS.UNDER_2_5];
      break;
    default:
      priority = [];
  }

  for (const market of priority) {
    const candidate = byMarket.get(market);
    if (candidate && candidate.score >= config.minBankerScore) return candidate;
  }

  const fallback = acceptable.find(c => c.score >= config.minBankerScore);
  if (fallback) return fallback;

  return {
    market: MARKETS.NO_PICK,
    score: 0,
    reasons: ['No market cleared the frozen banker threshold'],
    warnings: ['SHADOW_TEST_NO_PICK'],
    fatal: false
  };
}

function buildStory(classification, home, away) {
  const sideName = classification.side === 'HOME' ? home.name : classification.side === 'AWAY' ? away.name : null;
  switch (classification.type) {
    case 'MULTI_ROUTE_ADVANTAGE':
      return `${sideName} has compatible winning routes from leading, drawing and trailing half-time states.`;
    case 'STABLE_LEADER':
      return `${sideName} has the clearest control route and the opponent has limited ability to recover the result.`;
    case 'LATE_SEPARATION':
      return `A level first half is plausible, with ${sideName} holding the stronger second-half separation route.`;
    case 'DRAW_LOCK':
      return 'Both teams repeatedly convert different half-time states into full-time draws within a low-event profile.';
    case 'HIGH_EVENT_EARLY_SEPARATION':
      return 'The goal data and low half-time-draw structure support early separation and a high-event match.';
    case 'FALSE_OVER_TRAP':
      return 'Historical goal totals are high, but the transition structure can keep this matchup locked.';
    case 'SWING_GAME':
      return 'A matched comeback-collapse route creates genuine reversal volatility.';
    case 'CONTROLLED_2_TO_3_GOALS':
      return 'The matchup points to a controlled two-to-three-goal corridor without a decisive team route.';
    default:
      return 'The signals conflict and no shared market is sufficiently strong.';
  }
}

export function analyseFixture(input, overrides = {}) {
  validateFixture(input);
  const config = { ...DEFAULT_CONFIG, ...overrides };
  const home = deriveTeamMetrics(input.home, config);
  const away = deriveTeamMetrics(input.away, config);
  const routes = buildCompatibleRoutes(home, away);
  const classification = classifyMatch(home, away, routes, config);
  const oddsConflict = assessOddsConflict(input, classification, config);
  const markets = scoreMarkets({ home, away, routes, classification, oddsConflict, config });
  const banker = chooseBanker(markets, classification, config);
  const secondary = markets.filter(m => m.market !== banker.market && m.score >= config.minSupportingScore).slice(0, 3);

  return {
    engine: { name: ENGINE_NAME, version: ENGINE_VERSION, mode: 'FROZEN_SHADOW' },
    fixture: {
      id: input.id ?? null,
      league: input.league ?? null,
      kickoff: input.kickoff ?? null,
      home: home.name,
      away: away.name
    },
    classification,
    story: buildStory(classification, home, away),
    banker,
    secondary,
    topMarkets: markets.slice(0, 8),
    oddsConflict,
    metrics: { home, away },
    routes,
    audit: {
      generatedAt: new Date().toISOString(),
      config,
      frozenRules: true,
      disclaimer: 'Shadow-test output only. No prediction is guaranteed.'
    }
  };
}
