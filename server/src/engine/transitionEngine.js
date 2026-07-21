import { predictMatch as predictWithOverhaul } from "./overhaulEngine.js";
import { predictMatch as predictWithConsensusSupport } from "./consensusSupportEngine.js";

const SPECIAL_COMMON_SENSE_KEYS = new Set([
  "home-win-either-half",
  "away-win-either-half",
  "draw-either-half",
  "first-half-over-15",
  "gg-yes",
  "over-15"
]);

function rounded(value, digits = 4) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function percent(value) {
  return `${rounded(Number(value || 0) * 100, 1)}%`;
}

function normalizeMarket(market, source = "overhaul") {
  if (!market) return null;
  const score = Number(market.safetyAdjustedScore ?? market.score ?? 0);
  const threshold = Number(market.threshold || 0.01);
  const comparisonScore = Number(
    market.comparisonScore ?? market.directionalRankScore ?? market.rankScore ?? score
  );

  return {
    ...market,
    family: market.family || market.market,
    supportRatio: Number.isFinite(Number(market.supportRatio))
      ? Number(market.supportRatio)
      : rounded(score / Math.max(0.01, threshold)),
    thresholdEdge: Number.isFinite(Number(market.thresholdEdge))
      ? Number(market.thresholdEdge)
      : rounded(score - threshold),
    comparisonScore: rounded(comparisonScore),
    rankScore: rounded(Number(market.rankScore ?? comparisonScore)),
    directionalRankScore: rounded(
      Number(market.directionalRankScore ?? comparisonScore)
    ),
    engineSource: source
  };
}

function marketIdentity(market) {
  return `${String(market?.market || "").trim().toLowerCase()}|${String(
    market?.selection || ""
  ).trim().toLowerCase()}`;
}

function mergeMarkets(overhaulMarkets = [], supportMarkets = []) {
  const merged = [];
  const seen = new Set();

  for (const market of overhaulMarkets) {
    const normalized = normalizeMarket(market, "full-market-overhaul");
    const identity = marketIdentity(normalized);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    merged.push(normalized);
  }

  for (const market of supportMarkets) {
    const normalized = normalizeMarket(market, "v1.17-common-sense-extension");
    const identity = marketIdentity(normalized);
    if (!identity) continue;

    if (seen.has(identity)) {
      const existing = merged.find((row) => marketIdentity(row) === identity);
      if (existing) {
        existing.reasons = [...new Set([...(existing.reasons || []), ...(normalized.reasons || [])])];
        existing.blockers = [...new Set([...(existing.blockers || []), ...(normalized.blockers || [])])];
        existing.qualified = existing.qualified && existing.blockers.length === 0;
        existing.directional = !existing.qualified;
        existing.supportLayer = {
          score: normalized.safetyAdjustedScore,
          threshold: normalized.threshold,
          qualified: normalized.qualified,
          comparisonScore: normalized.comparisonScore
        };
      }
      continue;
    }

    seen.add(identity);
    merged.push(normalized);
  }

  return merged.sort((a, b) => {
    if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
    return Number(b.directionalRankScore || 0) - Number(a.directionalRankScore || 0);
  });
}

function buildPrimaryExplanation(primary, overhaul, support) {
  const evidence = support?.enginePicks?.primary?.explanationEvidence || {};
  const top = overhaul?.story?.topTransitions?.[0] || support?.story?.topTransitions?.[0];
  const second = overhaul?.story?.topTransitions?.[1] || support?.story?.topTransitions?.[1];
  const homeName = overhaul.home;
  const awayName = overhaul.away;
  const decision = [
    ...(primary.reasons || []),
    ...(primary.blockers?.length
      ? [`Main caution: ${primary.blockers.join("; ")}.`]
      : [])
  ].join(" ");

  const topCode = top?.code || evidence.strongestRoute || "the leading route";
  const topMeaning = evidence.strongestRouteMeaning ||
    `${topCode} carries ${percent(top?.probability || 0)} of the compatible HT/FT matrix`;
  const secondSentence = second
    ? `The next supporting transition is ${second.code} at ${percent(second.probability)}.`
    : "All nine HT/FT transitions were reviewed before the market was ranked.";

  return {
    paragraph:
      `Papa's Pick is ${primary.selection}. ` +
      `The strongest exact transition is ${topCode}: ${topMeaning}. ` +
      `${homeName} and ${awayName} were compared through overall, venue and recent HT/FT histories. ` +
      `${secondSentence} ${decision || "The full-market overhaul ranked this as the safest adjusted direction."}`,
    evidence: {
      ...evidence,
      strongestRoute: topCode,
      strongestRouteMeaning: topMeaning,
      secondRoute: second?.code || evidence.secondRoute || null,
      secondRouteMeaning: evidence.secondRouteMeaning || secondSentence,
      homeSupport: evidence.homeSupport || {
        count: 0,
        total: 0,
        percent: 0,
        approximate: true,
        text: "profile evidence reviewed"
      },
      awaySupport: evidence.awaySupport || {
        count: 0,
        total: 0,
        percent: 0,
        approximate: true,
        text: "profile evidence reviewed"
      },
      decision: decision || "The full-market overhaul ranked this as the safest adjusted direction.",
      marketEvidence: primary.evidence || {},
      resultStructure: overhaul.resultStructure || {}
    }
  };
}

function authoritativePrimary(overhaul, support) {
  const supportPrimary = support?.primaryPrediction;
  const policy = supportPrimary?.marketPolicy;

  // Preserve explicit odds-aware upgrades. A real Over 0.5 price below 1.20
  // must never be restored by the generic overhaul ranking.
  if (supportPrimary && policy?.actualOddsUsed) {
    return normalizeMarket(supportPrimary, "v1.17-odds-aware-common-sense-rule");
  }

  // Preserve the later practical HT/FT translations that do not exist in the
  // original v1.6 overhaul, such as Win Either Half and Draw Either Half.
  if (supportPrimary && SPECIAL_COMMON_SENSE_KEYS.has(supportPrimary.key) && policy) {
    return normalizeMarket(supportPrimary, "v1.17-common-sense-special-rule");
  }

  return normalizeMarket(overhaul.primaryPrediction, "full-market-overhaul");
}

function buildPrimaryEnginePick(primary, overhaul, support) {
  const existing = support?.enginePicks?.primary || {};
  const explanation = buildPrimaryExplanation(primary, overhaul, support);
  const confidence = rounded(Number(primary.safetyAdjustedScore || 0) * 100, 2);

  return {
    ...existing,
    engineKey: "primary",
    engineName: "Papa's Pick",
    key: primary.key,
    family: primary.family || primary.market,
    market: primary.market,
    selection: primary.selection,
    score: Number(primary.safetyAdjustedScore || 0),
    confidence,
    modelScore: Number(primary.modelScore || 0),
    threshold: Number(primary.threshold || 0),
    comparisonScore: Number(primary.comparisonScore || primary.directionalRankScore || 0),
    qualified: Boolean(primary.qualified),
    mode: primary.qualified ? "qualified" : "directional",
    tier: primary.tier,
    reasons: [
      "Papa's Pick uses the audited full-market overhaul before the consensus layer.",
      ...(primary.reasons || [])
    ],
    cautions: [
      ...(primary.blockers || []),
      ...(!primary.qualified
        ? ["Directional only — this selection did not pass its full market threshold."]
        : [])
    ],
    description:
      "Audited full-market HT/FT intelligence: each market is scored separately and must pass its own blockers.",
    explanationParagraph: explanation.paragraph,
    explanationEvidence: explanation.evidence,
    marketPolicy: {
      ...(primary.marketPolicy || {}),
      version: "papa-full-market-overhaul-v1.17.1",
      authoritativeCore: true
    }
  };
}

function buildDecisionTrace(primary, markets, overhaul, support, enginePicks) {
  const base = overhaul.decisionTrace || {};
  const protectedMarketReason = primary.market === "Double Chance"
    ? "Double Chance remained strongest after its protection-market and threshold checks."
    : `The ${primary.market} route beat the protected Double Chance routes after threshold-relative comparison.`;

  const alternatives = markets
    .filter((market) => marketIdentity(market) !== marketIdentity(primary))
    .slice(0, 8)
    .map((market) => ({
      key: market.key,
      family: market.family,
      market: market.market,
      selection: market.selection,
      score: market.safetyAdjustedScore,
      threshold: market.threshold,
      qualified: market.qualified,
      tier: market.tier,
      reasons: market.reasons || [],
      blockers: market.blockers || [],
      comparisonScore: market.comparisonScore,
      supportRatio: market.supportRatio,
      thresholdEdge: market.thresholdEdge,
      engineSource: market.engineSource
    }));

  return {
    ...base,
    mode: primary.qualified ? "qualified" : "directional",
    qualified: Boolean(primary.qualified),
    headline: primary.qualified
      ? "Papa’s strongest qualified market"
      : "Papa’s best available direction",
    summary: `${primary.selection}. ${overhaul.story?.narrative || "All market families were compared separately."}`,
    whyChosen: [
      ...(primary.reasons || []),
      protectedMarketReason,
      `Model score: ${percent(primary.modelScore)}; safety-adjusted score: ${percent(primary.safetyAdjustedScore)}.`,
      primary.qualified
        ? `Passed the ${percent(primary.threshold)} market threshold.`
        : `Best direction but below the ${percent(primary.threshold)} strong-pick threshold.`,
      `Home goal support ${percent(overhaul.goalIntelligence?.metrics?.homeGoalSupport)} versus away goal support ${percent(overhaul.goalIntelligence?.metrics?.awayGoalSupport)}.`
    ],
    cautions: [
      ...(primary.blockers || []),
      ...(!primary.qualified
        ? ["Directional only: this is not a banker or high-confidence call."]
        : [])
    ],
    alternatives,
    marketComparison: markets.slice(0, 18).map((market) => ({
      key: market.key,
      family: market.family,
      market: market.market,
      selection: market.selection,
      score: market.safetyAdjustedScore,
      threshold: market.threshold,
      supportRatio: market.supportRatio,
      thresholdEdge: market.thresholdEdge,
      comparisonScore: market.comparisonScore,
      qualified: market.qualified,
      selected: marketIdentity(market) === marketIdentity(primary),
      reasons: market.reasons || [],
      blockers: market.blockers || [],
      engineSource: market.engineSource
    })),
    selectionMethod:
      "The audited overhaul compares every market relative to its own threshold, applies market-specific blockers, and then sends the winning direction into the four-engine consensus layer.",
    enginePicks,
    venuePatternReview: support?.decisionTrace?.venuePatternReview || null,
    marketPolicy: {
      version: "papa-full-market-overhaul-v1.17.1",
      authoritativeCore: true,
      specialCommonSenseCompatibility: SPECIAL_COMMON_SENSE_KEYS.has(primary.key)
    }
  };
}

export function predictMatch(input) {
  // The support engine is called first because it enforces the v1.17
  // anti-zombie evidence gate and builds venue/common-sense auxiliary engines.
  const support = predictWithConsensusSupport(input);
  const overhaul = predictWithOverhaul(input);

  const primary = authoritativePrimary(overhaul, support);
  const markets = mergeMarkets(overhaul.markets, support.markets);

  const enginePicks = {
    ...(support.enginePicks || {}),
    primary: buildPrimaryEnginePick(primary, overhaul, support)
  };

  const supportingPrediction = markets.find(
    (market) =>
      marketIdentity(market) !== marketIdentity(primary) &&
      market.family !== primary.family &&
      (market.qualified || Number(market.directionalRankScore || 0) >= 0.58)
  ) || overhaul.supportingPrediction || support.supportingPrediction || null;

  const decisionTrace = buildDecisionTrace(
    primary,
    markets,
    overhaul,
    support,
    enginePicks
  );

  return {
    ...support,
    ...overhaul,
    profileAudit: input.profileAudit || support.profileAudit || null,
    analysisFingerprint: input.analysisFingerprint || support.analysisFingerprint || null,
    primaryPrediction: primary,
    supportingPrediction,
    markets,
    enginePicks,
    defaultEngine: "primary",
    noBet: false,
    qualified: Boolean(primary.qualified),
    directionMode: primary.qualified ? "qualified" : "directional",
    decisionTrace,
    venuePattern: support.venuePattern || null,
    resultStructure: overhaul.resultStructure || null,
    engineArchitecture: {
      version: "1.17.1",
      authoritativeCore: "Papa full-market overhaul",
      supportLayer: "v1.17 common-sense, venue and consensus engines",
      policy:
        "Every market is scored independently by the overhaul before auxiliary engine consensus is calculated."
    },
    safeguards: [
      ...(overhaul.safeguards || []),
      "The v1.17 prior-only anti-zombie gate remains active.",
      "Consensus Bankers remain separate and require strict multi-engine agreement.",
      "Later common-sense special routes are retained only when their explicit HT/FT rule fires."
    ]
  };
}
