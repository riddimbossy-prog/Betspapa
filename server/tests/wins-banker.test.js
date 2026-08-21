import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { selectWinsBanker, identifyFavorite, formString } from "../src/engine/winsBankerEngine.js";
import { totalsFromSportyMarkets } from "../src/providers/sportyBetOdds.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

const base = {
  homeName: "Bodø/Glimt",
  awayName: "Sandnes Ulf",
  homeRank: 2,
  awayRank: 14,
  tableSize: 16,
  homePlayed: 12,
  awayPlayed: 12,
  homePpg: 2.4,
  awayPpg: 0.6,
  homeGpg: 2.5,
  awayGpg: 0.8,
  homeLastFive: ["W", "W", "D", "W", "W"],
  awayLastFive: ["L", "D", "L", "L", "D"],
  odds: {
    home: 1.32,
    away: 8.5,
    "over-15": 1.14,
    "home-over-15": 1.28,
    "away-over-05": 1.85,
    url: "https://www.sportybet.com/ng/sport/football"
  }
};

const weak = {
  ...base,
  homeRank: 9,
  homePpg: 1.1,
  homeGpg: 1.1,
  awayLastFive: ["W", "W", "W", "D", "L"],
  odds: {
    home: 1.8,
    away: 3.9,
    "over-15": 1.14,
    "home-over-15": 1.9,
    "away-over-05": 1.4,
    url: "https://www.sportybet.com/ng/sport/football"
  }
};

test("SportyBet 1X2 marks the shorter side as favourite", () => {
  const fav = identifyFavorite({ home: 1.32, away: 8.5 });
  assert.equal(fav.side, "home");
  assert.equal(fav.favOdds, 1.32);
});

test("wins banker still publishes when every extra filter passes", () => {
  const pick = selectWinsBanker(base);
  assert.equal(pick.available, true);
  assert.equal(pick.key, "home-win");
  assert.equal(pick.book, "SportyBet");
  assert.ok(pick.extraPassed >= 2);
});

test("Over 1.5 at 1.20 or shorter plus one extra filter is enough", () => {
  const pick = selectWinsBanker({
    ...weak,
    homeRank: 3
  });
  assert.equal(pick.available, true);
  assert.equal(pick.extraPassed, 1);
  assert.equal(pick.filters.find((row) => row.key === "top-4").passed, true);
  assert.equal(pick.filters.find((row) => row.key === "over-15").required, true);
});

test("two extra filters also publish", () => {
  const pick = selectWinsBanker({
    ...weak,
    homeRank: 2,
    homePpg: 2.3
  });
  assert.equal(pick.available, true);
  assert.equal(pick.extraPassed, 2);
});

test("Over 1.5 alone with no extra filters is rejected", () => {
  const pick = selectWinsBanker(weak);
  assert.equal(pick.available, false);
});

test("Over 1.5 longer than 1.20 is rejected even with extras", () => {
  const pick = selectWinsBanker({ ...base, odds: { ...base.odds, "over-15": 1.22 } });
  assert.equal(pick.available, false);
});

test("favourite outside 1.19-1.55 can still publish if another extra passes", () => {
  const pick = selectWinsBanker({ ...base, odds: { ...base.odds, home: 1.72 } });
  assert.equal(pick.available, true);
  assert.equal(pick.filters.find((row) => row.key === "fav-odds").passed, false);
});

test("red flags block a wins banker", () => {
  const pick = selectWinsBanker({
    ...base,
    redFlags: [{ code: "EARLY_SEASON", reason: "Red flag: first 5 league matches." }]
  });
  assert.equal(pick.available, false);
});

test("SportyBet 1X2 market 1 is parsed", () => {
  const odds = totalsFromSportyMarkets([
    {
      id: "1",
      desc: "1X2",
      outcomes: [
        { id: "1", desc: "Home", odds: "1.32" },
        { id: "2", desc: "Draw", odds: "5.40" },
        { id: "3", desc: "Away", odds: "8.50" }
      ]
    }
  ]);
  assert.equal(odds.home, 1.32);
  assert.equal(odds.away, 8.5);
});

test("form string keeps last-five codes", () => {
  assert.equal(formString(["L", "D", "L", "L", "D"]), "L" + "D" + "L" + "L" + "D");
});

test("wins banker page exists", async () => {
  const html = await readFile(resolve(root, "wins-bankers.html"), "utf8");
  const js = await readFile(resolve(root, "assets/js/portal.v1250.js"), "utf8");
  assert.match(html, /data-page="wins-bankers"/);
  assert.match(html, /<table class="wins-filter-table">/);
  assert.match(html, /Required/);
  assert.match(html, /1 or 2 extras/);
  assert.match(js, /wins-bankers\/today/);
  assert.match(js, /wins-match-table/);
});
