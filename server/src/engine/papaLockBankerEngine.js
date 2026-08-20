import { competitionPolicy } from "./competitionPolicy.js";
import { buildLeagueGoalsFlag, classifyLeagueScoring } from "./leagueScoringPolicy.js";

const PAPA_SENSE_KEYS = ["primary", "safer", "aggressive"];
const FAMILY_KEYS = ["papasense", "venue", "athena"];

export const PAPALOCK_VERSION = "papalock-v1.1.0";
export const PAPALOCK_MIN_SCORE = 84;
export const PAPALOCK_ELITE_SCORE = 92;
export const PAPALOCK_MAX_DAILY = 3;
export const PAPALOCK_MAX_PER_LEAGUE = 2;
export const PAPALOCK_MIN_EVIDENCE = 0.52;

const CORE_STORIES = Object.freeze({
  HOME_PROTECTION: "HOME_PROTECTION",
  AWAY_PROTECTION: "AWAY_PROTECTION",
  MATCH_GOALS: "MATCH_GOALS",
  LOW_EVENT: "LOW_EVENT",
  HOME_GOAL: "HOME_GOAL",
  AWAY_GOAL: "AWAY_GOAL",
  SECOND_HALF_ACTIVITY: "SECOND_HALF_ACTIVITY"
});

const HOME_CLASS = /STABLE_HOME|LATE_HOME|FULL_HOME|HOME_LEADER|HOME_SEPARATION|HOME_REVERSAL/;
const AWAY_CLASS = /STABLE_AWAY|LATE_AWAY|FULL_AWAY|AWAY_LEADER|AWAY_SEPARATION|AWAY_REVERSAL/;
const HARD_CONFLICT_CLASS = /DIRECTIONAL_CONFLICT|VENUE_CONFLICT|CONFLICT_NO_PICK|FALSE_SWING/;

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function percent(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return number <= 1 ? number * 100 : number;
}

function normalise(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[.,]/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

function collapseMarketToken(value) {
  return normalise(value)
    .replace(/_/g, "-")
    .replace(/(\d)[.-](\d)/g, "$1$2");
}

const KEY_ALIASES = Object.freeze({
  "match-over-15": "over-15",
  "over 15": "over-15",
  "match-over-25": "over-25",
  "over 25": "over-25",
  "match-under-35": "under-35",
  "under 35": "under-35",
  "under 25": "under-25",
  "btts-yes": "gg-yes",
  "btts-no": "gg-no",
  "both-teams-to-score": "gg-yes",
  "home-or-draw": "home-1x",
  "home-double-chance": "home-1x",
  "away-or-draw": "away-x2",
  "away-double-chance": "away-x2",
  "home-team-over-05": "home-over-05",
  "away-team-over-05": "away-over-05",
  "home-team-to-score": "home-over-05",
  "away-team-to-score": "away-over-05",
  "second half over 05": "second-half-over-05",
  "home team to score in the second half": "home-second-half-over-05",
  "away team to score in the second half": "away-second-half-over-05",
  "home team over 05": "home-over-05",
  "away team over 05": "away-over-05"
});

function canonicalKey(pick) {
  const raw = pick?.key || pick?.marketId || pick?.market;
  const collapsed = collapseMarketToken(raw);
  return KEY_ALIASES[collapsed] || KEY_ALIASES[normalise(raw)] || collapsed;
}

const STORY_KEYS = Object.freeze({
  [CORE_STORIES.HOME_PROTECTION]: ["home-1x", "home-dnb", "home-win"],
  [CORE_STORIES.AWAY_PROTECTION]: ["away-x2", "away-dnb", "away-win"],
  [CORE_STORIES.HOME_GOAL]: [
    "home-over-05", "home-over-15", "home-second-half-over-05",
    "home-win", "home-win-either-half"
  ],
  [CORE_STORIES.AWAY_GOAL]: [
    "away-over-05", "away-over-15", "away-second-half-over-05",
    "away-win", "away-win-either-half"
  ],
  [CORE_STORIES.LOW_EVENT]: ["under-35", "under-25", "under-15"],
  [CORE_STORIES.SECOND_HALF_ACTIVITY]: [
    "second-half-over-05", "second-half-over-15", "goals-both-halves",
    "home-second-half-over-05", "away-second-half-over-05"
  ],
  [CORE_STORIES.MATCH_GOALS]: [
    "over-15", "over-25", "over-35", "gg-yes", "goals-both-halves",
    "first-half-over-15", "second-half-over-15"
  ]
});

function uniqueStories(stories) {
  return [...new Set(stories.filter(Boolean))];
}

function storiesFromSelection(selection, home, away) {
  const text = collapseMarketToken(selection);
  const stories = [];
  const namesHome = home && text.includes(home);
  const namesAway = away && text.includes(away);

  if (text.includes("win either half")) {
    if (namesHome) stories.push(CORE_STORIES.HOME_GOAL);
    if (namesAway) stories.push(CORE_STORIES.AWAY_GOAL);
    return uniqueStories(stories);
  }

  if (text.includes("second half") && text.includes("draw no bet")) {
    return [];
  }

  if (text.includes("or draw") || text.includes("draw no bet")) {
    if (namesHome) stories.push(CORE_STORIES.HOME_PROTECTION);
    if (namesAway) stories.push(CORE_STORIES.AWAY_PROTECTION);
  }

  if (text.includes("second half") && (text.includes("over 05") || text.includes("to score"))) {
    stories.push(CORE_STORIES.SECOND_HALF_ACTIVITY);
    if (namesHome) stories.push(CORE_STORIES.HOME_GOAL);
    if (namesAway) stories.push(CORE_STORIES.AWAY_GOAL);
  }

  if (text.includes("over 15") || text.includes("over 25") || text.includes("over 35") || text.includes("both teams to score")) {
    if (!/both teams to score(?:\s+—)?\s+no\b/.test(text) && !text.includes("btts no") && !text.includes("gg no")) {
      stories.push(CORE_STORIES.MATCH_GOALS);
    }
  }

  if (text.includes("under 35") || text.includes("under 25") || text.includes("under 15")) {
    stories.push(CORE_STORIES.LOW_EVENT);
  }

  if ((text.includes("over 05") || text.includes("to score")) && !text.includes("second half") && !text.includes("first half")) {
    if (namesHome) stories.push(CORE_STORIES.HOME_GOAL);
    if (namesAway) stories.push(CORE_STORIES.AWAY_GOAL);
  }

  return uniqueStories(stories);
}

function storiesForPick(pick, homeName = "Home", awayName = "Away") {
  if (!pick || pick.available === false || pick.qualified === false) return [];
  const key = canonicalKey(pick);
  const stories = [];
  for (const [story, keys] of Object.entries(STORY_KEYS)) {
    if (keys.includes(key)) stories.push(story);
  }
  if (stories.length) return uniqueStories(stories);

  return storiesFromSelection(
    pick.selection,
    normalise(homeName),
    normalise(awayName)
  );
}

function storyForPick(pick, homeName = "Home", awayName = "Away") {
  return storiesForPick(pick, homeName, awayName)[0] || null;
}

function competitionEligible(prediction) {
  return competitionPolicy(prediction?.league || {}).eligible;
}

function auditEvidence(prediction) {
  const audit = prediction?.profileAudit || prediction?.engine?.profileAudit || {};
  const home = audit.home?.evidence || {};
  const away = audit.away?.evidence || {};
  return {
    individuallyAnalysed: Boolean(audit.individuallyAnalysed),
    homeOverall: Number(home.overall || 0),
    homeVenue: Number(home.venue || 0),
    homeRecent: Number(home.recent || 0),
    awayOverall: Number(away.overall || 0),
    awayVenue: Number(away.venue || 0),
    awayRecent: Number(away.recent || 0),
    evidenceFingerprint: audit.evidenceFingerprint || null
  };
}

function sampleGate(evidence) {
  const failures = [];
  if (!evidence.individuallyAnalysed) failures.push("Individual match profiles are incomplete");
  if (evidence.homeOverall < 12 || evidence.awayOverall < 12) {
    failures.push("One or both teams have fewer than 12 same-league matches");
  }
  if (evidence.homeVenue < 8 || evidence.awayVenue < 8) {
    failures.push("One or both teams have fewer than eight relevant home or away matches");
  }
  if (evidence.homeRecent < 6 || evidence.awayRecent < 6) {
    failures.push("Recent-six evidence is incomplete");
  }
  return { passed: failures.length === 0, failures };
}

function criticalWarnings(pick) {
  return (pick?.cautions || pick?.warnings || [])
    .filter(Boolean)
    .filter((warning) => /(insufficient|small sample|contradiction|missing|unavailable|unstable|unverified|friendly|\bcup\b)/i.test(String(warning)));
}

function pickEvidenceStrength(pick, story) {
  const direct = pick?.internalAudit?.marketEvidence || pick?.explanationEvidence?.marketEvidence || {};
  const goalScores = pick?.explanationEvidence?.goalScores || pick?.internalAudit?.goalScores || {};
  const goalMetrics = pick?.explanationEvidence?.goalMetrics || pick?.internalAudit?.goalMetrics || {};
  const htft = pick?.internalAudit?.htftGate || pick?.explanationEvidence?.htftGate || pick?.htftGate || {};
  const values = [];

  const push = (value) => {
    const number = Number(value);
    if (Number.isFinite(number)) values.push(clamp(number <= 1 ? number : number / 100));
  };

  if (story === CORE_STORIES.MATCH_GOALS) {
    push(goalScores.over15);
    push(goalMetrics.venueO15);
    push(goalMetrics.recentO15);
    push(direct.over15);
  } else if (story === CORE_STORIES.LOW_EVENT) {
    push(goalScores.under35);
    push(goalMetrics.venueU35);
    push(goalMetrics.recentU35);
    push(direct.under35);
  } else if (story === CORE_STORIES.HOME_GOAL) {
    push(goalScores.homeOver05);
    push(goalMetrics.homeGoalSupport);
    push(direct.homeGoalSupport);
  } else if (story === CORE_STORIES.AWAY_GOAL) {
    push(goalScores.awayOver05);
    push(goalMetrics.awayGoalSupport);
    push(direct.awayGoalSupport);
  } else if (story === CORE_STORIES.SECOND_HALF_ACTIVITY) {
    push(goalScores.secondHalfOver05);
    push(goalMetrics.secondHalfChangeMass);
  } else {
    push(htft.score);
    push(htft.triggerMass);
    push(direct.winMass);
    push(direct.awayOrDraw);
    push(direct.homeOrDraw);
  }

  const confidence = clamp(percent(pick?.confidence ?? pick?.score) / 100);
  if (!values.length) {
    const athenaPick = pick?.engineKey === "athena" || /athena/i.test(String(pick?.engineName || ""));
    return clamp(confidence * (athenaPick ? 0.72 : 0.45));
  }
  values.sort((a, b) => a - b);
  const lowerHalf = values.slice(0, Math.max(1, Math.ceil(values.length / 2)));
  const conservative = lowerHalf.reduce((sum, value) => sum + value, 0) / lowerHalf.length;
  return clamp((conservative * 0.65) + (confidence * 0.35));
}

function familyRecord(familyKey, picks, story, homeName, awayName) {
  const supporting = picks.filter((pick) => storiesForPick(pick, homeName, awayName).includes(story));
  if (!supporting.length) return null;
  const valid = supporting.filter((pick) => criticalWarnings(pick).length === 0);
  if (!valid.length) return null;
  const confidences = valid.map((pick) => percent(pick.confidence ?? pick.score));
  const evidenceStrengths = valid.map((pick) => pickEvidenceStrength(pick, story));
  const confidence = confidences.reduce((sum, value) => sum + value, 0) / confidences.length;
  const evidenceStrength = Math.min(...evidenceStrengths);
  return {
    familyKey,
    familyName: familyKey === "papasense" ? "PapaSense family" : familyKey === "venue" ? "Venue Pattern" : "Athena",
    confidence: Number(confidence.toFixed(1)),
    evidenceStrength: Number(evidenceStrength.toFixed(4)),
    picks: valid.map((pick) => ({
      engineKey: pick.engineKey || (familyKey === "athena" ? "athena" : familyKey),
      engineName: pick.engineName || pick.engine || (familyKey === "athena" ? "Athena" : familyKey),
      key: canonicalKey(pick),
      market: pick.market,
      selection: pick.selection,
      confidence: Number(percent(pick.confidence ?? pick.score).toFixed(1))
    }))
  };
}

function targetForStory(story, prediction) {
  const home = prediction?.home?.name || "Home";
  const away = prediction?.away?.name || "Away";
  const targets = {
    [CORE_STORIES.HOME_PROTECTION]: {
      key: "home-1x",
      market: "Double Chance",
      selection: `${home} or Draw (1X)`,
      label: "home side to avoid defeat"
    },
    [CORE_STORIES.AWAY_PROTECTION]: {
      key: "away-x2",
      market: "Double Chance",
      selection: `${away} or Draw (X2)`,
      label: "away side to avoid defeat"
    },
    [CORE_STORIES.MATCH_GOALS]: {
      key: "over-15",
      market: "Total Goals",
      selection: "Over 1.5 Goals",
      label: "at least two match goals"
    },
    [CORE_STORIES.LOW_EVENT]: {
      key: "under-35",
      market: "Total Goals",
      selection: "Under 3.5 Goals",
      label: "the match to stay below four goals"
    },
    [CORE_STORIES.HOME_GOAL]: {
      key: "home-over-05",
      market: "Team Goals",
      selection: `${home} Over 0.5 Team Goals`,
      label: `${home} to score`
    },
    [CORE_STORIES.AWAY_GOAL]: {
      key: "away-over-05",
      market: "Team Goals",
      selection: `${away} Over 0.5 Team Goals`,
      label: `${away} to score`
    },
    [CORE_STORIES.SECOND_HALF_ACTIVITY]: {
      key: "second-half-over-05",
      market: "Second-Half Goals",
      selection: "Second Half Over 0.5 Goals",
      label: "at least one second-half goal"
    }
  };
  return targets[story] || null;
}

function exactTargetSupport(target, records) {
  const targetKey = canonicalKey(target);
  return records.reduce((count, record) => {
    return count + (record.picks.some((pick) => canonicalKey(pick) === targetKey) ? 1 : 0);
  }, 0);
}

function classificationLabels(prediction, athenaPick) {
  const papa = PAPA_SENSE_KEYS
    .map((key) => prediction?.engines?.[key]?.internalAudit?.classification)
    .filter(Boolean);
  const names = papa.flatMap((item) => [
    item.classification,
    item.rawClassification,
    item.venue?.classification
  ]).filter(Boolean).map((name) => String(name));
  const athenaType = athenaPick?.classification?.type
    || athenaPick?.internalAudit?.classification?.type
    || "";
  const athenaSide = athenaPick?.classification?.side
    || athenaPick?.internalAudit?.classification?.side
    || "";
  if (athenaType) names.push(String(athenaType));
  if (athenaSide === "HOME") names.push("STABLE_HOME_LEADER");
  if (athenaSide === "AWAY") names.push("STABLE_AWAY_LEADER");
  const conflicts = papa.map((item) => Number(item.conflict || 0)).filter(Number.isFinite);
  return {
    names,
    maxConflict: conflicts.length ? Math.max(...conflicts) : 0
  };
}

function classificationConflict(prediction, story, athenaPick) {
  const { names, maxConflict } = classificationLabels(prediction, athenaPick);
  const directionalStory = story === CORE_STORIES.HOME_PROTECTION || story === CORE_STORIES.AWAY_PROTECTION;
  let hard = false;
  if (directionalStory && names.some((name) => HARD_CONFLICT_CLASS.test(name))) hard = true;
  if (story === CORE_STORIES.HOME_PROTECTION && names.some((name) => AWAY_CLASS.test(name))) hard = true;
  if (story === CORE_STORIES.AWAY_PROTECTION && names.some((name) => HOME_CLASS.test(name))) hard = true;
  return { maxConflict: clamp(maxConflict), hard };
}

function calibrationForStory(calibrationProfiles, story, leagueId) {
  const rows = (calibrationProfiles || []).filter((row) =>
    row.story === story && (row.league_id == null || Number(row.league_id) === Number(leagueId))
  );
  if (!rows.length) return { available: false, lowerBound: null, sampleCount: 0, bonus: 0 };
  const preferred = rows.sort((a, b) => {
    const aLeague = a.league_id == null ? 0 : 1;
    const bLeague = b.league_id == null ? 0 : 1;
    return bLeague - aLeague || Number(b.sample_count || 0) - Number(a.sample_count || 0);
  })[0];
  const lowerBound = Number(preferred.lower_bound || 0);
  const sampleCount = Number(preferred.sample_count || 0);
  return {
    available: sampleCount >= 20,
    lowerBound,
    sampleCount,
    bonus: sampleCount >= 20 ? Math.max(-4, Math.min(3, (lowerBound - 0.6) * 20)) : 0
  };
}

function scoreCandidate({ records, evidence, story, target, prediction, calibration, athenaPick }) {
  const familyCount = records.length;
  const averageConfidence = records.reduce((sum, record) => sum + record.confidence, 0) / familyCount;
  const evidenceStrength = Math.min(...records.map((record) => record.evidenceStrength));
  const sampleBonus = Math.min(6,
    ((evidence.homeOverall + evidence.awayOverall - 24) / 12) +
    ((evidence.homeVenue + evidence.awayVenue - 16) / 8)
  );
  const exactSupport = exactTargetSupport(target, records);
  const familyBonus = familyCount === 3 ? 26 : familyCount === 2 ? 18 : 0;
  const conflict = classificationConflict(prediction, story, athenaPick);
  const conflictPenalty = conflict.hard ? 18 : Math.max(0, conflict.maxConflict - 0.55) * 18;
  const specialistPenalty = story === CORE_STORIES.SECOND_HALF_ACTIVITY &&
    !records.some((record) => record.familyKey === "athena") ? 20 : 0;
  const score = 50 +
    familyBonus +
    (averageConfidence / 10) +
    (evidenceStrength * 10) +
    Math.max(0, sampleBonus) +
    Math.min(2, exactSupport) +
    Number(calibration.bonus || 0) -
    conflictPenalty -
    specialistPenalty;

  return {
    score: Number(Math.max(0, Math.min(99, score)).toFixed(1)),
    averageConfidence: Number(averageConfidence.toFixed(1)),
    minimumConfidence: Number(Math.min(...records.map((record) => record.confidence)).toFixed(1)),
    evidenceStrength: Number(evidenceStrength.toFixed(4)),
    sampleBonus: Number(Math.max(0, sampleBonus).toFixed(2)),
    exactSupport,
    conflictPenalty: Number(conflictPenalty.toFixed(2)),
    specialistPenalty,
    conflict
  };
}

function plainExplanation(story, prediction, records, evidence, score) {
  const home = prediction?.home?.name || "The home team";
  const away = prediction?.away?.name || "the away team";
  const familyNames = records.map((record) => record.familyName).join(", ");
  const base = {
    [CORE_STORIES.HOME_PROTECTION]: `PapaLock selected ${home} or Draw because the independent checks agree that ${home} should remain competitive, while the straight home win still carries unnecessary draw risk.`,
    [CORE_STORIES.AWAY_PROTECTION]: `PapaLock selected ${away} or Draw because the independent checks agree that ${away} should remain competitive, while the straight away win still carries unnecessary draw risk.`,
    [CORE_STORIES.MATCH_GOALS]: "PapaLock selected Over 1.5 Goals because the engines agree on more than one credible scoring route, but the evidence is not strong enough to require a third goal.",
    [CORE_STORIES.LOW_EVENT]: "PapaLock selected Under 3.5 Goals because the match repeatedly shows a controlled scoring ceiling, while sharper under markets need more things to go right.",
    [CORE_STORIES.HOME_GOAL]: `PapaLock selected ${home} to score because the team-goal route is supported without needing ${home} to win the match.`,
    [CORE_STORIES.AWAY_GOAL]: `PapaLock selected ${away} to score because the team-goal route is supported without needing ${away} to win the match.`,
    [CORE_STORIES.SECOND_HALF_ACTIVITY]: "PapaLock selected Second Half Over 0.5 Goals because Athena's half-goal audit and another independent family both support action after the break, without naming which team must score."
  }[story] || "PapaLock selected the safest market shared by the independent engine evidence.";

  return `${base} The support came from ${familyNames}. The audit used ${evidence.homeOverall} and ${evidence.awayOverall} same-league matches, including ${evidence.homeVenue} home and ${evidence.awayVenue} away matches. PapaLock's ${score.toFixed(1)}/100 is a rule score, not a guaranteed probability.`;
}

function buildOtherViews(prediction, athenaPick) {
  const views = [];
  for (const key of ["primary", "safer", "aggressive", "venue", "form"]) {
    const pick = prediction?.engines?.[key];
    if (!pick || pick.available === false) continue;
    views.push({
      engineKey: key,
      engineName: pick.engineName || key,
      selection: pick.selection,
      market: pick.market,
      confidence: Number(percent(pick.confidence ?? pick.score).toFixed(1)),
      qualified: pick.qualified !== false
    });
  }
  if (athenaPick) {
    views.push({
      engineKey: "athena",
      engineName: "Athena",
      selection: athenaPick.selection,
      market: athenaPick.market,
      confidence: Number(percent(athenaPick.score).toFixed(1)),
      qualified: true
    });
  }
  return views;
}

function familyPicksForPrediction(prediction, athenaPick) {
  return {
    papasense: PAPA_SENSE_KEYS.map((key) => prediction?.engines?.[key]).filter(Boolean),
    venue: prediction?.engines?.venue ? [prediction.engines.venue] : [],
    athena: athenaPick ? [{
      ...athenaPick.selected,
      engineKey: "athena",
      engineName: "Athena",
      key: athenaPick.marketId,
      marketId: athenaPick.marketId,
      market: athenaPick.market,
      selection: athenaPick.selection,
      score: athenaPick.score,
      confidence: athenaPick.score,
      qualified: true,
      cautions: [
        ...(athenaPick.selected?.warnings || []),
        ...(athenaPick.oddsConflict?.conflict
          ? ["Bookmaker prices disagreed with Athena's original direction"]
          : [])
      ],
      internalAudit: athenaPick.internalAudit || {}
    }] : []
  };
}

function candidateForStory(prediction, athenaPick, story, calibrationProfiles) {
  const evidence = auditEvidence(prediction);
  const gate = sampleGate(evidence);
  if (!gate.passed) return { rejected: true, story, reasons: gate.failures };
  const target = targetForStory(story, prediction);
  if (!target) return { rejected: true, story, reasons: ["No safe PapaLock target exists for this story"] };
  const climate = prediction?.engine?.leagueScoring ||
    prediction?.market_scores?.leagueScoring ||
    classifyLeagueScoring(prediction?.league?.goals || {});
  const leagueFlag = buildLeagueGoalsFlag({
    key: target.key,
    market: target.market,
    selection: target.selection,
    available: true
  }, climate);
  if (leagueFlag) {
    return { rejected: true, story, reasons: [leagueFlag.reason] };
  }
  const clash = prediction?.topFiveClash ||
    (prediction?.redFlags || []).find((flag) => flag.code === "TOP5_CLASH") ||
    (athenaPick?.topFiveClash) ||
    (athenaPick?.redFlags || []).find((flag) => flag.code === "TOP5_CLASH");
  if (clash) {
    return { rejected: true, story, reasons: [clash.reason || "Two top-five teams are too volatile for a PapaLock banker"] };
  }

  const familyPicks = familyPicksForPrediction(prediction, athenaPick);
  const records = FAMILY_KEYS
    .map((familyKey) => familyRecord(
      familyKey,
      familyPicks[familyKey],
      story,
      prediction?.home?.name,
      prediction?.away?.name
    ))
    .filter(Boolean);

  if (records.length < 2) {
    return { rejected: true, story, reasons: ["Fewer than two independent confirmation families support this story"] };
  }

  if (story === CORE_STORIES.SECOND_HALF_ACTIVITY && !records.some((record) => record.familyKey === "athena")) {
    return { rejected: true, story, reasons: ["Athena did not confirm the second-half specialist market"] };
  }

  const calibration = calibrationForStory(
    calibrationProfiles,
    story,
    prediction?.league?.id || prediction?.league?.external_league_id
  );
  const scored = scoreCandidate({
    records,
    evidence,
    story,
    target,
    prediction,
    calibration,
    athenaPick
  });

  if (scored.evidenceStrength < PAPALOCK_MIN_EVIDENCE) {
    return {
      rejected: true,
      story,
      reasons: ["Family market evidence is too weak for a banker"]
    };
  }

  const grade = records.length === 3 && scored.score >= PAPALOCK_ELITE_SCORE
    ? "ELITE"
    : scored.score >= PAPALOCK_MIN_SCORE
      ? "PRIME"
      : scored.score >= 80
        ? "QUALIFIED"
        : "WITHHELD";
  const publicEligible = grade === "ELITE" || grade === "PRIME";

  return {
    rejected: grade === "WITHHELD",
    story,
    target,
    records,
    evidence,
    calibration,
    scored,
    grade,
    publicEligible,
    reasons: publicEligible
      ? []
      : [`PapaLock score ${scored.score.toFixed(1)} did not reach the ${PAPALOCK_MIN_SCORE} Prime gate`]
  };
}

function contradictoryStories(a, b) {
  const pairs = new Set([
    `${CORE_STORIES.HOME_PROTECTION}|${CORE_STORIES.AWAY_PROTECTION}`,
    `${CORE_STORIES.AWAY_PROTECTION}|${CORE_STORIES.HOME_PROTECTION}`
  ]);
  return pairs.has(`${a}|${b}`);
}

function publicRecord(prediction, athenaPick, candidate) {
  const { target, story, records, evidence, calibration, scored, grade } = candidate;
  const agreeingEngines = records.map((record) => ({
    engineKey: record.familyKey,
    engineName: record.familyName,
    confidence: record.confidence,
    evidenceStrength: record.evidenceStrength,
    contributingEngines: record.picks
  }));
  const explanation = plainExplanation(story, prediction, records, evidence, scored.score);
  return {
    id: prediction.id,
    sourcePredictionId: prediction.id,
    fixtureId: prediction.fixtureId,
    internalFixtureId: prediction.internalFixtureId,
    kickoff: prediction.kickoff,
    league: prediction.league,
    home: prediction.home,
    away: prediction.away,
    status: prediction.status,
    matchState: prediction.matchState || null,
    settlement: prediction.settlement || null,
    engineOutcomes: prediction.engineOutcomes || {},
    consensusOutcome: null,
    engine: "PapaLock",
    engineVersion: PAPALOCK_VERSION,
    source: "papalock",
    tier: `PAPALOCK ${grade}`,
    papaLockGrade: grade,
    consensusCount: records.length,
    confirmationFamilies: records.length,
    enginesAvailable: 3,
    key: target.key,
    market: target.market,
    selection: target.selection,
    confidence: scored.averageConfidence,
    minimumConfidence: scored.minimumConfidence,
    bankerScore: scored.score,
    agreeingEngines,
    otherEnginePicks: buildOtherViews(prediction, athenaPick),
    evidence,
    publicExplanation: explanation,
    explanation,
    reasons: [
      `${records.length} independent confirmation families support the same ${target.label} story.`,
      `The weakest family evidence score is ${(scored.evidenceStrength * 100).toFixed(1)}%.`,
      `Both teams passed the 12-match overall, eight-match venue and recent-six data gates.`,
      scored.exactSupport
        ? `${scored.exactSupport} confirmation famil${scored.exactSupport === 1 ? "y selected" : "ies selected"} the exact final market.`
        : "PapaLock chose the safest common market rather than copying a sharper engine selection."
    ],
    cautions: calibration.available
      ? []
      : ["PapaLock does not yet have 20 settled results for this exact story and league, so no calibration bonus was added."],
    internalAudit: {
      story,
      target,
      familyRecords: records,
      scoreBreakdown: scored,
      sampleGate: sampleGate(evidence),
      calibration,
      predictionFingerprint: evidence.evidenceFingerprint,
      athenaFixtureId: athenaPick?.fixtureId || null
    }
  };
}

function toPublicPapaLockPick(pick) {
  if (!pick || typeof pick !== "object") return pick;
  const {
    internalAudit,
    ...rest
  } = pick;
  const evidence = rest.evidence || {};
  return {
    ...rest,
    evidence: {
      individuallyAnalysed: Boolean(evidence.individuallyAnalysed),
      homeOverall: evidence.homeOverall,
      homeVenue: evidence.homeVenue,
      homeRecent: evidence.homeRecent,
      awayOverall: evidence.awayOverall,
      awayVenue: evidence.awayVenue,
      awayRecent: evidence.awayRecent
    }
  };
}

export function toPublicPapaLockSlate(slate = {}) {
  const {
    internalRejections,
    persistence,
    picks,
    ...publicSlate
  } = slate;
  return {
    ...publicSlate,
    picks: (picks || []).map(toPublicPapaLockPick)
  };
}

export function buildPapaLockSlate(predictions = [], athenaPicks = [], {
  limit = PAPALOCK_MAX_DAILY,
  calibrationProfiles = []
} = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || PAPALOCK_MAX_DAILY, PAPALOCK_MAX_DAILY));
  const athenaByFixture = new Map((athenaPicks || []).map((pick) => [String(pick.fixtureId), pick]));
  const selected = [];
  const rejections = [];
  let qualifiedHiddenCount = 0;

  for (const prediction of predictions || []) {
    if (!competitionEligible(prediction)) {
      rejections.push({ fixtureId: prediction.fixtureId, reason: "Competition is not a verified league" });
      continue;
    }
    const athenaPick = athenaByFixture.get(String(prediction.fixtureId)) || null;
    const evaluated = Object.values(CORE_STORIES)
      .map((story) => candidateForStory(prediction, athenaPick, story, calibrationProfiles));
    const viable = evaluated
      .filter((candidate) => candidate && !candidate.rejected)
      .sort((a, b) => b.scored.score - a.scored.score);
    const publicCandidates = viable.filter((candidate) => candidate.publicEligible);

    if (!publicCandidates.length) {
      const evidence = auditEvidence(prediction);
      const gate = sampleGate(evidence);
      if (viable.some((candidate) => candidate.grade === "QUALIFIED")) {
        qualifiedHiddenCount += 1;
        rejections.push({
          fixtureId: prediction.fixtureId,
          reason: viable[0]?.reasons?.[0] || `PapaLock score did not reach the ${PAPALOCK_MIN_SCORE} Prime gate`
        });
      } else {
        rejections.push({
          fixtureId: prediction.fixtureId,
          reason: gate.passed
            ? (evaluated.find((item) => item.reasons?.length)?.reasons[0]
              || "No story reached the PapaLock Prime gate with two independent families")
            : gate.failures[0]
        });
      }
      continue;
    }

    const top = publicCandidates[0];
    const runnerUp = publicCandidates[1];
    if (runnerUp && contradictoryStories(top.story, runnerUp.story) && Math.abs(top.scored.score - runnerUp.scored.score) < 6) {
      rejections.push({
        fixtureId: prediction.fixtureId,
        reason: "Home and away protection stories were too close to separate safely"
      });
      continue;
    }
    if (runnerUp && Math.abs(top.scored.score - runnerUp.scored.score) < 2 && top.story !== runnerUp.story) {
      rejections.push({
        fixtureId: prediction.fixtureId,
        reason: "Two different banker stories had almost equal PapaLock scores"
      });
      continue;
    }

    selected.push(publicRecord(prediction, athenaPick, top));
  }

  selected.sort((a, b) => b.bankerScore - a.bankerScore || new Date(a.kickoff || 0) - new Date(b.kickoff || 0));
  const picks = [];
  const leagueCounts = new Map();
  for (const candidate of selected) {
    const leagueKey = String(candidate.league?.id || candidate.league?.external_league_id || candidate.league?.name || "unknown");
    const count = leagueCounts.get(leagueKey) || 0;
    if (count >= PAPALOCK_MAX_PER_LEAGUE) {
      rejections.push({ fixtureId: candidate.fixtureId, reason: "Daily limit of two PapaLock bankers from the same league was reached" });
      continue;
    }
    leagueCounts.set(leagueKey, count + 1);
    picks.push(candidate);
    if (picks.length >= safeLimit) break;
  }

  const rejectionCounts = rejections.reduce((counts, item) => {
    counts[item.reason] = (counts[item.reason] || 0) + 1;
    return counts;
  }, {});

  return {
    engine: "PapaLock Banker Engine",
    engineVersion: PAPALOCK_VERSION,
    methodology: "Independent family confirmation plus a fresh market-specific PapaLock audit",
    criteria: {
      onePickPerFixture: true,
      minimumConfirmationFamilies: 2,
      papaSenseFamilyCountsAsOne: true,
      minimumOverallMatches: 12,
      minimumVenueMatches: 8,
      minimumRecentMatches: 6,
      minimumEvidenceStrength: PAPALOCK_MIN_EVIDENCE,
      primeScore: PAPALOCK_MIN_SCORE,
      eliteScore: PAPALOCK_ELITE_SCORE,
      maximumPublished: safeLimit,
      maximumPerLeague: PAPALOCK_MAX_PER_LEAGUE,
      verifiedLeagueOnly: true,
      exactSelectionAgreementRequired: false,
      containmentRoutingOnly: true,
      noForcedBankers: true
    },
    picks,
    totalSelections: picks.length,
    eliteCount: picks.filter((pick) => pick.papaLockGrade === "ELITE").length,
    primeCount: picks.filter((pick) => pick.papaLockGrade === "PRIME").length,
    qualifiedHiddenCount,
    rejectedCount: rejections.length,
    rejectionSummary: Object.entries(rejectionCounts)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
    internalRejections: rejections
  };
}

export { CORE_STORIES, canonicalKey, storyForPick, storiesForPick };
