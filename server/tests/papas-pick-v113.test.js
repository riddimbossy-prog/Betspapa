import test from "node:test";
import assert from "node:assert/strict";
import { demoFixtures } from "../src/data/demoFixtures.js";
import { predictMatch } from "../src/engine/transitionEngine.js";

const OPPOSITE = {
  WW: "LL", WD: "LD", WL: "LW",
  DW: "DL", DD: "DD", DL: "DW",
  LW: "WL", LD: "WD", LL: "WW"
};

function profile(counts, matches = 100) {
  return { matches, ...counts };
}

function goalBlock(values, matches = 100) {
  return { matches, ...values };
}

function orientedAwayCounts(homeOrientedCounts) {
  return Object.fromEntries(
    Object.keys(homeOrientedCounts).map((key) => [key, homeOrientedCounts[OPPOSITE[key]]])
  );
}

function makePolicyFixture({
  id = "policy-fixture",
  transitionCounts = { WW: 16, WD: 9, WL: 9, DW: 16, DD: 9, DL: 9, LW: 14, LD: 9, LL: 9 },
  homeGoalOverrides = {},
  awayGoalOverrides = {},
  odds = { home: { over05: 1.1, over15: 1.65 }, away: { over05: 1.55, over15: 2.6 } }
} = {}) {
  const awayCounts = orientedAwayCounts(transitionCounts);
  const homeGoals = {
    scoreRate: 0.92,
    concedeRate: 0.34,
    bttsRate: 0.28,
    over15Rate: 0.58,
    over25Rate: 0.34,
    under35Rate: 0.48,
    scored2PlusRate: 0.62,
    conceded2PlusRate: 0.25,
    failedToScoreRate: 0.08,
    cleanSheetRate: 0.58,
    firstHalfScoringRate: 0.24,
    secondHalfScoringRate: 0.28,
    ...homeGoalOverrides
  };
  const awayGoals = {
    scoreRate: 0.34,
    concedeRate: 0.9,
    bttsRate: 0.28,
    over15Rate: 0.58,
    over25Rate: 0.34,
    under35Rate: 0.48,
    scored2PlusRate: 0.24,
    conceded2PlusRate: 0.65,
    failedToScoreRate: 0.66,
    cleanSheetRate: 0.08,
    firstHalfScoringRate: 0.18,
    secondHalfScoringRate: 0.22,
    ...awayGoalOverrides
  };

  return {
    fixtureId: id,
    competition: "PapaSense policy test",
    home: {
      name: "Home Alpha",
      htft: {
        overall: profile(transitionCounts),
        venue: profile(transitionCounts),
        recent: profile(transitionCounts)
      },
      goals: {
        overall: goalBlock(homeGoals),
        venue: goalBlock(homeGoals),
        recent: goalBlock(homeGoals)
      }
    },
    away: {
      name: "Away Beta",
      htft: {
        overall: profile(awayCounts),
        venue: profile(awayCounts),
        recent: profile(awayCounts)
      },
      goals: {
        overall: goalBlock(awayGoals),
        venue: goalBlock(awayGoals),
        recent: goalBlock(awayGoals)
      }
    },
    league: { goals: { bttsRate: 0.35, under35Rate: 0.5 } },
    odds: { source: "test", status: "available", teamGoals: odds }
  };
}

test("PapaSense v1.13 converts 1/1 and 2/2 into Win Either Half", () => {
  const awayControl = predictMatch(demoFixtures[0]);
  const homeControl = predictMatch(demoFixtures[1]);

  assert.equal(awayControl.papaPolicy.topHtftRoute.code, "2/2");
  assert.equal(awayControl.primaryPrediction.key, "away-win-either-half");
  assert.equal(homeControl.papaPolicy.topHtftRoute.code, "1/1");
  assert.equal(homeControl.primaryPrediction.key, "home-win-either-half");
});

test("PapaSense v1.13 converts an X-led route into Draw in Either Half", () => {
  const prediction = predictMatch(makePolicyFixture({
    id: "draw-either-half",
    transitionCounts: { WW: 9, WD: 8, WL: 7, DW: 10, DD: 30, DL: 10, LW: 7, LD: 8, LL: 11 }
  }));

  assert.equal(prediction.papaPolicy.topHtftRoute.code, "X/X");
  assert.equal(prediction.primaryPrediction.key, "draw-either-half");
  assert.match(prediction.papaPolicy.actions.join(" "), /Draw in Either Half/i);
});

test("low-value Team Over 0.5 upgrades only to the same team's qualified Over 1.5", () => {
  const prediction = predictMatch(makePolicyFixture());
  const lowLine = prediction.markets.find((market) => market.key === "home-over-05");
  const highLine = prediction.markets.find((market) => market.key === "home-over-15");

  assert.equal(lowLine.thresholdPassed, true);
  assert.equal(lowLine.qualified, false);
  assert.equal(lowLine.policy.lowValueRejected, true);
  assert.equal(highLine.qualified, true);
  assert.equal(highLine.odds, 1.65);
  assert.equal(prediction.primaryPrediction.key, "home-over-15");
  assert.match(prediction.papaPolicy.actions.join(" "), /same team's Over 1.5 passed every statistical and value gate/i);
});

test("low-value Team Over 0.5 is removed when the same-team Over 1.5 fails", () => {
  const prediction = predictMatch(makePolicyFixture({
    id: "no-forced-upgrade",
    homeGoalOverrides: { scored2PlusRate: 0.3 },
    awayGoalOverrides: { conceded2PlusRate: 0.3 }
  }));
  const highLine = prediction.markets.find((market) => market.key === "home-over-15");

  assert.equal(highLine.qualified, false);
  assert.notEqual(prediction.primaryPrediction.key, "home-over-05");
  assert.notEqual(prediction.primaryPrediction.key, "home-over-15");
  assert.match(prediction.papaPolicy.actions.join(" "), /no forced upgrade was made/i);
});

test("straight-win markets enforce six overall and six relevant split wins", () => {
  const input = structuredClone(demoFixtures[0]);
  const prediction = predictMatch(input);
  const awayWin = prediction.markets.find((market) => market.key === "away-win");
  const gate = awayWin.policy.resultSampleGate;

  assert.ok(gate.overallWins >= 6);
  assert.ok(gate.venueWins >= 6);
  assert.equal(gate.bothPass, true);
  assert.ok(awayWin.policy.straightWinBehaviour);
});

test("all amended Papa's Pick markets are present", () => {
  const prediction = predictMatch(demoFixtures[0]);
  const keys = new Set(prediction.markets.map((market) => market.key));

  for (const key of [
    "first-half-over-05",
    "first-half-over-15",
    "second-half-over-05",
    "home-over-15",
    "away-over-15",
    "home-win-either-half",
    "away-win-either-half",
    "draw-either-half"
  ]) {
    assert.ok(keys.has(key), `missing amended market ${key}`);
  }
});
