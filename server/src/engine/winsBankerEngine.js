export const WINS_BANKER_VERSION = "wins-banker-v1.0.0";
export const WINS_BANKER_NAME = "Wins Banker";
export const FAV_ODDS_MIN = 1.19;
export const FAV_ODDS_MAX = 1.55;
export const OPP_ODDS_MIN = 4.5;
export const OVER15_MAX = 1.2;
export const FAV_TWO_PLUS_MAX = 1.55;
export const OPP_SCORE_MIN = 1.65;
export const MIN_PPG = 2;
export const MIN_GPG = 2;
export const TOP_RANK = 4;
export const MIN_PLAYED = 5;
export const MIN_TABLE = 8;

function rate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

export function formString(results = []) {
  return results.map((code) => String(code || "").toUpperCase().slice(0, 1)).join("") || "—";
}

export function winsInForm(results = []) {
  return results.filter((code) => String(code).toUpperCase() === "W").length;
}

export function bookMap(odds) {
  if (!odds) return {};
  if (odds.odds && typeof odds.odds === "object") return { ...odds, ...odds.odds };
  return odds;
}

export function identifyFavorite(odds = {}) {
  const home = Number(bookMap(odds).home);
  const away = Number(bookMap(odds).away);
  if (!Number.isFinite(home) || !Number.isFinite(away) || home <= 1 || away <= 1) {
    return { available: false, reason: "No SportyBet 1X2 price was found for this match" };
  }
  if (home === away) {
    return { available: false, reason: "SportyBet has no favourite — home and away are the same price" };
  }
  const homeIsFav = home < away;
  return {
    available: true,
    side: homeIsFav ? "home" : "away",
    favOdds: homeIsFav ? home : away,
    oppOdds: homeIsFav ? away : home
  };
}

export function selectWinsBanker({
  homeName = "Home",
  awayName = "Away",
  homeRank = null,
  awayRank = null,
  tableSize = 0,
  homePlayed = 0,
  awayPlayed = 0,
  homePpg = 0,
  awayPpg = 0,
  homeGpg = 0,
  awayGpg = 0,
  homeLastFive = [],
  awayLastFive = [],
  odds = {},
  redFlags = []
} = {}) {
  const flags = (redFlags || []).filter(Boolean);
  if (flags.length) {
    return {
      available: false,
      key: "no-pick",
      reasons: flags.map((flag) => flag.reason || flag.label || "Red flag")
    };
  }

  const prices = bookMap(odds);
  const favorite = identifyFavorite(prices);
  if (!favorite.available) {
    return { available: false, key: "no-pick", reasons: [favorite.reason] };
  }

  const isHome = favorite.side === "home";
  const favName = isHome ? homeName : awayName;
  const oppName = isHome ? awayName : homeName;
  const favRank = Number(isHome ? homeRank : awayRank);
  const favPlayed = Number(isHome ? homePlayed : awayPlayed);
  const favPpg = rate(isHome ? homePpg : awayPpg);
  const favGpg = rate(isHome ? homeGpg : awayGpg);
  const oppForm = isHome ? awayLastFive : homeLastFive;
  const over15 = Number(prices["over-15"]);
  const favTwoPlus = Number(isHome ? prices["home-over-15"] : prices["away-over-15"]);
  const oppScore = Number(isHome ? prices["away-over-05"] : prices["home-over-05"]);

  if (favorite.favOdds < FAV_ODDS_MIN || favorite.favOdds > FAV_ODDS_MAX) {
    return { available: false, key: "no-pick", reasons: [`Favourite SportyBet price ${favorite.favOdds} is outside 1.19–1.55`] };
  }
  if (!(favorite.oppOdds > OPP_ODDS_MIN)) {
    return { available: false, key: "no-pick", reasons: [`Opponent SportyBet price ${favorite.oppOdds} is not over 4.50`] };
  }
  if (Number(tableSize) < MIN_TABLE) {
    return { available: false, key: "no-pick", reasons: ["League table is too small to trust a top-4 favourite"] };
  }
  if (favPlayed < MIN_PLAYED) {
    return { available: false, key: "no-pick", reasons: [`${favName} does not have five league matches for PPG`] };
  }
  if (!(favRank >= 1 && favRank <= TOP_RANK)) {
    return { available: false, key: "no-pick", reasons: [`${favName} is not inside the current top 4`] };
  }
  if (!(favPpg > MIN_PPG)) {
    return { available: false, key: "no-pick", reasons: [`${favName} PPG ${round(favPpg, 2)} is not over 2.00`] };
  }
  if (!(favGpg > MIN_GPG)) {
    return { available: false, key: "no-pick", reasons: [`${favName} scores ${round(favGpg, 2)} goals per game, not over 2.00`] };
  }
  if (oppForm.length < 5) {
    return { available: false, key: "no-pick", reasons: [`${oppName} does not have five recent league matches`] };
  }
  if (winsInForm(oppForm) > 0) {
    return { available: false, key: "no-pick", reasons: [`${oppName} is not winless in the last five (${formString(oppForm)})`] };
  }
  if (!Number.isFinite(over15) || over15 <= 1) {
    return { available: false, key: "no-pick", reasons: ["No SportyBet Over 1.5 price"] };
  }
  if (!(over15 <= OVER15_MAX)) {
    return { available: false, key: "no-pick", reasons: [`SportyBet Over 1.5 is ${over15}, not 1.20 or shorter`] };
  }
  if (!Number.isFinite(favTwoPlus) || favTwoPlus <= 1) {
    return { available: false, key: "no-pick", reasons: [`No SportyBet ${favName} Over 1.5 team-goals price`] };
  }
  if (!(favTwoPlus < FAV_TWO_PLUS_MAX)) {
    return { available: false, key: "no-pick", reasons: [`${favName} to score 2+ is ${favTwoPlus}, not under 1.55`] };
  }
  if (!Number.isFinite(oppScore) || oppScore <= 1) {
    return { available: false, key: "no-pick", reasons: [`No SportyBet ${oppName} Over 0.5 team-goals price`] };
  }
  if (!(oppScore > OPP_SCORE_MIN)) {
    return { available: false, key: "no-pick", reasons: [`${oppName} to score is ${oppScore}, not over 1.65`] };
  }

  return {
    available: true,
    key: isHome ? "home-win" : "away-win",
    market: "Full-Time Result",
    selection: `${favName} Win`,
    direction: "win",
    side: favorite.side,
    qualified: true,
    tier: "Banker",
    odds: round(favorite.favOdds, 3),
    opponentOdds: round(favorite.oppOdds, 3),
    over15Odds: round(over15, 3),
    favoriteTwoPlusOdds: round(favTwoPlus, 3),
    opponentScoreOdds: round(oppScore, 3),
    oddsSource: "sportybet",
    book: "SportyBet",
    sportyBetUrl: odds.url || prices.url || null,
    favoriteName: favName,
    opponentName: oppName,
    favoriteRank: favRank,
    favoritePpg: round(favPpg, 3),
    favoriteGpg: round(favGpg, 3),
    opponentForm: formString(oppForm),
    score: round(favPpg * 22 + favGpg * 8 + (FAV_ODDS_MAX - favorite.favOdds) * 18 + Math.min(favorite.oppOdds, 12), 2),
    reasons: [
      `${favName} is ${favRank} in the table, ${round(favPpg, 2)} PPG and ${round(favGpg, 2)} goals per game.`,
      `${oppName} is winless in the last five (${formString(oppForm)}) at SportyBet ${round(favorite.oppOdds, 2)}.`,
      `SportyBet ${favName} ${round(favorite.favOdds, 2)} · Over 1.5 ${round(over15, 2)} · ${favName} 2+ ${round(favTwoPlus, 2)} · ${oppName} to score ${round(oppScore, 2)}.`
    ]
  };
}
