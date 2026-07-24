export const ENGINE_NAME = 'Athena Transition Engine';
export const ENGINE_VERSION = '1.0.0-rc.1';

export const CLASSIFICATIONS = Object.freeze({
  STABLE_LEADER: 'STABLE_LEADER',
  LATE_SEPARATION: 'LATE_SEPARATION',
  DRAW_LOCK: 'DRAW_LOCK',
  CONTROLLED_CORRIDOR: 'CONTROLLED_2_TO_3_GOALS',
  HIGH_EVENT_EARLY_SEPARATION: 'HIGH_EVENT_EARLY_SEPARATION',
  FALSE_OVER_TRAP: 'FALSE_OVER_TRAP',
  SWING_GAME: 'SWING_GAME',
  MULTI_ROUTE_ADVANTAGE: 'MULTI_ROUTE_ADVANTAGE',
  CONFLICT_NO_PICK: 'CONFLICT_NO_PICK'
});

export const MARKETS = Object.freeze({
  HOME_WIN_EITHER_HALF: 'HOME_WIN_EITHER_HALF',
  AWAY_WIN_EITHER_HALF: 'AWAY_WIN_EITHER_HALF',
  HOME_DNB: 'HOME_DNB',
  AWAY_DNB: 'AWAY_DNB',
  HOME_DOUBLE_CHANCE: 'HOME_OR_DRAW',
  AWAY_DOUBLE_CHANCE: 'AWAY_OR_DRAW',
  HOME_OVER_0_5: 'HOME_TEAM_OVER_0_5',
  AWAY_OVER_0_5: 'AWAY_TEAM_OVER_0_5',
  OVER_1_5: 'OVER_1_5',
  OVER_2_5: 'OVER_2_5',
  UNDER_2_5: 'UNDER_2_5',
  UNDER_3_5: 'UNDER_3_5',
  FIRST_HALF_UNDER_1_5: 'FIRST_HALF_UNDER_1_5',
  FIRST_HALF_OVER_0_5: 'FIRST_HALF_OVER_0_5',
  HALF_TIME_DRAW: 'HALF_TIME_DRAW',
  FULL_TIME_DRAW: 'FULL_TIME_DRAW',
  BTTS_YES: 'BTTS_YES',
  NO_PICK: 'NO_PICK'
});

export const DEFAULT_CONFIG = Object.freeze({
  minMatchesForFullReliability: 20,
  minBankerScore: 80,
  minStrongScore: 70,
  minSupportingScore: 60,
  drawRateStrong: 0.35,
  htDrawRateStrong: 0.45,
  under25UpgradeRate: 0.65,
  under25IdealRate: 0.70,
  under25MaxCombinedAverage: 2.2,
  highEventOver25Rate: 0.60,
  highEventAverageGoals: 2.8,
  strongRouteRate: 0.25,
  meaningfulStateSample: 3,
  matchedReversalCountStrong: 2,
  marketOddsConflictRatio: 1.35,
  useOddsAsConfirmation: true,
  requireVenueSplitForConflictedDirection: true,
  oneBankerOnly: true
});
