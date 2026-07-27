import test from "node:test";
import assert from "node:assert/strict";

import {
  analyseFixture,
  CLASSIFICATIONS,
  MARKETS
} from "../src/engine/athena-transition-engine/src/index.js";
import {
  ATHENA_ARBITRATION_VERSION,
  arbitrateAthenaV11
} from "../src/engine/athenaV11Arbiter.js";

function market(marketId, score, warnings = []) {
  return { market: marketId, score, reasons: ["test"], warnings, fatal: false };
}

function resultFixture({
  classification = CLASSIFICATIONS.HIGH_EVENT_EARLY_SEPARATION,
  side = "AWAY",
  candidates,
  oddsConflict = false,
  favorite = "AWAY"
}) {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  return {
    classification: { type: classification, side, warnings: [] },
    banker: candidates.find((item) => item.market === MARKETS.AWAY_WIN_EITHER_HALF) || sorted[0],
    topMarkets: sorted,
    secondary: sorted.slice(1, 4),
    oddsConflict: { conflict: oddsConflict, favorite },
    metrics: {
      home: { leadHoldRate: 0.55, comebackSaveRate: 0.35 },
      away: { leadHoldRate: 0.9, comebackSaveRate: 0.2 }
    }
  };
}

function venueResult(side = "AWAY") {
  return { classification: { type: CLASSIFICATIONS.STABLE_LEADER, side, warnings: [] } };
}

const samples = { homeVenue: 12, awayVenue: 12 };

test("Athena v3 preserves the high-event Aktobe 2 vs Kairat Almaty 2 route to Over 2.5", () => {
  const input = {
    id: "aktobe-kairat",
    home: {
      name: "Aktobe 2",
      matchesPlayed: 15,
      htft: { ww: 1, wd: 1, wl: 0, dw: 2, dd: 2, dl: 1, lw: 1, ld: 2, ll: 5 },
      goals: { over25: 12, under25: 3, averageTotalGoals: 4.7, goalsFor: 27, goalsAgainst: 44 },
      venue: { matchesPlayed: 15 }
    },
    away: {
      name: "Kairat Almaty 2",
      matchesPlayed: 15,
      htft: { ww: 13, wd: 0, wl: 0, dw: 0, dd: 2, dl: 0, lw: 0, ld: 0, ll: 0 },
      goals: { over25: 11, under25: 4, averageTotalGoals: 4.1, goalsFor: 54, goalsAgainst: 7 },
      venue: { matchesPlayed: 15 }
    },
    odds: { home: 9.25, draw: 7.5, away: 1.16 }
  };
  const rc1 = analyseFixture(input);
  const arbitration = arbitrateAthenaV11({
    result: rc1,
    venueResult: analyseFixture(input),
    samples: { homeVenue: 15, awayVenue: 15 }
  });

  assert.equal(ATHENA_ARBITRATION_VERSION, "3.1.0");
  assert.equal(rc1.banker.market, MARKETS.AWAY_WIN_EITHER_HALF);
  assert.equal(arbitration.primary.market, MARKETS.OVER_2_5);
  assert.equal(arbitration.primary.score, 100);
  assert.equal(arbitration.bestDirectional.market, MARKETS.AWAY_WIN_EITHER_HALF);
  assert.equal(arbitration.switchedFromRc1, true);
  assert.equal(arbitration.rule, "HIGH_EVENT_GOAL_FIRST");
});

test("high-event Win Either Half may replace the goal market only within five points", () => {
  const result = resultFixture({
    candidates: [
      market(MARKETS.OVER_2_5, 92),
      market(MARKETS.AWAY_WIN_EITHER_HALF, 89),
      market(MARKETS.OVER_1_5, 88)
    ]
  });
  const arbitration = arbitrateAthenaV11({ result, venueResult: venueResult("AWAY"), samples });
  assert.equal(arbitration.primary.market, MARKETS.AWAY_WIN_EITHER_HALF);
  assert.equal(arbitration.rule, "HIGH_EVENT_CLOSE_DIRECTION");
});

test("directional odds conflict prevents Win Either Half from replacing a high-event goal market", () => {
  const result = resultFixture({
    candidates: [
      market(MARKETS.OVER_2_5, 92),
      market(MARKETS.AWAY_WIN_EITHER_HALF, 91, ["ODDS_DIRECTION_CONFLICT"]),
      market(MARKETS.OVER_1_5, 88)
    ],
    oddsConflict: true,
    favorite: "HOME"
  });
  const arbitration = arbitrateAthenaV11({ result, venueResult: venueResult("AWAY"), samples });
  assert.equal(arbitration.primary.market, MARKETS.OVER_2_5);
  assert.equal(arbitration.bestDirectional, null);
});

test("stable-leader classification keeps a fully confirmed direction inside the six-point margin", () => {
  const result = resultFixture({
    classification: CLASSIFICATIONS.STABLE_LEADER,
    candidates: [
      market(MARKETS.OVER_1_5, 92),
      market(MARKETS.AWAY_WIN_EITHER_HALF, 88),
      market(MARKETS.AWAY_DNB, 84)
    ]
  });
  const arbitration = arbitrateAthenaV11({ result, venueResult: venueResult("AWAY"), samples });
  assert.equal(arbitration.primary.market, MARKETS.AWAY_WIN_EITHER_HALF);
  assert.equal(arbitration.rule, "STABLE_DIRECTION_WITHIN_MARGIN");
});

test("BTTS with insufficient scoring evidence cannot become the Athena v1.1 primary", () => {
  const result = resultFixture({
    side: null,
    favorite: null,
    candidates: [
      market(MARKETS.BTTS_YES, 94, ["INSUFFICIENT_SCORING_EVIDENCE"]),
      market(MARKETS.OVER_1_5, 86)
    ]
  });
  result.classification.side = null;
  const arbitration = arbitrateAthenaV11({ result, venueResult: null, samples });
  assert.equal(arbitration.primary.market, MARKETS.OVER_1_5);
});


test("CONFLICT_NO_PICK is a mandatory hard stop even when a goal score clears 80", () => {
  const result = resultFixture({
    classification: CLASSIFICATIONS.CONFLICT_NO_PICK,
    side: null,
    favorite: null,
    candidates: [
      market(MARKETS.OVER_1_5, 96),
      market(MARKETS.OVER_2_5, 88),
      market(MARKETS.BTTS_YES, 84)
    ]
  });
  result.classification.warnings = ["NO_CLEAR_SHARED_MARKET"];
  const arbitration = arbitrateAthenaV11({ result, venueResult: null, samples });

  assert.equal(arbitration.hardStop, true);
  assert.equal(arbitration.rule, "CONFLICT_HARD_STOP");
  assert.equal(arbitration.primary.market, MARKETS.NO_PICK);
  assert.equal(arbitration.primary.score, 0);
  assert.equal(arbitration.bestGoal.market, MARKETS.OVER_1_5);
  assert.equal(arbitration.bestGoal.score, 96);
  assert.ok(arbitration.primary.warnings.includes("ATHENA_V3_CONFLICT_HARD_STOP"));
});

test("Kopavogur vs Njardvik returns NO PICK while preserving Over 1.5 as observation only", () => {
  const input = {
    id: "kopavogur-njardvik",
    home: {
      name: "Kopavogur",
      matchesPlayed: 15,
      htft: { ww: 5, wd: 1, wl: 0, dw: 4, dd: 0, dl: 1, lw: 0, ld: 0, ll: 4 },
      goals: { over25: 11, under25: 4, averageTotalGoals: 4.1, goalsFor: 36, goalsAgainst: 26 },
      venue: { matchesPlayed: 15 }
    },
    away: {
      name: "Njardvik",
      matchesPlayed: 14,
      htft: { ww: 4, wd: 0, wl: 1, dw: 2, dd: 2, dl: 4, lw: 0, ld: 0, ll: 1 },
      goals: { over25: 6, under25: 8, averageTotalGoals: 2.8, goalsFor: 20, goalsAgainst: 19 },
      venue: { matchesPlayed: 14 }
    }
  };

  const rc1 = analyseFixture(input);
  const arbitration = arbitrateAthenaV11({
    result: rc1,
    venueResult: analyseFixture(input),
    samples: { homeVenue: 15, awayVenue: 14 }
  });

  assert.equal(rc1.classification.type, CLASSIFICATIONS.CONFLICT_NO_PICK);
  assert.equal(rc1.banker.market, MARKETS.NO_PICK);
  assert.equal(rc1.banker.score, 0);
  assert.equal(arbitration.primary.market, MARKETS.NO_PICK);
  assert.equal(arbitration.rule, "CONFLICT_HARD_STOP");
  assert.equal(arbitration.bestGoal.market, MARKETS.OVER_1_5);
  assert.equal(arbitration.bestGoal.score, 86);
});

test("a high-event directional conflict may still publish a qualified goal market", () => {
  const result = resultFixture({
    classification: CLASSIFICATIONS.HIGH_EVENT_EARLY_SEPARATION,
    side: null,
    favorite: null,
    candidates: [
      market(MARKETS.OVER_2_5, 91),
      market(MARKETS.OVER_1_5, 88)
    ]
  });
  result.classification.warnings = ["DIRECTIONAL_CONFLICT"];
  const arbitration = arbitrateAthenaV11({ result, venueResult: null, samples });

  assert.equal(arbitration.hardStop, false);
  assert.equal(arbitration.rule, "HIGH_EVENT_GOAL_FIRST");
  assert.equal(arbitration.primary.market, MARKETS.OVER_2_5);
});
