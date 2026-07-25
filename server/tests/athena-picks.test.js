import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  analyseFixture,
  ENGINE_VERSION,
  MARKETS
} from "../src/engine/athena-transition-engine/src/index.js";
import {
  athenaSelectionLabel,
  buildAthenaTeamInput,
  extractAthenaOdds,
  rankAthenaPicks,
  settleAthenaMarket
} from "../src/services/athenaPickService.js";

function fixture({
  id = 1,
  team = 10,
  opponent = 20,
  hh = 1,
  ha = 0,
  fh = 2,
  fa = 0,
  date = "2026-07-01T12:00:00Z",
  status = "FT"
} = {}) {
  return {
    id,
    fixture_date: date,
    home_team_id: team,
    away_team_id: opponent,
    halftime_home: hh,
    halftime_away: ha,
    fulltime_home: fh,
    fulltime_away: fa,
    status
  };
}

test("Athena RC1 source is integrated unchanged", () => {
  assert.equal(ENGINE_VERSION, "1.0.0-rc.1");
});

test("Athena adapter creates team-perspective HT/FT counts", () => {
  const rows = [
    fixture({ id: 1, hh: 1, ha: 0, fh: 2, fa: 0 }),
    fixture({ id: 2, hh: 0, ha: 0, fh: 1, fa: 0 }),
    fixture({ id: 3, hh: 0, ha: 1, fh: 1, fa: 1 })
  ];
  const input = buildAthenaTeamInput("Home", rows, 10);
  assert.equal(input.matchesPlayed, 3);
  assert.equal(input.htft.ww, 1);
  assert.equal(input.htft.dw, 1);
  assert.equal(input.htft.ld, 1);
  assert.equal(Object.values(input.htft).reduce((a, b) => a + b, 0), 3);
});

test("Athena stable leader sample returns Home Win Either Half", () => {
  const team = (name, htft, over25, under25, averageTotalGoals, goalsFor, goalsAgainst) => ({
    name,
    matchesPlayed: Object.values(htft).reduce((a, b) => a + b, 0),
    htft,
    goals: { over25, under25, averageTotalGoals, goalsFor, goalsAgainst },
    venue: { matchesPlayed: 8 }
  });
  const result = analyseFixture({
    id: "sample",
    home: team("Bodo/Glimt", { ww: 10, wd: 0, wl: 0, dw: 0, dd: 1, dl: 0, lw: 0, ld: 1, ll: 2 }, 9, 5, 3.2, 34, 11),
    away: team("HamKam", { ww: 4, wd: 0, wl: 0, dw: 1, dd: 2, dl: 0, lw: 0, ld: 1, ll: 5 }, 10, 3, 3.5, 20, 25),
    odds: { home: 1.10, draw: 10, away: 18 }
  });
  assert.equal(result.banker.market, MARKETS.HOME_WIN_EITHER_HALF);
  assert.ok(result.banker.score >= 80);
});

test("Athena labels and rankings are user-facing and deterministic", () => {
  assert.equal(
    athenaSelectionLabel(MARKETS.AWAY_DNB, "Hearts", "Lions"),
    "Lions Draw No Bet"
  );
  const ranked = rankAthenaPicks([
    { grade: "QUALIFIED", score: 84, kickoff: "2026-07-17T11:00:00Z" },
    { grade: "PRIME", score: 88, kickoff: "2026-07-17T13:00:00Z" },
    { grade: "PRIME", score: 91, kickoff: "2026-07-17T14:00:00Z" }
  ]);
  assert.equal(ranked[0].score, 91);
  assert.equal(ranked[2].grade, "QUALIFIED");
});

test("Athena odds adapter reads standard 1X2 keys", () => {
  assert.deepEqual(
    extractAthenaOdds({ market_odds: { home: 1.9, draw: 3.4, away: 4.2 } }),
    { home: 1.9, draw: 3.4, away: 4.2 }
  );
});

test("Athena markets settle automatically from HT and FT scores", () => {
  const row = fixture({ hh: 0, ha: 0, fh: 2, fa: 1, status: "FT" });
  assert.equal(settleAthenaMarket(row, MARKETS.OVER_2_5).outcome, "WIN");
  assert.equal(settleAthenaMarket(row, MARKETS.HOME_DNB).outcome, "WIN");
  assert.equal(settleAthenaMarket(row, MARKETS.HALF_TIME_DRAW).outcome, "WIN");
});

test("Boss Picks UI is replaced by Athena while old bookmarks redirect", async () => {
  const projectRoot = resolve(new URL("../../", import.meta.url).pathname);
  const athenaHtml = await readFile(resolve(projectRoot, "athena.html"), "utf8");
  const bossRedirect = await readFile(resolve(projectRoot, "boss-picks.html"), "utf8");
  const portal = await readFile(resolve(projectRoot, "assets/js/portal.v1190.js"), "utf8");
  assert.match(athenaHtml, /data-page="athena-picks"/);
  assert.match(athenaHtml, /Athena Transition Picks/);
  assert.match(athenaHtml, /id="athenaMarketFilter"/);
  assert.match(athenaHtml, /id="athenaConfidenceFilter"/);
  assert.match(portal, /function athenaConfidenceMatches/);
  assert.match(portal, /NO PICKS MATCH THESE FILTERS/);
  assert.match(bossRedirect, /location\.replace\("athena\.html"/);
  assert.match(portal, /\/api\/athena\/today/);
  assert.doesNotMatch(athenaHtml, /OMNI v2\.5\.2/);
});

test("current navigation points to Athena instead of Boss Picks", async () => {
  const projectRoot = resolve(new URL("../../", import.meta.url).pathname);
  const pages = [
    "index.html",
    "bankers.html",
    "live-fixtures.html",
    "results-intelligence.html",
    "responsible.html"
  ];
  for (const page of pages) {
    const html = await readFile(resolve(projectRoot, page), "utf8");
    assert.match(html, /href="athena\.html">Athena<\/a>/);
    assert.doesNotMatch(html, /href="boss-picks\.html">Boss Picks<\/a>/);
  }
});

test("public API exposes Athena and keeps only a compatibility Boss alias", async () => {
  const projectRoot = resolve(new URL("../../", import.meta.url).pathname);
  const routes = await readFile(resolve(projectRoot, "server/src/routes/publicRoutes.js"), "utf8");
  assert.match(routes, /publicRouter\.get\("\/athena\/today", athenaPicksHandler\)/);
  assert.match(routes, /publicRouter\.get\("\/boss-picks\/today", athenaPicksHandler\)/);
  assert.doesNotMatch(routes, /getBossPicks/);
});
