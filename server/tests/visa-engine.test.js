import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  VISA_ENGINE_NAME,
  VISA_ENGINE_VERSION,
  lossGrade,
  selectVisaPick,
  summarizeVisaForm,
  winGrade
} from "../src/engine/visaEngine.js";
import { venueHistoryForFixture, visaWeekDates } from "../src/services/visaPickService.js";
import { visaFromSportyMarkets } from "../src/providers/sportyBetOdds.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const source = (path) => readFile(resolve(root, path), "utf8");
const games = (scores) => scores.map(([ftFor, ftAgainst], index) => ({
  date: `2026-08-${String(20 - index).padStart(2, "0")}`,
  ftFor,
  ftAgainst
}));

const fatalLoss = games([[0, 2], [1, 3], [0, 1], [1, 2], [1, 1]]);
const strongAway = games([[2, 0], [1, 0], [2, 1], [1, 1], [0, 1]]);
const drawHeavyAway = games([[1, 0], [2, 1], [1, 1], [0, 0], [0, 1]]);

test("Visa has a stable public identity and exact 60/80/100 grades", () => {
  assert.equal(VISA_ENGINE_NAME, "Visa");
  assert.equal(VISA_ENGINE_VERSION, "visa-v1.0.0");
  assert.equal(lossGrade(0.6), 60);
  assert.equal(lossGrade(0.8), 80);
  assert.equal(lossGrade(1), 100);
  assert.equal(lossGrade(0.4), null);
  assert.equal(winGrade(0.6), 60);
  assert.equal(winGrade(0.8), 80);
  assert.equal(winGrade(1), 100);
});

test("Visa week supplies exactly seven ordered dates across month and year boundaries", () => {
  assert.deepEqual(visaWeekDates("2026-12-29"), [
    "2026-12-29",
    "2026-12-30",
    "2026-12-31",
    "2027-01-01",
    "2027-01-02",
    "2027-01-03",
    "2027-01-04"
  ]);
  assert.equal(visaWeekDates("2026-09-11", 20).length, 7);
  assert.throws(() => visaWeekDates("2026-02-30"), /valid ISO date/);
});

test("Visa summarises the last five only", () => {
  const summary = summarizeVisaForm(games([
    [0, 1], [0, 2], [1, 3], [0, 1], [1, 1], [6, 0]
  ]));
  assert.equal(summary.matches, 5);
  assert.equal(summary.losses, 4);
  assert.equal(summary.lossRate, 0.8);
  assert.equal(summary.lossGrade, 80);
  assert.equal(summary.formLine, "L-L-L-L-D");
});

test("an 80% loser against a sub-40% loser with a 60% win grade is denied a straight result", () => {
  const pick = selectVisaPick({
    homeName: "Weak Home",
    awayName: "Strong Away",
    homeGames: fatalLoss,
    awayGames: strongAway,
    odds: { away: 1.72 }
  });
  assert.equal(pick.available, true);
  assert.equal(pick.key, "away-win");
  assert.equal(pick.selection, "Strong Away Win");
  assert.equal(pick.odds, 1.72);
  assert.equal(pick.route, "loss-denial");
  assert.equal(pick.deniedTeam, "Weak Home");
  assert.equal(pick.homeVisa.lossGrade, 80);
  assert.equal(pick.awayVisa.winGrade, 60);
});

test("a low-loss opponent below the 60% win grade is protected with X2", () => {
  const pick = selectVisaPick({
    homeName: "Weak Home",
    awayName: "Draw Heavy",
    homeGames: fatalLoss,
    awayGames: drawHeavyAway,
    odds: { "draw-or-away": 1.31, away: 2.15 }
  });
  assert.equal(pick.available, true);
  assert.equal(pick.key, "draw-or-away");
  assert.equal(pick.selection, "Draw Heavy or Draw (X2)");
  assert.equal(pick.route, "protected-loss-denial");
});

test("protection falls back to DNB only when the exact double-chance price is absent", () => {
  const pick = selectVisaPick({
    homeName: "Weak Home",
    awayName: "Draw Heavy",
    homeGames: fatalLoss,
    awayGames: drawHeavyAway,
    odds: { "away-dnb": 1.47 }
  });
  assert.equal(pick.available, true);
  assert.equal(pick.key, "away-dnb");
  assert.equal(pick.selection, "Draw Heavy Draw No Bet");
});

test("dual 60% loss grades select Over 1.5 only with supporting totals and expectation", () => {
  const home = games([[0, 2], [1, 2], [0, 3], [2, 1], [1, 1]]);
  const away = games([[1, 3], [0, 2], [1, 2], [2, 1], [2, 2]]);
  const pick = selectVisaPick({ homeGames: home, awayGames: away, odds: { "over-15": 1.24 } });
  assert.equal(pick.available, true);
  assert.equal(pick.key, "over-15");
  assert.equal(pick.route, "dual-loss-goals");
  assert.ok(pick.expectedGoals.total >= 2);
});

test("dual 60% loss grades do not invent goals from repeated nil-one losses", () => {
  const lowEvent = games([[0, 1], [0, 1], [0, 1], [1, 0], [0, 0]]);
  const pick = selectVisaPick({
    homeGames: lowEvent,
    awayGames: lowEvent,
    odds: { "over-15": 1.35 }
  });
  assert.equal(pick.available, false);
  assert.match(pick.reasons[0], /loss frequency alone/i);
});

test("dual 60% win grades select GG only with scoring, conceding and GG confirmation", () => {
  const home = games([[2, 1], [3, 1], [2, 1], [1, 2], [1, 1]]);
  const away = games([[2, 1], [2, 1], [3, 2], [1, 2], [2, 2]]);
  const pick = selectVisaPick({ homeGames: home, awayGames: away, odds: { "btts-yes": 1.62 } });
  assert.equal(pick.available, true);
  assert.equal(pick.key, "gg-yes");
  assert.equal(pick.route, "dual-win-gg");
});

test("dual winners that keep clean sheets are not automatically labelled GG", () => {
  const clean = games([[1, 0], [2, 0], [1, 0], [0, 0], [0, 1]]);
  const pick = selectVisaPick({ homeGames: clean, awayGames: clean, odds: { "btts-yes": 1.8 } });
  assert.equal(pick.available, false);
  assert.match(pick.reasons[0], /does not approve GG/i);
});

test("40% opponent losses are not treated as strictly below 40%", () => {
  const fortyLoss = games([[2, 0], [2, 1], [1, 0], [0, 1], [0, 2]]);
  const pick = selectVisaPick({
    homeGames: fatalLoss,
    awayGames: fortyLoss,
    odds: { away: 1.62 }
  });
  assert.equal(pick.available, false);
  assert.match(pick.reasons[0], /No Visa route qualified/);
});

test("strict venue history ignores overall form, future rows and older sixth matches", () => {
  const fixture = {
    kickoff: "2026-09-10T15:00:00.000Z",
    season: 2026,
    league: { id: 7, season: 2026 },
    home: { id: 10 },
    away: { id: 20 }
  };
  const rows = [];
  for (let index = 1; index <= 6; index += 1) {
    rows.push({
      league_id: 7,
      season: 2026,
      fixture_date: `2026-08-${String(index).padStart(2, "0")}T15:00:00.000Z`,
      home_team_id: 10,
      away_team_id: 100 + index,
      fulltime_home: index,
      fulltime_away: 0
    });
    rows.push({
      league_id: 7,
      season: 2026,
      fixture_date: `2026-08-${String(index).padStart(2, "0")}T18:00:00.000Z`,
      home_team_id: 200 + index,
      away_team_id: 20,
      fulltime_home: 0,
      fulltime_away: index
    });
  }
  rows.push({ league_id: 7, season: 2026, fixture_date: "2026-09-11", home_team_id: 10, away_team_id: 20, fulltime_home: 9, fulltime_away: 9 });
  rows.push({ league_id: 7, season: 2026, fixture_date: "2026-08-31", home_team_id: 99, away_team_id: 10, fulltime_home: 0, fulltime_away: 9 });
  const history = venueHistoryForFixture(rows, fixture);
  assert.equal(history.homeGames.length, 5);
  assert.equal(history.awayGames.length, 5);
  assert.deepEqual(history.homeGames.map((row) => row.ftFor), [6, 5, 4, 3, 2]);
  assert.deepEqual(history.awayGames.map((row) => row.ftFor), [6, 5, 4, 3, 2]);
});

test("SportyBet Visa parser reads exact core and protection prices", () => {
  const odds = visaFromSportyMarkets([
    {
      id: 1,
      desc: "Match Result",
      outcomes: [{ id: 1, desc: "Home", odds: "1.80" }, { id: 3, desc: "Away", odds: "4.10" }]
    },
    {
      id: 18,
      desc: "Total Goals",
      specifier: "total=1.5",
      outcomes: [{ id: 12, desc: "Over", odds: "1.25" }]
    },
    {
      id: 29,
      desc: "Both Teams to Score",
      outcomes: [{ id: 74, desc: "Yes", odds: "1.66" }]
    },
    {
      id: 10,
      desc: "Double Chance",
      outcomes: [{ desc: "1X", odds: "1.20" }, { desc: "X2", odds: "1.42" }]
    },
    {
      id: 11,
      desc: "Draw No Bet",
      outcomes: [{ desc: "Home", odds: "1.31" }, { desc: "Away", odds: "2.70" }]
    }
  ]);
  assert.equal(odds.home, 1.8);
  assert.equal(odds.away, 4.1);
  assert.equal(odds["over-15"], 1.25);
  assert.equal(odds["btts-yes"], 1.66);
  assert.equal(odds["home-or-draw"], 1.2);
  assert.equal(odds["draw-or-away"], 1.42);
  assert.equal(odds["home-dnb"], 1.31);
  assert.equal(odds["away-dnb"], 2.7);
});

test("Betspapa exposes the Visa page, weekly preload, API, navigation and fresh PWA assets", async () => {
  const [html, client, css, routes, server, nav, sw, manifest, preload, workflow] = await Promise.all([
    source("visa.html"),
    source("assets/js/visa.v1270.js"),
    source("assets/css/visa.v1270.css"),
    source("server/src/routes/publicRoutes.js"),
    source("server/src/server.js"),
    source("assets/js/mobile-nav.v1240.js"),
    source("sw.js"),
    source("manifest.webmanifest"),
    source("scripts/preload-ppg-horizon.mjs"),
    source(".github/workflows/automatic-picks.yml")
  ]);
  assert.match(html, /data-page="visa"/);
  assert.match(html, /Loss grades: 60 · 80 · 100/);
  assert.match(html, /id="visaDateTabs"/);
  assert.match(html, /Week starts/);
  assert.match(client, /\/api\/visa\/week/);
  assert.match(client, /WEEK_LENGTH = 7/);
  assert.match(client, /homeVisa/);
  assert.match(css, /max-width: 470px/);
  assert.match(routes, /publicRouter\.get\("\/visa\/today"/);
  assert.match(routes, /publicRouter\.get\("\/visa\/week"/);
  assert.match(server, /visaEngineVersion/);
  assert.match(server, /visa: "\/api\/visa\/today"/);
  assert.match(server, /visaWeek: "\/api\/visa\/week"/);
  assert.match(nav, /visa\.html/);
  assert.match(sw, /betspapa-pwa-v1280/);
  assert.match(sw, /visa\.v1270\.js/);
  assert.match(sw, /visa\.html/);
  assert.match(manifest, /"version": "1\.28\.0"/);
  assert.match(preload, /HORIZON_DAYS = 7/);
  assert.match(preload, /\/api\/visa\/week/);
  assert.match(workflow, /Preload seven-day fixture horizon/);
});
