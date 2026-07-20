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

// Stable fallback used only for smoothing when a league-specific baseline is unavailable.
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
  doubleChance: 0.72,
  noDraw: 0.74,
  dnb: 0.64,
  fullTimeWin: 0.54,
  halfTimeDoubleChance: 0.74,
  halfTimeResult: 0.49,
  exactHtFt: 0.26,
  ggYes: 0.66,
  ggNo: 0.67,
  over15: 0.67,
  over25: 0.61,
  under35: 0.71,
  teamOver05: 0.7,
  teamOver15: 0.61
};
