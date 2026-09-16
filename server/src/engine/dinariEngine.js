export const DINARI_ENGINE_NAME = "Dinari";
export const DINARI_ENGINE_VERSION = "dinari-v1.0.0";
export const DINARI_ENGINE_KEY = "dinari";
export const DINARI_MIN_MATCHES = 5;

export const OVER_25_GF_MIN = 2.2;
export const OVER_25_PARTNER_GF_MIN = 1.3;
export const OVER_25_DRAW_MIN = 3.6;

export const OVER_15_SOLO_GF_MIN = 2.2;
export const OVER_15_SOLO_GA_MAX = 1;
export const OVER_15_BOTH_GF_MIN = 1.8;
export const OVER_15_BOTH_GA_MIN = 1.5;

export const UNDER_25_GF_MAX = 1;
export const UNDER_25_GA_MAX = 1;
export const UNDER_25_DRAW_MAX = 2.9;

export const UNDER_35_SOLO_GF_MAX = 1.4;
export const UNDER_35_SOLO_GA_MAX = 1;
export const UNDER_35_BOTH_GF_MAX = 1;
export const UNDER_35_BOTH_GA_MAX = 1.2;
export const UNDER_35_DRAW_MAX = 3.1;

const MARKETS = {
  "over-25": {
    key: "over-25",
    market: "Total Goals",
    selection: "Over 2.5",
    direction: "over",
    line: 2.5,
    oddsKey: "over-25"
  },
  "over-15": {
    key: "over-15",
    market: "Total Goals",
    selection: "Over 1.5",
    direction: "over",
    line: 1.5,
    oddsKey: "over-15"
  },
  "under-25": {
    key: "under-25",
    market: "Total Goals",
    selection: "Under 2.5",
    direction: "under",
    line: 2.5,
    oddsKey: "under-25"
  },
  "under-35": {
    key: "under-35",
    market: "Total Goals",
    selection: "Under 3.5",
    direction: "under",
    line: 3.5,
    oddsKey: "under-35"
  }
};

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function bookMap(odds) {
  if (!odds) return {};
  if (odds.odds && typeof odds.odds === "object") return { ...odds, ...odds.odds };
  return odds;
}

export function drawOddOf(odds = {}) {
  const book = bookMap(odds);
  const draw = num(book.draw ?? book.x ?? book.Draw);
  return draw != null && draw > 1 ? draw : null;
}

export function marketOddOf(odds = {}, key) {
  const book = bookMap(odds);
  const aliases = {
    "over-15": ["over-15", "over15", "over_1_5", "over1.5"],
    "over-25": ["over-25", "over25", "over_2_5", "over2.5"],
    "under-25": ["under-25", "under25", "under_2_5", "under2.5"],
    "under-35": ["under-35", "under35", "under_3_5", "under3.5"]
  };
  for (const alias of aliases[key] || [key]) {
    const price = num(book[alias]);
    if (price != null && price > 1) return price;
  }
  return 0;
}

export function averagesOf(side = {}) {
  const played = num(side.played ?? side.matches ?? side.matchesPlayed) || 0;
  const gfTotal = num(side.gf ?? side.goalsFor ?? side.goals_scored);
  const gaTotal = num(side.ga ?? side.goalsAgainst ?? side.goals_conceded);
  const gfAvg = num(side.gfAvg ?? side.gpg ?? side.gfAverage);
  const gaAvg = num(side.gaAvg ?? side.gapg ?? side.gaAverage);
  const scored = gfAvg != null
    ? gfAvg
    : played > 0 && gfTotal != null
      ? gfTotal / played
      : null;
  const conceded = gaAvg != null
    ? gaAvg
    : played > 0 && gaTotal != null
      ? gaTotal / played
      : null;
  return {
    played,
    gf: scored == null ? null : round(scored, 3),
    ga: conceded == null ? null : round(conceded, 3)
  };
}

function teamLabel(snapshot, side) {
  if (side === "home") return snapshot.homeName || "Home";
  return snapshot.awayName || "Away";
}

function over25Hits(home, away, draw) {
  if (draw == null || !(draw > OVER_25_DRAW_MIN)) return null;
  const sides = [
    { side: "home", ...home },
    { side: "away", ...away }
  ];
  const attack = sides.find((row) => row.gf != null && row.gf > OVER_25_GF_MIN);
  if (!attack) return null;
  if (home.gf == null || away.gf == null) return null;
  if (Math.min(home.gf, away.gf) < OVER_25_PARTNER_GF_MIN) return null;
  const partner = attack.side === "home" ? away : home;
  return {
    ruleId: "dinari-over-25",
    branch: "solo-attack-plus-partner",
    trigger: `${attack.side} averages ${round(attack.gf, 2)} scored`,
    reasons: [
      `At least one side averages over ${OVER_25_GF_MIN} goals scored (${round(attack.gf, 2)}).`,
      `The other side still averages not less than ${OVER_25_PARTNER_GF_MIN} (${round(partner.gf, 2)}).`,
      `Draw odds ${round(draw, 2)} sit over ${OVER_25_DRAW_MIN.toFixed(2)}.`
    ]
  };
}

function over15Hits(home, away) {
  const sides = [
    { side: "home", ...home },
    { side: "away", ...away }
  ];
  const locked = sides.find((row) =>
    row.gf != null && row.ga != null && row.gf > OVER_15_SOLO_GF_MIN && row.ga < OVER_15_SOLO_GA_MAX
  );
  if (locked) {
    return {
      ruleId: "dinari-over-15-solo",
      branch: "attack-and-tight",
      trigger: `${locked.side} ${round(locked.gf, 2)} scored, ${round(locked.ga, 2)} conceded`,
      reasons: [
        `At least one side averages over ${OVER_15_SOLO_GF_MIN} goals scored (${round(locked.gf, 2)}).`,
        `That same side concedes less than ${OVER_15_SOLO_GA_MAX} (${round(locked.ga, 2)}).`
      ]
    };
  }
  if (
    home.gf != null && away.gf != null && home.ga != null && away.ga != null &&
    home.gf >= OVER_15_BOTH_GF_MIN && away.gf >= OVER_15_BOTH_GF_MIN &&
    home.ga >= OVER_15_BOTH_GA_MIN && away.ga >= OVER_15_BOTH_GA_MIN
  ) {
    return {
      ruleId: "dinari-over-15-both",
      branch: "both-open",
      trigger: "Both sides score and concede freely",
      reasons: [
        `Both sides average not less than ${OVER_15_BOTH_GF_MIN.toFixed(2)} goals scored (${round(home.gf, 2)} / ${round(away.gf, 2)}).`,
        `Both sides concede not less than ${OVER_15_BOTH_GA_MIN.toFixed(2)} (${round(home.ga, 2)} / ${round(away.ga, 2)}).`
      ]
    };
  }
  return null;
}

function under25Hits(home, away, draw) {
  if (draw == null || !(draw <= UNDER_25_DRAW_MAX)) return null;
  const sides = [
    { side: "home", ...home },
    { side: "away", ...away }
  ];
  const tight = sides.find((row) =>
    row.gf != null && row.ga != null && row.gf < UNDER_25_GF_MAX && row.ga < UNDER_25_GA_MAX
  );
  const bothLow =
    home.gf != null && away.gf != null && home.ga != null && away.ga != null &&
    home.gf < UNDER_25_GF_MAX && away.gf < UNDER_25_GF_MAX &&
    home.ga < UNDER_25_GA_MAX && away.ga < UNDER_25_GA_MAX;
  if (!tight && !bothLow) return null;
  return {
    ruleId: bothLow ? "dinari-under-25-both" : "dinari-under-25-solo",
    branch: bothLow ? "both-locked" : "solo-locked",
    trigger: bothLow
      ? "Both sides average under 1 scored and conceded"
      : `${tight.side} averages under 1 scored and conceded`,
    reasons: bothLow
      ? [
          `Both sides average less than ${UNDER_25_GF_MAX} goal scored (${round(home.gf, 2)} / ${round(away.gf, 2)}).`,
          `Both sides concede less than ${UNDER_25_GA_MAX} (${round(home.ga, 2)} / ${round(away.ga, 2)}).`,
          `Draw odds ${round(draw, 2)} are not greater than ${UNDER_25_DRAW_MAX.toFixed(2)}.`
        ]
      : [
          `At least one side averages less than ${UNDER_25_GF_MAX} goal scored (${round(tight.gf, 2)}).`,
          `That same side concedes less than ${UNDER_25_GA_MAX} (${round(tight.ga, 2)}).`,
          `Draw odds ${round(draw, 2)} are not greater than ${UNDER_25_DRAW_MAX.toFixed(2)}.`
        ]
  };
}

function under35Hits(home, away, draw) {
  if (draw == null || !(draw <= UNDER_35_DRAW_MAX)) return null;
  const sides = [
    { side: "home", ...home },
    { side: "away", ...away }
  ];
  const tight = sides.find((row) =>
    row.gf != null && row.ga != null && row.gf < UNDER_35_SOLO_GF_MAX && row.ga < UNDER_35_SOLO_GA_MAX
  );
  const bothLow =
    home.gf != null && away.gf != null && home.ga != null && away.ga != null &&
    home.gf < UNDER_35_BOTH_GF_MAX && away.gf < UNDER_35_BOTH_GF_MAX &&
    home.ga < UNDER_35_BOTH_GA_MAX && away.ga < UNDER_35_BOTH_GA_MAX;
  if (!tight && !bothLow) return null;
  return {
    ruleId: bothLow ? "dinari-under-35-both" : "dinari-under-35-solo",
    branch: bothLow ? "both-quiet" : "solo-quiet",
    trigger: bothLow
      ? "Both sides sit under 1 scored and 1.2 conceded"
      : `${tight.side} averages under 1.4 scored and under 1 conceded`,
    reasons: bothLow
      ? [
          `Both sides average less than ${UNDER_35_BOTH_GF_MAX} goal scored (${round(home.gf, 2)} / ${round(away.gf, 2)}).`,
          `Both sides concede less than ${UNDER_35_BOTH_GA_MAX} (${round(home.ga, 2)} / ${round(away.ga, 2)}).`,
          `Draw odds ${round(draw, 2)} are not greater than ${UNDER_35_DRAW_MAX.toFixed(2)}.`
        ]
      : [
          `At least one side averages less than ${UNDER_35_SOLO_GF_MAX} goals scored (${round(tight.gf, 2)}).`,
          `That same side concedes less than ${UNDER_35_SOLO_GA_MAX} (${round(tight.ga, 2)}).`,
          `Draw odds ${round(draw, 2)} are not greater than ${UNDER_35_DRAW_MAX.toFixed(2)}.`
        ]
  };
}

function confidenceFor(key, home, away, draw, hit) {
  let score = 72;
  if (key === "over-25") {
    score += clamp((Math.max(home.gf, away.gf) - OVER_25_GF_MIN) * 8, 0, 12);
    score += clamp((Math.min(home.gf, away.gf) - OVER_25_PARTNER_GF_MIN) * 6, 0, 8);
    score += clamp((draw - OVER_25_DRAW_MIN) * 3, 0, 6);
  } else if (key === "over-15") {
    if (hit.branch === "attack-and-tight") {
      const attack = home.gf > OVER_15_SOLO_GF_MIN && home.ga < OVER_15_SOLO_GA_MAX ? home : away;
      score += clamp((attack.gf - OVER_15_SOLO_GF_MIN) * 6, 0, 10);
      score += clamp((OVER_15_SOLO_GA_MAX - attack.ga) * 8, 0, 8);
    } else {
      score += clamp((Math.min(home.gf, away.gf) - OVER_15_BOTH_GF_MIN) * 8, 0, 8);
      score += clamp((Math.min(home.ga, away.ga) - OVER_15_BOTH_GA_MIN) * 6, 0, 8);
    }
  } else if (key === "under-25") {
    score += clamp((UNDER_25_GF_MAX - Math.min(home.gf, away.gf)) * 10, 0, 10);
    score += clamp((UNDER_25_GA_MAX - Math.min(home.ga, away.ga)) * 8, 0, 8);
    score += clamp((UNDER_25_DRAW_MAX - draw) * 4, 0, 6);
  } else if (key === "under-35") {
    score += clamp((UNDER_35_SOLO_GF_MAX - Math.min(home.gf, away.gf)) * 8, 0, 8);
    score += clamp((UNDER_35_SOLO_GA_MAX - Math.min(home.ga, away.ga)) * 8, 0, 8);
    score += clamp((UNDER_35_DRAW_MAX - draw) * 3, 0, 6);
  }
  return round(clamp(score, 70, 96), 1);
}

function explain(snapshot, home, away, draw, market, hit) {
  const homeName = teamLabel(snapshot, "home");
  const awayName = teamLabel(snapshot, "away");
  return `${market.selection} is the Dinari banker for ${homeName} vs ${awayName}. ${homeName} ${round(home.gf, 2)} scored / ${round(home.ga, 2)} conceded, ${awayName} ${round(away.gf, 2)} / ${round(away.ga, 2)}, draw ${round(draw, 2)}.`;
}

function buildPick(snapshot, key, hit, home, away, draw) {
  const market = MARKETS[key];
  const odds = marketOddOf(snapshot.odds, market.oddsKey);
  const confidence = confidenceFor(key, home, away, draw, hit);
  const why = explain(snapshot, home, away, draw, market, hit);
  return {
    available: true,
    qualified: true,
    fixtureId: snapshot.fixtureId || snapshot.id || null,
    kickoff: snapshot.kickoff || null,
    homeName: teamLabel(snapshot, "home"),
    awayName: teamLabel(snapshot, "away"),
    engine: DINARI_ENGINE_NAME,
    engineKey: DINARI_ENGINE_KEY,
    engineVersion: DINARI_ENGINE_VERSION,
    key: market.key,
    market: market.market,
    selection: market.selection,
    direction: market.direction,
    line: market.line,
    odds,
    drawOdd: round(draw, 2),
    homeOdd: num(bookMap(snapshot.odds).home) || 0,
    awayOdd: num(bookMap(snapshot.odds).away) || 0,
    odds1x2: {
      home: num(bookMap(snapshot.odds).home) || 0,
      draw: round(draw, 2),
      away: num(bookMap(snapshot.odds).away) || 0
    },
    homePlayed: home.played,
    awayPlayed: away.played,
    homeGf: home.gf,
    homeGa: home.ga,
    awayGf: away.gf,
    awayGa: away.ga,
    averages: { home, away },
    confidence,
    score: confidence,
    modelProbability: confidence,
    tier: "BANKER",
    ruleId: hit.ruleId,
    branch: hit.branch,
    trigger: hit.trigger,
    reasons: hit.reasons,
    why,
    publicExplanation: why,
    note: hit.reasons[0]
  };
}

export function selectDinariPicks(snapshot = {}) {
  const home = averagesOf(snapshot.home || {});
  const away = averagesOf(snapshot.away || {});
  if (home.played < DINARI_MIN_MATCHES || away.played < DINARI_MIN_MATCHES) return [];
  if (home.gf == null || home.ga == null || away.gf == null || away.ga == null) return [];
  const draw = drawOddOf(snapshot.odds);
  const hits = [];
  const over25 = over25Hits(home, away, draw);
  const over15 = over15Hits(home, away);
  const under25 = under25Hits(home, away, draw);
  const under35 = under35Hits(home, away, draw);
  if (over25) hits.push(buildPick(snapshot, "over-25", over25, home, away, draw));
  else if (over15) hits.push(buildPick(snapshot, "over-15", over15, home, away, draw || 0));
  if (under25) hits.push(buildPick(snapshot, "under-25", under25, home, away, draw));
  else if (under35) hits.push(buildPick(snapshot, "under-35", under35, home, away, draw));
  return hits;
}

export function runDinari(snapshots = []) {
  const picks = [];
  for (const snapshot of snapshots || []) {
    picks.push(...selectDinariPicks(snapshot));
  }
  return picks.sort((left, right) =>
    Date.parse(left.kickoff || 0) - Date.parse(right.kickoff || 0) ||
    right.confidence - left.confidence
  );
}

export { MARKETS as DINARI_MARKETS };
