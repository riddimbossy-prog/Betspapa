export const VISA_ENGINE_NAME = "Visa";
export const VISA_ENGINE_VERSION = "visa-v1.0.0";
export const VISA_WINDOW = 5;
export const VISA_MIN_MATCHES = 5;
export const VISA_LOSS_GRADE_MIN = 0.6;
export const VISA_FATAL_LOSS_MIN = 0.8;
export const VISA_LOW_LOSS_MAX = 0.4;
export const VISA_WIN_MIN = 0.6;
export const VISA_SCORE_RATE_MIN = 0.8;
export const VISA_CONCEDE_RATE_MIN = 0.6;
export const VISA_GOAL_RATE_MIN = 0.6;
export const VISA_EXPECTED_GOALS_MIN = 2;

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function percentage(value) {
  return Math.round(clamp(value) * 100);
}

function resultCode(forGoals, againstGoals) {
  if (forGoals > againstGoals) return "W";
  if (forGoals < againstGoals) return "L";
  return "D";
}

function normaliseGame(game) {
  if (!game || typeof game !== "object") return null;
  const ftFor = Number(game.ftFor ?? game.goalsFor);
  const ftAgainst = Number(game.ftAgainst ?? game.goalsAgainst);
  if (!Number.isFinite(ftFor) || !Number.isFinite(ftAgainst)) return null;
  return {
    date: game.date || game.fixture_date || null,
    ftFor,
    ftAgainst,
    totalGoals: ftFor + ftAgainst,
    result: resultCode(ftFor, ftAgainst)
  };
}

export function lossGrade(rate) {
  const value = clamp(rate);
  if (value >= 1) return 100;
  if (value >= 0.8) return 80;
  if (value >= 0.6) return 60;
  return null;
}

export function winGrade(rate) {
  const value = clamp(rate);
  if (value >= 1) return 100;
  if (value >= 0.8) return 80;
  if (value >= 0.6) return 60;
  return null;
}

function lossBand(rate) {
  const grade = lossGrade(rate);
  if (grade) return `LOSS ${grade}%`;
  if (rate < VISA_LOW_LOSS_MAX) return `LOW LOSS ${percentage(rate)}%`;
  return `LOSS ${percentage(rate)}%`;
}

function winBand(rate) {
  const grade = winGrade(rate);
  return grade ? `WIN ${grade}%` : `WIN ${percentage(rate)}%`;
}

/** Summarise exactly the most recent five venue-specific matches. */
export function summarizeVisaForm(games = []) {
  const rows = games.map(normaliseGame).filter(Boolean).slice(0, VISA_WINDOW);
  const matches = rows.length;
  const wins = rows.filter((game) => game.result === "W").length;
  const draws = rows.filter((game) => game.result === "D").length;
  const losses = rows.filter((game) => game.result === "L").length;
  const divisor = Math.max(1, matches);
  const gf = rows.reduce((sum, game) => sum + game.ftFor, 0);
  const ga = rows.reduce((sum, game) => sum + game.ftAgainst, 0);
  const scoredIn = rows.filter((game) => game.ftFor > 0).length;
  const concededIn = rows.filter((game) => game.ftAgainst > 0).length;
  const over15 = rows.filter((game) => game.totalGoals >= 2).length;
  const btts = rows.filter((game) => game.ftFor > 0 && game.ftAgainst > 0).length;
  const winRate = wins / divisor;
  const drawRate = draws / divisor;
  const lossRate = losses / divisor;
  const scoredRate = scoredIn / divisor;
  const concededRate = concededIn / divisor;
  const over15Rate = over15 / divisor;
  const bttsRate = btts / divisor;

  return {
    matches,
    wins,
    draws,
    losses,
    form: rows.map((game) => game.result).join(""),
    formLine: rows.map((game) => game.result).join("-") || "—",
    scoreline: rows.map((game) => `${game.ftFor}-${game.ftAgainst}`).join(", ") || "—",
    gf,
    ga,
    gfAverage: round(gf / divisor),
    gaAverage: round(ga / divisor),
    scoredIn,
    concededIn,
    over15,
    btts,
    winRate: round(winRate, 4),
    drawRate: round(drawRate, 4),
    lossRate: round(lossRate, 4),
    scoredRate: round(scoredRate, 4),
    concededRate: round(concededRate, 4),
    over15Rate: round(over15Rate, 4),
    bttsRate: round(bttsRate, 4),
    winGrade: winGrade(winRate),
    lossGrade: lossGrade(lossRate),
    winBand: winBand(winRate),
    lossBand: lossBand(lossRate),
    lowLoss: lossRate < VISA_LOW_LOSS_MAX,
    games: rows
  };
}

function price(odds, key) {
  const source = odds?.odds && typeof odds.odds === "object" ? { ...odds, ...odds.odds } : odds;
  const value = Number(source?.[key]);
  return Number.isFinite(value) && value > 1 ? round(value, 2) : null;
}

function gate(key, label, rule, value, passed) {
  return { key, label, rule, value, passed: Boolean(passed), required: true };
}

function expectedGoals(home, away) {
  const homeGoals = (home.gfAverage + away.gaAverage) / 2;
  const awayGoals = (away.gfAverage + home.gaAverage) / 2;
  return {
    home: round(homeGoals),
    away: round(awayGoals),
    total: round(homeGoals + awayGoals)
  };
}

function tier(score) {
  if (score >= 90) return "VISA PRIME";
  if (score >= 78) return "VISA APPROVED";
  return "VISA QUALIFIED";
}

function approvedPick({
  key,
  family,
  market,
  selection,
  odds,
  route,
  routeLabel,
  score,
  home,
  away,
  expected,
  explanation,
  reasons,
  audit,
  approvedTeam = null,
  deniedTeam = null
}) {
  const strength = round(clamp(score) * 100, 1);
  return {
    available: true,
    qualified: true,
    key,
    family,
    market,
    selection,
    odds,
    book: "SportyBet",
    source: "sportybet",
    route,
    routeLabel,
    visaStatus: "APPROVED",
    tier: tier(strength),
    score: strength,
    confidence: strength,
    approvedTeam,
    deniedTeam,
    homeVisa: home,
    awayVisa: away,
    expectedGoals: expected,
    filters: audit,
    explanation,
    explanationParagraph: explanation,
    publicExplanation: explanation,
    reasons,
    cautions: [],
    engine: VISA_ENGINE_NAME,
    engineKey: "visa",
    engineVersion: VISA_ENGINE_VERSION
  };
}

function noPick(reason, home, away, expected, audit = []) {
  return {
    available: false,
    qualified: false,
    key: "no-pick",
    family: "No Pick",
    market: "No Pick",
    selection: "NO VISA",
    visaStatus: "NO DECISION",
    score: 0,
    confidence: 0,
    tier: "NO VISA",
    homeVisa: home,
    awayVisa: away,
    expectedGoals: expected,
    filters: audit,
    explanation: reason,
    explanationParagraph: reason,
    publicExplanation: reason,
    reasons: [reason],
    cautions: [reason],
    engine: VISA_ENGINE_NAME,
    engineKey: "visa",
    engineVersion: VISA_ENGINE_VERSION
  };
}

function resultMismatch(home, away) {
  if (
    home.lossRate >= VISA_FATAL_LOSS_MIN &&
    away.lossRate < VISA_LOW_LOSS_MAX &&
    home.lossRate - away.lossRate >= 0.4
  ) {
    return { weakSide: "home", weak: home, strong: away };
  }
  if (
    away.lossRate >= VISA_FATAL_LOSS_MIN &&
    home.lossRate < VISA_LOW_LOSS_MAX &&
    away.lossRate - home.lossRate >= 0.4
  ) {
    return { weakSide: "away", weak: away, strong: home };
  }
  return null;
}

/** Select one Visa market from strict last-five home/away split form, or fail closed. */
export function selectVisaPick({
  homeName = "Home",
  awayName = "Away",
  homeGames = [],
  awayGames = [],
  odds = {}
} = {}) {
  const home = summarizeVisaForm(homeGames);
  const away = summarizeVisaForm(awayGames);
  const expected = expectedGoals(home, away);

  if (home.matches < VISA_MIN_MATCHES || away.matches < VISA_MIN_MATCHES) {
    return noPick(
      `Visa needs five completed home-split and five completed away-split matches. It found ${home.matches} and ${away.matches}.`,
      home,
      away,
      expected
    );
  }

  const mismatch = resultMismatch(home, away);
  if (mismatch) {
    const strongIsHome = mismatch.weakSide === "away";
    const strongName = strongIsHome ? homeName : awayName;
    const weakName = strongIsHome ? awayName : homeName;
    const gradeGap = mismatch.weak.lossRate - mismatch.strong.lossRate;
    const sharedAudit = [
      gate("fatal-loss", `${weakName} loss grade`, "80–100%", `${percentage(mismatch.weak.lossRate)}%`, mismatch.weak.lossRate >= VISA_FATAL_LOSS_MIN),
      gate("low-loss", `${strongName} loss rate`, "Strictly below 40%", `${percentage(mismatch.strong.lossRate)}%`, mismatch.strong.lossRate < VISA_LOW_LOSS_MAX),
      gate("loss-gap", "Loss-grade separation", "40 points or more", `${percentage(gradeGap)} points`, gradeGap >= 0.4)
    ];

    if (mismatch.strong.winRate >= VISA_WIN_MIN) {
      const winKey = strongIsHome ? "home" : "away";
      const winOdds = price(odds, winKey);
      const audit = sharedAudit.concat(
        gate("win-grade", `${strongName} win grade`, "60% or higher", `${percentage(mismatch.strong.winRate)}%`, true),
        gate("sportybet-price", "SportyBet Match Result", "Exact active price required", winOdds ?? "Missing", winOdds != null)
      );
      if (winOdds == null) {
        return noPick(`Visa approved ${strongName}'s result route, but the exact SportyBet win price is missing.`, home, away, expected, audit);
      }
      const explanation = `${weakName} lost ${mismatch.weak.losses}/5 ${mismatch.weakSide} split matches (${percentage(mismatch.weak.lossRate)}%), while ${strongName} lost only ${mismatch.strong.losses}/5 (${percentage(mismatch.strong.lossRate)}%) and won ${mismatch.strong.wins}/5.`;
      return approvedPick({
        key: strongIsHome ? "home-win" : "away-win",
        family: "Match Result",
        market: "Match Result",
        selection: `${strongName} Win`,
        odds: winOdds,
        route: "loss-denial",
        routeLabel: "LOSS DENIAL",
        score: mismatch.weak.lossRate * 0.5 + (1 - mismatch.strong.lossRate) * 0.25 + mismatch.strong.winRate * 0.25,
        home,
        away,
        expected,
        explanation,
        reasons: [explanation, `The loss-grade gap is ${percentage(gradeGap)} percentage points.`],
        audit,
        approvedTeam: strongName,
        deniedTeam: weakName
      });
    }

    const doubleChanceKey = strongIsHome ? "home-or-draw" : "draw-or-away";
    const dnbKey = strongIsHome ? "home-dnb" : "away-dnb";
    const doubleChanceOdds = price(odds, doubleChanceKey);
    const dnbOdds = price(odds, dnbKey);
    const protectionKey = doubleChanceOdds ? doubleChanceKey : dnbOdds ? dnbKey : null;
    const protectionOdds = doubleChanceOdds || dnbOdds;
    const audit = sharedAudit.concat(
      gate("win-protection", `${strongName} win grade`, "Below 60% requires protection", `${percentage(mismatch.strong.winRate)}%`, mismatch.strong.winRate < VISA_WIN_MIN),
      gate("sportybet-protection", "SportyBet protection market", "Exact active 1X/X2 or DNB price required", protectionOdds ?? "Missing", protectionOdds != null)
    );
    if (!protectionKey) {
      return noPick(`Visa found the loss mismatch, but ${strongName} needs a SportyBet double-chance or DNB price for protection.`, home, away, expected, audit);
    }
    const doubleChance = protectionKey === doubleChanceKey;
    const selection = doubleChance
      ? strongIsHome ? `${homeName} or Draw (1X)` : `${awayName} or Draw (X2)`
      : `${strongName} Draw No Bet`;
    const explanation = `${weakName} carries a ${percentage(mismatch.weak.lossRate)}% loss grade and ${strongName} is below 40% losses. Because ${strongName} won fewer than 60%, Visa protects the draw instead of forcing a straight win.`;
    return approvedPick({
      key: protectionKey,
      family: doubleChance ? "Double Chance" : "Draw No Bet",
      market: doubleChance ? "Double Chance" : "Draw No Bet",
      selection,
      odds: protectionOdds,
      route: "protected-loss-denial",
      routeLabel: "PROTECTED",
      score: mismatch.weak.lossRate * 0.55 + (1 - mismatch.strong.lossRate) * 0.45,
      home,
      away,
      expected,
      explanation,
      reasons: [explanation, `The loss-grade gap is ${percentage(gradeGap)} percentage points.`],
      audit,
      approvedTeam: strongName,
      deniedTeam: weakName
    });
  }

  const bothWinQualified = home.winRate >= VISA_WIN_MIN && away.winRate >= VISA_WIN_MIN;
  if (bothWinQualified) {
    const bothScore = home.scoredRate >= VISA_SCORE_RATE_MIN && away.scoredRate >= VISA_SCORE_RATE_MIN;
    const bothConcede = home.concededRate >= VISA_CONCEDE_RATE_MIN && away.concededRate >= VISA_CONCEDE_RATE_MIN;
    const bothBtts = home.bttsRate >= VISA_GOAL_RATE_MIN && away.bttsRate >= VISA_GOAL_RATE_MIN;
    const ggOdds = price(odds, "btts-yes");
    const audit = [
      gate("home-win-grade", `${homeName} win grade`, "60% or higher", `${percentage(home.winRate)}%`, true),
      gate("away-win-grade", `${awayName} win grade`, "60% or higher", `${percentage(away.winRate)}%`, true),
      gate("both-score", "Both teams scoring", "Each scores in at least 80%", `${percentage(home.scoredRate)}% / ${percentage(away.scoredRate)}%`, bothScore),
      gate("both-concede", "Both teams conceding", "Each concedes in at least 60%", `${percentage(home.concededRate)}% / ${percentage(away.concededRate)}%`, bothConcede),
      gate("btts-history", "Split GG history", "Each reaches at least 60%", `${percentage(home.bttsRate)}% / ${percentage(away.bttsRate)}%`, bothBtts),
      gate("sportybet-gg", "SportyBet GG", "Exact active price required", ggOdds ?? "Missing", ggOdds != null)
    ];
    if (!bothScore || !bothConcede || !bothBtts) {
      return noPick("Both teams carry a 60%+ win grade, but the scoring, conceding and split-GG evidence does not approve GG.", home, away, expected, audit);
    }
    if (ggOdds == null) {
      return noPick("Visa approved the GG evidence, but the exact SportyBet GG price is missing.", home, away, expected, audit);
    }
    const explanation = `${homeName} and ${awayName} each won at least 3/5 split matches. They also scored in ${home.scoredIn}/5 and ${away.scoredIn}/5, conceded in ${home.concededIn}/5 and ${away.concededIn}/5, and cleared the split GG gate.`;
    return approvedPick({
      key: "gg-yes",
      family: "Both Teams To Score",
      market: "Both Teams To Score",
      selection: "GG — Yes",
      odds: ggOdds,
      route: "dual-win-gg",
      routeLabel: "DUAL WIN",
      score: ((home.winRate + away.winRate) / 2) * 0.3 +
        ((home.scoredRate + away.scoredRate) / 2) * 0.25 +
        ((home.concededRate + away.concededRate) / 2) * 0.2 +
        ((home.bttsRate + away.bttsRate) / 2) * 0.25,
      home,
      away,
      expected,
      explanation,
      reasons: [explanation],
      audit
    });
  }

  const bothLossQualified = home.lossRate >= VISA_LOSS_GRADE_MIN && away.lossRate >= VISA_LOSS_GRADE_MIN;
  if (bothLossQualified) {
    const totalsPass = home.over15Rate >= VISA_GOAL_RATE_MIN && away.over15Rate >= VISA_GOAL_RATE_MIN;
    const expectedPass = expected.total >= VISA_EXPECTED_GOALS_MIN;
    const overOdds = price(odds, "over-15");
    const audit = [
      gate("home-loss-grade", `${homeName} loss grade`, "60% or higher", `${percentage(home.lossRate)}%`, true),
      gate("away-loss-grade", `${awayName} loss grade`, "60% or higher", `${percentage(away.lossRate)}%`, true),
      gate("split-over-15", "Split Over 1.5 history", "Each reaches at least 60%", `${percentage(home.over15Rate)}% / ${percentage(away.over15Rate)}%`, totalsPass),
      gate("expected-goals", "Combined goal expectation", "2.00 or higher", expected.total.toFixed(2), expectedPass),
      gate("sportybet-over-15", "SportyBet Over 1.5", "Exact active price required", overOdds ?? "Missing", overOdds != null)
    ];
    if (!totalsPass || !expectedPass) {
      return noPick("Both teams have 60%+ loss grades, but loss frequency alone cannot approve Over 1.5 without matching goal evidence.", home, away, expected, audit);
    }
    if (overOdds == null) {
      return noPick("Visa approved the two-goal route, but the exact SportyBet Over 1.5 price is missing.", home, away, expected, audit);
    }
    const explanation = `${homeName} and ${awayName} each lost at least 3/5 split matches. Over 1.5 landed in ${home.over15}/5 and ${away.over15}/5, with a combined goal expectation of ${expected.total.toFixed(2)}.`;
    return approvedPick({
      key: "over-15",
      family: "Total Goals",
      market: "Total Goals",
      selection: "Over 1.5 Goals",
      odds: overOdds,
      route: "dual-loss-goals",
      routeLabel: "DUAL LOSS",
      score: ((home.lossRate + away.lossRate) / 2) * 0.3 +
        ((home.over15Rate + away.over15Rate) / 2) * 0.45 +
        Math.min(1, expected.total / 3) * 0.25,
      home,
      away,
      expected,
      explanation,
      reasons: [explanation],
      audit
    });
  }

  return noPick(
    "No Visa route qualified: there is no protected 80–100% loss mismatch, dual 60% win route, or validated dual 60% loss route.",
    home,
    away,
    expected
  );
}
