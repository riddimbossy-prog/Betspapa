export const SPLIT_FORM_VERSION = "splitform-v1.0.0";
export const SPLIT_FORM_WINDOW = 5;
export const SPLIT_FORM_MIN_GAMES = 5;
export const SPLIT_FORM_QUALIFY = 0.74;

const MARKETS = {
  "home-win": { key: "home-win", family: "Full-Time Result", market: "Full-Time Result", selectionOf: (home) => `${home} Win` },
  "away-win": { key: "away-win", family: "Full-Time Result", market: "Full-Time Result", selectionOf: (_home, away) => `${away} Win` },
  "home-dnb": { key: "home-dnb", family: "Draw No Bet", market: "Draw No Bet", selectionOf: (home) => `${home} Draw No Bet` },
  "away-dnb": { key: "away-dnb", family: "Draw No Bet", market: "Draw No Bet", selectionOf: (_home, away) => `${away} Draw No Bet` },
  "home-1x": { key: "home-1x", family: "Double Chance", market: "Double Chance", selectionOf: (home) => `${home} or Draw (1X)` },
  "away-x2": { key: "away-x2", family: "Double Chance", market: "Double Chance", selectionOf: (_home, away) => `${away} or Draw (X2)` },
  "over-15": { key: "over-15", family: "Total Goals", market: "Total Goals", selectionOf: () => "Over 1.5 Goals" },
  "over-25": { key: "over-25", family: "Total Goals", market: "Total Goals", selectionOf: () => "Over 2.5 Goals" },
  "under-35": { key: "under-35", family: "Total Goals", market: "Total Goals", selectionOf: () => "Under 3.5 Goals" },
  "gg-yes": { key: "gg-yes", family: "Both Teams To Score", market: "Both Teams To Score", selectionOf: () => "Both Teams to Score — Yes" },
  "home-over-05": { key: "home-over-05", family: "Team Goals", market: "Team Goals", selectionOf: (home) => `${home} Over 0.5 Team Goals` },
  "away-over-05": { key: "away-over-05", family: "Team Goals", market: "Team Goals", selectionOf: (_home, away) => `${away} Over 0.5 Team Goals` },
  "second-half-over-05": { key: "second-half-over-05", family: "Second-Half Goals", market: "Second-Half Goals", selectionOf: () => "Second Half Over 0.5 Goals" },
  "home-win-either-half": { key: "home-win-either-half", family: "Result Protection", market: "Result Protection", selectionOf: (home) => `${home} to Win Either Half` },
  "away-win-either-half": { key: "away-win-either-half", family: "Result Protection", market: "Result Protection", selectionOf: (_home, away) => `${away} to Win Either Half` }
};

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function resultCode(forGoals, againstGoals) {
  const scored = Number(forGoals);
  const conceded = Number(againstGoals);
  if (!Number.isFinite(scored) || !Number.isFinite(conceded)) return null;
  if (scored > conceded) return "W";
  if (scored < conceded) return "L";
  return "D";
}

export function toPerspectiveGame(fixture, teamId) {
  const isHome = Number(fixture.home_team_id) === Number(teamId);
  const htFor = isHome ? fixture.halftime_home : fixture.halftime_away;
  const htAgainst = isHome ? fixture.halftime_away : fixture.halftime_home;
  const ftFor = isHome ? fixture.fulltime_home : fixture.fulltime_away;
  const ftAgainst = isHome ? fixture.fulltime_away : fixture.fulltime_home;
  const htResult = resultCode(htFor, htAgainst);
  const ftResult = resultCode(ftFor, ftAgainst);
  const shFor = Number.isFinite(Number(ftFor)) && Number.isFinite(Number(htFor)) ? Number(ftFor) - Number(htFor) : null;
  const shAgainst = Number.isFinite(Number(ftAgainst)) && Number.isFinite(Number(htAgainst))
    ? Number(ftAgainst) - Number(htAgainst)
    : null;
  return {
    id: fixture.id,
    date: fixture.fixture_date || fixture.date || null,
    venue: isHome ? "home" : "away",
    htFor: Number.isFinite(Number(htFor)) ? Number(htFor) : null,
    htAgainst: Number.isFinite(Number(htAgainst)) ? Number(htAgainst) : null,
    ftFor: Number.isFinite(Number(ftFor)) ? Number(ftFor) : null,
    ftAgainst: Number.isFinite(Number(ftAgainst)) ? Number(ftAgainst) : null,
    shFor,
    shAgainst,
    htResult,
    ftResult,
    shResult: resultCode(shFor, shAgainst),
    transition: htResult && ftResult ? `${htResult}${ftResult}` : null,
    totalGoals: Number.isFinite(Number(ftFor)) && Number.isFinite(Number(ftAgainst))
      ? Number(ftFor) + Number(ftAgainst)
      : null
  };
}

function normaliseGame(game) {
  if (!game) return null;
  if (game.ftResult && Number.isFinite(Number(game.ftFor))) return game;
  if (game.home_team_id != null && game.fulltime_home != null) {
    return toPerspectiveGame(game, game.teamId || game.perspectiveTeamId);
  }
  const ftFor = Number(game.ftFor);
  const ftAgainst = Number(game.ftAgainst);
  if (!Number.isFinite(ftFor) || !Number.isFinite(ftAgainst)) return null;
  const htFor = Number.isFinite(Number(game.htFor)) ? Number(game.htFor) : null;
  const htAgainst = Number.isFinite(Number(game.htAgainst)) ? Number(game.htAgainst) : null;
  const shFor = htFor == null ? null : ftFor - htFor;
  const shAgainst = htAgainst == null ? null : ftAgainst - htAgainst;
  const htResult = resultCode(htFor, htAgainst);
  const ftResult = resultCode(ftFor, ftAgainst);
  return {
    ...game,
    htFor,
    htAgainst,
    ftFor,
    ftAgainst,
    shFor,
    shAgainst,
    htResult,
    ftResult,
    shResult: resultCode(shFor, shAgainst),
    transition: htResult && ftResult ? `${htResult}${ftResult}` : null,
    totalGoals: ftFor + ftAgainst
  };
}

export function summarizeRecentFive(games = []) {
  const rows = games.map(normaliseGame).filter(Boolean).slice(0, SPLIT_FORM_WINDOW);
  const complete = rows.filter((game) => game.ftResult);
  const htftRows = complete.filter((game) => game.transition);
  const shRows = complete.filter((game) => game.shFor != null && game.shAgainst != null);
  const transitions = { WW: 0, WD: 0, WL: 0, DW: 0, DD: 0, DL: 0, LW: 0, LD: 0, LL: 0 };
  for (const game of htftRows) {
    if (transitions[game.transition] != null) transitions[game.transition] += 1;
  }

  const wins = complete.filter((game) => game.ftResult === "W").length;
  const draws = complete.filter((game) => game.ftResult === "D").length;
  const losses = complete.filter((game) => game.ftResult === "L").length;
  const lastTwo = complete.slice(0, 2);
  const lastTwoPoints = lastTwo.reduce((sum, game) => sum + (game.ftResult === "W" ? 3 : game.ftResult === "D" ? 1 : 0), 0);
  const gf = complete.reduce((sum, game) => sum + Number(game.ftFor || 0), 0);
  const ga = complete.reduce((sum, game) => sum + Number(game.ftAgainst || 0), 0);

  return {
    matches: complete.length,
    htftMatches: htftRows.length,
    form: complete.map((game) => game.ftResult).join(""),
    formLine: complete.map((game) => game.ftResult).join("-") || "—",
    scoreline: complete.map((game) => `${game.ftFor}-${game.ftAgainst}`).join(", ") || "—",
    wins,
    draws,
    losses,
    points: wins * 3 + draws,
    lastTwoPoints,
    gf,
    ga,
    gd: gf - ga,
    scoredIn: complete.filter((game) => Number(game.ftFor) > 0).length,
    concededIn: complete.filter((game) => Number(game.ftAgainst) > 0).length,
    over15: complete.filter((game) => Number(game.totalGoals) >= 2).length,
    over25: complete.filter((game) => Number(game.totalGoals) >= 3).length,
    under35: complete.filter((game) => Number(game.totalGoals) <= 3).length,
    btts: complete.filter((game) => Number(game.ftFor) > 0 && Number(game.ftAgainst) > 0).length,
    firstHalfScored: shRows.filter((game) => Number(game.htFor) > 0).length,
    secondHalfScored: shRows.filter((game) => Number(game.shFor) > 0).length,
    secondHalfGoal: shRows.filter((game) => Number(game.shFor) + Number(game.shAgainst) > 0).length,
    winEitherHalf: shRows.filter((game) => game.htResult === "W" || game.shResult === "W").length,
    secondHalfWins: shRows.filter((game) => game.shResult === "W").length,
    ledAtHt: htftRows.filter((game) => game.htResult === "W").length,
    collapsed: htftRows.filter((game) => game.transition === "WL").length,
    recovered: htftRows.filter((game) => game.transition === "LW" || game.transition === "DW").length,
    transitions,
    games: complete
  };
}

function sideStrength(side) {
  if (!side.matches) return 0;
  return clamp(
    (side.points / (SPLIT_FORM_WINDOW * 3)) * 0.34 +
    (side.wins / SPLIT_FORM_WINDOW) * 0.2 +
    ((side.transitions.WW + side.transitions.DW) / Math.max(1, side.htftMatches)) * 0.18 +
    (side.lastTwoPoints / 6) * 0.14 +
    (side.scoredIn / SPLIT_FORM_WINDOW) * 0.14 -
    (side.collapsed / Math.max(1, side.htftMatches)) * 0.16 -
    (side.losses / SPLIT_FORM_WINDOW) * 0.1
  );
}

function expectedGoals(home, away) {
  const homeAttack = home.matches ? home.gf / home.matches : 0;
  const awayAttack = away.matches ? away.gf / away.matches : 0;
  const homeDefend = home.matches ? home.ga / home.matches : 0;
  const awayDefend = away.matches ? away.ga / away.matches : 0;
  return round(((homeAttack + awayDefend) / 2) + ((awayAttack + homeDefend) / 2), 3);
}

function noPick(reasons, audit = {}) {
  const reasonList = Array.isArray(reasons) ? reasons : [reasons];
  return {
    available: false,
    key: "no-pick",
    family: "No Pick",
    market: "No Pick",
    selection: "NO PICK",
    score: 0,
    confidence: 0,
    qualified: false,
    mode: "no-pick",
    tier: "NO PICK",
    reasons: reasonList,
    cautions: reasonList,
    engineKey: "form",
    engineName: "Split Form",
    description: "Split Form only uses each team's last five finished league matches: HT/FT split, W-D-L form and form goals.",
    explanationParagraph: reasonList[0],
    publicExplanation: reasonList[0],
    independentConsensusVote: true,
    consensusEligible: false,
    engineSource: SPLIT_FORM_VERSION,
    engineVersion: SPLIT_FORM_VERSION,
    internalAudit: { version: SPLIT_FORM_VERSION, ...audit },
    explanationEvidence: { formPicture: audit.formPicture || null }
  };
}

function buildPick(key, score, homeName, awayName, reasons, audit) {
  const market = MARKETS[key];
  const confidence = round(score * 100, 1);
  const explanation = reasons.join(" ");
  return {
    available: true,
    key,
    family: market.family,
    market: market.market,
    selection: market.selectionOf(homeName, awayName),
    score: confidence,
    confidence,
    qualified: true,
    mode: "qualified",
    tier: "Qualified",
    reasons,
    cautions: [],
    engineKey: "form",
    engineName: "Split Form",
    description: "Split Form only uses each team's last five finished league matches: HT/FT split, W-D-L form and form goals.",
    explanationParagraph: explanation,
    publicExplanation: explanation,
    independentConsensusVote: true,
    consensusEligible: true,
    engineSource: SPLIT_FORM_VERSION,
    engineVersion: SPLIT_FORM_VERSION,
    internalAudit: {
      version: SPLIT_FORM_VERSION,
      story: audit.story,
      score: round(score),
      home: audit.home,
      away: audit.away,
      expectedGoals: audit.expectedGoals,
      formPicture: audit.formPicture
    },
    explanationEvidence: {
      formPicture: audit.formPicture,
      selectionBasis: "last-five HT/FT split, form and form goals"
    }
  };
}

function formPicture(home, away, homeName, awayName) {
  return {
    home: {
      name: homeName,
      form: home.formLine,
      points: home.points,
      goals: `${home.gf}-${home.ga}`,
      scoreline: home.scoreline,
      htft: home.transitions
    },
    away: {
      name: awayName,
      form: away.formLine,
      points: away.points,
      goals: `${away.gf}-${away.ga}`,
      scoreline: away.scoreline,
      htft: away.transitions
    }
  };
}

export function selectSplitFormPick(input = {}) {
  const homeName = input.home?.name || "Home";
  const awayName = input.away?.name || "Away";
  const homeGames = input.home?.recentFive || input.homeRecentFive || [];
  const awayGames = input.away?.recentFive || input.awayRecentFive || [];
  const home = summarizeRecentFive(homeGames);
  const away = summarizeRecentFive(awayGames);
  const picture = formPicture(home, away, homeName, awayName);

  if (home.matches < SPLIT_FORM_MIN_GAMES || away.matches < SPLIT_FORM_MIN_GAMES) {
    return noPick(
      [`Split Form needs ${SPLIT_FORM_MIN_GAMES} finished league matches for both teams. Home has ${home.matches}, away has ${away.matches}.`],
      { formPicture: picture, home, away }
    );
  }

  const homePower = sideStrength(home);
  const awayPower = sideStrength(away);
  const xg = expectedGoals(home, away);
  const gap = homePower - awayPower;
  const audit = { home, away, expectedGoals: xg, formPicture: picture };

  const candidates = [];
  const push = (key, score, story, reasons) => {
    if (score >= SPLIT_FORM_QUALIFY) {
      candidates.push({ key, score: clamp(score), story, reasons });
    }
  };

  const homeResultBase = homePower * 0.62 + (1 - awayPower) * 0.28 + (home.ledAtHt / 5) * 0.1;
  const awayResultBase = awayPower * 0.62 + (1 - homePower) * 0.28 + (away.ledAtHt / 5) * 0.1;

  if (gap >= 0.12 && home.losses <= 2 && away.wins <= 3) {
    const winScore = homeResultBase - 0.06 - home.collapsed * 0.06;
    const dnbScore = homeResultBase - 0.01;
    const dcScore = homeResultBase + 0.05;
    if (winScore >= 0.8 && home.wins >= 4 && away.wins <= 1 && home.collapsed === 0) {
      push("home-win", winScore, "HOME_FORM", [
        `${homeName} won ${home.wins} of the last five (${home.formLine}) and the HT/FT split shows no blown leads.`,
        `${awayName} only took ${away.points}/15 points (${away.formLine}) with form goals ${away.scoreline}.`
      ]);
    } else if (dnbScore >= SPLIT_FORM_QUALIFY && home.wins >= 3 && home.collapsed <= 1) {
      push("home-dnb", dnbScore, "HOME_FORM", [
        `${homeName} hold the last-five form edge (${home.formLine} vs ${away.formLine}). Draw No Bet keeps the split without needing to survive a draw as a loss.`,
        `Home HT/FT leads or recoveries: ${home.ledAtHt + home.recovered} of ${home.htftMatches}.`
      ]);
    } else {
      push("home-1x", dcScore, "HOME_FORM", [
        `${homeName} avoid defeat on last-five form (${home.formLine}, ${home.points} points) while ${awayName} are at ${away.formLine}.`,
        `Split Form stays on Home or Draw because five matches are too few for a sharper result.`
      ]);
    }
    if (home.winEitherHalf >= 4 && home.wins < 4) {
      push("home-win-either-half", 0.68 + (home.winEitherHalf / 5) * 0.16, "HOME_HALF", [
        `${homeName} won at least one half in ${home.winEitherHalf} of the last five HT/FT splits.`
      ]);
    }
  }

  if (gap <= -0.12 && away.losses <= 2 && home.wins <= 3) {
    const winScore = awayResultBase - 0.06 - away.collapsed * 0.06;
    const dnbScore = awayResultBase - 0.01;
    const dcScore = awayResultBase + 0.05;
    if (winScore >= 0.8 && away.wins >= 4 && home.wins <= 1 && away.collapsed === 0) {
      push("away-win", winScore, "AWAY_FORM", [
        `${awayName} won ${away.wins} of the last five (${away.formLine}).`,
        `${homeName} are at ${home.formLine} with form goals ${home.scoreline}.`
      ]);
    } else if (dnbScore >= SPLIT_FORM_QUALIFY && away.wins >= 3 && away.collapsed <= 1) {
      push("away-dnb", dnbScore, "AWAY_FORM", [
        `${awayName} hold the last-five form edge (${away.formLine} vs ${home.formLine}).`
      ]);
    } else {
      push("away-x2", dcScore, "AWAY_FORM", [
        `${awayName} avoid defeat on last-five form (${away.formLine}, ${away.points} points).`
      ]);
    }
    if (away.winEitherHalf >= 4 && away.wins < 4) {
      push("away-win-either-half", 0.68 + (away.winEitherHalf / 5) * 0.16, "AWAY_HALF", [
        `${awayName} won at least one half in ${away.winEitherHalf} of the last five HT/FT splits.`
      ]);
    }
  }

  const goalClimate = clamp((xg - 1.7) / 2.4);
  const lowClimate = clamp((3.1 - xg) / 2.4);
  push(
    "over-15",
    0.5 + (home.over15 + away.over15) / 50 + goalClimate * 0.16 + (home.scoredIn + away.scoredIn) / 50,
    "MATCH_GOALS",
    [`Last-five totals point to more than one goal: ${homeName} ${home.over15}/5 over 1.5, ${awayName} ${away.over15}/5. Form goals ${home.scoreline} against ${away.scoreline}.`]
  );
  if (home.over25 + away.over25 >= 7 && xg >= 2.8) {
    push(
      "over-25",
      0.55 + (home.over25 + away.over25) / 40 + goalClimate * 0.16,
      "MATCH_GOALS",
      [`Both last-five goal lines are busy (${home.gf}-${home.ga} and ${away.gf}-${away.ga}), so Split Form steps to Over 2.5.`]
    );
  }
  if (home.under35 >= 4 && away.under35 >= 4 && xg <= 2.6) {
    push(
      "under-35",
      0.52 + (home.under35 + away.under35) / 40 + lowClimate * 0.16,
      "LOW_EVENT",
      [`Last-five form goals stayed under four in ${home.under35} and ${away.under35} of five matches.`]
    );
  }
  if (home.scoredIn >= 4 && away.scoredIn >= 4 && home.concededIn >= 3 && away.concededIn >= 3) {
    push(
      "gg-yes",
      0.54 + (home.btts + away.btts) / 40 + (Math.min(home.scoredIn, away.scoredIn) / 5) * 0.14,
      "BTTS",
      [`Both teams scored in ${home.scoredIn} and ${away.scoredIn} of their last five, and both also concede regularly.`]
    );
  }
  if (home.scoredIn >= 5 && gap > -0.08) {
    push("home-over-05", 0.76 + Math.min(0.08, home.gf / 40), "HOME_GOAL", [
      `${homeName} scored in all five recent matches (${home.scoreline}).`
    ]);
  }
  if (away.scoredIn >= 5 && gap < 0.08) {
    push("away-over-05", 0.76 + Math.min(0.08, away.gf / 40), "AWAY_GOAL", [
      `${awayName} scored in all five recent matches (${away.scoreline}).`
    ]);
  }
  if (home.secondHalfGoal >= 4 && away.secondHalfGoal >= 4) {
    push(
      "second-half-over-05",
      0.66 + (home.secondHalfGoal + away.secondHalfGoal) / 50,
      "SECOND_HALF",
      [`A second-half goal landed in ${home.secondHalfGoal} and ${away.secondHalfGoal} of the last five HT/FT splits.`]
    );
  }
  if (!candidates.length) {
    return noPick(
      ["Last-five HT/FT, form and form goals did not produce one market that cleared Split Form's independent bar."],
      audit
    );
  }

  candidates.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  const top = candidates[0];
  const runner = candidates[1];
  if (runner && Math.abs(top.score - runner.score) < 0.02 && top.story !== runner.story) {
    return noPick(
      [`Split Form withheld the match because ${MARKETS[top.key].family} and ${MARKETS[runner.key].family} were too close on the last-five picture.`],
      audit
    );
  }

  return buildPick(top.key, top.score, homeName, awayName, top.reasons, { ...audit, story: top.story });
}
