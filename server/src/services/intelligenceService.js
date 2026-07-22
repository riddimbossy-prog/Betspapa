import { ENGINE_VERSION, FINISHED_PROFILE_STATUSES, PREDICTABLE_STATUSES } from "../config.js";
import { dateRangeUtc } from "../utils/date.js";
import { fetchAllRows, throwIfSupabaseError } from "./supabaseHelpers.js";
import { gradeEnginePick } from "./gradingService.js";

export const ENGINE_KEYS = ["primary", "aggressive", "safer", "venue"];

export const ENGINE_LABELS = {
  primary: "Papa's Pick",
  aggressive: "Aggressive",
  safer: "Safer",
  venue: "Venue Pattern"
};

const BANKER_THRESHOLDS = {
  primary: 72,
  aggressive: 68,
  safer: 70,
  venue: 70
};

function confidencePercent(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return number <= 1 ? number * 100 : number;
}

function chunkValues(values, size = 100) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function fetchRowsInChunks(values, queryFactory, {
  chunkSize = 100,
  concurrency = 4
} = {}) {
  if (!values.length) return [];
  const chunks = chunkValues(values, chunkSize);
  const rows = [];

  for (let index = 0; index < chunks.length; index += concurrency) {
    const group = chunks.slice(index, index + concurrency);
    const results = await Promise.all(
      group.map((chunk) => fetchAllRows(() => queryFactory(chunk)))
    );
    results.forEach((batch) => rows.push(...batch));
  }

  return rows;
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

function criticalCautions(pick) {
  return (pick?.cautions || [])
    .filter(Boolean)
    .filter((warning) =>
      /(insufficient|small sample|contradiction|unavailable|below the strong|missing|unstable)/i
        .test(String(warning))
    );
}

function bankerEligibility(prediction, engineKey) {
  const pick = prediction?.engines?.[engineKey];
  if (!pick) return { eligible: false, reasons: ["Engine pick is unavailable"] };

  const evidence = auditEvidence(prediction);
  const confidence = confidencePercent(pick.confidence ?? pick.score);
  const threshold = BANKER_THRESHOLDS[engineKey];
  const cautions = criticalCautions(pick);
  const reasons = [];

  if (!pick.qualified) reasons.push("Pick did not pass its qualification threshold");
  if (pick.consensusEligible === false) {
    reasons.push("Engine repeated another pick and is not an independent consensus vote");
  }
  if (confidence < threshold) reasons.push(`Confidence below ${threshold}%`);
  if (!evidence.individuallyAnalysed) reasons.push("Individual profile audit is incomplete");
  if (evidence.homeOverall < 6 || evidence.awayOverall < 6) {
    reasons.push("Overall history is below six matches for one or both teams");
  }
  if (evidence.homeVenue < 3 || evidence.awayVenue < 3) {
    reasons.push("Venue history is below three matches for one or both teams");
  }
  if (cautions.length) reasons.push(...cautions);

  return {
    eligible: reasons.length === 0,
    reasons,
    confidence,
    threshold,
    evidence,
    score:
      confidence +
      Math.min(4, evidence.homeVenue + evidence.awayVenue) +
      Math.min(3, (evidence.homeOverall + evidence.awayOverall) / 10)
  };
}

export function selectBankerSlate(predictions, { limit = 3 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 3, 5));
  const engines = {};
  const rejectionSummary = {};

  for (const engineKey of ENGINE_KEYS) {
    const candidates = [];
    const rejected = [];

    for (const prediction of predictions || []) {
      const pick = prediction?.engines?.[engineKey];
      if (!pick) continue;

      const eligibility = bankerEligibility(prediction, engineKey);
      const record = {
        fixtureId: prediction.fixtureId,
        internalFixtureId: prediction.internalFixtureId,
        kickoff: prediction.kickoff,
        league: prediction.league,
        home: prediction.home,
        away: prediction.away,
        status: prediction.status,
        matchState: prediction.matchState || null,
        settlement: prediction.settlement || null,
        engineOutcome: prediction.engineOutcomes?.[engineKey] || null,
        engineKey,
        engineName: ENGINE_LABELS[engineKey],
        pick,
        confidence: eligibility.confidence,
        threshold: eligibility.threshold,
        evidence: eligibility.evidence,
        reasons: pick.reasons || [],
        cautions: pick.cautions || []
      };

      if (eligibility.eligible) {
        candidates.push({ ...record, bankerScore: Number(eligibility.score.toFixed(2)) });
      } else {
        rejected.push({ ...record, rejectedFor: eligibility.reasons });
      }
    }

    candidates.sort((a, b) => {
      if (b.bankerScore !== a.bankerScore) return b.bankerScore - a.bankerScore;
      return new Date(a.kickoff || 0) - new Date(b.kickoff || 0);
    });

    const unique = [];
    const fixtureIds = new Set();
    for (const candidate of candidates) {
      const id = String(candidate.fixtureId || candidate.internalFixtureId);
      if (fixtureIds.has(id)) continue;
      fixtureIds.add(id);
      unique.push(candidate);
      if (unique.length >= safeLimit) break;
    }

    engines[engineKey] = {
      engineKey,
      engineName: ENGINE_LABELS[engineKey],
      threshold: BANKER_THRESHOLDS[engineKey],
      picks: unique,
      qualifiedCandidates: candidates.length,
      status: unique.length
        ? "ready"
        : "No fixture passed every banker requirement"
    };

    rejectionSummary[engineKey] = {
      rejected: rejected.length,
      topReasons: Object.entries(
        rejected.flatMap((item) => item.rejectedFor)
          .reduce((counts, reason) => {
            counts[reason] = (counts[reason] || 0) + 1;
            return counts;
          }, {})
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([reason, count]) => ({ reason, count }))
    };
  }

  return {
    criteria: {
      limitPerEngine: safeLimit,
      minimumOverallMatches: 6,
      minimumVenueMatches: 3,
      qualifiedRequired: true,
      criticalCautionsAllowed: false,
      confidenceThresholds: BANKER_THRESHOLDS
    },
    engines,
    rejectionSummary,
    totalSelections: Object.values(engines)
      .reduce((sum, engine) => sum + engine.picks.length, 0)
  };
}


const CONSENSUS_MIN_CONFIDENCE = 68;
const SOLO_HIGH_CONFIDENCE = 86;
const CONSENSUS_DEFAULT_LIMIT = 12;

function normalizedToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/\bgoals?\b/g, "")
    .replace(/\bmatch\b/g, "")
    .replace(/\bteam\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalPickKey(pick) {
  const rawKey = String(pick?.key || "").toLowerCase().trim();
  const aliases = {
    "over-15": "match-over-1.5",
    "over-25": "match-over-2.5",
    "under-35": "match-under-3.5",
    "gg-yes": "btts-yes",
    "gg-no": "btts-no",
    "home-1x": "double-chance",
    "away-x2": "double-chance",
    "no-draw": "double-chance",
    "home-over-05": "team-over-0.5",
    "away-over-05": "team-over-0.5",
    "home-over-15": "team-over-1.5",
    "away-over-15": "team-over-1.5",
    "favourite-over-15": "team-over-1.5",
    "home-win": "full-time-win",
    "away-win": "full-time-win",
    "home-dnb": "draw-no-bet",
    "away-dnb": "draw-no-bet",
    "home-win-either-half": "win-either-half",
    "away-win-either-half": "win-either-half",
    "first-half-over-05": "first-half-over-0.5",
    "first-half-over-15": "first-half-over-1.5",
    "second-half-over-05": "second-half-over-0.5"
  };
  return aliases[rawKey] || rawKey || normalizedToken(pick?.market);
}

function pickSignature(pick) {
  return `${canonicalPickKey(pick)}|${normalizedToken(pick?.selection)}`;
}

function consensusTier(votes, source) {
  if (source === "high-confidence") return "HIGH CONFIDENCE";
  if (votes >= 4) return "UNANIMOUS";
  if (votes === 3) return "PRIME CONSENSUS";
  return "CONSENSUS";
}

function consensusScore({ averageConfidence, minimumConfidence, votes, evidence, source }) {
  const voteBonus = source === "high-confidence" ? 0 : ({ 2: 3, 3: 6, 4: 9 }[votes] || 0);
  const sampleBonus = Math.min(
    3,
    ((evidence.homeOverall + evidence.awayOverall) / 20) +
      ((evidence.homeVenue + evidence.awayVenue) / 10)
  );
  const consistencyBonus = Math.max(0, 2 - Math.max(0, averageConfidence - minimumConfidence) / 8);
  return Math.min(99, averageConfidence + voteBonus + sampleBonus + consistencyBonus);
}

function publicBankerRecord(prediction, group, source) {
  const votes = group.items.length;
  const confidences = group.items.map((item) => item.confidence);
  const averageConfidence = confidences.reduce((sum, value) => sum + value, 0) / confidences.length;
  const minimumConfidence = Math.min(...confidences);
  const evidence = group.items[0].eligibility.evidence;
  const score = consensusScore({
    averageConfidence,
    minimumConfidence,
    votes,
    evidence,
    source
  });
  const agreeingEngines = group.items.map((item) => ({
    engineKey: item.engineKey,
    engineName: ENGINE_LABELS[item.engineKey],
    confidence: Number(item.confidence.toFixed(1))
  }));
  const agreeingKeys = new Set(group.items.map((item) => item.engineKey));
  const otherEnginePicks = ENGINE_KEYS
    .filter((engineKey) => prediction.engines?.[engineKey] && !agreeingKeys.has(engineKey))
    .map((engineKey) => {
      const pick = prediction.engines[engineKey];
      return {
        engineKey,
        engineName: ENGINE_LABELS[engineKey],
        selection: pick.selection,
        market: pick.market,
        confidence: Number(confidencePercent(pick.confidence ?? pick.score).toFixed(1)),
        qualified: Boolean(pick.qualified)
      };
    });

  return {
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
    consensusOutcome: agreeingEngines
      .map((engine) => prediction.engineOutcomes?.[engine.engineKey])
      .find(Boolean) || null,
    source,
    tier: consensusTier(votes, source),
    consensusCount: votes,
    enginesAvailable: Object.keys(prediction.engines || {}).length,
    selection: group.pick.selection,
    market: group.pick.market,
    key: group.pick.key,
    confidence: Number(averageConfidence.toFixed(1)),
    minimumConfidence: Number(minimumConfidence.toFixed(1)),
    bankerScore: Number(score.toFixed(1)),
    agreeingEngines,
    otherEnginePicks,
    evidence,
    reasons: [
      source === "high-confidence"
        ? `${agreeingEngines[0]?.engineName || "One engine"} produced an exceptional qualified score of ${averageConfidence.toFixed(1)}%.`
        : `${votes} of ${Object.keys(prediction.engines || {}).length || 4} engines independently selected the same market.`,
      `The agreeing engines average ${averageConfidence.toFixed(1)}% confidence; the lowest agreeing score is ${minimumConfidence.toFixed(1)}%.`,
      `Both teams passed the strict history audit (${evidence.homeOverall}/${evidence.awayOverall} overall and ${evidence.homeVenue}/${evidence.awayVenue} venue matches).`
    ],
    cautions: group.items.flatMap((item) => item.pick.cautions || []).filter(Boolean)
  };
}

/**
 * Builds one consensus banker per fixture.
 * - Exact same market + exact same selection from at least two qualified engines.
 * - Or one exceptional qualified engine at 86%+ when no consensus exists.
 * - Every candidate must pass the existing banker sample and caution gates.
 * - Split ties are withheld instead of forcing a pick.
 */
export function selectConsensusBankers(predictions, { limit = CONSENSUS_DEFAULT_LIMIT } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || CONSENSUS_DEFAULT_LIMIT, 20));
  const selected = [];
  const rejections = [];

  for (const prediction of predictions || []) {
    const groups = new Map();
    const eligibleSingles = [];

    for (const engineKey of ENGINE_KEYS) {
      const pick = prediction?.engines?.[engineKey];
      if (!pick) continue;
      const eligibility = bankerEligibility(prediction, engineKey);
      const confidence = eligibility.confidence;
      if (!eligibility.eligible || confidence < CONSENSUS_MIN_CONFIDENCE) continue;

      const item = { engineKey, pick, confidence, eligibility };
      eligibleSingles.push(item);
      const signature = pickSignature(pick);
      if (!groups.has(signature)) groups.set(signature, { signature, pick, items: [] });
      groups.get(signature).items.push(item);
    }

    const consensusGroups = [...groups.values()]
      .filter((group) => group.items.length >= 2)
      .map((group) => ({
        ...group,
        averageConfidence: group.items.reduce((sum, item) => sum + item.confidence, 0) / group.items.length,
        minimumConfidence: Math.min(...group.items.map((item) => item.confidence))
      }))
      .sort((a, b) =>
        b.items.length - a.items.length ||
        b.averageConfidence - a.averageConfidence ||
        b.minimumConfidence - a.minimumConfidence
      );

    if (consensusGroups.length) {
      const top = consensusGroups[0];
      const runnerUp = consensusGroups[1];
      const splitTie = runnerUp &&
        runnerUp.items.length === top.items.length &&
        Math.abs(runnerUp.averageConfidence - top.averageConfidence) < 3;

      if (splitTie) {
        rejections.push({
          fixtureId: prediction.fixtureId,
          reason: "Two different selections had an almost equal engine consensus"
        });
        continue;
      }

      selected.push(publicBankerRecord(prediction, top, "consensus"));
      continue;
    }

    const exceptional = eligibleSingles
      .filter((item) => item.confidence >= SOLO_HIGH_CONFIDENCE)
      .sort((a, b) => b.confidence - a.confidence)[0];

    if (exceptional) {
      selected.push(publicBankerRecord(prediction, {
        signature: pickSignature(exceptional.pick),
        pick: exceptional.pick,
        items: [exceptional]
      }, "high-confidence"));
    } else {
      rejections.push({
        fixtureId: prediction.fixtureId,
        reason: eligibleSingles.length
          ? "No two engines agreed and no single pick reached 86%"
          : "No engine passed the strict banker evidence gate"
      });
    }
  }

  selected.sort((a, b) =>
    b.consensusCount - a.consensusCount ||
    b.bankerScore - a.bankerScore ||
    new Date(a.kickoff || 0) - new Date(b.kickoff || 0)
  );

  const picks = selected.slice(0, safeLimit);
  const rejectionCounts = rejections.reduce((counts, row) => {
    counts[row.reason] = (counts[row.reason] || 0) + 1;
    return counts;
  }, {});

  return {
    criteria: {
      onePickPerFixture: true,
      exactSelectionAgreementRequired: true,
      minimumConsensusEngines: 2,
      minimumEligibleConfidence: CONSENSUS_MIN_CONFIDENCE,
      soloHighConfidenceThreshold: SOLO_HIGH_CONFIDENCE,
      minimumOverallMatches: 6,
      minimumVenueMatches: 3,
      qualifiedRequired: true,
      criticalCautionsAllowed: false,
      maximumPublished: safeLimit
    },
    picks,
    totalSelections: picks.length,
    unanimousCount: picks.filter((pick) => pick.consensusCount >= 4).length,
    primeCount: picks.filter((pick) => pick.consensusCount === 3).length,
    consensusCount: picks.filter((pick) => pick.consensusCount === 2).length,
    highConfidenceCount: picks.filter((pick) => pick.source === "high-confidence").length,
    rejectedCount: rejections.length,
    rejectionSummary: Object.entries(rejectionCounts)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
  };
}

function maxIso(values) {
  return values
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()))
    .sort((a, b) => b - a)[0]?.toISOString() || null;
}

function groupCount(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

function similarityGroups(predictions) {
  const groups = new Map();

  for (const prediction of predictions || []) {
    const audit = prediction.market_scores?.profileAudit || {};
    const evidenceFingerprint = audit.evidenceFingerprint;
    const enginePicks = prediction.market_scores?.enginePicks || {};
    if (!evidenceFingerprint) continue;

    const engineSignature = ENGINE_KEYS
      .map((engineKey) => {
        const pick = enginePicks[engineKey];
        if (!pick) return `${engineKey}:none`;
        const confidence = confidencePercent(pick.confidence ?? pick.score).toFixed(1);
        return `${engineKey}:${pick.key || pick.market}:${confidence}`;
      })
      .join("|");

    const signature = `${evidenceFingerprint}|${engineSignature}`;
    if (!groups.has(signature)) groups.set(signature, []);
    groups.get(signature).push({
      predictionId: prediction.id,
      fixtureId: prediction.fixture_id,
      primarySelection: prediction.primary_selection,
      confidence: Number(prediction.confidence || 0),
      analysisFingerprint: prediction.market_scores?.analysisFingerprint || null
    });
  }

  return [...groups.entries()]
    .filter(([, rows]) => rows.length >= 3)
    .map(([signature, rows]) => ({
      severity: rows.length >= 5 ? "critical" : "review",
      signature: signature.slice(0, 32),
      count: rows.length,
      rows
    }))
    .sort((a, b) => b.count - a.count);
}

export function detectSuspiciousPredictionCandidates(candidates) {
  const groups = new Map();

  for (const candidate of candidates || []) {
    const audit = candidate.prediction?.profileAudit || {};
    const evidenceFingerprint = audit.evidenceFingerprint;
    if (!evidenceFingerprint) continue;

    const enginePicks = candidate.prediction?.enginePicks || {};
    const engineSignature = ENGINE_KEYS
      .map((engineKey) => {
        const pick = enginePicks[engineKey];
        if (!pick) return `${engineKey}:none`;
        const confidence = confidencePercent(pick.confidence ?? pick.score).toFixed(1);
        return `${engineKey}:${pick.key || pick.market}:${confidence}`;
      })
      .join("|");

    const signature = `${evidenceFingerprint}|${engineSignature}`;
    if (!groups.has(signature)) groups.set(signature, []);
    groups.get(signature).push(candidate);
  }

  const withheldFixtureIds = new Set();
  const flaggedGroups = [];

  for (const [signature, rows] of groups.entries()) {
    if (rows.length < 3) continue;
    for (const row of rows) withheldFixtureIds.add(Number(row.fixture.id));
    flaggedGroups.push({
      signature: signature.slice(0, 32),
      count: rows.length,
      fixtureIds: rows.map((row) => row.fixture.id)
    });
  }

  return {
    withheldFixtureIds,
    flaggedGroups,
    withheld: withheldFixtureIds.size
  };
}

async function loadEntities(supabase, fixtures) {
  const teamIds = [...new Set(fixtures.flatMap((fixture) => [
    fixture.home_team_id,
    fixture.away_team_id
  ]).filter(Boolean))];
  const leagueIds = [...new Set(fixtures.map((fixture) => fixture.league_id).filter(Boolean))];

  const [teams, leagues] = await Promise.all([
    fetchRowsInChunks(
      teamIds,
      (ids) => supabase.from("teams")
        .select("id,external_team_id,name,country,logo_url")
        .in("id", ids)
    ),
    fetchRowsInChunks(
      leagueIds,
      (ids) => supabase.from("leagues")
        .select("id,external_league_id,name,country,season,logo_url")
        .in("id", ids)
    )
  ]);

  return {
    teamMap: new Map((teams || []).map((team) => [team.id, team])),
    leagueMap: new Map((leagues || []).map((league) => [league.id, league]))
  };
}

export async function getResultsIntelligence(supabase, days = 30) {
  const safeDays = Math.max(1, Math.min(Number(days) || 30, 90));
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - safeDays);

  const fixtures = await fetchAllRows(() =>
    supabase
      .from("fixtures")
      .select("*")
      .in("status", [...FINISHED_PROFILE_STATUSES])
      .gte("fixture_date", start.toISOString())
      .lte("fixture_date", end.toISOString())
      .order("fixture_date", { ascending: false })
  );

  if (!fixtures.length) {
    return {
      days: safeDays,
      generatedAt: new Date().toISOString(),
      engines: Object.fromEntries(
        ENGINE_KEYS.map((key) => [key, {
          engineKey: key,
          engineName: ENGINE_LABELS[key],
          wins: 0,
          losses: 0,
          voids: 0,
          graded: 0,
          winRate: null
        }])
      ),
      marketBreakdown: [],
      recent: []
    };
  }

  const fixtureIds = fixtures.map((fixture) => fixture.id);
  const predictionRows = await fetchRowsInChunks(
    fixtureIds,
    (ids) => supabase
      .from("predictions")
      .select("*")
      .in("fixture_id", ids)
      .eq("published", true)
      .order("created_at", { ascending: false })
  );

  // Results must survive engine upgrades. Keep the newest usable published
  // prediction for each fixture instead of filtering history to one version.
  const rowsByFixture = new Map();
  for (const prediction of predictionRows) {
    if (!rowsByFixture.has(prediction.fixture_id)) rowsByFixture.set(prediction.fixture_id, []);
    rowsByFixture.get(prediction.fixture_id).push(prediction);
  }
  const predictions = [...rowsByFixture.values()].map((rows) => {
    rows.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    return rows.find((row) => Object.keys(row.market_scores?.enginePicks || {}).length) || rows[0];
  });

  const { teamMap, leagueMap } = await loadEntities(supabase, fixtures);
  const fixtureMap = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const recent = [];
  const engineRows = Object.fromEntries(ENGINE_KEYS.map((key) => [key, []]));

  for (const prediction of predictions) {
    const fixture = fixtureMap.get(prediction.fixture_id);
    if (!fixture) continue;
    const home = teamMap.get(fixture.home_team_id);
    const away = teamMap.get(fixture.away_team_id);
    const league = leagueMap.get(fixture.league_id);
    const picks = prediction.market_scores?.enginePicks || {};

    for (const engineKey of ENGINE_KEYS) {
      const pick = picks[engineKey];
      if (!pick) continue;
      const outcome = gradeEnginePick(pick, fixture, home?.name, away?.name);
      const row = {
        fixtureId: fixture.external_fixture_id,
        kickoff: fixture.fixture_date,
        engineKey,
        engineName: ENGINE_LABELS[engineKey],
        home,
        away,
        league,
        market: pick.market,
        selection: pick.selection,
        key: pick.key,
        confidence: confidencePercent(pick.confidence ?? pick.score),
        outcome,
        halftimeScore: `${fixture.halftime_home}-${fixture.halftime_away}`,
        fulltimeScore: `${fixture.fulltime_home}-${fixture.fulltime_away}`
      };
      engineRows[engineKey].push(row);
      recent.push(row);
    }
  }

  const engines = {};
  const marketRows = [];

  for (const engineKey of ENGINE_KEYS) {
    const rows = engineRows[engineKey];
    const wins = rows.filter((row) => row.outcome === "WIN").length;
    const losses = rows.filter((row) => row.outcome === "LOSS").length;
    const voids = rows.filter((row) => row.outcome === "VOID").length;
    const graded = wins + losses;

    engines[engineKey] = {
      engineKey,
      engineName: ENGINE_LABELS[engineKey],
      wins,
      losses,
      voids,
      ungradeable: rows.filter((row) => row.outcome === "UNABLE_TO_GRADE").length,
      graded,
      winRate: graded ? Number(((wins / graded) * 100).toFixed(1)) : null
    };

    const byMarket = new Map();
    for (const row of rows) {
      const key = `${row.market}|${row.key}`;
      if (!byMarket.has(key)) {
        byMarket.set(key, {
          engineKey,
          engineName: ENGINE_LABELS[engineKey],
          market: row.market,
          selection: row.key,
          wins: 0,
          losses: 0,
          voids: 0
        });
      }
      const item = byMarket.get(key);
      if (row.outcome === "WIN") item.wins += 1;
      if (row.outcome === "LOSS") item.losses += 1;
      if (row.outcome === "VOID") item.voids += 1;
    }

    for (const item of byMarket.values()) {
      const gradedMarket = item.wins + item.losses;
      marketRows.push({
        ...item,
        graded: gradedMarket,
        winRate: gradedMarket
          ? Number(((item.wins / gradedMarket) * 100).toFixed(1))
          : null
      });
    }
  }

  recent.sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff));

  return {
    days: safeDays,
    generatedAt: new Date().toISOString(),
    engines,
    marketBreakdown: marketRows
      .filter((row) => row.graded > 0)
      .sort((a, b) => {
        if ((b.winRate || 0) !== (a.winRate || 0)) return (b.winRate || 0) - (a.winRate || 0);
        return b.graded - a.graded;
      })
      .slice(0, 40),
    recent: recent.slice(0, 80)
  };
}

export async function getPredictionDiagnostics(supabase, date) {
  const { start, end } = dateRangeUtc(date);

  const fixtures = await fetchAllRows(() =>
    supabase
      .from("fixtures")
      .select("*")
      .gte("fixture_date", start)
      .lt("fixture_date", end)
      .order("fixture_date", { ascending: true })
  );

  const fixtureIds = fixtures.map((fixture) => fixture.id);
  const predictions = fixtureIds.length
    ? await fetchAllRows(() =>
        supabase
          .from("predictions")
          .select("*")
          .in("fixture_id", fixtureIds)
          .eq("engine_version", ENGINE_VERSION)
      )
    : [];

  const teamIds = [...new Set(fixtures.flatMap((fixture) => [
    fixture.home_team_id,
    fixture.away_team_id
  ]).filter(Boolean))];

  const profiles = teamIds.length
    ? await fetchAllRows(() =>
        supabase
          .from("team_htft_profiles")
          .select("team_id,scope,matches_played,updated_at")
          .in("team_id", teamIds)
      )
    : [];

  const profileMap = new Map();
  for (const row of profiles) {
    if (!profileMap.has(row.team_id)) {
      profileMap.set(row.team_id, {
        overall: 0,
        home: 0,
        away: 0,
        recent6: 0,
        updatedAt: null
      });
    }
    const item = profileMap.get(row.team_id);
    item[row.scope] = Math.max(
      Number(item[row.scope] || 0),
      Number(row.matches_played || 0)
    );
    item.updatedAt = maxIso([item.updatedAt, row.updated_at]);
  }

  const teamReadiness = teamIds.map((teamId) => {
    const item = profileMap.get(teamId) || {
      overall: 0,
      home: 0,
      away: 0,
      recent6: 0
    };
    return {
      teamId,
      ...item,
      ready:
        item.overall >= 6 &&
        (item.home >= 3 || item.away >= 3 || item.recent6 >= 4)
    };
  });

  const predictionFixtureIds = new Set(predictions.map((row) => row.fixture_id));
  const predictable = fixtures.filter((fixture) => PREDICTABLE_STATUSES.has(fixture.status));
  const finished = fixtures.filter((fixture) => fixture.status === "FT");

  const marketRows = [];
  for (const prediction of predictions) {
    const picks = prediction.market_scores?.enginePicks || {};
    for (const engineKey of ENGINE_KEYS) {
      const pick = picks[engineKey];
      if (!pick) continue;
      marketRows.push({
        engineKey,
        engineName: ENGINE_LABELS[engineKey],
        market: pick.market || "Unknown",
        selection: pick.selection || "Unknown",
        qualified: Boolean(pick.qualified)
      });
    }
  }

  const markets = groupCount(
    marketRows,
    (row) => `${row.engineKey}|${row.market}`
  ).map((row) => {
    const [engineKey, market] = row.key.split("|");
    return {
      engineKey,
      engineName: ENGINE_LABELS[engineKey],
      market,
      count: row.count
    };
  });

  const duplicates = similarityGroups(predictions);

  return {
    date,
    generatedAt: new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
    fixtures: {
      imported: fixtures.length,
      predictable: predictable.length,
      finished: finished.length,
      other: Math.max(0, fixtures.length - predictable.length - finished.length)
    },
    predictions: {
      rows: predictions.length,
      published: predictions.filter((row) => row.published).length,
      withheld: predictions.filter((row) => !row.published).length,
      pending: predictable.filter((fixture) => !predictionFixtureIds.has(fixture.id)).length,
      qualified: predictions.filter((row) => row.market_scores?.qualified).length,
      directional: predictions.filter((row) => !row.market_scores?.qualified).length,
      lastGeneratedAt: maxIso(predictions.flatMap((row) => [row.updated_at, row.created_at]))
    },
    profiles: {
      teams: teamIds.length,
      readyTeams: teamReadiness.filter((team) => team.ready).length,
      thinTeams: teamReadiness.filter((team) => !team.ready).length,
      readinessPercent: teamIds.length
        ? Number(((teamReadiness.filter((team) => team.ready).length / teamIds.length) * 100).toFixed(1))
        : null,
      thinTeamIds: teamReadiness.filter((team) => !team.ready).map((team) => team.teamId)
    },
    markets,
    antiZombie: {
      status: duplicates.length ? "review" : "clear",
      suspiciousGroups: duplicates.length,
      groups: duplicates
    }
  };
}
