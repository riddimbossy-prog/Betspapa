#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const engine = require("./omni_htft_engine_v2_5_2");
const forensic = require("./loss_forensics_v2_5_2");
const example = require("./example_input.json");

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("engine identifies itself as v2.5.2", () => {
  assert.strictEqual(engine.ENGINE_VERSION, "2.5.2");
  assert.match(engine.ENGINE_NAME, /v2\.5\.2/);
});

test("date parser orders ISO and DD/MM/YYYY consistently", () => {
  assert.strictEqual(
    engine.parseDateToTimestamp("20/07/2026"),
    engine.parseDateToTimestamp("2026-07-20")
  );
  assert(
    engine.parseDateToTimestamp("2026-07-20T18:00:00Z") >
    engine.parseDateToTimestamp("2026-07-20T12:00:00Z")
  );
  assert.throws(() => engine.parseDateToTimestamp("31/02/2026"), /valid calendar date/);
});

test("empty histories return controlled NO_BET rather than throwing", () => {
  const result = engine.runEngine({
    match: { homeTeam: "A", awayTeam: "B" },
    homeMatches: [], awayMatches: [], leagueMatches: [], strict: false
  });
  assert.strictEqual(result.decision, "NO_BET");
  assert(result.failures.some(f => f.includes("fewer than 8")));
});

test("complete example runs all 44 active markets", () => {
  const result = engine.runEngine(example);
  assert.strictEqual(result.decision, "BET");
  assert.strictEqual(result.allMarkets.length, 44);
  const ids = result.allMarkets.map(m => m.marketId);
  assert(!ids.includes("HOME_SCORE_FIRST"));
  assert(!ids.includes("AWAY_SCORE_FIRST"));
  assert(!ids.includes("SECOND_HALF_OVER_1_5"));
});



test("match total Over 0.5 is removed while other 0.5 markets remain", () => {
  const result = engine.runEngine(example);
  const ids = new Set(result.allMarkets.map(m => m.marketId));
  assert(!ids.has("MATCH_OVER_0_5"));
  assert(ids.has("HOME_OVER_0_5"));
  assert(ids.has("AWAY_OVER_0_5"));
  assert(ids.has("FIRST_HALF_OVER_0_5"));
  assert(ids.has("SECOND_HALF_OVER_0_5"));
  assert(!engine.CORE_MARKETS.has("MATCH_OVER_0_5"));
});

test("only the six core markets are eligible for final selection", () => {
  const result = engine.runEngine(example);
  const eligible = result.allMarkets.filter(m => m.selectionEligible).map(m => m.marketId);
  assert.strictEqual(eligible.length, 6);
  assert.deepStrictEqual(new Set(eligible), engine.CORE_MARKETS);
  assert(engine.CORE_MARKETS.has(result.selected.marketId));
  const acceptedTail = result.allMarkets.find(m => m.accepted && !m.selectionEligible);
  assert(acceptedTail, "Example should contain at least one accepted non-core market for this audit test.");
});

test("NO_BET explains when only a non-core market qualifies", () => {
  const decision = engine.selectFinalMarket([
    { marketId: "HOME_WIN", accepted: true, score: 91 },
    { marketId: "SECOND_HALF_OVER_0_5", accepted: false, score: 79 },
    { marketId: "FIRST_HALF_OVER_0_5", accepted: false, score: 72 }
  ]);
  assert.strictEqual(decision.decision, "NO_BET");
  assert.match(decision.reason, /non-core markets qualified/i);
  assert.strictEqual(decision.blockedAcceptedMarkets[0].marketId, "HOME_WIN");
  assert.strictEqual(decision.bestCoreRejected.marketId, "SECOND_HALF_OVER_0_5");
});

test("same input gives the same football decision and scores", () => {
  const a = engine.runEngine(example);
  const b = engine.runEngine(example);
  assert.strictEqual(a.decision, b.decision);
  assert.strictEqual(a.selected.marketId, b.selected.marketId);
  assert.deepStrictEqual(
    a.allMarkets.map(m => [m.marketId, m.score, m.accepted]),
    b.allMarkets.map(m => [m.marketId, m.score, m.accepted])
  );
});

test("non-strict mode blocks only markets requiring missing specialist data", () => {
  const input = deepClone(example);
  input.strict = false;
  for (const match of [...input.homeMatches, ...input.awayMatches]) {
    delete match.xgFor; delete match.xgAgainst;
    delete match.scoredFirst; delete match.ledAnyTime; delete match.trailedAnyTime;
  }
  const result = engine.runEngine(input);
  assert.strictEqual(result.context.availability.xg, false);
  assert.strictEqual(result.context.availability.scoreOrder, false);
  const homeWin = result.allMarkets.find(m => m.marketId === "HOME_WIN");
  const firstHalf = result.allMarkets.find(m => m.marketId === "FIRST_HALF_OVER_0_5");
  assert(homeWin.hardFailures.some(f => f.includes("xG")));
  assert(homeWin.hardFailures.some(f => f.includes("scored-first")));
  assert(!firstHalf.hardFailures.some(f => f.includes("xG") || f.includes("scored-first")));
});


test("partial xG coverage is not treated as complete", () => {
  const input = deepClone(example);
  input.strict = false;
  delete input.homeMatches[0].xgFor;
  const result = engine.runEngine(input);
  assert.strictEqual(result.context.availability.xg, false);
  const xgMarket = result.allMarkets.find(m => m.marketId === "HOME_WIN");
  assert(xgMarket.hardFailures.some(f => f.includes("xG")));
});

test("strict mode globally rejects missing xG and event-order fields", () => {
  const input = deepClone(example);
  for (const match of [...input.homeMatches, ...input.awayMatches]) {
    delete match.xgFor; delete match.xgAgainst;
    delete match.scoredFirst; delete match.ledAnyTime; delete match.trailedAnyTime;
  }
  const result = engine.runEngine(input);
  assert.strictEqual(result.decision, "NO_BET");
  assert(result.failures.some(f => f.includes("xG")));
  assert(result.failures.some(f => f.includes("scored-first")));
  assert(result.failures.some(f => f.includes("ledAnyTime")));
});

test("major context risk forces NO_BET", () => {
  const input = deepClone(example);
  input.context.lineupRisk = 0.8;
  const result = engine.runEngine(input);
  assert.strictEqual(result.decision, "NO_BET");
  assert(result.failures.some(f => f.includes("0.80")));
});

test("CSV parser supports quoted commas", () => {
  const rows = forensic.parseCsv('Date,HomeTeam,AwayTeam,FTHG,FTAG,HTHG,HTAG\n20/07/2026,"City, Athletic",United,2,1,1,0\n');
  assert.strictEqual(rows[1][1], "City, Athletic");
});

test("lead-at-any-time settlement is unknown without event data", () => {
  assert.strictEqual(forensic.settle("HOME_LEAD_ANYTIME", {
    fthg: 2, ftag: 1, hthg: 0, htag: 1
  }), null);
});

test("demo walk-forward backtest completes and writes reports", () => {
  const reportDir = path.join(__dirname, "reports", "test-run");
  fs.rmSync(reportDir, { recursive: true, force: true });
  const { summary } = forensic.runBacktest({
    engine: path.join(__dirname, "omni_htft_engine_v2_5_2.js"),
    dataDir: path.join(__dirname, "data"),
    outputDir: reportDir,
    historyWindow: 20,
    leagueWindow: 60,
    season: "synthetic-demo",
    strict: false,
    leagues: ["demo-league"]
  });
  assert.strictEqual(summary.fixturesEvaluated, 96);
  assert(fs.existsSync(path.join(reportDir, "backtest_summary.json")));
  assert(fs.existsSync(path.join(reportDir, "all_bets.csv")));
  assert(summary.bets > 0);
  const bets = JSON.parse(fs.readFileSync(path.join(reportDir, "all_bets.json"), "utf8"));
  assert(bets.every(b => engine.CORE_MARKETS.has(b.market)));
});

console.log(`\n${passed} tests passed.`);
