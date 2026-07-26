import { CLASSIFICATIONS, DEFAULT_CONFIG, ENGINE_NAME, ENGINE_VERSION, MARKETS } from './constants.js';
import { validateFixture } from './validation.js';
import { deriveTeamMetrics, buildCompatibleRoutes } from './metrics.js';
import { classifyMatch } from './classifier.js';
import { assessOddsConflict } from './odds.js';
import { scoreMarkets } from './marketScoring.js';

function sideMarket(classification, homeMarket, awayMarket) {
  return classification.side === 'HOME' ? homeMarket : awayMarket;
}

function chooseBanker(candidates, classification, config) {
  const acceptable = candidates.filter((candidate) => !candidate.fatal && candidate.score >= config.minSupportingScore);
  const byMarket = new Map(acceptable.map((item) => [item.market, item]));

  const teamEitherHalfMarkets = [MARKETS.HOME_WIN_EITHER_HALF, MARKETS.AWAY_WIN_EITHER_HALF];
  const teamProtectionMarkets = [MARKETS.HOME_DNB, MARKETS.AWAY_DNB, MARKETS.HOME_DOUBLE_CHANCE, MARKETS.AWAY_DOUBLE_CHANCE];

  let priority = [];
  switch (classification.type) {
    case CLASSIFICATIONS.MULTI_ROUTE_ADVANTAGE:
    case CLASSIFICATIONS.STABLE_LEADER:
    case CLASSIFICATIONS.LATE_SEPARATION:
      priority = [...teamEitherHalfMarkets, ...teamProtectionMarkets, MARKETS.OVER_1_5, MARKETS.UNDER_3_5];
      break;
    case CLASSIFICATIONS.DRAW_LOCK:
      priority = [MARKETS.UNDER_2_5, MARKETS.UNDER_3_5, MARKETS.HALF_TIME_DRAW, MARKETS.FULL_TIME_DRAW, MARKETS.FIRST_HALF_UNDER_1_5];
      break;
    case CLASSIFICATIONS.HIGH_EVENT_EARLY_SEPARATION:
      priority = classification.side && !classification.warnings.includes('DIRECTIONAL_CONFLICT')
        ? [...teamEitherHalfMarkets, MARKETS.OVER_2_5, MARKETS.OVER_1_5]
        : [MARKETS.OVER_2_5, MARKETS.OVER_1_5, ...teamEitherHalfMarkets];
      break;
    case CLASSIFICATIONS.SWING_FULL_REVERSAL:
      priority = [
        sideMarket(classification, MARKETS.HOME_SECOND_HALF_OVER_0_5, MARKETS.AWAY_SECOND_HALF_OVER_0_5),
        MARKETS.SECOND_HALF_OVER_0_5,
        sideMarket(classification, MARKETS.HOME_WIN_EITHER_HALF, MARKETS.AWAY_WIN_EITHER_HALF),
        MARKETS.OVER_1_5,
        MARKETS.BTTS_YES,
        MARKETS.SECOND_HALF_OVER_1_5,
        MARKETS.OVER_2_5
      ];
      break;
    case CLASSIFICATIONS.SWING_LEAD_SURRENDER:
      priority = [
        MARKETS.SECOND_HALF_OVER_0_5,
        sideMarket(classification, MARKETS.HOME_SECOND_HALF_OVER_0_5, MARKETS.AWAY_SECOND_HALF_OVER_0_5),
        MARKETS.OVER_1_5,
        MARKETS.BTTS_YES,
        sideMarket(classification, MARKETS.HOME_DOUBLE_CHANCE, MARKETS.AWAY_DOUBLE_CHANCE)
      ];
      break;
    case CLASSIFICATIONS.SWING_LATE_SEPARATION:
      priority = [
        sideMarket(classification, MARKETS.HOME_SECOND_HALF_OVER_0_5, MARKETS.AWAY_SECOND_HALF_OVER_0_5),
        MARKETS.SECOND_HALF_OVER_0_5,
        sideMarket(classification, MARKETS.HOME_WIN_EITHER_HALF, MARKETS.AWAY_WIN_EITHER_HALF),
        sideMarket(classification, MARKETS.HOME_SECOND_HALF_DNB, MARKETS.AWAY_SECOND_HALF_DNB),
        MARKETS.OVER_1_5
      ];
      break;
    case CLASSIFICATIONS.SWING_TWO_WAY_INSTABILITY:
      priority = [
        MARKETS.SECOND_HALF_OVER_0_5,
        MARKETS.OVER_1_5,
        MARKETS.BTTS_YES,
        MARKETS.SECOND_HALF_OVER_1_5,
        MARKETS.GOALS_BOTH_HALVES,
        MARKETS.OVER_2_5
      ];
      break;
    case CLASSIFICATIONS.SWING_GAME:
      priority = [MARKETS.SECOND_HALF_OVER_0_5, MARKETS.OVER_1_5, MARKETS.OVER_2_5, ...teamEitherHalfMarkets];
      break;
    case CLASSIFICATIONS.SWING_FALSE_SIGNAL:
      priority = [];
      break;
    case CLASSIFICATIONS.FALSE_OVER_TRAP:
      priority = [MARKETS.FIRST_HALF_UNDER_1_5, MARKETS.HALF_TIME_DRAW, MARKETS.UNDER_3_5];
      break;
    case CLASSIFICATIONS.CONTROLLED_CORRIDOR:
      priority = [MARKETS.UNDER_3_5, MARKETS.OVER_1_5, MARKETS.UNDER_2_5];
      break;
    default:
      priority = [];
  }

  for (const market of priority) {
    const candidate = byMarket.get(market);
    if (candidate && candidate.score >= config.minBankerScore) return candidate;
  }

  if (classification.type === CLASSIFICATIONS.SWING_FALSE_SIGNAL || classification.type === CLASSIFICATIONS.CONFLICT_NO_PICK) {
    return {
      market: MARKETS.NO_PICK,
      score: 0,
      reasons: ['The visible HT/FT swing was not confirmed by the goals scored in each half'],
      warnings: ['SWING_NOT_CONFIRMED'],
      fatal: false
    };
  }

  const fallback = acceptable.find((candidate) => candidate.score >= config.minBankerScore);
  if (fallback) return fallback;

  return {
    market: MARKETS.NO_PICK,
    score: 0,
    reasons: ['No market cleared Athena v3’s banker threshold'],
    warnings: ['ATHENA_V3_NO_PICK'],
    fatal: false
  };
}

function buildStory(classification, home, away) {
  const sideName = classification.side === 'HOME' ? home.name : classification.side === 'AWAY' ? away.name : null;
  switch (classification.type) {
    case CLASSIFICATIONS.MULTI_ROUTE_ADVANTAGE:
      return `${sideName} can take control from more than one half-time position.`;
    case CLASSIFICATIONS.STABLE_LEADER:
      return `${sideName} protects leads better and the opponent rarely changes the result after falling behind.`;
    case CLASSIFICATIONS.LATE_SEPARATION:
      return `The first half may stay level, but ${sideName} has the stronger route after the break.`;
    case CLASSIFICATIONS.DRAW_LOCK:
      return 'Both teams repeatedly keep matches level and the goal picture is controlled.';
    case CLASSIFICATIONS.HIGH_EVENT_EARLY_SEPARATION:
      return 'The match regularly opens early and the goal records support a high-event game.';
    case CLASSIFICATIONS.FALSE_OVER_TRAP:
      return 'Past totals look lively, but the half-time structure can keep this matchup tight.';
    case CLASSIFICATIONS.SWING_FULL_REVERSAL:
      return `${sideName} has genuine comeback strength against an opponent that gives away leads, with the second-half goal data confirming the swing.`;
    case CLASSIFICATIONS.SWING_LEAD_SURRENDER:
      return `${sideName} often responds after falling behind, while the opponent frequently allows the match to return level.`;
    case CLASSIFICATIONS.SWING_LATE_SEPARATION:
      return `${sideName} is more likely to break a level match after half-time, and the second-half scoring records agree.`;
    case CLASSIFICATIONS.SWING_TWO_WAY_INSTABILITY:
      return 'Both teams can score, recover and surrender control, so Athena avoids choosing a winner and follows the safer goal route.';
    case CLASSIFICATIONS.SWING_FALSE_SIGNAL:
      return 'The HT/FT table hints at a swing, but the goals scored by half do not confirm enough second-half activity.';
    case CLASSIFICATIONS.SWING_GAME:
      return 'A comeback-versus-collapse route exists, but detailed half-goal confirmation is limited.';
    case CLASSIFICATIONS.CONTROLLED_CORRIDOR:
      return 'The match points to a controlled two-to-three-goal range without a safe team direction.';
    default:
      return 'The teams’ strongest routes point in different directions, so Athena does not force a pick.';
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
  const secondary = markets.filter((market) => market.market !== banker.market && market.score >= config.minSupportingScore).slice(0, 5);

  return {
    engine: { name: ENGINE_NAME, version: ENGINE_VERSION, mode: 'ATHENA_V3' },
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
    topMarkets: markets.slice(0, 12),
    oddsConflict,
    metrics: { home, away },
    routes,
    audit: {
      generatedAt: new Date().toISOString(),
      config,
      halfGoalsEnabled: true,
      swingResolutionEnabled: true,
      eventCoverageRequiredForEventClaims: true,
      disclaimer: 'Rules-based sports analysis. No prediction is guaranteed.'
    }
  };
}
