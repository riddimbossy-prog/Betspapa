const RESULT_KEYS = new Set([
  "home-win", "away-win", "home-dnb", "away-dnb", "home-1x", "away-x2",
  "no-draw", "draw", "ft-draw", "ht-home", "ht-away", "ht-draw",
  "ht-home-or-draw", "ht-away-or-draw", "home-win-either-half",
  "away-win-either-half", "draw-either-half", "exact-htft"
]);

const HALF_KEYS = new Set([
  "ht-home", "ht-away", "ht-draw", "ht-home-or-draw", "ht-away-or-draw",
  "first-half-over-05", "first-half-over-15", "second-half-over-05",
  "second-half-over-15", "goals-both-halves", "home-second-half-over-05",
  "away-second-half-over-05", "home-second-half-dnb", "away-second-half-dnb",
  "home-win-either-half", "away-win-either-half", "draw-either-half", "exact-htft"
]);

const EXACT_KEYS = new Set(["exact-htft"]);
const STRAIGHT_RESULT_KEYS = new Set(["home-win", "away-win", "draw", "ft-draw", "no-draw"]);
const PROTECTION_KEYS = new Set([
  "home-dnb", "away-dnb", "home-1x", "away-x2", "home-win-either-half",
  "away-win-either-half", "draw-either-half", "ht-home-or-draw", "ht-away-or-draw",
  "home-second-half-dnb", "away-second-half-dnb"
]);
const BROAD_GOAL_KEYS = new Set([
  "over-15", "under-35", "home-over-05", "away-over-05", "first-half-over-05",
  "second-half-over-05"
]);
const TWO_TEAM_GOAL_KEYS = new Set(["gg-yes", "gg-no", "goals-both-halves"]);
const SHARP_GOAL_KEYS = new Set([
  "over-25", "over-35", "under-25", "under-15", "home-over-15", "away-over-15",
  "first-half-over-15", "second-half-over-15", "home-second-half-over-05",
  "away-second-half-over-05"
]);

const CONTAINMENT = {
  "home-win": ["home-dnb", "home-1x", "home-win-either-half", "home-over-05"],
  "away-win": ["away-dnb", "away-x2", "away-win-either-half", "away-over-05"],
  "home-dnb": ["home-1x"],
  "away-dnb": ["away-x2"],
  "home-win-either-half": ["home-dnb", "home-1x", "home-over-05"],
  "away-win-either-half": ["away-dnb", "away-x2", "away-over-05"],
  "over-35": ["over-25", "over-15"],
  "over-25": ["over-15"],
  "home-over-15": ["home-over-05"],
  "away-over-15": ["away-over-05"],
  "first-half-over-15": ["first-half-over-05", "over-15"],
  "second-half-over-15": ["second-half-over-05", "over-15"],
  "goals-both-halves": ["first-half-over-05", "second-half-over-05", "over-15"],
  "home-second-half-over-05": ["home-over-05", "second-half-over-05"],
  "away-second-half-over-05": ["away-over-05", "second-half-over-05"],
  "under-15": ["under-25", "under-35"],
  "under-25": ["under-35"],
  "gg-yes": ["over-15"],
  "total-2-3": ["over-15", "under-35"],
  "ht-home": ["ht-home-or-draw"],
  "ht-away": ["ht-away-or-draw"]
};

const ESCALATION = {
  "home-1x": ["home-dnb", "home-win"],
  "away-x2": ["away-dnb", "away-win"],
  "home-dnb": ["home-win"],
  "away-dnb": ["away-win"],
  "home-over-05": ["home-over-15"],
  "away-over-05": ["away-over-15"],
  "over-15": ["over-25", "over-35"],
  "over-25": ["over-35"],
  "under-35": ["under-25", "under-15"],
  "under-25": ["under-15"],
  "first-half-over-05": ["first-half-over-15"],
  "second-half-over-05": ["second-half-over-15"],
  "draw-either-half": ["ht-draw"],
  "ht-home-or-draw": ["ht-home"],
  "ht-away-or-draw": ["ht-away"]
};

function exactRouteRelations(primaryMarket, relation) {
  if (primaryMarket?.key !== "exact-htft") return null;
  const route = String(primaryMarket.selection || "").trim();
  const containment = {
    "1/1": ["home-win", "home-dnb", "home-1x", "home-win-either-half", "home-over-05"],
    "X/1": ["home-win", "home-dnb", "home-1x", "draw-either-half"],
    "2/1": ["home-win", "home-dnb", "home-1x", "home-win-either-half", "gg-yes", "over-15"],
    "1/X": ["ft-draw", "gg-yes", "over-15"],
    "X/X": ["ft-draw", "draw-either-half"],
    "2/X": ["ft-draw", "gg-yes", "over-15"],
    "1/2": ["away-win", "away-dnb", "away-x2", "away-win-either-half", "gg-yes", "over-15"],
    "X/2": ["away-win", "away-dnb", "away-x2", "draw-either-half"],
    "2/2": ["away-win", "away-dnb", "away-x2", "away-win-either-half", "away-over-05"]
  };
  if (relation === "containment") return containment[route] || [];
  return [];
}

function relationKeys(primaryMarket, relation) {
  const exact = exactRouteRelations(primaryMarket, relation);
  if (exact) return exact;
  return relation === "containment"
    ? (CONTAINMENT[primaryMarket?.key] || [])
    : (ESCALATION[primaryMarket?.key] || []);
}

const STORY_MARKETS = {
  STABLE_HOME_LEADER: new Set(["home-win", "home-dnb", "home-1x", "home-win-either-half", "home-over-05", "home-over-15", "no-draw", "exact-htft"]),
  STABLE_AWAY_LEADER: new Set(["away-win", "away-dnb", "away-x2", "away-win-either-half", "away-over-05", "away-over-15", "no-draw", "exact-htft"]),
  LATE_HOME_SEPARATION: new Set(["home-dnb", "home-1x", "home-win-either-half", "home-over-05", "home-second-half-over-05", "home-second-half-dnb", "second-half-over-05", "second-half-over-15", "over-15", "exact-htft"]),
  LATE_AWAY_SEPARATION: new Set(["away-dnb", "away-x2", "away-win-either-half", "away-over-05", "away-second-half-over-05", "away-second-half-dnb", "second-half-over-05", "second-half-over-15", "over-15", "exact-htft"]),
  FULL_HOME_REVERSAL: new Set(["home-over-05", "home-win-either-half", "home-dnb", "home-1x", "home-second-half-over-05", "home-second-half-dnb", "gg-yes", "over-15", "over-25", "second-half-over-05", "second-half-over-15"]),
  FULL_AWAY_REVERSAL: new Set(["away-over-05", "away-win-either-half", "away-dnb", "away-x2", "away-second-half-over-05", "away-second-half-dnb", "gg-yes", "over-15", "over-25", "second-half-over-05", "second-half-over-15"]),
  LEAD_SURRENDER: new Set(["over-15", "gg-yes", "second-half-over-05", "second-half-over-15", "goals-both-halves", "draw-either-half"]),
  TWO_WAY_INSTABILITY: new Set(["over-15", "over-25", "gg-yes", "first-half-over-05", "first-half-over-15", "second-half-over-05", "second-half-over-15", "goals-both-halves", "no-draw"]),
  DRAW_LOCK: new Set(["draw-either-half", "draw", "ft-draw", "under-35", "under-25", "ht-draw"]),
  TWO_SIDED_GOALS: new Set(["gg-yes", "over-15", "over-25", "first-half-over-05", "second-half-over-05", "second-half-over-15", "goals-both-halves"]),
  HOME_GOAL_ROUTE: new Set(["home-over-05", "home-over-15", "home-second-half-over-05", "over-15", "over-25", "first-half-over-05", "first-half-over-15", "second-half-over-05"]),
  AWAY_GOAL_ROUTE: new Set(["away-over-05", "away-over-15", "away-second-half-over-05", "over-15", "over-25", "first-half-over-05", "first-half-over-15", "second-half-over-05"]),
  LOW_EVENT_CEILING: new Set(["under-35", "under-25", "under-15", "gg-no", "draw-either-half"]),
  DIRECTIONAL_CONFLICT: new Set(["over-15", "under-35", "gg-yes", "first-half-over-05", "first-half-over-15", "second-half-over-05", "second-half-over-15", "goals-both-halves", "draw-either-half"]),
  VENUE_CONFLICT: new Set(["over-15", "under-35", "gg-yes", "no-draw", "draw-either-half", "first-half-over-05", "second-half-over-05"]),
  FALSE_SWING: new Set(),
  INSUFFICIENT_DATA: new Set()
};

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function profileMatches(profile = {}) {
  if (Number.isFinite(Number(profile.matches))) return Number(profile.matches);
  return ["WW", "WD", "WL", "DW", "DD", "DL", "LW", "LD", "LL"]
    .reduce((sum, key) => sum + Number(profile[key] || 0), 0);
}

function transitionRate(profile, key) {
  const matches = profileMatches(profile);
  return matches ? Number(profile?.[key] || 0) / matches : 0;
}

function weightedHtftProfile(team = {}) {
  const scopes = [
    [team?.htft?.overall, 0.5],
    [team?.htft?.venue, 0.35],
    [team?.htft?.recent, 0.15]
  ].filter(([profile]) => profileMatches(profile) > 0);
  const totalWeight = scopes.reduce((sum, [, weight]) => sum + weight, 0);
  const profile = { matches: totalWeight ? 1 : 0 };
  for (const key of ["WW", "WD", "WL", "DW", "DD", "DL", "LW", "LD", "LL"]) {
    profile[key] = totalWeight
      ? scopes.reduce((sum, [scope, weight]) => sum + transitionRate(scope, key) * weight, 0) / totalWeight
      : 0;
  }
  return profile;
}

function metric(profile, key) {
  const value = Number(profile?.[key]);
  return Number.isFinite(value) ? value : 0;
}

function teamSamples(team) {
  return {
    overall: profileMatches(team?.htft?.overall || {}),
    venue: profileMatches(team?.htft?.venue || {}),
    recent: profileMatches(team?.htft?.recent || {}),
    goalOverall: Number(team?.goals?.overall?.matches || 0),
    goalVenue: Number(team?.goals?.venue?.matches || 0),
    halfOverall: Number(
      team?.halfGoals?.overall?.matches || team?.halfGoals?.overall?.matchesPlayed ||
      (Number.isFinite(Number(team?.goals?.overall?.firstHalfScoringRate)) ? team?.goals?.overall?.matches : 0) || 0
    ),
    halfVenue: Number(
      team?.halfGoals?.venue?.matches || team?.halfGoals?.venue?.matchesPlayed ||
      (Number.isFinite(Number(team?.goals?.venue?.firstHalfScoringRate)) ? team?.goals?.venue?.matches : 0) || 0
    ),
    eventCoverage: Number(team?.halfGoals?.venue?.eventCoverageRate || team?.halfGoals?.overall?.eventCoverageRate || 0)
  };
}

function halfMetric(team, scope, key, fallbackKey = null) {
  const direct = Number(team?.halfGoals?.[scope]?.[key]);
  if (Number.isFinite(direct)) return direct;
  if (fallbackKey) {
    const fallback = Number(team?.goals?.[scope]?.[fallbackKey]);
    if (Number.isFinite(fallback)) return fallback;
  }
  return 0;
}

function halfCountRate(team, scope, key) {
  const matches = Number(team?.halfGoals?.[scope]?.matches || 0);
  if (!matches) return 0;
  return clamp(Number(team?.halfGoals?.[scope]?.[key] || 0) / matches);
}

function eventStateEvidence(input) {
  const homeCoverage = halfMetric(input.home, "venue", "eventCoverageRate");
  const awayCoverage = halfMetric(input.away, "venue", "eventCoverageRate");
  const coverage = Math.min(homeCoverage, awayCoverage);
  const homeComeback = clamp(
    halfCountRate(input.home, "venue", "goalsWhileTrailing") * 0.35 +
    halfCountRate(input.home, "venue", "equalisersScored") * 0.3 +
    halfCountRate(input.home, "venue", "winningGoalsAfterEqualising") * 0.2 +
    (halfCountRate(input.home, "venue", "minute61To75For") * 0.4 +
      halfCountRate(input.home, "venue", "minute76To90For") * 0.6) * 0.15
  );
  const awayComeback = clamp(
    halfCountRate(input.away, "venue", "goalsWhileTrailing") * 0.35 +
    halfCountRate(input.away, "venue", "equalisersScored") * 0.3 +
    halfCountRate(input.away, "venue", "winningGoalsAfterEqualising") * 0.2 +
    (halfCountRate(input.away, "venue", "minute61To75For") * 0.4 +
      halfCountRate(input.away, "venue", "minute76To90For") * 0.6) * 0.15
  );
  const homeCollapse = clamp(
    halfCountRate(input.home, "venue", "leadsSurrendered") * 0.65 +
    (halfCountRate(input.home, "venue", "minute61To75Against") * 0.4 +
      halfCountRate(input.home, "venue", "minute76To90Against") * 0.6) * 0.35
  );
  const awayCollapse = clamp(
    halfCountRate(input.away, "venue", "leadsSurrendered") * 0.65 +
    (halfCountRate(input.away, "venue", "minute61To75Against") * 0.4 +
      halfCountRate(input.away, "venue", "minute76To90Against") * 0.6) * 0.35
  );
  const scale = (value) => clamp(value / 0.28);
  return {
    coverage: round(coverage),
    complete: coverage >= 0.7,
    homeComeback: round(homeComeback),
    awayComeback: round(awayComeback),
    homeCollapse: round(homeCollapse),
    awayCollapse: round(awayCollapse),
    homeReversalSupport: round(Math.sqrt(scale(homeComeback) * scale(awayCollapse))),
    awayReversalSupport: round(Math.sqrt(scale(awayComeback) * scale(homeCollapse))),
    leadSurrenderSupport: round(Math.max(
      Math.sqrt(scale(homeCollapse) * scale(awayComeback)),
      Math.sqrt(scale(awayCollapse) * scale(homeComeback))
    ))
  };
}

function venueStory(input) {
  const h = input.home?.htft?.venue || {};
  const a = input.away?.htft?.venue || {};
  const scores = {
    stableHome: Math.sqrt(transitionRate(h, "WW") * transitionRate(a, "LL")),
    stableAway: Math.sqrt(transitionRate(a, "WW") * transitionRate(h, "LL")),
    lateHome: Math.sqrt(transitionRate(h, "DW") * transitionRate(a, "DL")),
    lateAway: Math.sqrt(transitionRate(a, "DW") * transitionRate(h, "DL")),
    reversalHome: Math.sqrt(transitionRate(h, "LW") * transitionRate(a, "WL")),
    reversalAway: Math.sqrt(transitionRate(a, "LW") * transitionRate(h, "WL")),
    drawLock: Math.sqrt(transitionRate(h, "DD") * transitionRate(a, "DD"))
  };
  const ordered = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topKey, topScore] = ordered[0] || [null, 0];
  const secondScore = ordered[1]?.[1] || 0;
  const map = {
    stableHome: "STABLE_HOME_LEADER",
    stableAway: "STABLE_AWAY_LEADER",
    lateHome: "LATE_HOME_SEPARATION",
    lateAway: "LATE_AWAY_SEPARATION",
    reversalHome: "FULL_HOME_REVERSAL",
    reversalAway: "FULL_AWAY_REVERSAL",
    drawLock: "DRAW_LOCK"
  };
  return {
    classification: map[topKey] || "VENUE_CONFLICT",
    score: round(topScore),
    margin: round(topScore - secondScore),
    scores
  };
}

export function classifyPapaSenseMatch(input, overhaul = {}) {
  const h = weightedHtftProfile(input.home);
  const a = weightedHtftProfile(input.away);
  const hSamples = teamSamples(input.home);
  const aSamples = teamSamples(input.away);
  const venue = venueStory(input);

  if (Math.min(hSamples.overall, aSamples.overall) < 6 || Math.min(hSamples.venue, aSamples.venue) < 3) {
    return {
      classification: "INSUFFICIENT_DATA",
      strength: 0,
      conflict: 1,
      venue,
      reasons: ["The home and away samples are too small for a dependable public selection."],
      samples: { home: hSamples, away: aSamples }
    };
  }

  const secondHalfHomeAttack = halfMetric(input.home, "venue", "secondHalfScoringRate", "secondHalfScoringRate");
  const secondHalfAwayAttack = halfMetric(input.away, "venue", "secondHalfScoringRate", "secondHalfScoringRate");
  const secondHalfHomeWeakness = halfMetric(input.home, "venue", "secondHalfConcedingRate", "concedeRate");
  const secondHalfAwayWeakness = halfMetric(input.away, "venue", "secondHalfConcedingRate", "concedeRate");
  const secondHalfActivity = (secondHalfHomeAttack + secondHalfAwayAttack + secondHalfHomeWeakness + secondHalfAwayWeakness) / 4;
  const eventEvidence = eventStateEvidence(input);
  const eventOrHalf = (eventValue, halfValue) => eventEvidence.complete ? eventValue : halfValue;

  const candidates = [
    ["STABLE_HOME_LEADER", Math.sqrt(transitionRate(h, "WW") * transitionRate(a, "LL"))],
    ["STABLE_AWAY_LEADER", Math.sqrt(transitionRate(a, "WW") * transitionRate(h, "LL"))],
    ["LATE_HOME_SEPARATION", Math.sqrt(transitionRate(h, "DW") * transitionRate(a, "DL")) * (0.75 + 0.25 * Math.max(secondHalfHomeAttack, secondHalfAwayWeakness))],
    ["LATE_AWAY_SEPARATION", Math.sqrt(transitionRate(a, "DW") * transitionRate(h, "DL")) * (0.75 + 0.25 * Math.max(secondHalfAwayAttack, secondHalfHomeWeakness))],
    ["FULL_HOME_REVERSAL", Math.sqrt(transitionRate(h, "LW") * transitionRate(a, "WL")) * (
      0.6 +
      0.25 * Math.max(secondHalfHomeAttack, secondHalfAwayWeakness) +
      0.15 * eventOrHalf(eventEvidence.homeReversalSupport, Math.max(secondHalfHomeAttack, secondHalfAwayWeakness))
    )],
    ["FULL_AWAY_REVERSAL", Math.sqrt(transitionRate(a, "LW") * transitionRate(h, "WL")) * (
      0.6 +
      0.25 * Math.max(secondHalfAwayAttack, secondHalfHomeWeakness) +
      0.15 * eventOrHalf(eventEvidence.awayReversalSupport, Math.max(secondHalfAwayAttack, secondHalfHomeWeakness))
    )],
    ["LEAD_SURRENDER", Math.max(
      Math.sqrt(transitionRate(h, "WD") * transitionRate(a, "LD")),
      Math.sqrt(transitionRate(a, "WD") * transitionRate(h, "LD"))
    ) * (
      0.62 +
      0.23 * secondHalfActivity +
      0.15 * eventOrHalf(eventEvidence.leadSurrenderSupport, secondHalfActivity)
    )],
    ["DRAW_LOCK", Math.sqrt(transitionRate(h, "DD") * transitionRate(a, "DD")) * (0.8 + 0.2 * ((metric(input.home?.goals?.venue, "under35Rate") + metric(input.away?.goals?.venue, "under35Rate")) / 2))],
    ["TWO_SIDED_GOALS", Math.sqrt(metric(input.home?.goals?.venue, "bttsRate") * metric(input.away?.goals?.venue, "bttsRate"))],
    ["HOME_GOAL_ROUTE", Math.sqrt(metric(input.home?.goals?.venue, "scoreRate") * metric(input.away?.goals?.venue, "concedeRate"))],
    ["AWAY_GOAL_ROUTE", Math.sqrt(metric(input.away?.goals?.venue, "scoreRate") * metric(input.home?.goals?.venue, "concedeRate"))],
    ["LOW_EVENT_CEILING", Math.sqrt(metric(input.home?.goals?.venue, "under35Rate") * metric(input.away?.goals?.venue, "under35Rate"))]
  ].sort((left, right) => right[1] - left[1]);

  const swingMassHome = transitionRate(h, "WL") + transitionRate(h, "LW") + 0.35 * (transitionRate(h, "WD") + transitionRate(h, "LD"));
  const swingMassAway = transitionRate(a, "WL") + transitionRate(a, "LW") + 0.35 * (transitionRate(a, "WD") + transitionRate(a, "LD"));
  if (swingMassHome >= 0.2 && swingMassAway >= 0.2 && secondHalfActivity >= 0.55) {
    candidates.push(["TWO_WAY_INSTABILITY", Math.min(0.92, (swingMassHome + swingMassAway + secondHalfActivity) / 3)]);
    candidates.sort((left, right) => right[1] - left[1]);
  }

  const structuralClasses = new Set([
    "STABLE_HOME_LEADER", "STABLE_AWAY_LEADER",
    "LATE_HOME_SEPARATION", "LATE_AWAY_SEPARATION",
    "FULL_HOME_REVERSAL", "FULL_AWAY_REVERSAL",
    "LEAD_SURRENDER", "TWO_WAY_INSTABILITY", "DRAW_LOCK"
  ]);
  const structuralCandidates = candidates
    .filter(([key]) => structuralClasses.has(key))
    .sort((left, right) => right[1] - left[1]);
  const structuralTop = structuralCandidates[0] || [null, 0];
  const rankedCandidates = structuralTop[1] >= 0.22
    ? [...structuralCandidates, ...candidates.filter(([key]) => !structuralClasses.has(key))]
    : candidates;

  const [topClass, topScore] = rankedCandidates[0];
  const secondScore = rankedCandidates[1]?.[1] || 0;
  const directionalPairs = new Set([
    "STABLE_HOME_LEADER|STABLE_AWAY_LEADER", "STABLE_AWAY_LEADER|STABLE_HOME_LEADER",
    "LATE_HOME_SEPARATION|LATE_AWAY_SEPARATION", "LATE_AWAY_SEPARATION|LATE_HOME_SEPARATION",
    "FULL_HOME_REVERSAL|FULL_AWAY_REVERSAL", "FULL_AWAY_REVERSAL|FULL_HOME_REVERSAL"
  ]);
  const pair = `${topClass}|${rankedCandidates[1]?.[0] || ""}`;
  const conflict = directionalPairs.has(pair) && topScore - secondScore < 0.07;

  const homeDirectional = new Set(["STABLE_HOME_LEADER", "LATE_HOME_SEPARATION", "FULL_HOME_REVERSAL"]);
  const awayDirectional = new Set(["STABLE_AWAY_LEADER", "LATE_AWAY_SEPARATION", "FULL_AWAY_REVERSAL"]);
  const venueOpposesDirection =
    (homeDirectional.has(topClass) && awayDirectional.has(venue.classification)) ||
    (awayDirectional.has(topClass) && homeDirectional.has(venue.classification));
  const venueConflict = venueOpposesDirection && venue.score >= 0.24 && venue.margin >= 0.04;

  const swingClasses = new Set(["FULL_HOME_REVERSAL", "FULL_AWAY_REVERSAL", "LEAD_SURRENDER", "TWO_WAY_INSTABILITY"]);
  const relevantEventSupport = topClass === "FULL_HOME_REVERSAL"
    ? eventEvidence.homeReversalSupport
    : topClass === "FULL_AWAY_REVERSAL"
      ? eventEvidence.awayReversalSupport
      : eventEvidence.leadSurrenderSupport;
  const falseSwing = swingClasses.has(topClass) && (
    secondHalfActivity < 0.42 ||
    (eventEvidence.complete && relevantEventSupport < 0.16)
  );

  const classification = conflict
    ? "DIRECTIONAL_CONFLICT"
    : venueConflict && RESULT_KEYS.has(overhaul?.primaryPrediction?.key)
      ? "VENUE_CONFLICT"
      : falseSwing
        ? "FALSE_SWING"
        : topClass;

  return {
    classification,
    rawClassification: topClass,
    strength: round(topScore),
    secondStrength: round(secondScore),
    margin: round(topScore - secondScore),
    conflict: conflict ? 1 : venueConflict ? 0.7 : clamp(1 - (topScore - secondScore) * 5, 0, 0.65),
    venue,
    secondHalfActivity: round(secondHalfActivity),
    eventEvidence,
    falseSwing,
    scores: Object.fromEntries(candidates.map(([key, value]) => [key, round(value)])),
    samples: { home: hSamples, away: aSamples },
    reasons: buildClassificationReasons(classification, input, venue)
  };
}

function buildClassificationReasons(classification, input, venue) {
  const home = input.home?.name || "The home team";
  const away = input.away?.name || "the away team";
  const reasons = {
    STABLE_HOME_LEADER: `${home} protects home leads better than ${away} recovers after falling behind away.`,
    STABLE_AWAY_LEADER: `${away} protects away leads better than ${home} recovers after falling behind at home.`,
    LATE_HOME_SEPARATION: `${home} often improves after a level first half, while ${away} is vulnerable after the break away from home.`,
    LATE_AWAY_SEPARATION: `${away} often improves after a level first half, while ${home} is vulnerable after the break at home.`,
    FULL_HOME_REVERSAL: `${home} has a comeback route that matches ${away}'s tendency to surrender leads.`,
    FULL_AWAY_REVERSAL: `${away} has a comeback route that matches ${home}'s tendency to surrender leads.`,
    LEAD_SURRENDER: "The HT/FT pattern points to an equaliser or a lead being surrendered rather than stable control.",
    TWO_WAY_INSTABILITY: "Both teams show comeback and collapse routes, so team direction is less reliable than the goal pattern.",
    DRAW_LOCK: "Both venue profiles frequently stay level from half-time to full-time.",
    TWO_SIDED_GOALS: "Both teams regularly score and concede in the relevant home and away samples.",
    HOME_GOAL_ROUTE: `${home}'s home scoring record matches ${away}'s away conceding record.`,
    AWAY_GOAL_ROUTE: `${away}'s away scoring record matches ${home}'s home conceding record.`,
    LOW_EVENT_CEILING: "Both venue profiles usually keep matches below the higher goal lines.",
    DIRECTIONAL_CONFLICT: "Both teams have credible opposite winning routes, so Papa will not force a team direction.",
    VENUE_CONFLICT: "The overall story and the home-versus-away story disagree, so directional markets are restricted.",
    FALSE_SWING: "The HT/FT table looks unstable, but the second-half goal and event evidence does not confirm a repeatable swing.",
    INSUFFICIENT_DATA: "There is not enough verified home and away history to publish a dependable pick."
  };
  return [reasons[classification] || "Papa compared the full HT/FT and goal profile.", `Venue route strength: ${Math.round((venue?.score || 0) * 100)}/100.`];
}

function requirementForMarket(key) {
  if (EXACT_KEYS.has(key)) return { overall: 14, venue: 8, half: 8, event: 0 };
  if (STRAIGHT_RESULT_KEYS.has(key)) return { overall: 12, venue: 7, half: HALF_KEYS.has(key) ? 7 : 0, event: 0 };
  if (PROTECTION_KEYS.has(key)) return { overall: 10, venue: 6, half: HALF_KEYS.has(key) ? 6 : 0, event: 0 };
  if (TWO_TEAM_GOAL_KEYS.has(key)) return { overall: 10, venue: 6, half: key === "goals-both-halves" ? 6 : 0, event: 0 };
  if (SHARP_GOAL_KEYS.has(key)) return { overall: 10, venue: 6, half: HALF_KEYS.has(key) ? 6 : 0, event: 0 };
  if (BROAD_GOAL_KEYS.has(key)) return { overall: 8, venue: 5, half: HALF_KEYS.has(key) ? 5 : 0, event: 0 };
  return { overall: 8, venue: 5, half: 0, event: 0 };
}

function sampleGate(key, input) {
  const requirement = requirementForMarket(key);
  const home = teamSamples(input.home);
  const away = teamSamples(input.away);
  const failures = [];
  if (Math.min(home.overall, away.overall) < requirement.overall) {
    failures.push(`needs at least ${requirement.overall} overall matches per team`);
  }
  if (Math.min(home.venue, away.venue) < requirement.venue) {
    failures.push(`needs at least ${requirement.venue} relevant home/away matches per team`);
  }
  if (requirement.half > 0) {
    const homeHalf = home.halfVenue;
    const awayHalf = away.halfVenue;
    if (Math.min(homeHalf, awayHalf) < requirement.half) {
      failures.push(`needs at least ${requirement.half} matches with complete half-time data per team`);
    }
  }
  return { passed: failures.length === 0, requirement, failures, samples: { home, away } };
}

function compatibility(key, classification) {
  if (classification === "INSUFFICIENT_DATA") return false;
  const allowed = STORY_MARKETS[classification];
  if (!allowed) return true;
  return allowed.has(key);
}

function empiricalCalibration(input, engineKey, marketKey) {
  const row = input?.calibration?.[engineKey]?.[marketKey] || input?.calibration?.all?.[marketKey] || null;
  if (!row || Number(row.sampleCount || 0) < 50) return null;
  const lower = Number(row.lowerBound ?? row.observedHitRate);
  return Number.isFinite(lower) ? clamp(lower) : null;
}

function conservativeConfidence(market, classification, sample, input, engineKey = "primary") {
  const empirical = empiricalCalibration(input, engineKey, market.key);
  if (empirical !== null) {
    return { value: round(empirical), source: "settled-history-calibration", sampleCount: Number(input.calibration?.[engineKey]?.[market.key]?.sampleCount || 0) };
  }
  const raw = clamp(market.safetyAdjustedScore ?? market.score ?? 0);
  const sampleFloor = Math.min(
    sample.samples.home.overall / Math.max(1, sample.requirement.overall),
    sample.samples.away.overall / Math.max(1, sample.requirement.overall),
    sample.samples.home.venue / Math.max(1, sample.requirement.venue),
    sample.samples.away.venue / Math.max(1, sample.requirement.venue)
  );
  const conflictPenalty = Number(classification.conflict || 0) * (RESULT_KEYS.has(market.key) ? 0.09 : 0.035);
  const samplePenalty = sampleFloor >= 1.5 ? 0 : sampleFloor >= 1 ? 0.025 : 0.09;
  const value = clamp(0.5 + (raw - 0.5) * 0.72 - conflictPenalty - samplePenalty, 0.5, 0.91);
  return { value: round(value), source: "conservative-fallback", sampleCount: 0 };
}

export function auditPapaSenseMarkets(markets, input, classification) {
  return markets.map((market) => {
    const gate = sampleGate(market.key, input);
    const sourceBlockers = [...new Set(market.blockers || [])];
    const sourceQualified = Boolean(market.qualified);
    const compatible = compatibility(market.key, classification.classification);
    const blockers = [...new Set([
      ...sourceBlockers,
      ...gate.failures.map((failure) => `Sample gate: ${failure}.`),
      ...(!compatible ? [`Market story does not fit ${classification.classification.replaceAll("_", " ").toLowerCase()}.`] : [])
    ])];
    const calibrationByEngine = Object.fromEntries(
      ["primary", "safer", "aggressive", "venue"].map((engineKey) => [
        engineKey,
        conservativeConfidence(market, classification, gate, input, engineKey)
      ])
    );
    const calibrated = calibrationByEngine.primary;
    const qualified = Boolean(market.qualified) && gate.passed && compatible && blockers.length === 0;
    const baseComparison = Number(market.comparisonScore || market.directionalRankScore || 0);
    const resolutionScoreByEngine = Object.fromEntries(
      Object.entries(calibrationByEngine).map(([engineKey, calibration]) => [
        engineKey,
        round(baseComparison * 0.72 + calibration.value * 0.2 + classification.strength * 0.08)
      ])
    );
    return {
      ...market,
      sourceQualified,
      sourceBlockers,
      blockers,
      qualified,
      storyCompatible: compatible,
      sampleGate: gate,
      calibratedConfidence: calibrated.value,
      calibrationSource: calibrated.source,
      calibrationSampleCount: calibrated.sampleCount,
      calibrationByEngine,
      resolutionScore: resolutionScoreByEngine.primary,
      resolutionScoreByEngine,
      papaSenseV2: true
    };
  }).sort((a, b) => {
    if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
    return Number(b.resolutionScore || 0) - Number(a.resolutionScore || 0);
  });
}

function findMarket(markets, key) {
  return markets.find((market) => market.key === key) || null;
}

function noPick(engineKey, engineName, reason, classification) {
  const enginePurpose = {
    primary: "balanced selection",
    safer: "lower-risk containment",
    aggressive: "higher-specificity escalation",
    venue: "independent venue selection"
  }[engineKey] || "selection";
  const paragraph = `NO PICK — ${reason}`;
  const support = classification?.samples || {};
  return {
    engineKey,
    engineName,
    available: false,
    key: "no-pick",
    market: "No Pick",
    selection: "NO PICK",
    confidence: 0,
    score: 0,
    qualified: false,
    tier: "NO PICK",
    description: `No ${enginePurpose} passed. ${reason}`,
    explanationParagraph: paragraph,
    publicExplanation: paragraph,
    reasons: [reason, ...(classification?.reasons || []).slice(0, 2)],
    cautions: classification?.reasons || [],
    explanationEvidence: {
      strongestRoute: classification?.rawClassification || classification?.classification || "NO_PICK",
      strongestRouteMeaning: reason,
      secondRoute: null,
      secondRouteMeaning: null,
      homeSupport: {
        count: Math.round(support.home?.overall || 0),
        total: Math.round(support.home?.overall || 0),
        percent: 100,
        approximate: false,
        text: `${Math.round(support.home?.overall || 0)} overall and ${Math.round(support.home?.venue || 0)} home matches reviewed`
      },
      awaySupport: {
        count: Math.round(support.away?.overall || 0),
        total: Math.round(support.away?.overall || 0),
        percent: 100,
        approximate: false,
        text: `${Math.round(support.away?.overall || 0)} overall and ${Math.round(support.away?.venue || 0)} away matches reviewed`
      },
      selectionBasis: `${enginePurpose} withheld by PapaSense v2 safety rules`,
      decision: paragraph
    },
    independentConsensusVote: false,
    consensusEligible: false,
    classification: classification?.classification || "INSUFFICIENT_DATA",
    marketPolicy: {
      version: "papasense-v2.1.0",
      purpose: engineKey,
      noPick: true,
      allEnginesUseOverhaulCatalogue: true
    }
  };
}

function engineConfidence(market, engineKey = "primary") {
  return Number(
    market?.calibrationByEngine?.[engineKey]?.value ??
    market?.calibratedConfidence ??
    market?.safetyAdjustedScore ??
    0
  );
}

function engineResolutionScore(market, engineKey = "primary") {
  return Number(
    market?.resolutionScoreByEngine?.[engineKey] ??
    market?.resolutionScore ??
    0
  );
}

function pickByKeys(markets, keys, predicate = () => true, engineKey = "primary") {
  return keys
    .map((key) => findMarket(markets, key))
    .filter((market) => market?.qualified && predicate(market))
    .sort((a, b) => engineResolutionScore(b, engineKey) - engineResolutionScore(a, engineKey))[0] || null;
}


function firstQualifiedByKeys(markets, keys, predicate = () => true) {
  for (const key of keys) {
    const market = findMarket(markets, key);
    if (market?.qualified && predicate(market)) return market;
  }
  return null;
}

function decimalOdds(input, side, line = "05") {
  const sources = [input?.odds, input?.marketOdds, input?.bookmakerOdds].filter(Boolean);
  const directKeys = side === "home"
    ? (line === "05" ? ["homeOver05", "home_team_over_05"] : ["homeOver15", "home_team_over_15"])
    : (line === "05" ? ["awayOver05", "away_team_over_05"] : ["awayOver15", "away_team_over_15"]);
  for (const source of sources) {
    for (const key of directKeys) {
      const value = Number(source?.[key]);
      if (Number.isFinite(value) && value > 1) return value;
    }
    const nested = Number(source?.teamGoals?.[side]?.[line === "05" ? "over05" : "over15"]);
    if (Number.isFinite(nested) && nested > 1) return nested;
  }
  return null;
}

function primaryPreference(classification) {
  const map = {
    STABLE_HOME_LEADER: ["home-win-either-half", "home-dnb", "home-1x", "home-win", "home-over-05"],
    STABLE_AWAY_LEADER: ["away-x2", "away-dnb", "away-win-either-half", "away-win", "away-over-05"],
    LATE_HOME_SEPARATION: ["home-second-half-over-05", "second-half-over-05", "home-second-half-dnb", "home-win-either-half", "home-dnb", "home-1x", "over-15"],
    LATE_AWAY_SEPARATION: ["away-second-half-over-05", "second-half-over-05", "away-second-half-dnb", "away-win-either-half", "away-dnb", "away-x2", "over-15"],
    FULL_HOME_REVERSAL: ["home-second-half-over-05", "home-over-05", "second-half-over-05", "over-15", "gg-yes", "home-1x"],
    FULL_AWAY_REVERSAL: ["away-second-half-over-05", "away-over-05", "second-half-over-05", "over-15", "gg-yes", "away-x2"],
    LEAD_SURRENDER: ["second-half-over-05", "over-15", "goals-both-halves", "gg-yes", "second-half-over-15", "draw-either-half"],
    TWO_WAY_INSTABILITY: ["second-half-over-05", "over-15", "gg-yes", "second-half-over-15", "goals-both-halves", "over-25", "no-draw"],
    DRAW_LOCK: ["draw-either-half", "under-35", "ht-draw", "ft-draw", "under-25"],
    TWO_SIDED_GOALS: ["over-15", "gg-yes", "second-half-over-05", "over-25", "goals-both-halves", "second-half-over-15"],
    HOME_GOAL_ROUTE: ["home-over-05", "home-second-half-over-05", "over-15", "home-over-15", "over-25"],
    AWAY_GOAL_ROUTE: ["away-over-05", "away-second-half-over-05", "over-15", "away-over-15", "over-25"],
    LOW_EVENT_CEILING: ["under-35", "under-25", "gg-no", "draw-either-half"],
    DIRECTIONAL_CONFLICT: ["over-15", "under-35", "second-half-over-05", "gg-yes", "goals-both-halves", "second-half-over-15", "draw-either-half"],
    VENUE_CONFLICT: ["over-15", "under-35", "second-half-over-05", "gg-yes"]
  };
  return map[classification] || [];
}

function choosePrimaryMarket(markets, preference, floor = 0.6) {
  const rank = new Map(preference.map((key, index) => [key, index]));
  const preferred = markets
    .filter((market) => market.qualified && rank.has(market.key) && engineConfidence(market, "primary") >= floor)
    .sort((a, b) => engineResolutionScore(b, "primary") - engineResolutionScore(a, "primary"));
  const strongest = preferred[0] || null;
  if (!strongest) return null;

  // The classification road is authoritative when its preferred market is close
  // to the raw leader. This prevents a narrower straight result from replacing
  // the intended balanced expression of the same match story.
  for (const key of preference) {
    const candidate = preferred.find((market) => market.key === key);
    if (!candidate) continue;
    if (engineResolutionScore(strongest, "primary") - engineResolutionScore(candidate, "primary") <= 0.12) {
      return candidate;
    }
  }
  return strongest;
}


export function selectPapaSenseV2(markets, input, classification) {
  if (classification.classification === "INSUFFICIENT_DATA") {
    return {
      primary: noPick("primary", "Papa's Pick", classification.reasons[0], classification),
      safer: noPick("safer", "Safer", "No safer market can be published without a qualified Papa story.", classification),
      aggressive: noPick("aggressive", "Aggressive", "No aggressive market can be published without a qualified Papa story.", classification),
      venue: noPick("venue", "Venue Pattern", "The home and away samples are too small for an independent venue pick.", classification)
    };
  }

  const preference = primaryPreference(classification.classification);
  let primaryMarket = choosePrimaryMarket(markets, preference, 0.6);
  let oddsPolicy = { applied: false, reason: null, observedPrice: null };

  if (["home-over-05", "away-over-05"].includes(primaryMarket?.key)) {
    const side = primaryMarket.key.startsWith("home-") ? "home" : "away";
    const price = decimalOdds(input, side, "05");
    if (price !== null && price < 1.2) {
      const upgrade = findMarket(markets, `${side}-over-15`);
      const replacement = upgrade?.qualified
        ? upgrade
        : firstQualifiedByKeys(markets, preference.filter((key) => key !== primaryMarket.key));
      if (replacement) {
        oddsPolicy = {
          applied: true,
          observedPrice: price,
          reason: upgrade?.qualified
            ? `Team Over 0.5 was priced at ${price.toFixed(2)}, below the 1.20 value floor, so the independently qualified Team Over 1.5 market replaced it.`
            : `Team Over 0.5 was priced at ${price.toFixed(2)}, below the 1.20 value floor, so the next qualified same-story market replaced it.`
        };
        primaryMarket = {
          ...replacement,
          marketPolicy: {
            ...(replacement.marketPolicy || {}),
            oddsPolicy
          }
        };
      }
    }
  }

  if (!primaryMarket || engineConfidence(primaryMarket, "primary") < 0.6) {
    return {
      primary: noPick("primary", "Papa's Pick", "No market passed the story, sample and confidence gates. Papa will not force a direction.", classification),
      safer: noPick("safer", "Safer", "No separate safer market passed because Papa did not publish a base pick.", classification),
      aggressive: noPick("aggressive", "Aggressive", "No aggressive upgrade passed because Papa did not publish a base pick.", classification),
      venue: selectVenue(markets, input, classification)
    };
  }

  const saferKeys = relationKeys(primaryMarket, "containment");
  const primaryConfidence = engineConfidence(primaryMarket, "primary");
  const saferMarket = pickByKeys(
    markets,
    saferKeys,
    (candidate) => engineConfidence(candidate, "safer") >= primaryConfidence + 0.03,
    "safer"
  );

  const aggressiveKeys = relationKeys(primaryMarket, "escalation");
  const aggressiveMarket = pickByKeys(
    markets,
    aggressiveKeys,
    (candidate) => engineConfidence(candidate, "aggressive") >= 0.55,
    "aggressive"
  );

  return {
    primary: { market: primaryMarket, purpose: "balanced", oddsPolicy },
    safer: saferMarket
      ? { market: saferMarket, purpose: "containment", parentKey: primaryMarket.key }
      : noPick("safer", "Safer", "No broader version of Papa's exact match story passed with a clear confidence cushion.", classification),
    aggressive: aggressiveMarket
      ? { market: aggressiveMarket, purpose: "same-story-escalation", parentKey: primaryMarket.key }
      : noPick("aggressive", "Aggressive", "No sharper version of Papa's exact match story passed its own safety gates.", classification),
    venue: selectVenue(markets, input, classification)
  };
}

function venueKeysFor(classification) {
  const map = {
    STABLE_HOME_LEADER: ["home-1x", "home-dnb", "home-win", "home-win-either-half", "home-over-05"],
    STABLE_AWAY_LEADER: ["away-x2", "away-dnb", "away-win", "away-win-either-half", "away-over-05"],
    LATE_HOME_SEPARATION: ["home-second-half-over-05", "home-second-half-dnb", "second-half-over-05", "home-dnb", "home-1x", "over-15"],
    LATE_AWAY_SEPARATION: ["away-second-half-over-05", "away-second-half-dnb", "second-half-over-05", "away-dnb", "away-x2", "over-15"],
    FULL_HOME_REVERSAL: ["home-second-half-over-05", "second-half-over-05", "home-over-05", "home-1x", "over-15"],
    FULL_AWAY_REVERSAL: ["away-second-half-over-05", "second-half-over-05", "away-over-05", "away-x2", "over-15"],
    LEAD_SURRENDER: ["second-half-over-05", "over-15", "gg-yes", "goals-both-halves", "draw-either-half"],
    TWO_WAY_INSTABILITY: ["second-half-over-05", "second-half-over-15", "over-15", "over-25", "gg-yes", "goals-both-halves"],
    DRAW_LOCK: ["draw-either-half", "ht-draw", "ft-draw", "under-35", "under-25"],
    TWO_SIDED_GOALS: ["over-15", "gg-yes", "second-half-over-05", "over-25", "goals-both-halves"],
    HOME_GOAL_ROUTE: ["home-over-05", "home-over-15", "home-second-half-over-05", "over-15"],
    AWAY_GOAL_ROUTE: ["away-over-05", "away-over-15", "away-second-half-over-05", "over-15"],
    LOW_EVENT_CEILING: ["under-35", "under-25", "gg-no", "draw-either-half"],
    VENUE_CONFLICT: [],
    FALSE_SWING: [],
    INSUFFICIENT_DATA: []
  };
  return map[classification] || ["over-15", "under-35", "second-half-over-05"];
}

function venueClassificationContext(classification) {
  const venue = classification.venue || {};
  return {
    ...classification,
    classification: venue.classification || "VENUE_CONFLICT",
    rawClassification: venue.classification || "VENUE_CONFLICT",
    strength: Number(venue.score || 0),
    margin: Number(venue.margin || 0),
    conflict: clamp(1 - Number(venue.margin || 0) * 6, 0, 0.65),
    reasons: [
      `The independent venue route is ${(venue.classification || "venue conflict").replaceAll("_", " ").toLowerCase()}.`,
      ...(classification.reasons || []).slice(0, 1)
    ]
  };
}

function geometricPair(a, b) {
  return Math.sqrt(clamp(a) * clamp(b));
}

function venueGoalMetric(team, key) {
  return clamp(metric(team?.goals?.venue, key));
}

function venueHalfMetric(team, key) {
  return clamp(halfMetric(team, "venue", key));
}

function venueOutcomeRates(input) {
  const home = input.home?.htft?.venue || {};
  const away = input.away?.htft?.venue || {};
  const homeWin = transitionRate(home, "WW") + transitionRate(home, "DW") + transitionRate(home, "LW");
  const homeDraw = transitionRate(home, "WD") + transitionRate(home, "DD") + transitionRate(home, "LD");
  const homeLoss = transitionRate(home, "WL") + transitionRate(home, "DL") + transitionRate(home, "LL");
  const awayWin = transitionRate(away, "WW") + transitionRate(away, "DW") + transitionRate(away, "LW");
  const awayDraw = transitionRate(away, "WD") + transitionRate(away, "DD") + transitionRate(away, "LD");
  const awayLoss = transitionRate(away, "WL") + transitionRate(away, "DL") + transitionRate(away, "LL");
  return {
    homeWin: clamp(homeWin),
    homeDraw: clamp(homeDraw),
    homeLoss: clamp(homeLoss),
    awayWin: clamp(awayWin),
    awayDraw: clamp(awayDraw),
    awayLoss: clamp(awayLoss)
  };
}

function venueMarketSupport(market, input, venueContext) {
  const key = market.key;
  const home = input.home || {};
  const away = input.away || {};
  const rates = venueOutcomeRates(input);
  const hHtft = home.htft?.venue || {};
  const aHtft = away.htft?.venue || {};
  const route = {
    stableHome: geometricPair(transitionRate(hHtft, "WW"), transitionRate(aHtft, "LL")),
    stableAway: geometricPair(transitionRate(aHtft, "WW"), transitionRate(hHtft, "LL")),
    lateHome: geometricPair(transitionRate(hHtft, "DW"), transitionRate(aHtft, "DL")),
    lateAway: geometricPair(transitionRate(aHtft, "DW"), transitionRate(hHtft, "DL")),
    reversalHome: geometricPair(transitionRate(hHtft, "LW"), transitionRate(aHtft, "WL")),
    reversalAway: geometricPair(transitionRate(aHtft, "LW"), transitionRate(hHtft, "WL")),
    drawLock: geometricPair(transitionRate(hHtft, "DD"), transitionRate(aHtft, "DD"))
  };

  const homeControl = clamp(
    geometricPair(rates.homeWin, rates.awayLoss) * 0.56 +
    Math.max(route.stableHome, route.lateHome, route.reversalHome) * 0.28 +
    venueContext.strength * 0.16
  );
  const awayControl = clamp(
    geometricPair(rates.awayWin, rates.homeLoss) * 0.56 +
    Math.max(route.stableAway, route.lateAway, route.reversalAway) * 0.28 +
    venueContext.strength * 0.16
  );
  const homeProtection = clamp(
    geometricPair(rates.homeWin + rates.homeDraw, rates.awayLoss + rates.awayDraw) * 0.66 +
    Math.max(route.stableHome, route.lateHome, route.reversalHome) * 0.2 +
    venueContext.strength * 0.14
  );
  const awayProtection = clamp(
    geometricPair(rates.awayWin + rates.awayDraw, rates.homeLoss + rates.homeDraw) * 0.66 +
    Math.max(route.stableAway, route.lateAway, route.reversalAway) * 0.2 +
    venueContext.strength * 0.14
  );
  const drawSupport = clamp(
    geometricPair(rates.homeDraw, rates.awayDraw) * 0.68 +
    route.drawLock * 0.22 +
    venueContext.strength * 0.1
  );
  const noDrawSupport = clamp(
    geometricPair(1 - rates.homeDraw, 1 - rates.awayDraw) * 0.75 +
    Math.max(homeControl, awayControl) * 0.15 +
    venueContext.strength * 0.1
  );

  const hScore = venueGoalMetric(home, "scoreRate");
  const aScore = venueGoalMetric(away, "scoreRate");
  const hConcede = venueGoalMetric(home, "concedeRate");
  const aConcede = venueGoalMetric(away, "concedeRate");
  const homeGoal = geometricPair(hScore, aConcede);
  const awayGoal = geometricPair(aScore, hConcede);
  const homeTwo = geometricPair(venueGoalMetric(home, "scored2PlusRate"), venueGoalMetric(away, "conceded2PlusRate"));
  const awayTwo = geometricPair(venueGoalMetric(away, "scored2PlusRate"), venueGoalMetric(home, "conceded2PlusRate"));
  const over15 = geometricPair(venueGoalMetric(home, "over15Rate"), venueGoalMetric(away, "over15Rate"));
  const over25 = geometricPair(venueGoalMetric(home, "over25Rate"), venueGoalMetric(away, "over25Rate"));
  const under35 = geometricPair(venueGoalMetric(home, "under35Rate"), venueGoalMetric(away, "under35Rate"));
  const btts = geometricPair(venueGoalMetric(home, "bttsRate"), venueGoalMetric(away, "bttsRate"));
  const noBtts = geometricPair(1 - venueGoalMetric(home, "bttsRate"), 1 - venueGoalMetric(away, "bttsRate"));

  const firstHalfO05 = geometricPair(venueHalfMetric(home, "firstHalfOver05Rate"), venueHalfMetric(away, "firstHalfOver05Rate"));
  const firstHalfO15 = geometricPair(venueHalfMetric(home, "firstHalfOver15Rate"), venueHalfMetric(away, "firstHalfOver15Rate"));
  const secondHalfO05 = geometricPair(venueHalfMetric(home, "secondHalfOver05Rate"), venueHalfMetric(away, "secondHalfOver05Rate"));
  const secondHalfO15 = geometricPair(venueHalfMetric(home, "secondHalfOver15Rate"), venueHalfMetric(away, "secondHalfOver15Rate"));
  const bothHalves = geometricPair(venueHalfMetric(home, "goalsBothHalvesRate"), venueHalfMetric(away, "goalsBothHalvesRate"));
  const homeSecondHalfGoal = geometricPair(venueHalfMetric(home, "secondHalfScoringRate"), venueHalfMetric(away, "secondHalfConcedingRate"));
  const awaySecondHalfGoal = geometricPair(venueHalfMetric(away, "secondHalfScoringRate"), venueHalfMetric(home, "secondHalfConcedingRate"));
  const homeSecondHalfDnb = clamp(
    geometricPair(
      venueHalfMetric(home, "secondHalfWinRate"),
      1 - venueHalfMetric(away, "secondHalfWinRate")
    ) * 0.72 + route.lateHome * 0.18 + venueContext.strength * 0.1
  );
  const awaySecondHalfDnb = clamp(
    geometricPair(
      venueHalfMetric(away, "secondHalfWinRate"),
      1 - venueHalfMetric(home, "secondHalfWinRate")
    ) * 0.72 + route.lateAway * 0.18 + venueContext.strength * 0.1
  );

  const supports = {
    "home-win": homeControl,
    "away-win": awayControl,
    "home-dnb": clamp(homeControl * 0.55 + homeProtection * 0.45),
    "away-dnb": clamp(awayControl * 0.55 + awayProtection * 0.45),
    "home-1x": homeProtection,
    "away-x2": awayProtection,
    "home-win-either-half": clamp(Math.max(route.stableHome, route.lateHome, route.reversalHome) * 0.62 + homeControl * 0.38),
    "away-win-either-half": clamp(Math.max(route.stableAway, route.lateAway, route.reversalAway) * 0.62 + awayControl * 0.38),
    "ft-draw": drawSupport,
    "ht-draw": clamp(route.drawLock * 0.65 + geometricPair(
      transitionRate(hHtft, "DW") + transitionRate(hHtft, "DD") + transitionRate(hHtft, "DL"),
      transitionRate(aHtft, "DW") + transitionRate(aHtft, "DD") + transitionRate(aHtft, "DL")
    ) * 0.35),
    "draw-either-half": clamp(drawSupport * 0.45 + route.drawLock * 0.3 + Math.max(route.lateHome, route.lateAway) * 0.25),
    "no-draw": noDrawSupport,
    "home-over-05": clamp(homeGoal * 0.78 + Math.max(route.stableHome, route.lateHome, route.reversalHome) * 0.22),
    "away-over-05": clamp(awayGoal * 0.78 + Math.max(route.stableAway, route.lateAway, route.reversalAway) * 0.22),
    "home-over-15": clamp(homeTwo * 0.72 + homeGoal * 0.18 + homeControl * 0.1),
    "away-over-15": clamp(awayTwo * 0.72 + awayGoal * 0.18 + awayControl * 0.1),
    "over-15": clamp(over15 * 0.72 + Math.max(homeGoal, awayGoal) * 0.18 + venueContext.strength * 0.1),
    "over-25": clamp(over25 * 0.68 + Math.max(homeTwo, awayTwo, btts) * 0.22 + venueContext.strength * 0.1),
    "under-35": clamp(under35 * 0.8 + Math.max(drawSupport, noBtts) * 0.12 + venueContext.strength * 0.08),
    "under-25": clamp((1 - over25) * 0.72 + under35 * 0.18 + drawSupport * 0.1),
    "gg-yes": clamp(btts * 0.76 + Math.min(homeGoal, awayGoal) * 0.24),
    "gg-no": clamp(noBtts * 0.74 + Math.max(1 - homeGoal, 1 - awayGoal) * 0.26),
    "first-half-over-05": clamp(firstHalfO05 * 0.8 + (1 - drawSupport) * 0.08 + venueContext.strength * 0.12),
    "first-half-over-15": clamp(firstHalfO15 * 0.82 + firstHalfO05 * 0.12 + venueContext.strength * 0.06),
    "second-half-over-05": clamp(secondHalfO05 * 0.7 + Math.max(route.lateHome, route.lateAway, route.reversalHome, route.reversalAway) * 0.2 + venueContext.strength * 0.1),
    "second-half-over-15": clamp(secondHalfO15 * 0.72 + Math.max(homeSecondHalfGoal, awaySecondHalfGoal) * 0.18 + venueContext.strength * 0.1),
    "goals-both-halves": clamp(bothHalves * 0.76 + geometricPair(firstHalfO05, secondHalfO05) * 0.24),
    "home-second-half-over-05": clamp(homeSecondHalfGoal * 0.74 + Math.max(route.lateHome, route.reversalHome) * 0.18 + venueContext.strength * 0.08),
    "away-second-half-over-05": clamp(awaySecondHalfGoal * 0.74 + Math.max(route.lateAway, route.reversalAway) * 0.18 + venueContext.strength * 0.08),
    "home-second-half-dnb": homeSecondHalfDnb,
    "away-second-half-dnb": awaySecondHalfDnb
  };

  return {
    score: round(supports[key] || 0),
    evidence: {
      venueClass: venueContext.classification,
      venueStrength: round(venueContext.strength),
      route: Object.fromEntries(Object.entries(route).map(([name, value]) => [name, round(value)])),
      homeOutcome: { win: round(rates.homeWin), draw: round(rates.homeDraw), loss: round(rates.homeLoss) },
      awayOutcome: { win: round(rates.awayWin), draw: round(rates.awayDraw), loss: round(rates.awayLoss) },
      venueGoals: {
        homeGoal: round(homeGoal),
        awayGoal: round(awayGoal),
        over15: round(over15),
        over25: round(over25),
        under35: round(under35),
        btts: round(btts)
      },
      venueHalves: {
        firstHalfOver05: round(firstHalfO05),
        secondHalfOver05: round(secondHalfO05),
        secondHalfOver15: round(secondHalfO15),
        homeSecondHalfGoal: round(homeSecondHalfGoal),
        awaySecondHalfGoal: round(awaySecondHalfGoal)
      }
    }
  };
}

function venueSupportFloor(key) {
  if (EXACT_KEYS.has(key)) return 0.7;
  if (STRAIGHT_RESULT_KEYS.has(key)) return 0.64;
  if (key === "home-second-half-dnb" || key === "away-second-half-dnb") return 0.64;
  if (PROTECTION_KEYS.has(key)) return 0.61;
  if (SHARP_GOAL_KEYS.has(key) || TWO_TEAM_GOAL_KEYS.has(key)) return 0.62;
  return 0.58;
}

function criticalVenueBlockers(market) {
  const criticalPatterns = [
    /odds/i,
    /missing/i,
    /complete half-goal/i,
    /unsupported market/i,
    /low-odds/i
  ];
  return [...new Set(market.sourceBlockers || market.blockers || [])]
    .filter((blocker) => criticalPatterns.some((pattern) => pattern.test(String(blocker))));
}

function auditVenueMarkets(markets, input, classification) {
  const venueContext = venueClassificationContext(classification);
  return markets.map((market) => {
    const gate = market.sampleGate || sampleGate(market.key, input);
    const compatible = compatibility(market.key, venueContext.classification);
    const support = venueMarketSupport(market, input, venueContext);
    const supportFloor = venueSupportFloor(market.key);
    const safetyBlockers = criticalVenueBlockers(market);
    const blockers = [...new Set([
      ...safetyBlockers,
      ...gate.failures.map((failure) => `Venue sample gate: ${failure}.`),
      ...(!compatible
        ? [`Venue market story does not fit ${venueContext.classification.replaceAll("_", " ").toLowerCase()}.`]
        : []),
      ...(support.score < supportFloor
        ? [`Independent venue support ${Math.round(support.score * 100)} is below the required ${Math.round(supportFloor * 100)}.`]
        : [])
    ])];
    const calibrated = conservativeConfidence(
      { ...market, safetyAdjustedScore: support.score, score: support.score },
      venueContext,
      gate,
      input,
      "venue"
    );
    const qualified = gate.passed && compatible && blockers.length === 0;
    const resolutionScore = round(
      support.score * 0.62 +
      calibrated.value * 0.2 +
      venueContext.strength * 0.13 +
      clamp(venueContext.margin * 3) * 0.05
    );
    return {
      ...market,
      sourceQualified: market.sourceQualified ?? Boolean(market.qualified),
      sourceBlockers: [...new Set(market.sourceBlockers || market.blockers || [])],
      blockers,
      qualified,
      storyCompatible: compatible,
      sampleGate: gate,
      venueSupport: support.score,
      venueSupportFloor: supportFloor,
      venueEvidence: support.evidence,
      calibratedConfidence: calibrated.value,
      calibrationSource: calibrated.source,
      calibrationSampleCount: calibrated.sampleCount,
      calibrationByEngine: {
        ...(market.calibrationByEngine || {}),
        venue: calibrated
      },
      resolutionScore,
      resolutionScoreByEngine: {
        ...(market.resolutionScoreByEngine || {}),
        venue: resolutionScore
      },
      internalAudit: {
        ...(market.internalAudit || {}),
        venueIndependent: true,
        venueSupport: support.score,
        venueSupportFloor: supportFloor,
        venueEvidence: support.evidence,
        sourceQualifiedIgnoredForVenueDecision: true
      }
    };
  });
}

function oppositeDirectionalConflict(classification) {
  const homeDirectional = new Set(["STABLE_HOME_LEADER", "LATE_HOME_SEPARATION", "FULL_HOME_REVERSAL"]);
  const awayDirectional = new Set(["STABLE_AWAY_LEADER", "LATE_AWAY_SEPARATION", "FULL_AWAY_REVERSAL"]);
  const raw = classification.rawClassification;
  const venue = classification.venue?.classification;
  if (!raw || !venue) return false;
  const opposite = (homeDirectional.has(raw) && awayDirectional.has(venue)) ||
    (awayDirectional.has(raw) && homeDirectional.has(venue));
  if (!opposite) return false;
  const rawScore = Number(classification.scores?.[raw] || classification.strength || 0);
  const venueScore = Number(classification.venue?.score || 0);
  return rawScore >= venueScore + 0.08;
}

function selectVenue(markets, input, classification) {
  const venue = classification.venue || {};
  const venueContext = venueClassificationContext(classification);
  const homeVenue = teamSamples(input.home).venue;
  const awayVenue = teamSamples(input.away).venue;
  if (Math.min(homeVenue, awayVenue) < 6 || Number(venue.score || 0) < 0.18 || Number(venue.margin || 0) < 0.02) {
    return noPick("venue", "Venue Pattern", "No independent venue route passed the minimum home-versus-away sample and separation gates.", venueContext);
  }
  if (oppositeDirectionalConflict(classification)) {
    return noPick("venue", "Venue Pattern", "The home-versus-away route points one way, but the stronger overall route points the other way. Venue Pattern will not force a direction.", venueContext);
  }
  const venueMarkets = auditVenueMarkets(markets, input, classification);
  const candidate = pickByKeys(
    venueMarkets,
    venueKeysFor(venue.classification),
    (market) => engineConfidence(market, "venue") >= 0.6 && Number(market.venueSupport || 0) >= Number(market.venueSupportFloor || 0),
    "venue"
  );
  if (!candidate) {
    return noPick("venue", "Venue Pattern", "The venue route was clear, but no market was strong enough using home-only and away-only evidence.", venueContext);
  }
  return {
    market: candidate,
    purpose: "independent-venue",
    venueClassification: venue.classification,
    venueStrength: venue.score,
    venueMargin: venue.margin,
    venueSupport: candidate.venueSupport,
    classification: venueContext
  };
}

export function publicExplanation({ engineKey = "primary", engineName, market, classification, purpose, parentKey, input }) {
  const home = input.home?.name || "The home team";
  const away = input.away?.name || "the away team";
  const base = classification.reasons?.[0] || "Papa compared the full match pattern.";
  const selection = market.selection;
  const purposeText = {
    balanced: `Papa chose ${selection} because it is the clearest balanced expression of that match story.`,
    containment: `${engineName} keeps the same match story as Papa but removes an extra condition, making ${selection} the broader option.`,
    "same-story-escalation": `${engineName} keeps Papa's original match story but adds one extra condition. ${selection} only appears because the sharper market passed its own gate.`,
    "independent-venue": `${engineName} used only ${home}'s home record against ${away}'s away record. ${selection} was the strongest market supported by that venue matchup.`
  };
  const sample = market.sampleGate?.samples;
  const sampleText = sample
    ? ` The check used ${Math.round(sample.home.overall)} and ${Math.round(sample.away.overall)} overall matches, including ${Math.round(sample.home.venue)} home and ${Math.round(sample.away.venue)} away matches.`
    : "";
  const explanationCalibrationSource = market.calibrationByEngine?.[engineKey]?.source || market.calibrationSource;
  const calibrationText = explanationCalibrationSource === "settled-history-calibration"
    ? " Its confidence is based on settled historical picks from the same engine and market."
    : " Its displayed strength is deliberately reduced because there is not yet enough settled history for full market-specific calibration.";
  return `${base} ${purposeText[purpose] || `The engine selected ${selection}.`}${sampleText}${calibrationText}`;
}

export function resolutionMetadata(classification) {
  return {
    version: "papasense-v2.1.0",
    classification: classification.classification,
    rawClassification: classification.rawClassification,
    strength: classification.strength,
    margin: classification.margin,
    conflict: classification.conflict,
    secondHalfActivity: classification.secondHalfActivity,
    eventEvidence: classification.eventEvidence,
    falseSwing: classification.falseSwing,
    venue: classification.venue,
    scores: classification.scores,
    samples: classification.samples,
    reasons: classification.reasons
  };
}
