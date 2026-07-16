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


test("market ranking uses threshold-relative comparison", () => {
  const prediction = predictMatch(demoFixtures[0]);
  assert.ok(Number.isFinite(prediction.primaryPrediction.comparisonScore));
  assert.ok(prediction.decisionTrace.selectionMethod.includes("threshold"));
  assert.ok(prediction.decisionTrace.marketComparison.length >= 8);
});

test("reason trace explains why the selected market beat Double Chance", () => {
  const prediction = predictMatch(demoFixtures[1]);
  assert.ok(
    prediction.decisionTrace.whyChosen.some(
      (reason) => reason.includes("Double Chance") || reason.includes("protection")
    )
  );
});


test("PapaSense v1.7 returns all four engine picks", () => {
  const prediction = predictMatch(demoFixtures[0]);
  assert.deepEqual(Object.keys(prediction.enginePicks).sort(), [
    "aggressive",
    "primary",
    "safer",
    "venue"
  ]);
  for (const pick of Object.values(prediction.enginePicks)) {
    assert.ok(pick.market);
    assert.ok(pick.selection);
    assert.ok(Number.isFinite(pick.confidence));
  }
  assert.equal(prediction.defaultEngine, "primary");
  assert.equal(
    prediction.enginePicks.primary.selection,
    prediction.primaryPrediction.selection
  );
});

test("Venue Pattern includes Potosi-style opposite transition evidence", () => {
  const prediction = predictMatch(demoFixtures[1]);
  assert.equal(prediction.venuePattern.indicators.length, 9);
  assert.ok(prediction.enginePicks.venue.reasons.length >= 3);
  assert.ok(prediction.enginePicks.venue.venueRoute);
});

test("Aggressive and safer engines use distinct selection policies", () => {
  const prediction = predictMatch(demoFixtures[2]);
  assert.notEqual(prediction.enginePicks.aggressive.engineKey, prediction.enginePicks.safer.engineKey);
  assert.match(prediction.enginePicks.aggressive.description, /specific/i);
  assert.match(prediction.enginePicks.safer.description, /lower-risk/i);
});


test("PapaSense blocks prior-only zombie predictions", () => {
  assert.throws(
    () => predictMatch({
      fixtureId: "zombie-test",
      home: { name: "Empty Home", htft: {}, goals: {} },
      away: { name: "Empty Away", htft: {}, goals: {} },
      league: {}
    }),
    /refuses to publish a prior-only prediction/i
  );
});

test("Safer engine does not automatically force Double Chance", () => {
  const markets = demoFixtures.map(
    (fixture) => predictMatch(fixture).enginePicks.safer.market
  );
  assert.ok(markets.some((market) => market !== "Double Chance"));
});

test("Prediction output carries an analysis fingerprint when supplied", () => {
  const input = structuredClone(demoFixtures[0]);
  input.profileAudit = {
    home: { teamName: input.home.name, evidence: { overall: 10, venue: 5, recent: 6 } },
    away: { teamName: input.away.name, evidence: { overall: 10, venue: 5, recent: 6 } }
  };
  input.analysisFingerprint = "abc12345";
  const prediction = predictMatch(input);
  assert.equal(prediction.analysisFingerprint, "abc12345");
  assert.ok(prediction.profileAudit);
});
