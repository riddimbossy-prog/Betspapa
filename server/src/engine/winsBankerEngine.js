export const WINS_BANKER_VERSION = "wins-banker-v1.2.0";
export const WINS_BANKER_NAME = "Wins Banker";
export const FAV_ODDS_MIN = 1.19;
export const FAV_ODDS_MAX = 1.55;
export const OPP_ODDS_MIN = 4.5;
export const OVER15_MAX = 1.2;
export const FAV_TWO_PLUS_MAX = 1.55;
export const OPP_SCORE_MIN = 1.65;
export const MIN_PPG = 2;
export const MIN_GPG = 2;
export const MIN_AWAY_GPG = 2.2;
export const TOP_RANK = 5;
export const MIN_PLAYED = 5;
export const MIN_TABLE = 8;
export const MIN_EXTRA_FILTERS = 1;
export const SIMILAR_FORM_POINTS_GAP = 3;
export const SIMILAR_GA_GAP = 0.4;

function rate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function finitePrice(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 1 ? number : null;
}

export function formString(results = []) {
  return results.map((code) => String(code || "").toUpperCase().slice(0, 1)).join("") || "—";
}

export function winsInForm(results = []) {
  return results.filter((code) => String(code).toUpperCase() === "W").length;
}

export function formPoints(results = []) {
  return results.reduce((sum, code) => {
    const letter = String(code || "").toUpperCase().slice(0, 1);
    if (letter === "W") return sum + 3;
    if (letter === "D") return sum + 1;
    return sum;
  }, 0);
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

function filterRow({ key, label, rule, value, passed, required = false }) {
  return { key, label, rule, value, passed: Boolean(passed), required };
}

function hardSkipReasons(redFlags = []) {
  const reasons = [];
  for (const flag of redFlags || []) {
    if (!flag) continue;
    const code = String(flag.code || "").toUpperCase();
    if (code === "EARLY_SEASON") {
      reasons.push(flag.reason || "Early season matchup skipped");
    } else if (code === "TOP5_CLASH") {
      reasons.push(flag.reason || "Top-five teams matchup skipped");
    }
  }
  return reasons;
}

function similarFormSkip({
  favForm = [],
  oppForm = [],
  favGaPerGame = null,
  oppGaPerGame = null
} = {}) {
  if (favForm.length < 5 || oppForm.length < 5) return null;
  const favPts = formPoints(favForm);
  const oppPts = formPoints(oppForm);
  const pointsGap = Math.abs(favPts - oppPts);
  if (pointsGap > SIMILAR_FORM_POINTS_GAP) return null;

  const favGa = rate(favGaPerGame);
  const oppGa = rate(oppGaPerGame);
  if (favGa > 0 && oppGa > 0 && Math.abs(favGa - oppGa) > SIMILAR_GA_GAP) {
    return null;
  }

  return `Teams are too similar in recent form and goal concessions (${formString(favForm)} ${favPts}pts vs ${formString(oppForm)} ${oppPts}pts)`;
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
  // Venue-split (slip) home / away recent form metrics — preferred when present
  homeVenuePpg = null,
  awayVenuePpg = null,
  homeVenueGpg = null,
  awayVenueGpg = null,
  homeVenueGa = null,
  awayVenueGa = null,
  homeVenueForm = [],
  awayVenueForm = [],
  homeLastFive = [],
  awayLastFive = [],
  odds = {},
  redFlags = []
} = {}) {
  // Hard skips only: early season + top-five clash. All other red flags are skippable.
  const hardReasons = hardSkipReasons(redFlags);
  if (hardReasons.length) {
    return {
      available: false,
      key: "no-pick",
      reasons: hardReasons
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

  // Prefer venue-split (home form for home fav, away form for away fav)
  const favPpg = rate(
    isHome
      ? (homeVenuePpg != null ? homeVenuePpg : homePpg)
      : (awayVenuePpg != null ? awayVenuePpg : awayPpg)
  );
  const favGpg = rate(
    isHome
      ? (homeVenueGpg != null ? homeVenueGpg : homeGpg)
      : (awayVenueGpg != null ? awayVenueGpg : awayGpg)
  );
  const favGa = rate(
    isHome
      ? (homeVenueGa != null ? homeVenueGa : null)
      : (awayVenueGa != null ? awayVenueGa : null)
  );
  const oppGa = rate(
    isHome
      ? (awayVenueGa != null ? awayVenueGa : null)
      : (homeVenueGa != null ? homeVenueGa : null)
  );

  const favForm = isHome
    ? (homeVenueForm.length ? homeVenueForm : homeLastFive)
    : (awayVenueForm.length ? awayVenueForm : awayLastFive);
  const oppForm = isHome
    ? (awayVenueForm.length ? awayVenueForm : awayLastFive)
    : (homeVenueForm.length ? homeVenueForm : homeLastFive);

  const similar = similarFormSkip({
    favForm,
    oppForm,
    favGaPerGame: favGa,
    oppGaPerGame: oppGa
  });
  if (similar) {
    return { available: false, key: "no-pick", reasons: [similar] };
  }

  const over15 = finitePrice(prices["over-15"]);
  const favTwoPlus = finitePrice(isHome ? prices["home-over-15"] : prices["away-over-15"]);
  const oppScore = finitePrice(isHome ? prices["away-over-05"] : prices["home-over-05"]);

  if (over15 == null) {
    return { available: false, key: "no-pick", reasons: ["No SportyBet Over 1.5 price"] };
  }
  if (!(over15 <= OVER15_MAX)) {
    return {
      available: false,
      key: "no-pick",
      reasons: [`SportyBet Over 1.5 is ${over15}, not 1.20 or shorter`]
    };
  }

  const minGpg = isHome ? MIN_GPG : MIN_AWAY_GPG;
  const gpgRule = isHome ? "2.00 or above" : "Above 2.20";

  const extras = [
    filterRow({
      key: "top-5",
      label: "Favourite position",
      rule: "Top 5",
      value: Number.isFinite(favRank) && favRank > 0 ? `P${favRank}` : "—",
      passed: Number(tableSize) >= MIN_TABLE && favRank >= 1 && favRank <= TOP_RANK
    }),
    filterRow({
      key: "ppg",
      label: "Points per game (venue form)",
      rule: "2.00 or above",
      value: favPlayed >= MIN_PLAYED ? round(favPpg, 2) : "—",
      passed: favPlayed >= MIN_PLAYED && favPpg >= MIN_PPG
    }),
    filterRow({
      key: "gpg",
      label: "Goals per game (venue form)",
      rule: gpgRule,
      value: favPlayed >= MIN_PLAYED ? round(favGpg, 2) : "—",
      passed: favPlayed >= MIN_PLAYED && (isHome ? favGpg >= MIN_GPG : favGpg > MIN_AWAY_GPG)
    }),
    filterRow({
      key: "fav-odds",
      label: "Favourite win odds",
      rule: "1.19–1.55",
      value: round(favorite.favOdds, 2),
      passed: favorite.favOdds >= FAV_ODDS_MIN && favorite.favOdds <= FAV_ODDS_MAX
    }),
    filterRow({
      key: "opp-odds",
      label: "Opponent win odds",
      rule: "Over 4.50",
      value: round(favorite.oppOdds, 2),
      passed: favorite.oppOdds > OPP_ODDS_MIN
    }),
    filterRow({
      key: "opp-form",
      label: "Opponent last 5 (venue)",
      rule: "Winless",
      value: oppForm.length >= 5 ? formString(oppForm) : "—",
      passed: oppForm.length >= 5 && winsInForm(oppForm) === 0
    }),
    filterRow({
      key: "fav-2plus",
      label: "Favourite to score 2+",
      rule: "Shorter than 1.55",
      value: favTwoPlus == null ? "—" : round(favTwoPlus, 2),
      passed: favTwoPlus != null && favTwoPlus < FAV_TWO_PLUS_MAX
    }),
    filterRow({
      key: "opp-score",
      label: "Opponent to score",
      rule: "Longer than 1.65",
      value: oppScore == null ? "—" : round(oppScore, 2),
      passed: oppScore != null && oppScore > OPP_SCORE_MIN
    })
  ];

  const extraPassed = extras.filter((row) => row.passed);
  if (extraPassed.length < MIN_EXTRA_FILTERS) {
    return {
      available: false,
      key: "no-pick",
      reasons: ["Over 1.5 is short enough, but none of the extra Wins Banker filters passed"]
    };
  }

  const required = filterRow({
    key: "over-15",
    label: "Match Over 1.5",
    rule: "1.20 or shorter",
    value: round(over15, 2),
    passed: true,
    required: true
  });

  const skippableFlags = (redFlags || []).filter((flag) => {
    const code = String(flag?.code || "").toUpperCase();
    return code && code !== "EARLY_SEASON" && code !== "TOP5_CLASH";
  });

  return {
    available: true,
    key: isHome ? "home-win" : "away-win",
    market: "Full-Time Result",
    selection: `${favName} Win`,
    direction: "win",
    side: favorite.side,
    qualified: true,
    tier: extraPassed.length >= 2 ? "Banker" : "Lean",
    odds: round(favorite.favOdds, 3),
    opponentOdds: round(favorite.oppOdds, 3),
    over15Odds: round(over15, 3),
    favoriteTwoPlusOdds: favTwoPlus == null ? null : round(favTwoPlus, 3),
    opponentScoreOdds: oppScore == null ? null : round(oppScore, 3),
    oddsSource: "sportybet",
    book: "SportyBet",
    sportyBetUrl: odds.url || prices.url || null,
    favoriteName: favName,
    opponentName: oppName,
    favoriteRank: Number.isFinite(favRank) ? favRank : null,
    favoritePpg: round(favPpg, 3),
    favoriteGpg: round(favGpg, 3),
    opponentForm: formString(oppForm),
    favoriteForm: formString(favForm),
    formBasis: "venue-split",
    extraPassed: extraPassed.length,
    extraTotal: extras.length,
    filters: [required, ...extras],
    skippableRedFlags: skippableFlags,
    score: round(
      extraPassed.length * 18 +
        (OVER15_MAX - over15) * 40 +
        (favorite.favOdds <= FAV_ODDS_MAX ? 8 : 0),
      2
    ),
    reasons: [
      `SportyBet Over 1.5 at ${round(over15, 2)} is 1.20 or shorter.`,
      `${extraPassed.length} extra filter${extraPassed.length === 1 ? "" : "s"} passed: ${extraPassed.map((row) => row.label).join(", ")}.`,
      `Venue form used for PPG/GPG (${isHome ? "home" : "away"} recent matches).`
    ]
  };
}
