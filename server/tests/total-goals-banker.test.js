import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  buildLeagueMap,
  inBankerOddsBand,
  ratesFromMatches,
  selectLeagueGoalPatterns,
  selectTotalGoalsBanker
} from "../src/engine/totalGoalsBankerEngine.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

const highLeague = { over15Rate: 0.82, over25Rate: 0.61, under35Rate: 0.54, matches: 220 };
const lowLeague = { over15Rate: 0.62, over25Rate: 0.4, under35Rate: 0.81, matches: 300 };
const highTeam = { over15Rate: 0.8, over25Rate: 0.6, under35Rate: 0.52, matches: 12 };
const lowTeam = { over15Rate: 0.58, over25Rate: 0.36, under35Rate: 0.84, matches: 12 };
const highRecent = { over15Rate: 0.8, over25Rate: 0.6, under35Rate: 0.4, matches: 5 };
const lowRecent = { over15Rate: 0.4, over25Rate: 0.2, under35Rate: 0.8, matches: 5 };

test("1.20 to 1.55 is the only banker odds band", () => {
  assert.equal(inBankerOddsBand(1.19), false);
  assert.equal(inBankerOddsBand(1.2), true);
  assert.equal(inBankerOddsBand(1.55), true);
  assert.equal(inBankerOddsBand(1.56), false);
});

test("high-scoring leagues map to Over totals inside the banker band", () => {
  const patterns = selectLeagueGoalPatterns(highLeague, "high");
  assert.ok(patterns.some((pattern) => pattern.key === "over-15"));
  assert.ok(patterns.every((pattern) => pattern.direction === "over"));
});

test("low-scoring leagues map to Under totals inside the banker band", () => {
  const patterns = selectLeagueGoalPatterns(lowLeague, "low");
  assert.equal(patterns[0].key, "under-35");
  assert.ok(patterns.every((pattern) => pattern.direction === "under"));
});

test("both teams must point the same way as the league tip", () => {
  const pick = selectTotalGoalsBanker({
    leagueRates: highLeague,
    climateLabel: "high",
    climateSource: "current",
    leagueSample: 220,
    homeSeason: highTeam,
    awaySeason: highTeam,
    homeRecent: highRecent,
    awayRecent: highRecent,
    odds: { "over-15": 1.28 }
  });
  assert.equal(pick.key, "over-15");
  assert.equal(pick.odds, 1.28);

  const clash = selectTotalGoalsBanker({
    leagueRates: highLeague,
    climateLabel: "high",
    climateSource: "current",
    leagueSample: 220,
    homeSeason: highTeam,
    awaySeason: lowTeam,
    homeRecent: highRecent,
    awayRecent: lowRecent,
    odds: { "over-15": 1.28 }
  });
  assert.equal(clash.available, false);
});

test("implied 1.20-1.55 prices still publish when bookmaker odds are missing", () => {
  const pick = selectTotalGoalsBanker({
    leagueRates: highLeague,
    climateLabel: "high",
    climateSource: "current",
    leagueSample: 220,
    homeSeason: highTeam,
    awaySeason: highTeam,
    homeRecent: highRecent,
    awayRecent: highRecent,
    odds: {}
  });
  assert.equal(pick.available, true);
  assert.equal(pick.key, "over-15");
  assert.equal(pick.oddsSource, "implied");
  assert.ok(pick.odds >= 1.2 && pick.odds <= 1.55);
});

test("red flags block a totals banker", () => {
  const pick = selectTotalGoalsBanker({
    leagueRates: lowLeague,
    climateLabel: "low",
    climateSource: "current",
    leagueSample: 300,
    homeSeason: lowTeam,
    awaySeason: lowTeam,
    homeRecent: lowRecent,
    awayRecent: lowRecent,
    odds: { "under-35": 1.32 },
    redFlags: [{ code: "TOP5_CLASH", reason: "Red flag 2: two top-five teams." }]
  });
  assert.equal(pick.available, false);
  assert.match(pick.reasons[0], /top-five/);
});

test("bookmaker odds outside 1.20-1.55 are rejected", () => {
  const pick = selectTotalGoalsBanker({
    leagueRates: lowLeague,
    climateLabel: "low",
    climateSource: "current",
    leagueSample: 300,
    homeSeason: lowTeam,
    awaySeason: lowTeam,
    homeRecent: lowRecent,
    awayRecent: lowRecent,
    odds: { "under-35": 1.72 }
  });
  assert.equal(pick.available, false);
});

test("league map groups each tip under its league", () => {
  const map = buildLeagueMap([
    { league: { country: "Brazil", name: "Serie B" }, key: "under-35", selection: "Under 3.5 Goals", market: "Total Goals" },
    { league: { country: "Brazil", name: "Serie B" }, key: "under-35", selection: "Under 3.5 Goals", market: "Total Goals" },
    { league: { country: "Norway", name: "Toppserien" }, key: "over-15", selection: "Over 1.5 Goals", market: "Total Goals" }
  ]);
  assert.equal(map.length, 2);
  assert.equal(map[0].picks, 2);
  assert.equal(map.find((row) => row.name === "Toppserien").selection, "Over 1.5 Goals");
});

test("five high-scoring matches count as Over 1.5 form", () => {
  const rates = ratesFromMatches([
    { totalGoals: 3 }, { totalGoals: 2 }, { totalGoals: 4 }, { totalGoals: 2 }, { totalGoals: 3 }
  ]);
  assert.equal(rates.matches, 5);
  assert.equal(rates.over15Rate, 1);
});

test("portal and page exist for Total Goals Bankers", async () => {
  const html = await readFile(resolve(root, "goals-bankers.html"), "utf8");
  const js = await readFile(resolve(root, "assets/js/portal.v1250.js"), "utf8");
  assert.match(html, /data-page="goals-bankers"/);
  assert.match(js, /goals-bankers\/today/);
  assert.match(js, /leagueMap/);
});
