import test from "node:test";
import assert from "node:assert/strict";

import { demoFixtures } from "../src/data/demoFixtures.js";
import { predictMatch } from "../src/engine/transitionEngine.js";

test("v1.17.1 uses the full-market overhaul as the authoritative core", () => {
  const prediction = predictMatch(demoFixtures[0]);
  assert.equal(prediction.engineArchitecture.version, "1.17.1");
  assert.match(prediction.engineArchitecture.authoritativeCore, /full-market overhaul/i);
  assert.equal(
    prediction.enginePicks.primary.selection,
    prediction.primaryPrediction.selection
  );
});

test("overhaul exposes the expanded independent goal-market scores", () => {
  const prediction = predictMatch(demoFixtures[0]);
  const scores = prediction.goalIntelligence.scores;

  for (const key of [
    "ggYes",
    "ggNo",
    "over15",
    "under15",
    "over25",
    "under25",
    "over35",
    "under35",
    "twoToThreeGoals",
    "homeUnder15",
    "awayUnder15",
    "homeCleanSheet",
    "awayCleanSheet",
    "firstHalfOver05",
    "secondHalfOver05"
  ]) {
    assert.ok(Number.isFinite(scores[key]), `missing score: ${key}`);
  }
});

test("overhaul market catalogue includes result, goal, team and half markets", () => {
  const prediction = predictMatch(demoFixtures[1]);
  const markets = new Set(prediction.markets.map((row) => row.market));

  for (const market of [
    "Double Chance",
    "Draw No Bet",
    "Full-Time Result",
    "Both Teams to Score",
    "Total Goals",
    "Total Goals Range",
    "Team Goals",
    "Clean Sheet",
    "First-Half Goals",
    "Second-Half Goals",
    "HT/FT"
  ]) {
    assert.ok(markets.has(market), `missing market family: ${market}`);
  }
});

test("duplicate markets retain later common-sense blockers", () => {
  const profile = (matches, values) => ({ matches, ...values });
  const goals = (matches) => ({
    matches,
    scoreRate: 0.75,
    concedeRate: 0.68,
    bttsRate: 0.62,
    over15Rate: 0.8,
    over25Rate: 0.58,
    under35Rate: 0.72,
    scored2PlusRate: 0.48,
    conceded2PlusRate: 0.48,
    failedToScoreRate: 0.25,
    cleanSheetRate: 0.25,
    firstHalfScoringRate: 0.58,
    secondHalfScoringRate: 0.68
  });

  const input = {
    fixtureId: "overhaul-blocker-test",
    home: {
      name: "Home Test",
      htft: {
        overall: profile(20, { WW: 10, WD: 0, WL: 0, DW: 4, DD: 2, DL: 0, LW: 0, LD: 0, LL: 4 }),
        venue: profile(10, { WW: 5, WD: 0, WL: 0, DW: 2, DD: 1, DL: 0, LW: 0, LD: 0, LL: 2 }),
        recent: profile(6, { WW: 3, WD: 0, WL: 0, DW: 1, DD: 1, DL: 0, LW: 0, LD: 0, LL: 1 })
      },
      goals: { overall: goals(20), venue: goals(10), recent: goals(6) }
    },
    away: {
      name: "Away Test",
      htft: {
        overall: profile(20, { WW: 2, WD: 0, WL: 0, DW: 2, DD: 2, DL: 4, LW: 0, LD: 0, LL: 10 }),
        venue: profile(10, { WW: 1, WD: 0, WL: 0, DW: 1, DD: 1, DL: 2, LW: 0, LD: 0, LL: 5 }),
        recent: profile(6, { WW: 1, WD: 0, WL: 0, DW: 1, DD: 1, DL: 1, LW: 0, LD: 0, LL: 3 })
      },
      goals: { overall: goals(20), venue: goals(10), recent: goals(6) }
    },
    league: { goals: { bttsRate: 0.5, under35Rate: 0.72 } }
  };

  const prediction = predictMatch(input);
  const homeWin = prediction.markets.find((market) => market.key === "home-win");
  assert.ok(homeWin);
  assert.ok(
    homeWin.blockers.some((reason) => /comeback ability|lead-surrender/i.test(reason))
  );
});
