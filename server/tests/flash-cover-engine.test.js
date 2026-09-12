import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  FLASH_ENGINE_NAME,
  FLASH_ENGINE_VERSION,
  FLASH_MARKETS,
  selectFlashPick
} from "../src/engine/flashCoverEngine.js";
import { flashFromSportyMarkets } from "../src/providers/sportyBetOdds.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

const scorelines = [
  [3, 1], [2, 2], [2, 1], [1, 2], [2, 0],
  [1, 1], [3, 2], [0, 1], [2, 1], [2, 2]
];
const splitGames = scorelines.map(([ftHome, ftAway], index) => ({
  ftHome,
  ftAway,
  htHome: index % 3 === 0 ? 1 : 0,
  htAway: index % 4 === 0 ? 1 : 0
}));

test("Flash exposes exactly the 15 requested markets", () => {
  assert.equal(FLASH_ENGINE_NAME, "Flash — Cover IQ");
  assert.equal(FLASH_ENGINE_VERSION, "flash-cover-iq-v1.1.0");
  assert.equal(FLASH_MARKETS.length, 15);
  assert.equal(new Set(FLASH_MARKETS.map((market) => market.key)).size, 15);
  assert.ok(FLASH_MARKETS.some((market) => market.market === "1st Half Result or Match Result"));
  assert.ok(FLASH_MARKETS.some((market) => market.market === "Away Team or Any Clean Sheet"));
});

test("SportyBet parser reads exact Flash Yes/No and three-way prices", () => {
  const odds = flashFromSportyMarkets([
    {
      id: 999,
      desc: "Home Team or Over 2.5",
      outcomes: [
        { id: 74, desc: "Yes", odds: "1.55", isActive: 1 },
        { id: 76, desc: "No", odds: "2.35", isActive: 1 }
      ]
    },
    {
      id: 998,
      desc: "1st Half Result or Match Result",
      outcomes: [
        { id: 1, desc: "Home", odds: "1.77", isActive: 1 },
        { id: 2, desc: "Draw", odds: "1.57", isActive: 1 },
        { id: 3, desc: "Away", odds: "2.50", isActive: 1 }
      ]
    },
    {
      id: 997,
      desc: "Unknown lookalike market",
      outcomes: [{ id: 74, desc: "Yes", odds: "1.22", isActive: 1 }]
    }
  ]);
  assert.deepEqual(odds, {
    "home-or-over-25": 1.55,
    "home-or-over-25-no": 2.35,
    "first-half-or-match-home": 1.77,
    "first-half-or-match-draw": 1.57,
    "first-half-or-match-away": 2.5
  });
});

test("Flash publishes every market that clears the gates", () => {
  const pick = selectFlashPick({
    homeGames: splitGames,
    awayGames: splitGames,
    league: { homeGoals: 1.6, awayGoals: 1.3 },
    odds: {
      "home-or-over-25": 1.55,
      "home-or-over-25-no": 2.35,
      "home-or-gg": 1.48,
      "home-or-gg-no": 2.55
    }
  });
  assert.equal(pick.available, true);
  assert.ok(Array.isArray(pick.picks));
  assert.ok(pick.picks.length >= 1);
  const keys = new Set(pick.picks.map((row) => row.key));
  assert.equal(keys.size, pick.picks.length);
});

test("Flash fires one qualified market when every gate clears", () => {
  const pick = selectFlashPick({
    homeGames: splitGames,
    awayGames: splitGames,
    league: { homeGoals: 1.6, awayGoals: 1.3 },
    odds: { "home-or-over-25": 1.55, "home-or-over-25-no": 2.35 }
  });
  assert.equal(pick.available, true);
  assert.equal(pick.key, "home-or-over-25");
  assert.equal(pick.market, "Home Team or Over 2.5");
  assert.equal(pick.selection, "Yes");
  assert.equal(pick.odds, 1.55);
  assert.ok(pick.modelProbability >= 0.75);
  assert.ok(pick.directHitRates.home >= 0.7);
  assert.ok(pick.directHitRates.away >= 0.7);
  assert.ok(pick.rescueGain >= 0.1);
  assert.ok(pick.confidence >= 80);
  assert.ok(Array.isArray(pick.picks));
  assert.equal(pick.picks.length, 1);
});

test("Flash skips paired markets without the matching No price", () => {
  const pick = selectFlashPick({
    homeGames: splitGames,
    awayGames: splitGames,
    league: { homeGoals: 1.6, awayGoals: 1.3 },
    odds: { "home-or-over-25": 1.55 }
  });
  assert.equal(pick.available, false);
  assert.equal(pick.selection, "SKIP");
  assert.ok(Object.keys(pick.internalAudit.rejectionCounts).some((reason) => /No price is missing/.test(reason)));
});

test("missing half-time scores are not silently treated as nil-nil", () => {
  const noHalves = splitGames.map(({ ftHome, ftAway }) => ({ ftHome, ftAway }));
  const pick = selectFlashPick({
    homeGames: noHalves,
    awayGames: noHalves,
    league: { homeGoals: 1.6, awayGoals: 1.3 },
    odds: {
      "first-half-or-match-home": 1.77,
      "first-half-or-match-draw": 1.57,
      "first-half-or-match-away": 2.5
    }
  });
  assert.equal(pick.available, false);
});

test("Flash is the home page, keeps its legacy URL and exposes the public API", async () => {
  const [html, legacyFlash, papa, portal, mobileNav, routes] = await Promise.all([
    readFile(resolve(root, "index.html"), "utf8"),
    readFile(resolve(root, "flash.html"), "utf8"),
    readFile(resolve(root, "papas-pick.html"), "utf8"),
    readFile(resolve(root, "assets/js/portal.v1250.js"), "utf8"),
    readFile(resolve(root, "assets/js/mobile-nav.v1240.js"), "utf8"),
    readFile(resolve(root, "server/src/routes/publicRoutes.js"), "utf8")
  ]);
  assert.match(html, /BETSPAPA_START="papa"/);
  assert.match(html, /screens-app/);
  assert.match(legacyFlash, /BETSPAPA_START="flash"/);
  assert.match(papa, /BETSPAPA_START="papa"/);
  assert.match(portal, /\/api\/flash\/today/);
  assert.match(portal, /page === "flash"/);
  assert.match(mobileNav, /data-bp-tab="flash"/);
  assert.match(routes, /publicRouter\.get\("\/flash\/today"/);
});
