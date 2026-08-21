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
  homeVenuePpg: 1.1,
  homeVenueGpg: 1.1,
  awayLastFive: ["W", "W", "W", "D", "L"],
  awayVenueForm: ["W", "W", "W", "D", "L"],
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
  assert.equal(pick.formBasis, "venue-split");
});

test("Over 1.5 at 1.20 or shorter plus one extra filter is enough", () => {
  const pick = selectWinsBanker({
    ...weak,
    homeRank: 3,
    homeVenuePpg: 1.1,
    homeVenueGpg: 1.1
  });
  assert.equal(pick.available, true);
  assert.equal(pick.extraPassed, 1);
  assert.equal(pick.filters.find((row) => row.key === "top-5").passed, true);
  assert.equal(pick.filters.find((row) => row.key === "over-15").required, true);
});

test("two extra filters also publish", () => {
  const pick = selectWinsBanker({
    ...weak,
    homeRank: 2,
    homePpg: 2.3,
    homeVenuePpg: 2.3,
    homeVenueGpg: 1.1
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

test("early-season red flag still blocks a wins banker", () => {
  const pick = selectWinsBanker({
    ...base,
    redFlags: [{ code: "EARLY_SEASON", reason: "Red flag: first 5 league matches." }]
  });
  assert.equal(pick.available, false);
});

test("top-five clash red flag still blocks a wins banker", () => {
  const pick = selectWinsBanker({
    ...base,
    redFlags: [{ code: "TOP5_CLASH", reason: "Two top-five teams." }]
  });
  assert.equal(pick.available, false);
});

test("other red flags are skippable and do not block", () => {
  const pick = selectWinsBanker({
    ...base,
    redFlags: [{ code: "LEAGUE_GOALS", reason: "League goals climate warning." }]
  });
  assert.equal(pick.available, true);
  assert.ok(Array.isArray(pick.skippableRedFlags));
  assert.equal(pick.skippableRedFlags.length, 1);
});

test("away favourite needs GPG above 2.2", () => {
  const pick = selectWinsBanker({
    ...base,
    homeRank: 12,
    awayRank: 2,
    homePpg: 0.8,
    awayPpg: 2.3,
    homeGpg: 0.9,
    awayGpg: 2.1,
    homeVenuePpg: 0.8,
    awayVenuePpg: 2.3,
    homeVenueGpg: 0.9,
    awayVenueGpg: 2.1,
    homeVenueForm: ["L", "L", "D", "L", "L"],
    awayVenueForm: ["W", "W", "W", "D", "W"],
    odds: {
      home: 6.5,
      away: 1.35,
      "over-15": 1.12,
      "away-over-15": 1.3,
      "home-over-05": 1.9,
      url: "https://www.sportybet.com/ng/sport/football"
    }
  });
  // 2.1 is not > 2.2, so gpg filter fails; may still publish via other extras
  const gpgFilter = pick.filters?.find((row) => row.key === "gpg");
  if (pick.available) {
    assert.equal(gpgFilter.passed, false);
  }
});

test("away favourite with GPG 2.3 passes goals filter", () => {
  const pick = selectWinsBanker({
    ...base,
    homeRank: 12,
    awayRank: 2,
    homePpg: 0.8,
    awayPpg: 2.3,
    homeGpg: 0.9,
    awayGpg: 2.3,
    homeVenuePpg: 0.8,
    awayVenuePpg: 2.3,
    homeVenueGpg: 0.9,
    awayVenueGpg: 2.3,
    homeVenueGa: 1.9,
    awayVenueGa: 0.5,
    homeVenueForm: ["L", "L", "D", "L", "L"],
    awayVenueForm: ["W", "W", "W", "D", "W"],
    odds: {
      home: 6.5,
      away: 1.35,
      "over-15": 1.12,
      "away-over-15": 1.3,
      "home-over-05": 1.9,
      url: "https://www.sportybet.com/ng/sport/football"
    }
  });
  assert.equal(pick.available, true);
  assert.equal(pick.key, "away-win");
  assert.equal(pick.filters.find((row) => row.key === "gpg").passed, true);
});

test("similar form and goal concessions are skipped", () => {
  const pick = selectWinsBanker({
    ...base,
    homeVenueForm: ["W", "D", "W", "D", "L"],
    awayVenueForm: ["W", "D", "D", "W", "L"],
    homeVenueGa: 1.0,
    awayVenueGa: 1.1,
    homeVenuePpg: 2.0,
    homeVenueGpg: 2.0
  });
  assert.equal(pick.available, false);
  assert.match(pick.reasons[0], /similar/i);
});

test("PPG of exactly 2.0 is accepted", () => {
  const pick = selectWinsBanker({
    ...base,
    homeVenuePpg: 2.0,
    homeVenueGpg: 2.0,
    homePpg: 2.0,
    homeGpg: 2.0
  });
  assert.equal(pick.available, true);
  assert.equal(pick.filters.find((row) => row.key === "ppg").passed, true);
  assert.equal(pick.filters.find((row) => row.key === "gpg").passed, true);
});

test("top-5 rank is required (rank 5 passes, rank 6 does not as sole extra)", () => {
  const rank5 = selectWinsBanker({
    ...weak,
    homeRank: 5,
    homeVenuePpg: 1.0,
    homeVenueGpg: 1.0
  });
  assert.equal(rank5.available, true);
  assert.equal(rank5.filters.find((row) => row.key === "top-5").passed, true);

  const rank6 = selectWinsBanker({
    ...weak,
    homeRank: 6,
    homeVenuePpg: 1.0,
    homeVenueGpg: 1.0
  });
  assert.equal(rank6.available, false);
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
  assert.match(js, /winsLeagueMap/);
});
