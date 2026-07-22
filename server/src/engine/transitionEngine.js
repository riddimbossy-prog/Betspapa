import { predictMatch as predictWithOverhaul } from "./overhaulEngine.js";
import { predictMatch as predictWithConsensusSupport } from "./consensusSupportEngine.js";

const SPECIAL_COMMON_SENSE_KEYS = new Set([
  "home-win-either-half",
  "away-win-either-half",
  "draw-either-half",
  "first-half-over-15"
]);

const OVERHAUL_CONFIRMED_COMMON_SENSE_KEYS = new Set(["gg-yes", "over-15"]);

const RESULT_MARKET_KEYS = new Set([
  "home-1x",
  "away-x2",
  "no-draw",
  "home-dnb",
  "away-dnb",
  "home-win",
  "away-win",
  "draw",
  "ht-home",
  "ht-away",
  "ht-draw",
  "exact-htft",
  "home-win-either-half",
  "away-win-either-half",
  "draw-either-half"
]);

const GOAL_MARKET_KEYS = new Set([
  "gg-yes",
  "gg-no",
  "over-15",
  "under-15",
  "over-25",
  "under-25",
  "over-35",
  "under-35",
  "two-to-three-goals",
  "home-over-05",
  "away-over-05",
  "home-over-15",
  "away-over-15",
  "home-under-15",
  "away-under-15",
  "home-clean-sheet",
  "away-clean-sheet",
  "first-half-over-05",
  "first-half-over-15",
  "second-half-over-05"
]);

const SAFER_DISALLOWED_KEYS = new Set([
  "exact-htft",
  "home-win",
  "away-win",
  "draw",
  "ht-home",
  "ht-away",
  "ht-draw",
  "over-35"
]);

const AGGRESSIVE_KEYS = new Set([
  "exact-htft",
  "home-win",
  "away-win",
  "ht-home",
  "ht-away",
  "over-25",
  "over-35",
  "gg-yes",
  "home-over-15",
  "away-over-15",
  "first-half-over-15"
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
        existing.qualified = Boolean(existing.qualified) && existing.blockers.length === 0;
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

function cleanMarket(market) {
  return Boolean(market) && (market.blockers || []).length === 0;
}

function qualifiedMarket(market) {
  return cleanMarket(market) && Boolean(market.qualified);
}

function marketByKey(markets, key) {
  return markets.find((market) => market.key === key) || null;
}

function selectionSide(market, input, overhaul) {
  const key = String(market?.key || "");
  if (key.startsWith("home-")) return "home";
  if (key.startsWith("away-")) return "away";

  const selection = String(market?.selection || "").toLowerCase();
  if (selection.startsWith(String(input.home.name || "").toLowerCase())) return "home";
  if (selection.startsWith(String(input.away.name || "").toLowerCase())) return "away";

  const structure = overhaul?.resultStructure || {};
  const home = Number(structure.homeWinMass || overhaul?.directProbabilities?.fullTime?.home || 0);
  const away = Number(structure.awayWinMass || overhaul?.directProbabilities?.fullTime?.away || 0);
  if (Math.abs(home - away) < 0.03) return null;
  return home > away ? "home" : "away";
}

function authoritativePrimary(overhaul, support) {
  const supportPrimary = support?.primaryPrediction;
  const policy = supportPrimary?.marketPolicy;

  // Preserve the explicit real-odds upgrade rule. This is the only generic
  // support-layer override because it reacts to a real market price.
  if (supportPrimary && policy?.actualOddsUsed) {
    return normalizeMarket(supportPrimary, "v1.17-odds-aware-common-sense-rule");
  }

  // A comeback/equalisation common-sense story may nominate GG or Over 1.5,
  // but it is accepted only when the same market independently qualifies in
  // the audited overhaul. The support engine cannot revive a blocked goal pick.
  if (supportPrimary && OVERHAUL_CONFIRMED_COMMON_SENSE_KEYS.has(supportPrimary.key) && policy) {
    const audited = (overhaul.markets || []).find((market) => market.key === supportPrimary.key);
    if (qualifiedMarket(audited)) {
      return normalizeMarket(audited, "full-market-overhaul-confirmed-common-sense-rule");
    }
  }

  // Preserve only practical markets that the original overhaul does not own.
  if (supportPrimary && SPECIAL_COMMON_SENSE_KEYS.has(supportPrimary.key) && policy) {
    return normalizeMarket(supportPrimary, "v1.17-common-sense-special-rule");
  }

  return normalizeMarket(overhaul.primaryPrediction, "full-market-overhaul");
}

function preferredSaferKeys(primary, input, overhaul) {
  const side = selectionSide(primary, input, overhaul);

  if (side === "home") {
    return ["home-dnb", "home-1x", "home-over-05", "under-35", "over-15"];
  }
  if (side === "away") {
    return ["away-dnb", "away-x2", "away-over-05", "under-35", "over-15"];
  }

  if (["over-25", "over-35", "gg-yes"].includes(primary.key)) {
    return ["over-15", "home-over-05", "away-over-05", "under-35"];
  }
  if (["under-15", "under-25", "under-35", "gg-no"].includes(primary.key)) {
    return ["under-35", "home-under-15", "away-under-15", "home-clean-sheet", "away-clean-sheet"];
  }
  if (primary.key === "no-draw") {
    const resultSide = selectionSide(primary, input, overhaul);
    return resultSide === "away"
      ? ["away-dnb", "away-x2", "under-35", "over-15"]
      : ["home-dnb", "home-1x", "under-35", "over-15"];
  }

  return ["under-35", "over-15", "home-1x", "away-x2", "home-over-05", "away-over-05"];
}

function chooseSaferMarket(markets, primary, input, overhaul) {
  const preferred = preferredSaferKeys(primary, input, overhaul);
  const preferredCandidate = preferred
    .map((key) => marketByKey(markets, key))
    .find((market) =>
      qualifiedMarket(market) &&
      marketIdentity(market) !== marketIdentity(primary) &&
      !SAFER_DISALLOWED_KEYS.has(market.key)
    );

  if (preferredCandidate) {
    return {
      market: preferredCandidate,
      independent: true,
      reason: "Selected from the audited overhaul catalogue after passing its own threshold and blockers."
    };
  }

  const broadQualified = markets
    .filter((market) =>
      qualifiedMarket(market) &&
      marketIdentity(market) !== marketIdentity(primary) &&
      !SAFER_DISALLOWED_KEYS.has(market.key)
    )
    .sort((a, b) => Number(b.supportRatio || 0) - Number(a.supportRatio || 0))[0];

  if (broadQualified) {
    return {
      market: broadQualified,
      independent: true,
      reason: "No preferred cushion passed, so Papa used the strongest other qualified broad market from the overhaul."
    };
  }

  return {
    market: primary,
    independent: false,
    reason: "No separate safer market passed its own audited threshold, so the Safer engine repeats Papa's Pick instead of inventing a weak cushion."
  };
}

function aggressivePreferences(primary, input, overhaul) {
  const side = selectionSide(primary, input, overhaul);
  if (side === "home") {
    return ["home-win", "home-over-15", "home-win-either-half", "ht-home", "exact-htft"];
  }
  if (side === "away") {
    return ["away-win", "away-over-15", "away-win-either-half", "ht-away", "exact-htft"];
  }
  if (["over-15", "gg-yes"].includes(primary.key)) {
    return ["over-25", "gg-yes", "over-35", "home-over-15", "away-over-15", "first-half-over-15"];
  }
  if (["under-35", "under-25", "gg-no"].includes(primary.key)) {
    return ["under-25", "under-15", "gg-no", "home-clean-sheet", "away-clean-sheet"];
  }
  return ["over-25", "gg-yes", "home-win", "away-win", "exact-htft"];
}

function chooseAggressiveMarket(markets, primary, input, overhaul) {
  const preferred = aggressivePreferences(primary, input, overhaul);
  const candidate = preferred
    .map((key) => marketByKey(markets, key))
    .find((market) =>
      qualifiedMarket(market) && marketIdentity(market) !== marketIdentity(primary)
    );

  if (candidate) {
    return {
      market: candidate,
      independent: true,
      reason: "Selected from a sharper audited market that passed its own threshold and blockers."
    };
  }

  const anyAggressive = markets
    .filter((market) =>
      qualifiedMarket(market) &&
      marketIdentity(market) !== marketIdentity(primary) &&
      AGGRESSIVE_KEYS.has(market.key)
    )
    .sort((a, b) => Number(b.comparisonScore || 0) - Number(a.comparisonScore || 0))[0];

  if (anyAggressive) {
    return {
      market: anyAggressive,
      independent: true,
      reason: "The strongest remaining qualified high-specificity market was selected."
    };
  }

  return {
    market: primary,
    independent: false,
    reason: "No independent aggressive market passed. The engine repeats Papa's Pick rather than forcing a volatile selection."
  };
}

function chooseVenueMarket(markets, primary, support) {
  const requestedKey = support?.enginePicks?.venue?.key;
  const requested = requestedKey ? marketByKey(markets, requestedKey) : null;

  if (qualifiedMarket(requested) && marketIdentity(requested) !== marketIdentity(primary)) {
    return {
      market: requested,
      independent: true,
      reason: "The venue engine's preferred route was found in the audited overhaul catalogue and passed its own blockers.",
      venueRoute: support?.enginePicks?.venue?.venueRoute || null
    };
  }

  const venueEvidenceCandidate = markets
    .filter((market) =>
      qualifiedMarket(market) &&
      marketIdentity(market) !== marketIdentity(primary) &&
      (market.evidence || market.supportLayer)
    )
    .sort((a, b) => Number(b.comparisonScore || 0) - Number(a.comparisonScore || 0))[0];

  if (venueEvidenceCandidate) {
    return {
      market: venueEvidenceCandidate,
      independent: true,
      reason: "The requested venue route failed, so the venue engine used the strongest other qualified overhaul market with auditable evidence.",
      venueRoute: support?.enginePicks?.venue?.venueRoute || null
    };
  }

  return {
    market: primary,
    independent: false,
    reason: "No separate venue market passed the overhaul checks, so the venue engine repeats Papa's Pick without claiming independent consensus.",
    venueRoute: support?.enginePicks?.venue?.venueRoute || null
  };
}

function routeContext(overhaul) {
  const top = overhaul?.story?.topTransitions?.[0] || null;
  const second = overhaul?.story?.topTransitions?.[1] || null;
  return { top, second };
}

function marketSpecificExplanation(engineName, market, overhaul, support, selectionReason) {
  const metrics = overhaul?.goalIntelligence?.metrics || {};
  const scores = overhaul?.goalIntelligence?.scores || {};
  const structure = overhaul?.resultStructure || {};
  const direct = overhaul?.directProbabilities || {};
  const { top, second } = routeContext(overhaul);
  const qualifiedSentence = market.qualified
    ? `It passed its ${percent(market.threshold)} threshold with a safety-adjusted score of ${percent(market.safetyAdjustedScore)}.`
    : `It is directional only: ${percent(market.safetyAdjustedScore)} against a ${percent(market.threshold)} threshold.`;
  const blockerSentence = (market.blockers || []).length
    ? ` Cautions: ${market.blockers.join("; ")}.`
    : " No market-specific blocker remained.";

  if (market.key === "over-15") {
    const topContext = top
      ? `The leading exact HT/FT route is ${top.code} at ${percent(top.probability)}, but that route is context only and did not create the goal pick.`
      : "The exact HT/FT routes were treated as context only.";
    return (
      `${engineName}'s pick is Over 1.5. ` +
      `The audited goal model used venue Over 1.5 agreement ${percent(metrics.venueO15)}, recent Over 1.5 agreement ${percent(metrics.recentO15)}, ` +
      `the strongest one-team scoring route ${percent(metrics.strongestGoalRoute)}, and low-score pressure ${percent(metrics.lowScorePressure)}. ` +
      `${topContext} ${qualifiedSentence} ${selectionReason}${blockerSentence}`
    );
  }

  if (market.key === "gg-yes") {
    return (
      `${engineName}'s pick is GG — Yes. ` +
      `Home scoring support is ${percent(metrics.homeGoalSupport)} and away scoring support is ${percent(metrics.awayGoalSupport)}. ` +
      `Forced two-sided scoring routes carry ${percent(metrics.forcedGgMass)}, while recent GG agreement is ${percent(metrics.latestGgAgreement)}. ` +
      `Both teams had to pass independently; one dominant attack was not enough. ${qualifiedSentence} ${selectionReason}${blockerSentence}`
    );
  }

  if (market.key === "gg-no") {
    return (
      `${engineName}'s pick is GG — No. ` +
      `The strongest shutout route is ${percent(Math.max(metrics.homeShutoutSupport || 0, metrics.awayShutoutSupport || 0))}, ` +
      `while the two-sided scoring floor is ${percent(metrics.twoSidedGoalFloor)} and forced GG mass is ${percent(metrics.forcedGgMass)}. ` +
      `${qualifiedSentence} ${selectionReason}${blockerSentence}`
    );
  }

  if (["over-25", "over-35"].includes(market.key)) {
    return (
      `${engineName}'s pick is ${market.selection}. ` +
      `The model separated two-sided scoring from one-sided dominance. Dominant 2+ support is ${percent(metrics.dominant2PlusSupport)}, ` +
      `recent Over 2.5 agreement is ${percent(metrics.recentO25)}, venue Over 2.5 agreement is ${percent(metrics.venueO25)}, ` +
      `and full-reversal mass is ${percent(structure.fullReversalMass)}. ` +
      `${qualifiedSentence} ${selectionReason}${blockerSentence}`
    );
  }

  if (["under-15", "under-25", "under-35"].includes(market.key)) {
    const venueValue = market.key === "under-35" ? metrics.venueU35 : metrics.venueU25;
    const recentValue = market.key === "under-35" ? metrics.recentU35 : metrics.recentU25;
    return (
      `${engineName}'s pick is ${market.selection}. ` +
      `Low-score pressure is ${percent(metrics.lowScorePressure)}, venue ceiling agreement is ${percent(venueValue)}, ` +
      `recent ceiling agreement is ${percent(recentValue)}, and full-reversal risk is ${percent(structure.fullReversalMass)}. ` +
      `${qualifiedSentence} ${selectionReason}${blockerSentence}`
    );
  }

  if (market.key === "two-to-three-goals") {
    return (
      `${engineName}'s pick is 2–3 Total Goals. ` +
      `Over 1.5 scored ${percent(scores.over15)} and Under 3.5 scored ${percent(scores.under35)}, so both models point to the same middle goal corridor. ` +
      `${qualifiedSentence} ${selectionReason}${blockerSentence}`
    );
  }

  if (market.key.endsWith("over-05") || market.key.endsWith("over-15") || market.key.endsWith("under-15")) {
    return (
      `${engineName}'s pick is ${market.selection}. ` +
      `${(market.reasons || []).join(" ")} ` +
      `Home goal support is ${percent(metrics.homeGoalSupport)} and away goal support is ${percent(metrics.awayGoalSupport)}. ` +
      `${qualifiedSentence} ${selectionReason}${blockerSentence}`
    );
  }

  if (market.key.includes("clean-sheet")) {
    return (
      `${engineName}'s pick is ${market.selection}. ` +
      `Home shutout support is ${percent(metrics.homeShutoutSupport)} and away shutout support is ${percent(metrics.awayShutoutSupport)}. ` +
      `Forced GG mass is ${percent(metrics.forcedGgMass)}. ${qualifiedSentence} ${selectionReason}${blockerSentence}`
    );
  }

  if (RESULT_MARKET_KEYS.has(market.key)) {
    const topSentence = top
      ? `The leading compatible route is ${top.code} at ${percent(top.probability)}${second ? `, followed by ${second.code} at ${percent(second.probability)}` : ""}.`
      : "All nine HT/FT routes were reviewed.";
    return (
      `${engineName}'s pick is ${market.selection}. ${topSentence} ` +
      `Home-win mass is ${percent(structure.homeWinMass || direct?.fullTime?.home)}, draw mass is ${percent(structure.drawMass || direct?.fullTime?.draw)}, ` +
      `and away-win mass is ${percent(structure.awayWinMass || direct?.fullTime?.away)}. ` +
      `${qualifiedSentence} ${selectionReason}${blockerSentence}`
    );
  }

  if (GOAL_MARKET_KEYS.has(market.key)) {
    return (
      `${engineName}'s pick is ${market.selection}. ${(market.reasons || []).join(" ")} ` +
      `${qualifiedSentence} ${selectionReason}${blockerSentence}`
    );
  }

  return (
    `${engineName}'s pick is ${market.selection}. ${(market.reasons || []).join(" ")} ` +
    `${qualifiedSentence} ${selectionReason}${blockerSentence}`
  );
}

function buildEnginePick({
  engineKey,
  engineName,
  market,
  overhaul,
  support,
  selectionReason,
  independent,
  venueRoute = null
}) {
  const confidence = rounded(Number(market.safetyAdjustedScore || 0) * 100, 2);
  const explanation = marketSpecificExplanation(
    engineName === "Papa's Pick" ? "Papa" : engineName,
    market,
    overhaul,
    support,
    selectionReason
  );

  const descriptions = {
    primary: "Authoritative audited full-market HT/FT intelligence.",
    aggressive: "Higher-specificity qualified market selected from the same audited overhaul catalogue.",
    safer: "Lower-risk qualified market selected only after its own threshold and blocker checks.",
    venue: "Venue-led route mapped back into the audited overhaul market catalogue."
  };

  const legacyEvidence = support?.enginePicks?.[engineKey]?.explanationEvidence ||
    support?.enginePicks?.primary?.explanationEvidence || {};
  const top = overhaul?.story?.topTransitions?.[0] || null;
  const second = overhaul?.story?.topTransitions?.[1] || null;

  return {
    engineKey,
    engineName,
    key: market.key,
    family: market.family || market.market,
    market: market.market,
    selection: market.selection,
    score: Number(market.safetyAdjustedScore || 0),
    confidence,
    modelScore: Number(market.modelScore || 0),
    threshold: Number(market.threshold || 0),
    comparisonScore: Number(market.comparisonScore || market.directionalRankScore || 0),
    qualified: Boolean(market.qualified),
    mode: market.qualified ? "qualified" : "directional",
    tier: market.tier,
    reasons: [
      `This ${engineName} selection came from the audited full-market catalogue.`,
      selectionReason,
      ...(market.reasons || [])
    ],
    cautions: [
      ...(market.blockers || []),
      ...(!market.qualified
        ? ["Directional only — this selection did not pass its full market threshold."]
        : []),
      ...(!independent
        ? ["This engine repeated Papa's Pick because no independent alternative passed; it is not a separate consensus vote."]
        : [])
    ],
    description: descriptions[engineKey],
    explanationParagraph: explanation,
    explanationEvidence: {
      strongestRoute: top?.code || legacyEvidence.strongestRoute || null,
      strongestRouteMeaning: legacyEvidence.strongestRouteMeaning ||
        (top ? `${top.code} carries ${percent(top.probability)} of the compatible matrix` : null),
      secondRoute: second?.code || legacyEvidence.secondRoute || null,
      secondRouteMeaning: legacyEvidence.secondRouteMeaning ||
        (second ? `${second.code} carries ${percent(second.probability)} of the compatible matrix` : null),
      homeSupport: legacyEvidence.homeSupport || {
        count: 0, total: 0, percent: 0, approximate: true, text: "profile evidence reviewed"
      },
      awaySupport: legacyEvidence.awaySupport || {
        count: 0, total: 0, percent: 0, approximate: true, text: "profile evidence reviewed"
      },
      selectionBasis: GOAL_MARKET_KEYS.has(market.key)
        ? "market-specific goal evidence"
        : RESULT_MARKET_KEYS.has(market.key)
          ? "market-specific result and HT/FT evidence"
          : "market-specific overhaul evidence",
      marketEvidence: market.evidence || {},
      goalMetrics: overhaul?.goalIntelligence?.metrics || {},
      goalScores: overhaul?.goalIntelligence?.scores || {},
      resultStructure: overhaul?.resultStructure || {},
      topTransitions: overhaul?.story?.topTransitions || [],
      decision: selectionReason
    },
    venueRoute,
    independentConsensusVote: Boolean(independent),
    consensusEligible: Boolean(independent),
    engineSource: market.engineSource || "full-market-overhaul",
    marketPolicy: {
      ...(market.marketPolicy || {}),
      version: "papa-full-market-overhaul-v1.17.4",
      authoritativeCore: true,
      allEnginesUseOverhaulCatalogue: true,
      independentConsensusVote: Boolean(independent)
    }
  };
}

function buildEngineSuite(primary, markets, overhaul, support, input) {
  const safer = chooseSaferMarket(markets, primary, input, overhaul);
  const aggressive = chooseAggressiveMarket(markets, primary, input, overhaul);
  const venue = chooseVenueMarket(markets, primary, support);

  return {
    primary: buildEnginePick({
      engineKey: "primary",
      engineName: "Papa's Pick",
      market: primary,
      overhaul,
      support,
      selectionReason: "The audited overhaul ranked this as the strongest safety-adjusted interpretation of the match.",
      independent: true
    }),
    aggressive: buildEnginePick({
      engineKey: "aggressive",
      engineName: "Aggressive",
      market: aggressive.market,
      overhaul,
      support,
      selectionReason: aggressive.reason,
      independent: aggressive.independent
    }),
    safer: buildEnginePick({
      engineKey: "safer",
      engineName: "Safer",
      market: safer.market,
      overhaul,
      support,
      selectionReason: safer.reason,
      independent: safer.independent
    }),
    venue: buildEnginePick({
      engineKey: "venue",
      engineName: "Venue Pattern",
      market: venue.market,
      overhaul,
      support,
      selectionReason: venue.reason,
      independent: venue.independent,
      venueRoute: venue.venueRoute
    })
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
      "All four engines now select from the audited overhaul catalogue. Goal markets use goal evidence; result markets use result and HT/FT evidence. Auxiliary engines cannot revive a blocked or sub-threshold market.",
    enginePicks,
    venuePatternReview: support?.decisionTrace?.venuePatternReview || null,
    marketPolicy: {
      version: "papa-full-market-overhaul-v1.17.4",
      authoritativeCore: true,
      allEnginesUseOverhaulCatalogue: true,
      specialCommonSenseCompatibility: SPECIAL_COMMON_SENSE_KEYS.has(primary.key)
    }
  };
}

export function predictMatch(input) {
  // The support engine still supplies anti-zombie evidence, venue context and
  // later special rules, but it no longer owns Safer/Aggressive goal logic.
  const support = predictWithConsensusSupport(input);
  const overhaul = predictWithOverhaul(input);

  const primary = authoritativePrimary(overhaul, support);
  const markets = mergeMarkets(overhaul.markets, support.markets);
  const enginePicks = buildEngineSuite(primary, markets, overhaul, support, input);

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
      version: "1.17.4",
      authoritativeCore: "Papa full-market overhaul",
      supportLayer: "v1.17 anti-zombie, real-odds and venue context only",
      policy:
        "Papa, Aggressive, Safer and Venue Pattern all select from the audited overhaul market catalogue."
    },
    safeguards: [
      ...(overhaul.safeguards || []),
      "The v1.17 prior-only anti-zombie gate remains active.",
      "Safer cannot choose a blocked or sub-threshold Over 1.5 merely because it is a lower line.",
      "Goal-market explanations cite goal evidence instead of treating the strongest exact HT/FT route as proof.",
      "Repeated fallback picks are marked ineligible as independent consensus votes.",
      "Consensus Bankers remain separate and require strict multi-engine agreement."
    ]
  };
}
