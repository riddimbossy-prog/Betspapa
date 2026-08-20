import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  applyLeagueScoringGuard,
  buildLeagueGoalsFlag,
  classifyLeagueScoring,
  resolveLeagueScoringTrend,
  totalsSideFromPick
} from "../src/engine/leagueScoringPolicy.js";
import { selectSplitFormPick } from "../src/engine/splitFormEngine.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

function fiveGames(total) {
  return Array.from({ length: 5 }, (_, index) => ({
    date: `2026-08-0${index + 1}T15:00:00.000Z`,
    ftFor: Math.floor(total / 2),
    ftAgainst: total - Math.floor(total / 2),
    htFor: 0,
    htAgainst: 0,
    ftResult: "D",
    htResult: "D",
    transition: "DD",
    totalGoals: total
  }));
}

test("high-scoring leagues flag Under totals", () => {
  const climate = classifyLeagueScoring({ over15Rate: 0.84, over25Rate: 0.61, under35Rate: 0.52 });
  assert.equal(climate.label, "high");
  const flag = buildLeagueGoalsFlag({ key: "under-35", available: true, selection: "Under 3.5 Goals" }, climate);
  assert.equal(flag.level, "red");
  assert.equal(flag.code, "HIGH_LEAGUE_UNDER");
});

test("low-scoring leagues flag Over 2.5 totals", () => {
  const climate = classifyLeagueScoring({ over15Rate: 0.64, over25Rate: 0.38, under35Rate: 0.84 });
  assert.equal(climate.label, "low");
  const flag = buildLeagueGoalsFlag({ key: "over-25", available: true, selection: "Over 2.5 Goals" }, climate);
  assert.equal(flag.level, "red");
  assert.equal(flag.code, "LOW_LEAGUE_OVER");
});

test("team overs and aligned totals are not flagged", () => {
  const high = classifyLeagueScoring({ over15Rate: 0.84, over25Rate: 0.61, under35Rate: 0.52 });
  const low = classifyLeagueScoring({ over15Rate: 0.64, over25Rate: 0.38, under35Rate: 0.84 });
  assert.equal(buildLeagueGoalsFlag({ key: "over-15", available: true }, high), null);
  assert.equal(buildLeagueGoalsFlag({ key: "under-35", available: true }, low), null);
  assert.equal(totalsSideFromPick({ key: "home-over-05", selection: "Arsenal Over 0.5 Team Goals" }), null);
});

test("engine guard withholds the contradicting totals tip", () => {
  const climate = classifyLeagueScoring({ over15Rate: 0.84, over25Rate: 0.61, under35Rate: 0.52 });
  const guarded = applyLeagueScoringGuard({
    available: true,
    key: "under-35",
    market: "Total Goals",
    selection: "Under 3.5 Goals",
    qualified: true
  }, climate);
  assert.equal(guarded.key, "no-pick");
  assert.equal(guarded.available, false);
  assert.equal(guarded.leagueGoalsFlag.level, "red");
});

test("Split Form will not issue Under 3.5 in a high-scoring league", () => {
  const pick = selectSplitFormPick({
    home: { name: "Home FC", recentFive: fiveGames(1) },
    away: { name: "Away FC", recentFive: fiveGames(1) },
    league: { goals: { over15Rate: 0.84, over25Rate: 0.62, under35Rate: 0.5 } }
  });
  assert.notEqual(pick.key, "under-35");
});

test("portal can paint a league-goals red flag", async () => {
  const js = await readFile(resolve(root, "assets/js/portal.v1250.js"), "utf8");
  assert.match(js, /function riskFlagMarkup/);
  assert.match(js, /leagueGoalsFlag/);
  assert.match(js, /function leagueClimateMarkup/);
  assert.match(js, /HIGH SCORING/);
});

test("thin current season falls back to last season's scoring trend", () => {
  const trend = resolveLeagueScoringTrend(
    { over15Rate: 0.5, over25Rate: 0.3, under35Rate: 0.85, matches: 18 },
    { over15Rate: 0.82, over25Rate: 0.6, under35Rate: 0.55, matches: 400 }
  );
  assert.equal(trend.source, "previous");
  assert.equal(trend.label, "high");
  assert.equal(trend.trend.direction, "falling");
});

test("full current season uses this year's scoring climate", () => {
  const trend = resolveLeagueScoringTrend(
    { over15Rate: 0.63, over25Rate: 0.4, under35Rate: 0.82, matches: 300 },
    { over15Rate: 0.82, over25Rate: 0.6, under35Rate: 0.55, matches: 400 }
  );
  assert.equal(trend.source, "current");
  assert.equal(trend.label, "low");
});

