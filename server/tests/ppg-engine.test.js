import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PPG_ENGINE_NAME,
  PPG_ENGINE_VERSION,
  rankSplitTable,
  selectPpgPick
} from "../src/engine/ppgEngine.js";
import { choosePpgBoard } from "../src/services/ppgPickService.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const source = (path) => readFile(resolve(root, path), "utf8");

const topHome = { teamId: 1, rank: 1, tableSize: 10, played: 7, ppg: 2 };
const topAway = { teamId: 2, rank: 2, tableSize: 10, played: 7, ppg: 1.6 };
const bottomHome = { teamId: 3, rank: 9, tableSize: 10, played: 7, ppg: 0.86 };
const bottomAway = { teamId: 4, rank: 10, tableSize: 10, played: 7, ppg: 0.71 };

test("PPG has a stable public identity", () => {
  assert.equal(PPG_ENGINE_NAME, "PPG");
  assert.equal(PPG_ENGINE_VERSION, "ppg-v1.0.0");
});

test("split tables rank home and away records independently", () => {
  const rows = [
    { league_id: 7, season: 2026, fixture_date: "2026-08-01", home_team_id: 1, away_team_id: 4, fulltime_home: 2, fulltime_away: 0 },
    { league_id: 7, season: 2026, fixture_date: "2026-08-02", home_team_id: 2, away_team_id: 3, fulltime_home: 0, fulltime_away: 1 },
    { league_id: 7, season: 2026, fixture_date: "2026-08-03", home_team_id: 3, away_team_id: 2, fulltime_home: 1, fulltime_away: 1 },
    { league_id: 7, season: 2026, fixture_date: "2026-08-04", home_team_id: 4, away_team_id: 1, fulltime_home: 0, fulltime_away: 3 }
  ];
  const home = rankSplitTable(rows, { leagueId: 7, season: 2026, cutoff: Date.parse("2026-09-01"), venue: "home" });
  const away = rankSplitTable(rows, { leagueId: 7, season: 2026, cutoff: Date.parse("2026-09-01"), venue: "away" });
  assert.equal(home[0].teamId, 1);
  assert.equal(home[0].ppg, 3);
  assert.equal(away[0].teamId, 1);
  assert.equal(away[0].ppg, 3);
  assert.equal(home.find((row) => row.teamId === 2).ppg, 0);
  assert.equal(away.find((row) => row.teamId === 2).ppg, 1);
});

test("top-3 versus bottom-3 publishes the strong win at exact boundary odds", () => {
  const pick = selectPpgPick({
    homeName: "Strong Home",
    awayName: "Weak Away",
    homeStanding: topHome,
    awayStanding: bottomAway,
    odds: { home: 1.55, away: 5 }
  });
  assert.equal(pick.available, true);
  assert.equal(pick.key, "home-win");
  assert.equal(pick.selection, "Strong Home Win");
  assert.equal(pick.odds, 1.55);
  assert.equal(pick.route, "top-3-v-bottom-3");
});

test("PPG rejects a favourite above 1.55 or an underdog below 5.00", () => {
  const favouriteTooLong = selectPpgPick({
    homeStanding: topHome,
    awayStanding: bottomAway,
    odds: { home: 1.56, away: 6 }
  });
  const underdogTooShort = selectPpgPick({
    homeStanding: topHome,
    awayStanding: bottomAway,
    odds: { home: 1.5, away: 4.99 }
  });
  assert.equal(favouriteTooLong.available, false);
  assert.match(favouriteTooLong.reasons[0], /1\.55/);
  assert.equal(underdogTooShort.available, false);
  assert.match(underdogTooShort.reasons[0], /5\.00/);
});

test("weak PPG must be strictly below 1.00", () => {
  const pick = selectPpgPick({
    homeStanding: topHome,
    awayStanding: { ...bottomAway, ppg: 1 },
    odds: { home: 1.4, away: 7 }
  });
  assert.equal(pick.available, false);
});

test("two bottom-3 sides below 1.00 PPG publish Under 2.5", () => {
  const pick = selectPpgPick({
    homeStanding: bottomHome,
    awayStanding: bottomAway,
    odds: { "under-25": 1.74 }
  });
  assert.equal(pick.available, true);
  assert.equal(pick.key, "under-25");
  assert.equal(pick.selection, "Under 2.5 Goals");
  assert.equal(pick.odds, 1.74);
});

test("two top-3 sides above 1.50 PPG publish Over 1.5", () => {
  const pick = selectPpgPick({
    homeStanding: { ...topHome, ppg: 1.51 },
    awayStanding: topAway,
    odds: { "over-15": 1.26 }
  });
  assert.equal(pick.available, true);
  assert.equal(pick.key, "over-15");
  assert.equal(pick.selection, "Over 1.5 Goals");
});

test("top-pair PPG must be strictly above 1.50", () => {
  const pick = selectPpgPick({
    homeStanding: { ...topHome, ppg: 1.5 },
    awayStanding: topAway,
    odds: { "over-15": 1.26 }
  });
  assert.equal(pick.available, false);
});

test("missing SportyBet market odds fail closed", () => {
  const pick = selectPpgPick({
    homeStanding: bottomHome,
    awayStanding: bottomAway,
    odds: {}
  });
  assert.equal(pick.available, false);
  assert.match(pick.reasons[0], /SportyBet Under 2\.5/);
});

test("PPG rolls to the next board only when it has qualified picks", () => {
  const first = { date: "2026-09-08", reviewedFixtures: 20, pickCount: 0, picks: [] };
  const second = { date: "2026-09-09", reviewedFixtures: 15, pickCount: 2, picks: [{}, {}] };
  const selected = choosePpgBoard(first, second, first.date);
  assert.equal(selected.date, second.date);
  assert.equal(selected.rolledForward, true);
  assert.equal(selected.requestedDate, first.date);
});

test("Betspapa exposes the PPG page, API, navigation and fresh PWA assets", async () => {
  const [html, client, routes, server, nav, sw] = await Promise.all([
    source("ppg.html"),
    source("assets/js/ppg.v1264.js"),
    source("server/src/routes/publicRoutes.js"),
    source("server/src/server.js"),
    source("assets/js/mobile-nav.v1240.js"),
    source("sw.js")
  ]);
  assert.match(html, /data-page="ppg"/);
  assert.match(html, />PPG</);
  assert.match(client, /\/api\/ppg\/today/);
  assert.match(routes, /publicRouter\.get\("\/ppg\/today"/);
  assert.match(server, /ppgEngineVersion/);
  assert.match(server, /ppg: "\/api\/ppg\/today"/);
  assert.match(nav, /ppg\.html/);
  assert.match(sw, /betspapa-pwa-v1264/);
  assert.match(sw, /ppg\.v1264\.js/);
  assert.match(sw, /ppg\.html/);
});
