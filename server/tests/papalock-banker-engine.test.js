import test from "node:test";
import assert from "node:assert/strict";

import {
  PAPALOCK_VERSION,
  buildPapaLockSlate
} from "../src/engine/papaLockBankerEngine.js";

function pick(engineKey, {
  key = "over-15",
  market = "Total Goals",
  selection = "Over 1.5 Goals",
  confidence = 78,
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
    score: confidence,
    qualified,
    cautions,
    internalAudit: {
      htftGate: { score: 0.76, triggerMass: 0.72 }
    },
    explanationEvidence: {
      goalScores: { over15: 0.78, under35: 0.74, homeOver05: 0.77, awayOver05: 0.75 },
      goalMetrics: { venueO15: 0.76, recentO15: 0.75, venueU35: 0.78, recentU35: 0.76 }
    }
  };
}

function prediction(id, leagueId = 1) {
  return {
    id,
    fixtureId: String(1000 + id),
    internalFixtureId: id,
    kickoff: `2026-07-${String(10 + id).padStart(2, "0")}T18:00:00.000Z`,
    status: "NS",
    home: { name: `Home ${id}` },
    away: { name: `Away ${id}` },
    league: {
      id: leagueId,
      name: `League ${leagueId}`,
      country: "Test",
      competition_type: "LEAGUE",
      prediction_enabled: true
    },
    engines: {},
    profileAudit: {
      individuallyAnalysed: true,
      evidenceFingerprint: `fingerprint-${id}`,
      home: { evidence: { overall: 18, venue: 9, recent: 6 } },
      away: { evidence: { overall: 18, venue: 9, recent: 6 } }
    }
  };
}

function athenaFor(row, {
  marketId = "SECOND_HALF_OVER_05",
  market = "Second-Half Goals",
  selection = "Second Half Over 0.5 Goals",
  score = 88
} = {}) {
  return {
    fixtureId: row.fixtureId,
    marketId,
    market,
    selection,
    score,
    selected: { market: marketId, score, warnings: [] },
    samples: {
      homeOverall: 18,
      homeVenue: 9,
      homeRecent: 6,
      awayOverall: 18,
      awayVenue: 9,
      awayRecent: 6
    }
  };
}

test("PapaLock counts Papa, Safer and Aggressive as one family", () => {
  const row = prediction(1);
  row.engines = {
    primary: pick("primary"),
    safer: pick("safer", { confidence: 82 }),
    aggressive: pick("aggressive", { key: "over-25", selection: "Over 2.5 Goals", confidence: 80 })
  };

  const result = buildPapaLockSlate([row], []);
  assert.equal(result.totalSelections, 0);
  assert.match(result.rejectionSummary[0].reason, /two independent/i);
});

test("PapaLock chooses the safest common goal market from two independent families", () => {
  const row = prediction(2);
  row.engines = {
    primary: pick("primary", { key: "over-25", selection: "Over 2.5 Goals", confidence: 82 }),
    safer: pick("safer", { key: "over-15", selection: "Over 1.5 Goals", confidence: 80 }),
    aggressive: pick("aggressive", { key: "over-25", selection: "Over 2.5 Goals", confidence: 84 }),
    venue: pick("venue", { key: "over-15", selection: "Over 1.5 Goals", confidence: 79 })
  };

  const result = buildPapaLockSlate([row], []);
  assert.equal(result.totalSelections, 1);
  assert.equal(result.picks[0].key, "over-15");
  assert.equal(result.picks[0].selection, "Over 1.5 Goals");
  assert.equal(result.picks[0].confirmationFamilies, 2);
  assert.equal(result.picks[0].engineVersion, PAPALOCK_VERSION);
  assert.equal(result.picks[0].papaLockGrade, "PRIME");
});

test("PapaLock produces Elite when PapaSense, Venue and Athena support the same home-protection story", () => {
  const row = prediction(3);
  row.engines = {
    primary: pick("primary", { key: "home-1x", market: "Double Chance", selection: "Home 3 or Draw (1X)", confidence: 86 }),
    safer: pick("safer", { key: "home-1x", market: "Double Chance", selection: "Home 3 or Draw (1X)", confidence: 88 }),
    aggressive: pick("aggressive", { key: "home-win", market: "Full-Time Result", selection: "Home 3 Win", confidence: 84 }),
    venue: pick("venue", { key: "home-dnb", market: "Draw No Bet", selection: "Home 3 DNB", confidence: 85 })
  };
  const athena = athenaFor(row, {
    marketId: "HOME_WIN_EITHER_HALF",
    market: "Result Protection",
    selection: "Home 3 to Win Either Half",
    score: 91
  });

  const result = buildPapaLockSlate([row], [athena]);
  assert.equal(result.totalSelections, 1);
  assert.equal(result.picks[0].key, "home-1x");
  assert.equal(result.picks[0].papaLockGrade, "ELITE");
  assert.equal(result.picks[0].confirmationFamilies, 3);
});

test("PapaLock blocks cup and friendly fixtures", () => {
  const row = prediction(4);
  row.league.name = "National Cup";
  row.league.competition_type = "CUP";
  row.engines = {
    primary: pick("primary"),
    venue: pick("venue")
  };

  const result = buildPapaLockSlate([row], []);
  assert.equal(result.totalSelections, 0);
  assert.match(result.rejectionSummary[0].reason, /verified league/i);
});

test("PapaLock enforces 12 overall, eight venue and recent-six samples", () => {
  const row = prediction(5);
  row.profileAudit.home.evidence.venue = 7;
  row.engines = {
    primary: pick("primary"),
    venue: pick("venue")
  };

  const result = buildPapaLockSlate([row], []);
  assert.equal(result.totalSelections, 0);
  assert.match(result.rejectionSummary[0].reason, /eight relevant home or away/i);
});

test("PapaLock publishes at most three daily and no more than two from one league", () => {
  const rows = [prediction(6, 9), prediction(7, 9), prediction(8, 9), prediction(9, 10)];
  for (const row of rows) {
    row.engines = {
      primary: pick("primary", { confidence: 88 }),
      venue: pick("venue", { confidence: 86 })
    };
  }

  const result = buildPapaLockSlate(rows, [], { limit: 3 });
  assert.equal(result.totalSelections, 3);
  const leagueNine = result.picks.filter((item) => item.league.id === 9);
  assert.equal(leagueNine.length, 2);
});
