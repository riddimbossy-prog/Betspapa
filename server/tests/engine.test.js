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


test("default engine is named Papa's Pick", () => {
  const prediction = predictMatch(demoFixtures[0]);
  assert.equal(prediction.enginePicks.primary.engineName, "Papa's Pick");
});

test("every engine pick contains a match-specific explanation paragraph", () => {
  const prediction = predictMatch(demoFixtures[0]);
  for (const pick of Object.values(prediction.enginePicks)) {
    assert.ok(pick.explanationParagraph);
    assert.match(pick.explanationParagraph, /strongest exact transition/i);
    assert.ok(
      pick.explanationParagraph.includes(demoFixtures[0].home.name) ||
      pick.explanationParagraph.includes(demoFixtures[0].away.name)
    );
  }
});


test("explanations use simple rounded samples instead of floating counts", () => {
  const prediction = predictMatch(demoFixtures[0]);
  for (const pick of Object.values(prediction.enginePicks)) {
    assert.ok(pick.explanationEvidence);
    assert.ok(pick.explanationEvidence.strongestRoute);
    assert.doesNotMatch(pick.explanationParagraph, /\d+\.\d{4,}/);
    assert.doesNotMatch(pick.explanationParagraph, /unclear half-time state/i);
  }
});

test("explanation evidence gives a plain-English market decision", () => {
  const prediction = predictMatch(demoFixtures[1]);
  for (const pick of Object.values(prediction.enginePicks)) {
    assert.ok(pick.explanationEvidence.decision.length > 25);
    assert.ok(pick.explanationEvidence.homeSupport.text);
    assert.ok(pick.explanationEvidence.awaySupport.text);
  }
});


function commonSenseFixture({ homeTransitions, awayTransitions, homeGoals = {}, awayGoals = {}, odds = null }) {
  const profile = (matches, values) => ({ matches, ...values });
  const goal = (matches, values) => ({
    scoreRate: 0.75, concedeRate: 0.68, bttsRate: 0.62,
    over15Rate: 0.8, over25Rate: 0.58, under35Rate: 0.72,
    scored2PlusRate: 0.48, conceded2PlusRate: 0.48,
    failedToScoreRate: 0.25, cleanSheetRate: 0.25,
    firstHalfScoringRate: 0.58, secondHalfScoringRate: 0.68,
    ...values, matches
  });
  return {
    fixtureId:'common-sense-test',competition:'Test League',kickoff:'2026-07-20T12:00:00Z',odds,
    home:{name:'Home Test',htft:{overall:profile(20,homeTransitions),venue:profile(10,homeTransitions),recent:profile(6,homeTransitions)},goals:{overall:goal(20,homeGoals),venue:goal(10,homeGoals),recent:goal(6,homeGoals)}},
    away:{name:'Away Test',htft:{overall:profile(20,awayTransitions),venue:profile(10,awayTransitions),recent:profile(6,awayTransitions)},goals:{overall:goal(20,awayGoals),venue:goal(10,awayGoals),recent:goal(6,awayGoals)}},
    league:{goals:{bttsRate:0.54,under35Rate:0.72}}
  };
}

test('1/1 main story becomes home team to win either half',()=>{
  const input=commonSenseFixture({
    homeTransitions:{WW:12,WD:1,WL:0,DW:3,DD:1,DL:1,LW:1,LD:0,LL:1},
    awayTransitions:{WW:1,WD:0,WL:1,DW:1,DD:1,DL:3,LW:0,LD:1,LL:12}
  });
  const prediction=predictMatch(input);
  assert.equal(prediction.primaryPrediction.key,'home-win-either-half');
  assert.equal(prediction.primaryPrediction.marketPolicy.topTransition,'WW');
});

test('draw transition family becomes Draw in Either Half',()=>{
  const input=commonSenseFixture({
    homeTransitions:{WW:1,WD:4,WL:0,DW:4,DD:7,DL:1,LW:0,LD:2,LL:1},
    awayTransitions:{WW:1,WD:2,WL:0,DW:1,DD:7,DL:4,LW:0,LD:4,LL:1}
  });
  assert.equal(predictMatch(input).primaryPrediction.key,'draw-either-half');
});

test('comeback story becomes GG or Over 1.5',()=>{
  const input=commonSenseFixture({
    homeTransitions:{WW:1,WD:1,WL:9,DW:1,DD:1,DL:1,LW:4,LD:1,LL:1},
    awayTransitions:{WW:1,WD:1,WL:4,DW:1,DD:1,DL:1,LW:9,LD:1,LL:1},
    homeGoals:{scoreRate:0.82,concedeRate:0.78,bttsRate:0.72},
    awayGoals:{scoreRate:0.8,concedeRate:0.76,bttsRate:0.7}
  });
  assert.ok(['gg-yes','over-15'].includes(predictMatch(input).primaryPrediction.key));
});

test('actual team Over 0.5 odds below 1.20 are not kept',()=>{
  const input=commonSenseFixture({
    homeTransitions:{WW:7,WD:1,WL:0,DW:5,DD:2,DL:1,LW:1,LD:1,LL:2},
    awayTransitions:{WW:1,WD:1,WL:1,DW:2,DD:2,DL:5,LW:0,LD:1,LL:7},
    homeGoals:{scoreRate:0.94,scored2PlusRate:0.72},
    awayGoals:{concedeRate:0.9,conceded2PlusRate:0.7},
    odds:{homeOver05:1.15,homeOver15:1.62}
  });
  assert.notEqual(predictMatch(input).primaryPrediction.key,'home-over-05');
});

test('straight-win candidates require comeback and lead-surrender evidence',()=>{
  const input=commonSenseFixture({
    homeTransitions:{WW:10,WD:0,WL:0,DW:4,DD:2,DL:0,LW:0,LD:0,LL:4},
    awayTransitions:{WW:2,WD:0,WL:0,DW:2,DD:2,DL:4,LW:0,LD:0,LL:10}
  });
  const market=predictMatch(input).markets.find(m=>m.key==='home-win');
  assert.ok(market.blockers.some(reason=>/comeback ability|lead-surrender/i.test(reason)));
});

test('two early-leading teams create an unblocked First Half Over 1.5 candidate',()=>{
  const input=commonSenseFixture({
    homeTransitions:{WW:7,WD:4,WL:2,DW:1,DD:1,DL:1,LW:1,LD:1,LL:2},
    awayTransitions:{WW:7,WD:4,WL:2,DW:1,DD:1,DL:1,LW:1,LD:1,LL:2},
    homeGoals:{firstHalfScoringRate:0.72,concedeRate:0.72,conceded2PlusRate:0.55},
    awayGoals:{firstHalfScoringRate:0.7,concedeRate:0.7,conceded2PlusRate:0.54}
  });
  const candidate=predictMatch(input).markets.find(m=>m.key==='first-half-over-15');
  assert.ok(candidate);
  assert.equal(candidate.blockers.length,0);
});
