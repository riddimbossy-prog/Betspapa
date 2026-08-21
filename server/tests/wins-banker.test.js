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

test("SportyBet 1X2 marks the shorter side as favourite", () => {
  const fav = identifyFavorite({ home: 1.32, away: 8.5 });
  assert.equal(fav.side, "home");
  assert.equal(fav.favOdds, 1.32);
});

test("wins banker publishes a top-4 favourite that clears every filter", () => {
  const pick = selectWinsBanker(base);
  assert.equal(pick.available, true);
  assert.equal(pick.key, "home-win");
  assert.equal(pick.book, "SportyBet");
  assert.equal(pick.odds, 1.32);
  assert.match(pick.selection, /Bodø\/Glimt Win/);
  assert.equal(pick.opponentForm, formString(base.awayLastFive));
});

test("favourite outside 1.19-1.55 is rejected", () => {
  const pick = selectWinsBanker({ ...base, odds: { ...base.odds, home: 1.72 } });
  assert.equal(pick.available, false);
});

test("opponent shorter than 4.50 is rejected", () => {
  const pick = selectWinsBanker({ ...base, odds: { ...base.odds, away: 4.4 } });
  assert.equal(pick.available, false);
});

test("favourite not in the top 4 is rejected", () => {
  const pick = selectWinsBanker({ ...base, homeRank: 5 });
  assert.equal(pick.available, false);
});

test("PPG of 2.00 is not enough", () => {
  const pick = selectWinsBanker({ ...base, homePpg: 2 });
  assert.equal(pick.available, false);
});

test("opponent with a win in the last five is rejected", () => {
  const pick = selectWinsBanker({ ...base, awayLastFive: ["L", "W", "L", "D", "L"] });
  assert.equal(pick.available, false);
});

test("Over 1.5 longer than 1.20 is rejected", () => {
  const pick = selectWinsBanker({ ...base, odds: { ...base.odds, "over-15": 1.22 } });
  assert.equal(pick.available, false);
});

test("favourite 2+ at 1.55 is rejected", () => {
  const pick = selectWinsBanker({ ...base, odds: { ...base.odds, "home-over-15": 1.55 } });
  assert.equal(pick.available, false);
});

test("opponent to score at 1.65 is rejected", () => {
  const pick = selectWinsBanker({ ...base, odds: { ...base.odds, "away-over-05": 1.65 } });
  assert.equal(pick.available, false);
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
  assert.match(html, /Favourite win odds/);
  assert.match(js, /wins-bankers\/today/);
  assert.match(js, /wins-match-table/);
});
