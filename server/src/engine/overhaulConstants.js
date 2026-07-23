export const TRANSITIONS = ["WW", "WD", "WL", "DW", "DD", "DL", "LW", "LD", "LL"];

export const OPPOSITE = {
  WW: "LL",
  WD: "LD",
  WL: "LW",
  DW: "DL",
  DD: "DD",
  DL: "DW",
  LW: "WL",
  LD: "WD",
  LL: "WW"
};

export const HTFT_CODE = {
  WW: "1/1",
  WD: "1/X",
  WL: "1/2",
  DW: "X/1",
  DD: "X/X",
  DL: "X/2",
  LW: "2/1",
  LD: "2/X",
  LL: "2/2"
};

// Used only for Bayesian smoothing when a league baseline is not yet available.
export const DEFAULT_LEAGUE_BASELINE = {
  WW: 0.18,
  WD: 0.07,
  WL: 0.02,
  DW: 0.16,
  DD: 0.16,
  DL: 0.13,
  LW: 0.02,
  LD: 0.07,
  LL: 0.19
};

export const PROFILE_WEIGHTS = {
  venue: 0.4,
  overall: 0.25,
  recent: 0.2,
  league: 0.15
};

export const MARKET_THRESHOLDS = {
  doubleChance: 0.73,
  noDraw: 0.78,
  dnb: 0.66,
  fullTimeWin: 0.56,
  fullTimeDraw: 0.5,
  halfTimeDoubleChance: 0.75,
  halfTimeResult: 0.5,
  exactHtFt: 0.28,
  winEitherHalf: 0.65,
  drawEitherHalf: 0.56,
  ggYes: 0.67,
  ggNo: 0.68,
  over15: 0.68,
  under15: 0.63,
  over25: 0.62,
  under25: 0.66,
  over35: 0.59,
  under35: 0.72,
  twoToThreeGoals: 0.67,
  teamOver05: 0.71,
  teamOver15: 0.63,
  teamUnder15: 0.68,
  cleanSheet: 0.64,
  firstHalfOver05: 0.67,
  firstHalfOver15: 0.7,
  secondHalfOver05: 0.69
};

export const FALLBACK_FAMILIES = new Set([
  "Double Chance",
  "Draw No Bet",
  "Win Either Half",
  "Both Teams to Score",
  "Total Goals",
  "Team Goals",
  "Clean Sheet",
  "Half Goals"
]);
