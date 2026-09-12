import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  VISA_ENGINE_NAME,
  VISA_ENGINE_VERSION,
  lossGrade,
  normaliseVisaStanding,
  selectVisaPick,
  summarizeVisaForm,
  winGrade
} from "../src/engine/visaEngine.js";
import {
  splitStandingsForFixture,
  venueHistoryForFixture,
  visaWeekDates
} from "../src/services/visaPickService.js";
import { visaFromSportyMarkets } from "../src/providers/sportyBetOdds.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const source = (path) => readFile(resolve(root, path), "utf8");
const games = (scores) => scores.map(([ftFor, ftAgainst], index) => ({
  date: `2026-08-${String(20 - index).padStart(2, "0")}`,
  ftFor,
  ftAgainst
}));
const standing = (rank, tableSize = 12, venue = "home", played = 8) => ({
  teamId: rank,
  rank,
  tableSize,
  played,
  points: 12,
  gf: 10,
  ga: 8,
  gd: 2,
  ppg: 1.5,
  venue
});

const neutralHome = games([[1, 0], [0, 0], [1, 1], [0, 1], [1, 1]]);
const neutralAway = games([[1, 1], [0, 0], [1, 0], [0, 1], [1, 1]]);

function visa(overrides = {}) {
  return selectVisaPick({
    homeName: "Home Club",
    awayName: "Away Club",
    homeGames: neutralHome,
    awayGames: neutralAway,
    homeStanding: standing(6, 12, "home"),
    awayStanding: standing(7, 12, "away"),
    odds: {},
    ...overrides
  });
}

test("Visa v2 keeps the public identity and exact 60/80/100 display grades", () => {
  assert.equal(VISA_ENGINE_NAME, "Visa");
  assert.equal(VISA_ENGINE_VERSION, "visa-v2.1.0");
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

test("split standing zones use inclusive top/bottom boundaries", () => {
  assert.equal(normaliseVisaStanding(standing(3)).top3, true);
  assert.equal(normaliseVisaStanding(standing(4)).top4, true);
  assert.equal(normaliseVisaStanding(standing(5)).top4, false);
  assert.equal(normaliseVisaStanding(standing(6)).top6, true);
  assert.equal(normaliseVisaStanding(standing(6)).outsideTop6, false);
  assert.equal(normaliseVisaStanding(standing(7)).outsideTop6, true);
  assert.equal(normaliseVisaStanding(standing(7)).bottom6, true);
  assert.equal(normaliseVisaStanding(standing(6)).bottom6, false);
  assert.equal(normaliseVisaStanding(standing(10)).bottom3, true);
});

test("Top 4 Win accepts rank four at the exact 1.52 boundary against a weaker opponent", () => {
  const pick = visa({
    homeStanding: standing(4, 12, "home"),
    awayStanding: standing(7, 12, "away"),
    odds: { home: 1.52 }
  });
  assert.equal(pick.available, true);
  assert.equal(pick.key, "home-win");
  assert.equal(pick.route, "split-top-4-win");
  assert.equal(pick.odds, 1.52);
  assert.equal(pick.homeVisa.splitStanding.rank, 4);
});

test("Top 4 Win rejects odds above 1.52", () => {
  const priceFail = visa({
    homeStanding: standing(4, 12, "home"),
    awayStanding: standing(7, 12, "away"),
    odds: { home: 1.53 }
  });
  assert.equal(priceFail.available, false);
  assert.match(priceFail.reasons[0], /above the 1\.52/i);

  const fractionalPriceFail = visa({
    homeStanding: standing(4, 12, "home"),
    awayStanding: standing(7, 12, "away"),
    odds: { home: 1.524 }
  });
  assert.equal(fractionalPriceFail.available, false);
});

test("Top 4 against a competitive top-six split team is reduced to exact DNB", () => {
  const pick = visa({
    homeStanding: standing(4, 12, "home"),
    awayStanding: standing(6, 12, "away"),
    odds: { home: 1.4, "home-dnb": 1.22 }
  });
  assert.equal(pick.available, true);
  assert.equal(pick.key, "home-dnb");
  assert.equal(pick.selection, "Home Club Draw No Bet");
  assert.equal(pick.market, "Draw No Bet");
  assert.equal(pick.route, "split-top-4-dnb");
  assert.equal(pick.odds, 1.22);
});

test("Top 4 competitive route never substitutes a straight win when DNB is missing", () => {
  const pick = visa({
    homeStanding: standing(4, 12, "home"),
    awayStanding: standing(6, 12, "away"),
    odds: { home: 1.4 }
  });
  assert.equal(pick.available, false);
  assert.match(pick.reasons[0], /Draw No Bet price is missing/i);
});

test("Top 4 DNB mirrors correctly for a competitive away side", () => {
  const pick = visa({
    homeStanding: standing(5, 12, "home"),
    awayStanding: standing(3, 12, "away"),
    odds: { away: 1.95, "away-dnb": 1.36 }
  });
  assert.equal(pick.available, true);
  assert.equal(pick.key, "away-dnb");
  assert.equal(pick.selection, "Away Club Draw No Bet");
  assert.equal(pick.route, "split-top-4-dnb");
});

test("rank five is not promoted into the Top 4 route", () => {
  const pick = visa({
    homeStanding: standing(5, 12, "home"),
    awayStanding: standing(7, 12, "away"),
    odds: { home: 1.4 }
  });
  assert.equal(pick.available, false);
});

test("Top 4 Win mirrors correctly for the away team", () => {
  const pick = visa({
    homeStanding: standing(8, 12, "home"),
    awayStanding: standing(4, 12, "away"),
    odds: { away: 1.5 }
  });
  assert.equal(pick.available, true);
  assert.equal(pick.key, "away-win");
  assert.equal(pick.selection, "Away Club Win");
  assert.equal(pick.route, "split-top-4-win");
});

test("Bottom 3 Loss opposes either the home or away bottom-three side", () => {
  const awayBottom = visa({
    homeStanding: standing(7, 12, "home"),
    awayStanding: standing(10, 12, "away"),
    odds: { home: 1.88 }
  });
  assert.equal(awayBottom.available, true);
  assert.equal(awayBottom.key, "home-win");
  assert.equal(awayBottom.route, "bottom-3-opponent-win");

  const homeBottom = visa({
    homeStanding: standing(10, 12, "home"),
    awayStanding: standing(7, 12, "away"),
    odds: { away: 2.05 }
  });
  assert.equal(homeBottom.available, true);
  assert.equal(homeBottom.key, "away-win");
  assert.equal(homeBottom.selection, "Away Club Win");
  assert.equal(homeBottom.route, "bottom-3-opponent-win");
});

test("Bottom 3 Loss skips a bottom-three versus bottom-three conflict", () => {
  const pick = visa({
    homeStanding: standing(10, 12, "home"),
    awayStanding: standing(11, 12, "away"),
    odds: { home: 1.8, away: 2.4 }
  });
  assert.equal(pick.available, false);
  assert.match(pick.reasons[0], /Both teams are bottom three/i);
});

test("a 2.2 away GA average selects home to score 2+ instead of Home Win", () => {
  const away = games([[1, 3], [2, 2], [1, 3], [1, 2], [2, 1]]);
  const pick = visa({ awayGames: away, odds: { home: 1.75, "home-over-15": 1.68 } });
  assert.equal(pick.available, true);
  assert.equal(pick.key, "home-over-15");
  assert.equal(pick.selection, "Home Club to Score 2+");
  assert.equal(pick.route, "away-concede-home-two");
  assert.equal(pick.odds, 1.68);
  assert.equal(pick.sureVisa, false);
  assert.equal(pick.awayVisa.gaAverage, 2.2);
});

test("Away Loss route qualifies from an 80% away loss rate by itself", () => {
  const away = games([[0, 1], [0, 1], [0, 1], [0, 1], [1, 0]]);
  const pick = visa({ awayGames: away, odds: { home: 1.66 } });
  assert.equal(pick.available, true);
  assert.equal(pick.route, "away-loss-home-win");
  assert.equal(pick.sureVisa, false);
  assert.equal(pick.awayVisa.lossRate, 0.8);
});

test("2.2 away GA plus 80% away losses makes home to score 2+ Sure Visa", () => {
  const away = games([[0, 3], [1, 2], [0, 3], [1, 3], [1, 1]]);
  const pick = visa({ awayGames: away, odds: { home: 1.72, "home-over-15": 1.59 } });
  assert.equal(pick.available, true);
  assert.equal(pick.key, "home-over-15");
  assert.equal(pick.selection, "Home Club to Score 2+");
  assert.equal(pick.route, "away-concede-home-two");
  assert.equal(pick.visaStatus, "SURE VISA");
  assert.equal(pick.tier, "SURE VISA");
  assert.equal(pick.awayVisa.lossRate, 0.8);
  assert.ok(pick.awayVisa.gaAverage >= 2.2);
});

test("the 2.2 route never substitutes Home Win when its team-total price is missing", () => {
  const away = games([[1, 3], [2, 2], [1, 3], [1, 2], [2, 1]]);
  const pick = visa({ awayGames: away, odds: { home: 1.75 } });
  assert.equal(pick.available, false);
  assert.match(pick.reasons[0], /home-team Over 1\.5 price is missing/i);
});

test("Home Power qualifies from a 2.3+ scoring average or a win rate above 80%", () => {
  const scoringHome = games([[3, 2], [3, 3], [2, 2], [2, 1], [2, 2]]);
  const scoringPick = visa({ homeGames: scoringHome, odds: { home: 1.7 } });
  assert.equal(scoringPick.available, true);
  assert.equal(scoringPick.route, "home-power-win");
  assert.equal(scoringPick.sureVisa, false);
  assert.ok(scoringPick.homeVisa.gfAverage >= 2.3);

  const perfectHome = games([[1, 0], [1, 0], [1, 0], [1, 0], [1, 0]]);
  const winPick = visa({ homeGames: perfectHome, odds: { home: 1.61 } });
  assert.equal(winPick.available, true);
  assert.equal(winPick.route, "home-power-win");
  assert.equal(winPick.sureVisa, false);
  assert.equal(winPick.homeVisa.winRate, 1);
});

test("Home Power becomes Sure Visa when both home triggers pass", () => {
  const home = games([[3, 1], [3, 0], [2, 0], [2, 1], [2, 0]]);
  const pick = visa({ homeGames: home, odds: { home: 1.48 } });
  assert.equal(pick.available, true);
  assert.equal(pick.route, "home-power-win");
  assert.equal(pick.visaStatus, "SURE VISA");
  assert.equal(pick.homeVisa.winRate, 1);
  assert.ok(pick.homeVisa.gfAverage >= 2.3);
});

test("exactly 80% home wins does not pass the more-than-80% Home Power gate", () => {
  const home = games([[1, 0], [1, 0], [1, 0], [1, 0], [0, 0]]);
  const pick = visa({ homeGames: home, odds: { home: 1.5 } });
  assert.equal(pick.homeVisa.winRate, 0.8);
  assert.equal(pick.available, false);
});

test("Over 2.5 accepts exact 2.2 scoring and conceding averages", () => {
  const home = games([[1, 2], [1, 2], [1, 2], [1, 2], [1, 3]]);
  const away = games([[2, 1], [2, 1], [2, 1], [2, 1], [3, 1]]);
  const pick = visa({
    homeGames: home,
    awayGames: away,
    homeStanding: standing(6, 12, "home"),
    awayStanding: standing(7, 12, "away"),
    odds: { "over-25": 1.74 }
  });
  assert.equal(pick.available, true);
  assert.equal(pick.key, "over-25");
  assert.equal(pick.route, "high-goal-over-25");
  assert.equal(pick.homeVisa.gaAverage, 2.2);
  assert.equal(pick.awayVisa.gfAverage, 2.2);
});

test("Over 2.5 excludes top-five pairs and bottom-three pairs", () => {
  const home = games([[1, 2], [1, 2], [1, 2], [1, 2], [1, 3]]);
  const away = games([[2, 1], [2, 1], [2, 1], [2, 1], [3, 1]]);
  const topPair = visa({
    homeGames: home,
    awayGames: away,
    homeStanding: standing(4, 12, "home"),
    awayStanding: standing(5, 12, "away"),
    odds: { "over-25": 1.74 }
  });
  assert.equal(topPair.available, false);

  const bottomPair = visa({
    homeGames: home,
    awayGames: away,
    homeStanding: standing(10, 12, "home"),
    awayStanding: standing(11, 12, "away"),
    odds: { "over-25": 1.74 }
  });
  assert.equal(bottomPair.available, false);
});

test("Over 2.5 fails closed without its exact SportyBet price", () => {
  const home = games([[1, 2], [1, 2], [1, 2], [1, 2], [1, 3]]);
  const away = games([[2, 1], [2, 1], [2, 1], [2, 1], [3, 1]]);
  const pick = visa({ homeGames: home, awayGames: away });
  assert.equal(pick.available, false);
  assert.match(pick.reasons[0], /exact SportyBet Over 2\.5 price is missing/i);
});

test("venue-average routes require five home and five away matches", () => {
  const high = games([[4, 0], [4, 0], [4, 0], [4, 0]]);
  const pick = visa({ homeGames: high, odds: { home: 1.4 } });
  assert.equal(pick.available, false);
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

test("Visa resolves the relevant home and away split standings at kickoff", () => {
  const rows = [];
  for (let index = 1; index <= 7; index += 1) {
    rows.push({
      league_id: 7,
      season: 2026,
      fixture_date: `2026-08-${String(index).padStart(2, "0")}T12:00:00.000Z`,
      home_team_id: index,
      away_team_id: 100 + index,
      fulltime_home: index === 1 ? 3 : 0,
      fulltime_away: index === 1 ? 0 : 1
    });
    rows.push({
      league_id: 7,
      season: 2026,
      fixture_date: `2026-08-${String(index + 7).padStart(2, "0")}T12:00:00.000Z`,
      home_team_id: 200 + index,
      away_team_id: index,
      fulltime_home: index === 7 ? 2 : 0,
      fulltime_away: index === 7 ? 0 : 1
    });
  }
  // Repeat enough completed rounds to clear the five-played safety floor.
  const repeated = Array.from({ length: 5 }, (_, round) => rows.map((row) => ({
    ...row,
    fixture_date: `2026-0${round + 1}-${String(new Date(row.fixture_date).getUTCDate()).padStart(2, "0")}T12:00:00.000Z`
  }))).flat();
  const fixture = {
    kickoff: "2026-09-10T15:00:00.000Z",
    season: 2026,
    league: { id: 7, season: 2026 },
    home: { id: 1 },
    away: { id: 7 }
  };
  const split = splitStandingsForFixture(repeated, fixture);
  assert.equal(split.homeStanding.rank, 1);
  assert.ok(split.awayStanding.rank > 6);
  assert.equal(split.homeStanding.played, 5);
  assert.equal(split.awayStanding.played, 5);
});

test("SportyBet Visa parser reads exact 1X2, DNB, team-total and Over 2.5 prices", () => {
  const odds = visaFromSportyMarkets([
    {
      id: 1,
      desc: "Match Result",
      outcomes: [{ id: 1, desc: "Home", odds: "1.80" }, { id: 3, desc: "Away", odds: "4.10" }]
    },
    {
      id: 18,
      desc: "Total Goals",
      specifier: "total=2.5",
      outcomes: [{ id: 12, desc: "Over", odds: "1.75" }]
    },
    {
      id: 19,
      desc: "Home Team Total Goals",
      specifier: "total=1.5",
      outcomes: [{ id: 12, desc: "Over", odds: "1.62" }]
    },
    {
      id: 11,
      desc: "Draw No Bet",
      outcomes: [{ id: 1, desc: "Home", odds: "1.24" }, { id: 3, desc: "Away", odds: "2.75" }]
    }
  ]);
  assert.equal(odds.home, 1.8);
  assert.equal(odds.away, 4.1);
  assert.equal(odds["over-25"], 1.75);
  assert.equal(odds["home-over-15"], 1.62);
  assert.equal(odds["home-dnb"], 1.24);
  assert.equal(odds["away-dnb"], 2.75);
});

test("Betspapa exposes Visa v2.1, seven phone-app date tabs and fresh PWA assets", async () => {
  const [html, client, css, routes, server, nav, sw, manifest, preload, workflow, service, engine] = await Promise.all([
    source("visa.html"),
    source("assets/js/screens-app.js"),
    source("assets/css/screens-app.css"),
    source("server/src/routes/publicRoutes.js"),
    source("server/src/server.js"),
    source("assets/js/mobile-nav.v1240.js"),
    source("sw.js"),
    source("manifest.webmanifest"),
    source("scripts/preload-ppg-horizon.mjs"),
    source(".github/workflows/automatic-picks.yml"),
    source("server/src/services/visaPickService.js"),
    source("server/src/engine/visaEngine.js")
  ]);
  assert.match(html, /BETSPAPA_START="visa"/);
  assert.match(html, /screens-app\.js\?v=20260912h/);
  assert.match(client, /\/api\/visa\/week/);
  assert.match(client, /days=7/);
  assert.match(client, /data-visa-date/);
  assert.match(client, /function renderVisa/);
  assert.match(client, /SportyBet/);
  assert.match(client, /sportybet\.com\/gh/);
  assert.match(client, /\/api\/sportybet\/upcoming/);
  assert.match(client, /name: "visa"/);
  assert.doesNotMatch(client, /\/api\/fixtures\/today/);
  assert.match(css, /\.tabs/);
  assert.match(css, /\.tab\.on/);
  assert.match(routes, /publicRouter\.get\("\/visa\/today"/);
  assert.match(routes, /publicRouter\.get\("\/visa\/week"/);
  assert.match(routes, /publicRouter\.get\("\/sportybet\/upcoming"/);
  assert.match(server, /visaEngineVersion/);
  assert.match(server, /visa: "\/api\/visa\/today"/);
  assert.match(server, /visaWeek: "\/api\/visa\/week"/);
  assert.match(server, /sportybetUpcoming: "\/api\/sportybet\/upcoming"/);
  assert.match(nav, /visa\.html/);
  assert.match(sw, /betspapa-screens-20260912h/);
  assert.match(sw, /screens-app\.js/);
  assert.match(manifest, /"version": "1\.29\.1"/);
  assert.match(preload, /HORIZON_DAYS = 7/);
  assert.match(preload, /\/api\/visa\/week/);
  assert.match(workflow, /Preload seven-day fixture horizon/);
  assert.match(service, /rankSplitTable/);
  assert.match(service, /competitiveOpponentMarket: "draw-no-bet"/);
  assert.match(engine, /split-top-4-dnb/);
  assert.match(engine, /bottom-3-opponent-win/);
  assert.ok(
    workflow.indexOf("Preload seven-day fixture horizon") <
      workflow.indexOf("Run automatic fixture and prediction pipeline")
  );
});
