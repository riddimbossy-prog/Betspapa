import test from "node:test";
import assert from "node:assert/strict";

import { selectConsensusBankers } from "../src/services/intelligenceService.js";

function basePrediction(id = 1) {
  return {
    fixtureId: String(id),
    internalFixtureId: id,
    kickoff: "2026-07-21T18:00:00.000Z",
    status: "NS",
    matchState: { category: "pending", label: "Pending" },
    home: { name: `Home ${id}` },
    away: { name: `Away ${id}` },
    league: { name: "Consensus League", country: "Test" },
    engines: {},
    profileAudit: {
      individuallyAnalysed: true,
      evidenceFingerprint: `evidence-${id}`,
      home: { evidence: { overall: 10, venue: 5, recent: 6 } },
      away: { evidence: { overall: 10, venue: 5, recent: 6 } }
    }
  };
}

function pick(engineKey, {
  key = "over-15",
  market = "Total Goals",
  selection = "Over 1.5",
  confidence = 80,
  qualified = true,
  cautions = []
} = {}) {
  return {
    engineKey,
    engineName: engineKey,
    key,
    market,
    selection,
    confidence,
    qualified,
    reasons: ["Strong supporting evidence"],
    cautions
  };
}

test("publishes one unanimous banker when all four engines agree", () => {
  const row = basePrediction(1);
  row.engines = {
    primary: pick("primary", { confidence: 82 }),
    aggressive: pick("aggressive", { confidence: 78 }),
    safer: pick("safer", { confidence: 84 }),
    venue: pick("venue", { confidence: 80 })
  };

  const result = selectConsensusBankers([row]);
  assert.equal(result.totalSelections, 1);
  assert.equal(result.picks[0].tier, "UNANIMOUS");
  assert.equal(result.picks[0].consensusCount, 4);
  assert.equal(result.picks[0].selection, "Over 1.5");
});

test("recognizes equivalent team Over 1.5 keys as the same selection", () => {
  const row = basePrediction(2);
  row.engines = {
    primary: pick("primary", {
      key: "favourite-over-15",
      market: "Team Goals",
      selection: "Home 2 Over 1.5",
      confidence: 82
    }),
    aggressive: pick("aggressive", {
      key: "home-over-15",
      market: "Team Goals",
      selection: "Home 2 Over 1.5",
      confidence: 79
    }),
    safer: pick("safer", { key: "home-over-05", market: "Team Goals", selection: "Home 2 Over 0.5", confidence: 84 }),
    venue: pick("venue", { key: "under-35", market: "Total Goals", selection: "Under 3.5", confidence: 75 })
  };

  const result = selectConsensusBankers([row]);
  assert.equal(result.totalSelections, 1);
  assert.equal(result.picks[0].tier, "CONSENSUS");
  assert.equal(result.picks[0].consensusCount, 2);
  assert.equal(result.picks[0].selection, "Home 2 Over 1.5");
});

test("uses an exceptional 86 percent qualified single-engine pick when no engines agree", () => {
  const row = basePrediction(3);
  row.engines = {
    primary: pick("primary", { key: "home-win", market: "Full-Time Result", selection: "Home 3 Win", confidence: 88 }),
    aggressive: pick("aggressive", { key: "over-25", selection: "Over 2.5", confidence: 75 }),
    safer: pick("safer", { key: "under-35", selection: "Under 3.5", confidence: 78 }),
    venue: pick("venue", { key: "ht-draw", market: "Half-Time Result", selection: "Draw at HT", confidence: 73 })
  };

  const result = selectConsensusBankers([row]);
  assert.equal(result.totalSelections, 1);
  assert.equal(result.picks[0].tier, "HIGH CONFIDENCE");
  assert.equal(result.picks[0].source, "high-confidence");
  assert.equal(result.picks[0].selection, "Home 3 Win");
});

test("rejects thin samples even when engines agree", () => {
  const row = basePrediction(4);
  row.profileAudit.home.evidence.venue = 1;
  row.engines = {
    primary: pick("primary", { confidence: 88 }),
    aggressive: pick("aggressive", { confidence: 87 })
  };

  const result = selectConsensusBankers([row]);
  assert.equal(result.totalSelections, 0);
  assert.equal(result.rejectedCount, 1);
});

test("withholds an almost-even split instead of forcing one selection", () => {
  const row = basePrediction(5);
  row.engines = {
    primary: pick("primary", { selection: "Over 1.5", confidence: 80 }),
    aggressive: pick("aggressive", { selection: "Over 1.5", confidence: 79 }),
    safer: pick("safer", { key: "under-35", selection: "Under 3.5", confidence: 80 }),
    venue: pick("venue", { key: "under-35", selection: "Under 3.5", confidence: 79 })
  };

  const result = selectConsensusBankers([row]);
  assert.equal(result.totalSelections, 0);
  assert.match(result.rejectionSummary[0].reason, /almost equal engine consensus/i);
});

test("publishes only one strongest banker per fixture", () => {
  const row = basePrediction(6);
  row.engines = {
    primary: pick("primary", { confidence: 85 }),
    aggressive: pick("aggressive", { confidence: 84 }),
    safer: pick("safer", { confidence: 83 }),
    venue: pick("venue", { key: "under-35", selection: "Under 3.5", confidence: 90 })
  };

  const result = selectConsensusBankers([row]);
  assert.equal(result.totalSelections, 1);
  assert.equal(result.picks[0].consensusCount, 3);
  assert.equal(result.picks[0].tier, "PRIME CONSENSUS");
});
