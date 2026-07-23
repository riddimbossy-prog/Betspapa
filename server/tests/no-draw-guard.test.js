import test from "node:test";
import assert from "node:assert/strict";

import { predictMatch } from "../src/engine/transitionEngine.js";

function buildFixture({
  homeTransitions,
  awayTransitions,
  homeGoals = {},
  awayGoals = {},
  leagueGoals = {}
}) {
  const profile = (matches, values) => ({ matches, ...values });
  const goal = (matches, values = {}) => ({
    matches,
    scoreRate: 0.82,
    concedeRate: 0.79,
    bttsRate: 0.72,
    over15Rate: 0.86,
    over25Rate: 0.66,
    under35Rate: 0.64,
    scored2PlusRate: 0.52,
    conceded2PlusRate: 0.52,
    failedToScoreRate: 0.18,
    cleanSheetRate: 0.18,
    firstHalfScoringRate: 0.58,
    secondHalfScoringRate: 0.72,
    ...values
  });

  return {
    fixtureId: "no-draw-guard",
    competition: "Test League",
    kickoff: "2026-07-25T12:00:00Z",
    home: {
      name: "Home Test",
      htft: {
        overall: profile(30, homeTransitions),
        venue: profile(15, homeTransitions),
        recent: profile(6, homeTransitions)
      },
      goals: {
        overall: goal(30, homeGoals),
        venue: goal(15, homeGoals),
        recent: goal(6, homeGoals)
      }
    },
    away: {
      name: "Away Test",
      htft: {
        overall: profile(30, awayTransitions),
        venue: profile(15, awayTransitions),
        recent: profile(6, awayTransitions)
      },
      goals: {
        overall: goal(30, awayGoals),
        venue: goal(15, awayGoals),
        recent: goal(6, awayGoals)
      }
    },
    league: {
      goals: {
        bttsRate: 0.68,
        over15Rate: 0.84,
        under35Rate: 0.66,
        ...leagueGoals
      }
    }
  };
}

const openHome = { WW: 6, WD: 3, WL: 10, DW: 8, DD: 6, DL: 5, LW: 8, LD: 4, LL: 9 };
const openAway = { WW: 4, WD: 2, WL: 7, DW: 6, DD: 3, DL: 10, LW: 7, LD: 2, LL: 7 };

const cleanHome = { WW: 10, WD: 1, WL: 1, DW: 6, DD: 1, DL: 5, LW: 1, LD: 1, LL: 4 };
const cleanAway = { WW: 4, WD: 1, WL: 1, DW: 5, DD: 1, DL: 6, LW: 1, LD: 1, LL: 10 };

const controlledGoals = {
  scoreRate: 0.68,
  concedeRate: 0.62,
  bttsRate: 0.44,
  over15Rate: 0.68,
  over25Rate: 0.38,
  under35Rate: 0.82,
  scored2PlusRate: 0.34,
  conceded2PlusRate: 0.32,
  failedToScoreRate: 0.32,
  cleanSheetRate: 0.34,
  firstHalfScoringRate: 0.44,
  secondHalfScoringRate: 0.55
};

test("high-scoring open HT/FT structure diverts 12 to a goal market", () => {
  const prediction = predictMatch(buildFixture({
    homeTransitions: openHome,
    awayTransitions: openAway
  }));

  const noDraw = prediction.markets.find((market) => market.key === "no-draw");
  const over15 = prediction.markets.find((market) => market.key === "over-15");

  assert.ok(noDraw);
  assert.equal(noDraw.qualified, false);
  assert.equal(noDraw.htftGate.eligible, false);
  assert.equal(noDraw.evidence.divertedToGoals, true);
  assert.match(noDraw.blockers.join(" "), /high-scoring|GG|Over 1\.5/i);
  assert.equal(over15?.qualified, true);
  assert.notEqual(prediction.enginePicks.venue.key, "no-draw");
});

test("clean decisive result structure can still qualify Either Team to Win", () => {
  const prediction = predictMatch(buildFixture({
    homeTransitions: cleanHome,
    awayTransitions: cleanAway,
    homeGoals: controlledGoals,
    awayGoals: controlledGoals,
    leagueGoals: { bttsRate: 0.44, over15Rate: 0.68, under35Rate: 0.82 }
  }));

  const noDraw = prediction.markets.find((market) => market.key === "no-draw");
  assert.ok(noDraw);
  assert.equal(noDraw.htftGate.eligible, true);
  assert.equal(noDraw.qualified, true);
  assert.equal(noDraw.evidence.divertedToGoals, false);
  assert.ok(noDraw.evidence.cleanDecisiveMass > 0.6);
});

test("a high-scoring league label alone cannot open GG or O1.5 without HT/FT goal routes", () => {
  const prediction = predictMatch(buildFixture({
    homeTransitions: cleanHome,
    awayTransitions: cleanAway,
    homeGoals: controlledGoals,
    awayGoals: controlledGoals,
    leagueGoals: { bttsRate: 0.7, over15Rate: 0.88, under35Rate: 0.68 }
  }));

  const noDraw = prediction.markets.find((market) => market.key === "no-draw");
  const gg = prediction.markets.find((market) => market.key === "gg-yes");
  const over15 = prediction.markets.find((market) => market.key === "over-15");

  assert.equal(noDraw.evidence.goalMarketDiversion, false);
  assert.equal(gg.htftGate.eligible, false);
  assert.equal(over15.htftGate.eligible, false);
});

test("No Draw explanation exposes clean decisive and goal-diversion diagnostics", () => {
  const prediction = predictMatch(buildFixture({
    homeTransitions: openHome,
    awayTransitions: openAway
  }));
  const noDraw = prediction.markets.find((market) => market.key === "no-draw");

  assert.ok(noDraw.evidence.noDrawPolicy);
  assert.equal(typeof noDraw.evidence.noDrawPolicy.cleanDecisiveMass, "number");
  assert.equal(typeof noDraw.evidence.noDrawPolicy.leagueOver15Rate, "number");
  assert.equal(noDraw.evidence.noDrawPolicy.preferredGoalMarket, "over-15");
});
