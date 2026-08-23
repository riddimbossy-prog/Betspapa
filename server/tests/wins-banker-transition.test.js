import test from "node:test";
import assert from "node:assert/strict";
import { selectWinsBanker } from "../src/engine/winsBankerEngine.js";

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

const base = {
  homeName: "Strong",
  awayName: "Weak",
  homeRank: 2,
  awayRank: 14,
  tableSize: 16,
  homePlayed: 12,
  awayPlayed: 12,
  homePpg: 2.4,
  awayPpg: 0.6,
  homeGpg: 2.5,
  awayGpg: 0.8,
  homeVenuePpg: 2.4,
  awayVenuePpg: 0.6,
  homeVenueGpg: 2.5,
  awayVenueGpg: 0.8,
  homeVenueGa: 0.6,
  awayVenueGa: 1.8,
  homeVenueForm: ["W", "W", "D", "W", "W"],
  awayVenueForm: ["L", "D", "L", "L", "D"],
  homeLastFive: ["W", "W", "D", "W", "W"],
  awayLastFive: ["L", "D", "L", "L", "D"],
  transitionSafety: { home: strong, away: weak },
  odds: {
    home: 1.32,
    away: 8.5,
    "over-15": 1.14,
    "home-over-15": 1.28,
    "away-over-05": 1.85
  }
};

test("Wins Banker requires the transition gate before a favourite win", () => {
  const pick = selectWinsBanker(base);
  assert.equal(pick.available, true);
  assert.equal(pick.key, "home-win");
  assert.equal(pick.transitionSafety.allowed, true);
});

test("Wins Banker fails closed when ordered transition evidence is missing", () => {
  const pick = selectWinsBanker({ ...base, transitionSafety: null });
  assert.equal(pick.available, false);
  assert.equal(pick.transitionSafety.reason, "transition-evidence-incomplete");
});

test("Wins Banker redirects when the favourite conceded in more than 80 percent", () => {
  const pick = selectWinsBanker({
    ...base,
    transitionSafety: {
      home: { ...strong, concededMatchRate: 100 },
      away: weak
    }
  });
  assert.equal(pick.available, false);
  assert.equal(pick.redirectGoals, true);
  assert.equal(pick.transitionSafety.reason, "stronger-team-leaks-over-80");
});

test("existing early-season hard red flag remains authoritative", () => {
  const pick = selectWinsBanker({
    ...base,
    redFlags: [{ code: "EARLY_SEASON", reason: "Early season matchup skipped" }]
  });
  assert.equal(pick.available, false);
  assert.match(pick.reasons[0], /early season/i);
});
