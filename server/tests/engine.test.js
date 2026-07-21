import test from "node:test";
import assert from "node:assert/strict";
import { demoFixtures } from "../src/data/demoFixtures.js";
import { predictMatch } from "../src/engine/transitionEngine.js";

test("engine generates a normalized nine-cell HT/FT matrix", () => {
  const prediction = predictMatch(demoFixtures[0]);
  const total = Object.values(prediction.transitionMatrix)
    .reduce((sum, row) => sum + row.probability, 0);
  assert.ok(Math.abs(total - 1) < 0.002);
  assert.equal(Object.keys(prediction.transitionMatrix).length, 9);
});

test("venue orientation maps the away W/W vs home L/L story to 2/2", () => {
  const prediction = predictMatch(demoFixtures[0]);
  const top = prediction.story.topTransitions[0];
  assert.equal(top.code, "2/2");
});

test("balanced volatile profiles produce goal intelligence without forcing an exact HT/FT pick", () => {
  const prediction = predictMatch(demoFixtures[1]);
  assert.ok(prediction.goalIntelligence.metrics.volatilitySpillover > 0.25);
  const exact = prediction.markets.find((market) => market.key === "exact-htft");
  assert.equal(exact.qualified, false);
});

test("small samples receive a data-quality downgrade", () => {
  const prediction = predictMatch(demoFixtures[2]);
  assert.ok(prediction.dataQuality.score < 0.7);
  assert.notEqual(prediction.dataQuality.label, "Excellent");
});

test("invalid input is rejected", () => {
  assert.throws(() => predictMatch({ home: {}, away: {} }), /required/);
});


test("every valid fixture receives one market direction", () => {
  for (const fixture of demoFixtures) {
    const prediction = predictMatch(fixture);
    assert.ok(prediction.primaryPrediction);
    assert.equal(prediction.noBet, false);
    assert.ok(["qualified", "directional"].includes(prediction.directionMode));
  }
});

test("decision trace reviews all nine HT/FT indicators", () => {
  const prediction = predictMatch(demoFixtures[0]);
  assert.equal(prediction.decisionTrace.allHtftIndicators.length, 9);
  assert.ok(prediction.decisionTrace.whyChosen.length >= 3);
});

test("PapaSense v1.6 evaluates every supported market family", () => {
  const prediction = predictMatch(demoFixtures[0]);
  const keys = new Set(prediction.markets.map((market) => market.key));
  const required = [
    "home-1x", "away-x2", "no-draw", "home-dnb", "away-dnb",
    "home-win", "away-win", "ft-draw",
    "home-win-either-half", "away-win-either-half",
    "gg-yes", "gg-no",
    "over-15", "under-15", "over-25", "under-25", "over-35", "under-35", "total-2-3",
    "home-over-05", "away-over-05", "home-over-15", "away-over-15",
    "home-under-15", "away-under-15", "home-clean-sheet", "away-clean-sheet",
    "first-half-over-05", "second-half-over-05"
  ];

  for (const key of required) assert.ok(keys.has(key), `Missing market ${key}`);
});

test("all market scores stay inside the probability range", () => {
  for (const fixture of demoFixtures) {
    const prediction = predictMatch(fixture);
    for (const market of prediction.markets) {
      assert.ok(market.modelScore >= 0 && market.modelScore <= 1, market.key);
      assert.ok(market.safetyAdjustedScore >= 0 && market.safetyAdjustedScore <= 1, market.key);
    }
  }
});

test("No Draw includes independent draw-structure checks", () => {
  const prediction = predictMatch(demoFixtures[0]);
  const noDraw = prediction.markets.find((market) => market.key === "no-draw");
  assert.ok(noDraw.evidence.homeWinMass >= 0);
  assert.ok(noDraw.evidence.awayWinMass >= 0);
  assert.ok(noDraw.evidence.drawMass >= 0);
  assert.ok(Number.isInteger(noDraw.evidence.meaningfulDecisiveRoutes));
  if (noDraw.qualified) {
    assert.ok(noDraw.evidence.drawMass <= 0.29);
    assert.ok(noDraw.evidence.meaningfulDecisiveRoutes >= 2);
  }
});

test("one-sided scoring can support Over 1.5 without forcing GG", () => {
  const fixture = structuredClone(demoFixtures[2]);
  fixture.home.name = "Dominant Home";
  fixture.away.name = "Weak Away";

  for (const scope of ["overall", "venue", "recent"]) {
    Object.assign(fixture.home.goals[scope], {
      scoreRate: 0.9,
      concedeRate: 0.25,
      bttsRate: 0.2,
      over15Rate: 0.85,
      over25Rate: 0.65,
      under35Rate: 0.75,
      scored2PlusRate: 0.7,
      conceded2PlusRate: 0.15,
      failedToScoreRate: 0.1,
      cleanSheetRate: 0.65,
      firstHalfScoringRate: 0.6,
      secondHalfScoringRate: 0.75
    });
    Object.assign(fixture.away.goals[scope], {
      scoreRate: 0.25,
      concedeRate: 0.9,
      bttsRate: 0.2,
      over15Rate: 0.75,
      over25Rate: 0.55,
      under35Rate: 0.72,
      scored2PlusRate: 0.1,
      conceded2PlusRate: 0.7,
      failedToScoreRate: 0.75,
      cleanSheetRate: 0.1,
      firstHalfScoringRate: 0.2,
      secondHalfScoringRate: 0.25
    });
  }

  const prediction = predictMatch(fixture);
  const gg = prediction.markets.find((market) => market.key === "gg-yes");
  const over15 = prediction.markets.find((market) => market.key === "over-15");
  const homeOver15 = prediction.markets.find((market) => market.key === "home-over-15");

  assert.equal(gg.qualified, false);
  assert.ok(gg.blockers.length >= 2);
  assert.ok(over15.safetyAdjustedScore > gg.safetyAdjustedScore);
  assert.equal(homeOver15.qualified, true);
});

test("decision trace compares the best market from every family", () => {
  const prediction = predictMatch(demoFixtures[1]);
  const families = new Set(prediction.decisionTrace.marketComparison.map((row) => row.family));
  for (const family of ["Result Safety", "Match Result", "Goal Participation", "Total Goals", "Team Goals"]) {
    assert.ok(families.has(family), `Missing family ${family}`);
  }
});
