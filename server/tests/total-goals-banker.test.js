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
import {
  matchSportyBetOdds,
  nameSimilarity,
  totalsFromSportyMarkets
} from "../src/providers/sportyBetOdds.js";

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

test("high-scoring leagues map to Over totals", () => {
  const patterns = selectLeagueGoalPatterns(highLeague, "high");
  assert.ok(patterns.some((pattern) => pattern.key === "over-15"));
  assert.ok(patterns.every((pattern) => pattern.direction === "over"));
});

test("low-scoring leagues map to Under totals", () => {
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
  assert.equal(pick.book, "SportyBet");

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

test("missing SportyBet odds are never guessed", () => {
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
  assert.equal(pick.available, false);
  assert.match(pick.reasons[0], /SportyBet/);
});

test("SportyBet Over 2.5 at 1.30 is used even when Over 1.5 is too short", () => {
  const busy = { over15Rate: 0.88, over25Rate: 0.72, under35Rate: 0.45, matches: 12 };
  const busyRecent = { over15Rate: 0.8, over25Rate: 0.8, under35Rate: 0.4, matches: 5 };
  const pick = selectTotalGoalsBanker({
    leagueRates: { over15Rate: 0.9, over25Rate: 0.7, under35Rate: 0.48, matches: 200 },
    climateLabel: "high",
    climateSource: "current",
    leagueSample: 200,
    homeSeason: busy,
    awaySeason: busy,
    homeRecent: busyRecent,
    awayRecent: busyRecent,
    odds: { "over-15": 1.08, "over-25": 1.3, "under-35": 2.05 }
  });
  assert.equal(pick.available, true);
  assert.equal(pick.key, "over-25");
  assert.equal(pick.odds, 1.3);
  assert.equal(pick.book, "SportyBet");
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

test("SportyBet odds outside 1.20-1.55 are rejected", () => {
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
});

test("five high-scoring matches count as Over 1.5 form", () => {
  const rates = ratesFromMatches([
    { totalGoals: 3 }, { totalGoals: 2 }, { totalGoals: 4 }, { totalGoals: 2 }, { totalGoals: 3 }
  ]);
  assert.equal(rates.matches, 5);
  assert.equal(rates.over15Rate, 1);
  assert.equal(rates.over05Rate, 1);
  assert.equal(rates.under45Rate, 1);
});

test("Under 4.5 and BTTS Yes qualify when SportyBet is in band", () => {
  const busy = {
    over15Rate: 0.86,
    over25Rate: 0.7,
    over05Rate: 0.94,
    bttsRate: 0.72,
    under45Rate: 0.4,
    scoredRate: 0.8,
    concededRate: 0.78,
    matches: 12
  };
  const recent = { ...busy, matches: 5 };
  const yes = selectTotalGoalsBanker({
    leagueRates: { ...busy, matches: 180 },
    climateLabel: "high",
    climateSource: "current",
    leagueSample: 180,
    homeSeason: busy,
    awaySeason: busy,
    homeRecent: recent,
    awayRecent: recent,
    odds: { "btts-yes": 1.38, "over-15": 1.08 }
  });
  assert.equal(yes.key, "btts-yes");
  assert.equal(yes.odds, 1.38);

  const under = selectTotalGoalsBanker({
    leagueRates: { over15Rate: 0.58, over25Rate: 0.32, under35Rate: 0.84, under45Rate: 0.9, matches: 220 },
    climateLabel: "low",
    climateSource: "current",
    leagueSample: 220,
    homeSeason: { over15Rate: 0.5, over25Rate: 0.3, under35Rate: 0.86, matches: 12 },
    awaySeason: { over15Rate: 0.48, over25Rate: 0.28, under35Rate: 0.88, matches: 12 },
    homeRecent: { over15Rate: 0.4, over25Rate: 0.2, under35Rate: 0.8, under45Rate: 1, matches: 5 },
    awayRecent: { over15Rate: 0.4, over25Rate: 0.2, under35Rate: 0.8, under45Rate: 1, matches: 5 },
    odds: { "under-45": 1.24, "under-35": 1.08 }
  });
  assert.equal(under.key, "under-45");
  assert.equal(under.odds, 1.24);
});

test("first-half Over 0.5 and home Over 1.5 qualify from SportyBet", () => {
  const recent = {
    over15Rate: 0.8,
    over25Rate: 0.6,
    fhOver05Rate: 0.8,
    scored15Rate: 0.8,
    conceded15Rate: 0.8,
    scoredRate: 1,
    concededRate: 0.8,
    matches: 5,
    fhMatches: 5
  };
  const league = {
    over15Rate: 0.84,
    over25Rate: 0.62,
    fhOver05Rate: 0.78,
    scored15Rate: 0.7,
    conceded15Rate: 0.66,
    matches: 160,
    fhMatches: 160
  };
  const half = selectTotalGoalsBanker({
    leagueRates: league,
    climateLabel: "high",
    climateSource: "current",
    leagueSample: 160,
    homeRecent: recent,
    awayRecent: recent,
    odds: { "fh-over-05": 1.23, "over-15": 1.08 }
  });
  assert.equal(half.key, "fh-over-05");

  const team = selectTotalGoalsBanker({
    leagueRates: league,
    climateLabel: "high",
    climateSource: "current",
    leagueSample: 160,
    homeRecent: recent,
    awayRecent: recent,
    homeName: "Bodo/Glimt",
    awayName: "Rosenborg",
    odds: { "home-over-15": 1.28, "over-15": 1.08 }
  });
  assert.equal(team.key, "home-over-15");
  assert.match(team.selection, /Bodo\/Glimt Over 1.5/);
});

test("SportyBet Over/Under market 18 becomes live totals prices", () => {
  const odds = totalsFromSportyMarkets([
    {
      id: "18",
      specifier: "total=2.5",
      outcomes: [
        { id: "12", desc: "Over 2.5", odds: "1.45" },
        { id: "13", desc: "Under 2.5", odds: "2.75" }
      ]
    },
    {
      id: "18",
      specifier: "total=1.5",
      outcomes: [
        { id: "12", desc: "Over 1.5", odds: "1.14" },
        { id: "13", desc: "Under 1.5", odds: "5.80" }
      ]
    }
  ]);
  assert.equal(odds["over-25"], 1.45);
  assert.equal(odds["over-15"], 1.14);
});

test("SportyBet BTTS, first-half and team markets are parsed", () => {
  const odds = totalsFromSportyMarkets([
    {
      id: "29",
      desc: "GG/NG",
      outcomes: [
        { id: "74", desc: "Yes", odds: "1.38" },
        { id: "76", desc: "No", odds: "3.10" }
      ]
    },
    {
      id: "68",
      specifier: "total=0.5",
      outcomes: [
        { id: "12", desc: "Over 0.5", odds: "1.23" },
        { id: "13", desc: "Under 0.5", odds: "4.25" }
      ]
    },
    {
      id: "19",
      specifier: "total=1.5",
      outcomes: [
        { id: "12", desc: "Over 1.5", odds: "1.28" },
        { id: "13", desc: "Under 1.5", odds: "3.50" }
      ]
    }
  ]);
  assert.equal(odds["btts-yes"], 1.38);
  assert.equal(odds["fh-over-05"], 1.23);
  assert.equal(odds["home-over-15"], 1.28);
});

test("SportyBet short names still match full club names", () => {
  assert.ok(nameSimilarity("Man City", "Manchester City") > 0.9);
  assert.ok(nameSimilarity("AFC Bournemouth", "Bournemouth") > 0.85);
});

test("SportyBet events match BetsPapa fixtures by team names", () => {
  const hit = matchSportyBetOdds([
    {
      home: "Vaalerenga IF",
      away: "Molde",
      homeKey: "vaalerenga",
      awayKey: "molde",
      kickoffMs: Date.parse("2026-08-21T15:00:00.000Z"),
      odds: { "over-25": 1.3 },
      url: "https://www.sportybet.com/ng/sport/football"
    }
  ], {
    home: { name: "Vålerenga" },
    away: { name: "Molde FK" },
    kickoff: "2026-08-21T15:00:00.000Z"
  });
  assert.equal(hit.odds["over-25"], 1.3);
});

test("portal and page exist for Total Goals Bankers", async () => {
  const html = await readFile(resolve(root, "goals-bankers.html"), "utf8");
  const js = await readFile(resolve(root, "assets/js/portal.v1250.js"), "utf8");
  assert.match(html, /data-page="goals-bankers"/);
  assert.match(js, /goals-bankers\/today/);
  assert.match(js, /SportyBet/);
});
