export const VISA_ENGINE_NAME = "Visa";
export const VISA_ENGINE_VERSION = "visa-v2.0.0";
export const VISA_WINDOW = 5;
export const VISA_MIN_MATCHES = 5;
export const VISA_MIN_SPLIT_PLAYED = 5;
export const VISA_MIN_SPLIT_TABLE = 7;
export const VISA_WIN_ODDS_MAX = 1.52;
export const VISA_CONCEDE_AVG_MIN = 2.2;
export const VISA_SCORE_AVG_MIN = 2.2;
export const VISA_HOME_SCORE_AVG_MIN = 2.3;
export const VISA_AWAY_LOSS_RATE_MIN = 0.8;
export const VISA_HOME_WIN_RATE_MIN = 0.8;

// Retained as public grading helpers for the Visa form display.
export const VISA_LOSS_GRADE_MIN = 0.6;
export const VISA_FATAL_LOSS_MIN = 0.8;
export const VISA_LOW_LOSS_MAX = 0.4;

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
    games: rows
  };
}

export function normaliseVisaStanding(standing = {}, venue = null) {
  const rank = Number(standing.rank);
  const tableSize = Number(standing.tableSize);
  const played = Number(standing.played);
  const valid = Number.isInteger(rank) && Number.isInteger(tableSize) &&
    rank >= 1 && rank <= tableSize && tableSize >= VISA_MIN_SPLIT_TABLE &&
    played >= VISA_MIN_SPLIT_PLAYED;
  return {
    ...standing,
    rank: Number.isFinite(rank) ? rank : null,
    tableSize: Number.isFinite(tableSize) ? tableSize : null,
    played: Number.isFinite(played) ? played : 0,
    ppg: Number.isFinite(Number(standing.ppg)) ? round(standing.ppg, 3) : null,
    venue: standing.venue || venue,
    qualified: valid,
    top3: valid && rank <= 3,
    top5: valid && rank <= 5,
    outsideTop6: valid && rank > 6,
    bottom3: valid && rank >= tableSize - 2,
    bottom6: valid && rank >= tableSize - 5
  };
}

function price(odds, key) {
  const source = odds?.odds && typeof odds.odds === "object" ? { ...odds, ...odds.odds } : odds;
  const value = Number(source?.[key]);
  return Number.isFinite(value) && value > 1 ? value : null;
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

function rankLabel(standing) {
  if (!standing?.qualified) return "Unavailable";
  return `#${standing.rank}/${standing.tableSize}`;
}

function tier(score, sureVisa) {
  if (sureVisa) return "SURE VISA";
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
  sureVisa = false,
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
    visaStatus: sureVisa ? "SURE VISA" : "APPROVED",
    sureVisa,
    tier: tier(strength, sureVisa),
    score: strength,
    confidence: strength,
    approvedTeam,
    deniedTeam,
    homeVisa: home,
    awayVisa: away,
    splitTable: { home: home.splitStanding, away: away.splitStanding },
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
    sureVisa: false,
    score: 0,
    confidence: 0,
    tier: "NO VISA",
    homeVisa: home,
    awayVisa: away,
    splitTable: { home: home.splitStanding, away: away.splitStanding },
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

function resultSelection({ side, teamName, opponentName, odds, route, routeLabel, score, home, away, expected, explanation, audit, sureVisa = false }) {
  return approvedPick({
    key: `${side}-win`,
    family: "Match Result",
    market: "Match Result",
    selection: `${teamName} Win`,
    odds,
    route,
    routeLabel,
    score,
    home,
    away,
    expected,
    explanation,
    reasons: [explanation],
    audit,
    sureVisa,
    approvedTeam: teamName,
    deniedTeam: opponentName
  });
}

/** Select one Visa v2 market from venue form, venue split ranks and exact SportyBet prices. */
export function selectVisaPick({
  homeName = "Home",
  awayName = "Away",
  homeGames = [],
  awayGames = [],
  homeStanding = {},
  awayStanding = {},
  odds = {}
} = {}) {
  const homeRank = normaliseVisaStanding(homeStanding, "home");
  const awayRank = normaliseVisaStanding(awayStanding, "away");
  const home = { ...summarizeVisaForm(homeGames), splitStanding: homeRank };
  const away = { ...summarizeVisaForm(awayGames), splitStanding: awayRank };
  const expected = expectedGoals(home, away);
  const historiesReady = home.matches >= VISA_MIN_MATCHES && away.matches >= VISA_MIN_MATCHES;
  const ranksReady = homeRank.qualified && awayRank.qualified;
  const homeOdds = price(odds, "home");
  const awayOdds = price(odds, "away");
  const over25Odds = price(odds, "over-25");
  const awayConcede = historiesReady && away.gaAverage >= VISA_CONCEDE_AVG_MIN;
  const awayLoses = historiesReady && away.lossRate >= VISA_AWAY_LOSS_RATE_MIN;
  const homeScores = historiesReady && home.gfAverage >= VISA_HOME_SCORE_AVG_MIN;
  const homeWins = historiesReady && home.winRate > VISA_HOME_WIN_RATE_MIN;
  let heldReason = null;
  let heldAudit = [];

  const hold = (reason, audit) => {
    if (heldReason == null) {
      heldReason = reason;
      heldAudit = audit;
    }
  };

  // Dual-trigger routes are evaluated first because they carry the explicit Sure Visa tag.
  if (awayConcede && awayLoses) {
    const audit = [
      gate("away-ga", `${awayName} away GA average`, `${VISA_CONCEDE_AVG_MIN.toFixed(1)} or higher`, away.gaAverage.toFixed(2), true),
      gate("away-loss", `${awayName} away loss rate`, "80% or higher", `${percentage(away.lossRate)}%`, true),
      gate("sportybet-home", "SportyBet home win", "Exact active price required", homeOdds ?? "Missing", homeOdds != null)
    ];
    if (homeOdds != null) {
      const explanation = `${awayName} concedes ${away.gaAverage.toFixed(2)} goals per away match and has lost ${away.losses}/5 away. Both loss-route triggers passed, so ${homeName} Win is tagged Sure Visa.`;
      return resultSelection({
        side: "home", teamName: homeName, opponentName: awayName, odds: homeOdds,
        route: "away-loss-home-win", routeLabel: "AWAY LOSS", score: 0.97,
        home, away, expected, explanation, audit, sureVisa: true
      });
    }
    hold("The Away Loss route reached Sure Visa, but the exact SportyBet home-win price is missing.", audit);
  }

  if (homeScores && homeWins) {
    const audit = [
      gate("home-gf", `${homeName} home GF average`, `${VISA_HOME_SCORE_AVG_MIN.toFixed(1)} or higher`, home.gfAverage.toFixed(2), true),
      gate("home-win-rate", `${homeName} home win rate`, "More than 80%", `${percentage(home.winRate)}%`, true),
      gate("sportybet-home", "SportyBet home win", "Exact active price required", homeOdds ?? "Missing", homeOdds != null)
    ];
    if (homeOdds != null) {
      const explanation = `${homeName} scores ${home.gfAverage.toFixed(2)} goals per home match and has won ${home.wins}/5 at home. Both home-power triggers passed, so ${homeName} Win is tagged Sure Visa.`;
      return resultSelection({
        side: "home", teamName: homeName, opponentName: awayName, odds: homeOdds,
        route: "home-power-win", routeLabel: "HOME POWER", score: 0.96,
        home, away, expected, explanation, audit, sureVisa: true
      });
    }
    hold("The Home Power route reached Sure Visa, but the exact SportyBet home-win price is missing.", audit);
  }

  // Win Banker: top three on the relevant split table, opponent outside the top six, price 1.52 or shorter.
  const splitWinCandidates = [
    { side: "home", teamName: homeName, opponentName: awayName, standing: homeRank, opponent: awayRank, odds: homeOdds },
    { side: "away", teamName: awayName, opponentName: homeName, standing: awayRank, opponent: homeRank, odds: awayOdds }
  ];
  for (const candidate of splitWinCandidates) {
    if (!ranksReady || !candidate.standing.top3 || !candidate.opponent.outsideTop6) continue;
    const oddsPass = candidate.odds != null && candidate.odds <= VISA_WIN_ODDS_MAX;
    const audit = [
      gate("split-top-3", `${candidate.teamName} split rank`, "Top 3 · 5+ played", rankLabel(candidate.standing), true),
      gate("opponent-outside-top-6", `${candidate.opponentName} split rank`, "Outside top 6", rankLabel(candidate.opponent), true),
      gate("win-odds-cap", "SportyBet win odds", "1.52 or shorter", candidate.odds ?? "Missing", oddsPass)
    ];
    if (oddsPass) {
      const explanation = `${candidate.teamName} is ${rankLabel(candidate.standing)} on the ${candidate.standing.venue} split, ${candidate.opponentName} is outside the top six at ${rankLabel(candidate.opponent)}, and the exact win price is ${candidate.odds.toFixed(2)}.`;
      return resultSelection({
        side: candidate.side, teamName: candidate.teamName, opponentName: candidate.opponentName, odds: candidate.odds,
        route: "split-top-3-win", routeLabel: "TOP 3 WIN",
        score: 0.84 + (4 - candidate.standing.rank) * 0.025 + Math.max(0, VISA_WIN_ODDS_MAX - candidate.odds) * 0.08,
        home, away, expected, explanation, audit
      });
    }
    hold(
      candidate.odds == null
        ? `The Top 3 Win route qualified for ${candidate.teamName}, but its exact SportyBet price is missing.`
        : `${candidate.teamName}'s ${candidate.odds.toFixed(2)} price is above the 1.52 Win Banker limit.`,
      audit
    );
  }

  // Bottom-three away opponent against a home team outside the bottom six.
  if (ranksReady && awayRank.bottom3 && !homeRank.bottom6) {
    const audit = [
      gate("away-bottom-3", `${awayName} away split rank`, "Bottom 3", rankLabel(awayRank), true),
      gate("home-outside-bottom-6", `${homeName} home split rank`, "Not bottom 6", rankLabel(homeRank), true),
      gate("sportybet-home", "SportyBet home win", "Exact active price required", homeOdds ?? "Missing", homeOdds != null)
    ];
    if (homeOdds != null) {
      const explanation = `${awayName} is bottom three away at ${rankLabel(awayRank)}, while ${homeName} is outside the bottom six at home (${rankLabel(homeRank)}).`;
      return resultSelection({
        side: "home", teamName: homeName, opponentName: awayName, odds: homeOdds,
        route: "away-bottom-3-home-win", routeLabel: "BOTTOM 3 AWAY", score: 0.86,
        home, away, expected, explanation, audit
      });
    }
    hold("The Bottom 3 Away route qualified, but the exact SportyBet home-win price is missing.", audit);
  }

  // Either away-loss trigger qualifies; both were already promoted to Sure Visa above.
  if (awayConcede || awayLoses) {
    const audit = [];
    if (awayConcede) {
      audit.push(gate("away-ga", `${awayName} away GA average`, `${VISA_CONCEDE_AVG_MIN.toFixed(1)} or higher`, away.gaAverage.toFixed(2), true));
    }
    if (awayLoses) {
      audit.push(gate("away-loss", `${awayName} away loss rate`, "80% or higher", `${percentage(away.lossRate)}%`, true));
    }
    audit.push(gate("sportybet-home", "SportyBet home win", "Exact active price required", homeOdds ?? "Missing", homeOdds != null));
    if (homeOdds != null) {
      const trigger = awayConcede
        ? `${awayName} concedes ${away.gaAverage.toFixed(2)} goals per away match`
        : `${awayName} has lost ${away.losses}/5 away matches`;
      const explanation = `${trigger}, qualifying the Away Loss route for ${homeName} Win.`;
      return resultSelection({
        side: "home", teamName: homeName, opponentName: awayName, odds: homeOdds,
        route: "away-loss-home-win", routeLabel: "AWAY LOSS", score: awayConcede ? 0.84 : 0.82,
        home, away, expected, explanation, audit
      });
    }
    hold("The Away Loss route qualified, but the exact SportyBet home-win price is missing.", audit);
  }

  // Either home-power trigger qualifies; both were already promoted to Sure Visa above.
  if (homeScores || homeWins) {
    const audit = [];
    if (homeScores) {
      audit.push(gate("home-gf", `${homeName} home GF average`, `${VISA_HOME_SCORE_AVG_MIN.toFixed(1)} or higher`, home.gfAverage.toFixed(2), true));
    }
    if (homeWins) {
      audit.push(gate("home-win-rate", `${homeName} home win rate`, "More than 80%", `${percentage(home.winRate)}%`, true));
    }
    audit.push(gate("sportybet-home", "SportyBet home win", "Exact active price required", homeOdds ?? "Missing", homeOdds != null));
    if (homeOdds != null) {
      const trigger = homeScores
        ? `${homeName} scores ${home.gfAverage.toFixed(2)} goals per home match`
        : `${homeName} has won ${home.wins}/5 home matches`;
      const explanation = `${trigger}, qualifying the Home Power route for ${homeName} Win.`;
      return resultSelection({
        side: "home", teamName: homeName, opponentName: awayName, odds: homeOdds,
        route: "home-power-win", routeLabel: "HOME POWER", score: homeScores ? 0.85 : 0.83,
        home, away, expected, explanation, audit
      });
    }
    hold("The Home Power route qualified, but the exact SportyBet home-win price is missing.", audit);
  }

  // Over 2.5 needs one 2.2+ scorer, one 2.2+ conceder and no same-zone extreme pairing.
  const scoreTrigger = historiesReady && Math.max(home.gfAverage, away.gfAverage) >= VISA_SCORE_AVG_MIN;
  const concedeTrigger = historiesReady && Math.max(home.gaAverage, away.gaAverage) >= VISA_CONCEDE_AVG_MIN;
  const bothTop5 = ranksReady && homeRank.top5 && awayRank.top5;
  const bothBottom3 = ranksReady && homeRank.bottom3 && awayRank.bottom3;
  const rankPairPass = ranksReady && !bothTop5 && !bothBottom3;
  if (scoreTrigger && concedeTrigger && rankPairPass) {
    const strongestScorer = home.gfAverage >= away.gfAverage ? homeName : awayName;
    const weakestDefence = home.gaAverage >= away.gaAverage ? homeName : awayName;
    const audit = [
      gate("score-average", "At least one scoring average", `${VISA_SCORE_AVG_MIN.toFixed(1)} or higher`, `${home.gfAverage.toFixed(2)} / ${away.gfAverage.toFixed(2)}`, true),
      gate("concede-average", "At least one conceding average", `${VISA_CONCEDE_AVG_MIN.toFixed(1)} or higher`, `${home.gaAverage.toFixed(2)} / ${away.gaAverage.toFixed(2)}`, true),
      gate("rank-pair", "Extreme split pairing", "Not top-5 vs top-5 or bottom-3 vs bottom-3", `${rankLabel(homeRank)} vs ${rankLabel(awayRank)}`, true),
      gate("sportybet-over-25", "SportyBet Over 2.5", "Exact active price required", over25Odds ?? "Missing", over25Odds != null)
    ];
    if (over25Odds != null) {
      const explanation = `${strongestScorer} supplies the 2.2+ scoring signal and ${weakestDefence} supplies the 2.2+ conceding signal. The split ranks are not an excluded top-five or bottom-three pairing.`;
      return approvedPick({
        key: "over-25",
        family: "Total Goals",
        market: "Total Goals",
        selection: "Over 2.5 Goals",
        odds: over25Odds,
        route: "high-goal-over-25",
        routeLabel: "OVER 2.5",
        score: 0.84 + Math.min(0.1, (Math.max(home.gfAverage, away.gfAverage) - VISA_SCORE_AVG_MIN) * 0.08),
        home,
        away,
        expected,
        explanation,
        reasons: [explanation],
        audit
      });
    }
    hold("The Over 2.5 route qualified, but the exact SportyBet Over 2.5 price is missing.", audit);
  }

  if (heldReason) return noPick(heldReason, home, away, expected, heldAudit);

  const audit = [
    gate("venue-history", "Venue form", "Five home and five away matches", `${home.matches} / ${away.matches}`, historiesReady),
    gate("split-tables", "Venue split tables", `${VISA_MIN_SPLIT_TABLE}+ teams and ${VISA_MIN_SPLIT_PLAYED}+ played`, `${rankLabel(homeRank)} / ${rankLabel(awayRank)}`, ranksReady)
  ];
  return noPick(
    "No Visa v2 route qualified: Top 3 Win, Bottom 3 Away, Away Loss, Home Power and Over 2.5 all stayed below their required gates.",
    home,
    away,
    expected,
    audit
  );
}
