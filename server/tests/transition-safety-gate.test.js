import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateTransitionSafety,
  applyTransitionSafetyToMarkets
} from "../src/engine/transitionSafetyGate.js";

const strong = {
  ready: true,
  played: 5,
  covered: 5,
  concededMatchRate: 60,
  scoreFirstRate: 60,
  scoreFirstWinRate: 100,
  scoreFirstNonLossRate: 100,
  leadHoldRate: 100,
  concededFirst: 2,
  comebackWinRate: 50,
  comebackNonLossRate: 100
};
const weak = {
  ready: true,
  played: 5,
  covered: 5,
  concedeFirstRate: 60,
  stayDownRate: 66.7
};

function market(key, qualified = true) {
  return {
    key,
    market: key,
    selection: key,
    qualified,
    fallbackEligible: true,
    blockers: [],
    reasons: []
  };
}

test("win transition gate passes on strong score-first/lead/comeback and weak stay-down evidence", () => {
  const gate = evaluateTransitionSafety({ stronger: strong, weaker: weak, mode: "win" });
  assert.equal(gate.allowed, true);
  assert.equal(gate.redirectGoals, false);
});

test("exactly 80 percent conceded is not the greater-than-80 leak trigger", () => {
  const gate = evaluateTransitionSafety({
    stronger: { ...strong, concededMatchRate: 80 },
    weaker: weak,
    mode: "win"
  });
  assert.equal(gate.redirectGoals, false);
});

test("more than 80 percent conceded blocks result markets and leaves only qualified goal fallbacks selectable", () => {
  const transitionProfiles = {
    sampleBasis: "last-5-venue-split",
    home: { ...strong, concededMatchRate: 100 },
    away: weak
  };
  const result = applyTransitionSafetyToMarkets([
    market("home-win"),
    market("home-1x"),
    market("gg-yes"),
    market("over-25"),
    market("over-15"),
    market("under-35")
  ], transitionProfiles, { home: { name: "Strong" }, away: { name: "Weak" } });

  assert.equal(result.leakRedirect, true);
  assert.equal(result.markets.find((row) => row.key === "home-win").qualified, false);
  assert.equal(result.markets.find((row) => row.key === "home-1x").qualified, false);
  assert.equal(result.markets.find((row) => row.key === "under-35").qualified, false);
  assert.equal(result.markets.find((row) => row.key === "gg-yes").qualified, true);
  assert.equal(result.markets.find((row) => row.key === "over-25").qualified, true);
  assert.equal(result.markets.find((row) => row.key === "over-15").qualified, true);
});

test("leak redirect never upgrades a goal market that failed its own rules", () => {
  const transitionProfiles = {
    sampleBasis: "last-5-venue-split",
    home: { ...strong, concededMatchRate: 100 },
    away: weak
  };
  const result = applyTransitionSafetyToMarkets([
    market("home-win"),
    market("gg-yes", false),
    market("over-25", false),
    market("over-15", false)
  ], transitionProfiles, { home: { name: "Strong" }, away: { name: "Weak" } });

  assert.equal(result.leakRedirect, true);
  assert.equal(result.markets.filter((row) => row.qualified).length, 0);
});

test("missing ordered event coverage fails closed for a team-side market", () => {
  const result = applyTransitionSafetyToMarkets([
    market("home-win"),
    market("over-15")
  ], null, { home: { name: "Home" }, away: { name: "Away" } });

  assert.equal(result.markets.find((row) => row.key === "home-win").qualified, false);
  assert.equal(result.markets.find((row) => row.key === "over-15").qualified, true);
});

test("not-to-lose market uses protection and comeback-to-non-loss evidence", () => {
  const gate = evaluateTransitionSafety({
    stronger: {
      ...strong,
      scoreFirstRate: 40,
      scoreFirstNonLossRate: 100,
      comebackNonLossRate: 50
    },
    weaker: { ...weak, concedeFirstRate: 40, stayDownRate: 50 },
    mode: "not-lose"
  });
  assert.equal(gate.allowed, true);
});
