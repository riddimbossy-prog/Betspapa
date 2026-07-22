import test from "node:test";
import assert from "node:assert/strict";

import { predictMatch } from "../src/engine/transitionEngine.js";

function fixture({ homeTransitions, awayTransitions, homeGoals = {}, awayGoals = {}, odds = null }) {
  const profile = (matches, values) => ({ matches, ...values });
  const goal = (matches, values = {}) => ({
    matches,
    scoreRate: 0.72,
    concedeRate: 0.66,
    bttsRate: 0.58,
    over15Rate: 0.76,
    over25Rate: 0.54,
    under35Rate: 0.74,
    scored2PlusRate: 0.44,
    conceded2PlusRate: 0.44,
    failedToScoreRate: 0.27,
    cleanSheetRate: 0.27,
    firstHalfScoringRate: 0.53,
    secondHalfScoringRate: 0.62,
    ...values
  });

  return {
    fixtureId: "htft-first-test",
    competition: "Test League",
    kickoff: "2026-07-23T12:00:00Z",
    odds,
    home: {
      name: "Home Test",
      htft: {
        overall: profile(20, homeTransitions),
        venue: profile(10, homeTransitions),
        recent: profile(6, homeTransitions)
      },
      goals: {
        overall: goal(20, homeGoals),
        venue: goal(10, homeGoals),
        recent: goal(6, homeGoals)
      }
    },
    away: {
      name: "Away Test",
      htft: {
        overall: profile(20, awayTransitions),
        venue: profile(10, awayTransitions),
        recent: profile(6, awayTransitions)
      },
      goals: {
        overall: goal(20, awayGoals),
        venue: goal(10, awayGoals),
        recent: goal(6, awayGoals)
      }
    },
    league: { goals: { bttsRate: 0.52, under35Rate: 0.73 } }
  };
}

test("every selectable market has a registered HT/FT firing gate", () => {
  const prediction = predictMatch(fixture({
    homeTransitions: { WW: 5, WD: 3, WL: 2, DW: 3, DD: 2, DL: 1, LW: 1, LD: 1, LL: 2 },
    awayTransitions: { WW: 2, WD: 1, WL: 1, DW: 1, DD: 2, DL: 3, LW: 2, LD: 3, LL: 5 }
  }));

  for (const market of prediction.markets) {
    assert.ok(market.htftGate, `missing gate for ${market.key}`);
    assert.equal(typeof market.htftGate.rule, "string");
    if (market.qualified) assert.equal(market.htftGate.eligible, true);
  }
});

test("X/X cannot create Over 1.5 without a separate two-goal HT/FT route", () => {
  const prediction = predictMatch(fixture({
    homeTransitions: { WW: 1, WD: 0, WL: 0, DW: 1, DD: 17, DL: 0, LW: 0, LD: 0, LL: 1 },
    awayTransitions: { WW: 1, WD: 0, WL: 0, DW: 0, DD: 17, DL: 1, LW: 0, LD: 0, LL: 1 },
    homeGoals: { over15Rate: 0.9, scoreRate: 0.8, concedeRate: 0.72 },
    awayGoals: { over15Rate: 0.9, scoreRate: 0.8, concedeRate: 0.72 }
  }));

  const over15 = prediction.markets.find((market) => market.key === "over-15");
  assert.ok(over15);
  assert.equal(over15.htftGate.eligible, false);
  assert.equal(over15.qualified, false);
  assert.match(over15.blockers.join(" "), /X\/X|two-goal HT\/FT/i);
});

test("1/2 or 2/1 reversal routes open GG and Over 2.5 gates", () => {
  const prediction = predictMatch(fixture({
    homeTransitions: { WW: 1, WD: 1, WL: 12, DW: 1, DD: 1, DL: 1, LW: 2, LD: 0, LL: 2 },
    awayTransitions: { WW: 2, WD: 0, WL: 2, DW: 1, DD: 1, DL: 1, LW: 12, LD: 1, LL: 1 },
    homeGoals: { scoreRate: 0.84, concedeRate: 0.79, bttsRate: 0.76, scored2PlusRate: 0.58 },
    awayGoals: { scoreRate: 0.83, concedeRate: 0.78, bttsRate: 0.75, scored2PlusRate: 0.57 }
  }));

  assert.equal(prediction.markets.find((market) => market.key === "gg-yes")?.htftGate.eligible, true);
  assert.equal(prediction.markets.find((market) => market.key === "over-25")?.htftGate.eligible, true);
});

test("full-time draw after a first-half lead does not falsely count as Draw in Either Half", () => {
  const prediction = predictMatch(fixture({
    homeTransitions: { WW: 1, WD: 15, WL: 1, DW: 0, DD: 1, DL: 0, LW: 0, LD: 1, LL: 1 },
    awayTransitions: { WW: 1, WD: 1, WL: 0, DW: 0, DD: 1, DL: 0, LW: 1, LD: 15, LL: 1 }
  }));

  const drawEitherHalf = prediction.markets.find((market) => market.key === "draw-either-half");
  assert.ok(drawEitherHalf);
  assert.equal(drawEitherHalf.htftGate.eligible, false);
});

test("team Over 0.5 odds do not trigger an override unless price is below 1.20", () => {
  const prediction = predictMatch(fixture({
    homeTransitions: { WW: 7, WD: 2, WL: 1, DW: 4, DD: 2, DL: 1, LW: 1, LD: 0, LL: 2 },
    awayTransitions: { WW: 2, WD: 0, WL: 1, DW: 1, DD: 2, DL: 4, LW: 1, LD: 2, LL: 7 },
    odds: { homeOver05: 1.25, homeOver15: 1.7 }
  }));

  assert.equal(prediction.decisionTrace.oddsPolicy.applied, false);
});
