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


test("valid fixtures receive either a qualified selection or an explicit NO PICK", () => {
  for (const fixture of demoFixtures) {
    const prediction = predictMatch(fixture);
    assert.ok(prediction.primaryPrediction);
    assert.ok(["qualified", "directional", "no-pick"].includes(prediction.directionMode));
    assert.equal(prediction.noBet, prediction.primaryPrediction.key === "no-pick");
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


test("PapaSense v2 returns the four core engines plus Split Form", () => {
  const prediction = predictMatch(demoFixtures[0]);
  assert.deepEqual(Object.keys(prediction.enginePicks).sort(), [
    "aggressive",
    "form",
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

test("Venue Pattern publishes only when the independent venue route passes", () => {
  const prediction = predictMatch(demoFixtures[0]);
  assert.equal(prediction.venuePattern.indicators.length, 9);
  assert.equal(prediction.enginePicks.venue.available, true);
  assert.ok(prediction.enginePicks.venue.venueRoute);
  assert.equal(prediction.enginePicks.venue.marketPolicy.venueIndependent, true);
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

test("every engine pick contains a market-specific explanation paragraph", () => {
  const prediction = predictMatch(demoFixtures[0]);
  for (const pick of Object.values(prediction.enginePicks)) {
    if (pick.engineKey === "form") continue;
    assert.ok(pick.explanationParagraph);
    assert.ok(pick.explanationParagraph.includes(pick.selection));
    assert.ok(pick.explanationEvidence.selectionBasis);
  }
});




test("Safer refuses to invent a cushion when no true containment market passes", () => {
  const prediction = predictMatch(demoFixtures[1]);
  const safer = prediction.enginePicks.safer;
  assert.equal(safer.available, false);
  assert.equal(safer.key, "no-pick");
  assert.equal(safer.marketPolicy.noPick, true);
  assert.match(safer.explanationParagraph, /NO PICK/i);
});

test("repeated fallback engines are not independent banker votes", () => {
  const prediction = predictMatch(demoFixtures[0]);
  const repeated = Object.values(prediction.enginePicks).filter(
    (pick) => pick.selection === prediction.enginePicks.primary.selection && pick.engineKey !== "primary"
  );
  for (const pick of repeated) {
    if (pick.marketPolicy?.purpose === "independent-venue") {
      assert.equal(pick.consensusEligible, true);
    } else {
      assert.equal(pick.consensusEligible, false);
    }
  }
});

test("explanations use simple rounded samples instead of floating counts", () => {
  const prediction = predictMatch(demoFixtures[0]);
  for (const pick of Object.values(prediction.enginePicks)) {
    if (pick.engineKey === "form") continue;
    assert.ok(pick.explanationEvidence);
    assert.ok(pick.explanationEvidence.strongestRoute);
    assert.doesNotMatch(pick.explanationParagraph, /\d+\.\d{4,}/);
    assert.doesNotMatch(pick.explanationParagraph, /unclear half-time state/i);
  }
});

test("explanation evidence gives a plain-English market decision", () => {
  const prediction = predictMatch(demoFixtures[1]);
  for (const pick of Object.values(prediction.enginePicks)) {
    if (pick.engineKey === "form") continue;
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
  assert.equal(prediction.primaryPrediction.marketPolicy.topTransition,'1/1');
});

test('draw-lock family chooses a compatible draw market',()=>{
  const input=commonSenseFixture({
    homeTransitions:{WW:1,WD:4,WL:0,DW:4,DD:7,DL:1,LW:0,LD:2,LL:1},
    awayTransitions:{WW:1,WD:2,WL:0,DW:1,DD:7,DL:4,LW:0,LD:4,LL:1}
  });
  assert.ok(['draw-either-half','ht-draw','under-35'].includes(predictMatch(input).primaryPrediction.key));
});

test('comeback story follows a reversal-compatible goal road',()=>{
  const input=commonSenseFixture({
    homeTransitions:{WW:1,WD:1,WL:9,DW:1,DD:1,DL:1,LW:4,LD:1,LL:1},
    awayTransitions:{WW:1,WD:1,WL:4,DW:1,DD:1,DL:1,LW:9,LD:1,LL:1},
    homeGoals:{scoreRate:0.82,concedeRate:0.78,bttsRate:0.72},
    awayGoals:{scoreRate:0.8,concedeRate:0.76,bttsRate:0.7}
  });
  const prediction = predictMatch(input);
  assert.match(prediction.papaSenseResolution.classification, /REVERSAL|INSTABILITY/);
  assert.ok(['gg-yes','over-15','home-over-05','away-over-05','second-half-over-05'].includes(prediction.primaryPrediction.key));
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
