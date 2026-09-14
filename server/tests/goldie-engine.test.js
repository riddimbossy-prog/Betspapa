import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GOLDIE_ENGINE_NAME,
  GOLDIE_ENGINE_VERSION,
  GOLDIE_MIN_HIT_RATE,
  GOLDIE_RULES,
  isBanned,
  matchCompetition,
  namesMatch,
  runGoldie,
  selectGoldiePicks
} from "../src/engine/goldieEngine.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const source = (path) => readFile(resolve(root, path), "utf8");

function fx(partial) {
  return {
    id: partial.id || "g1",
    kickoff: partial.kickoff || "2026-09-14T15:00:00.000Z",
    url: partial.url || "https://www.betexplorer.com/football/x/",
    home: partial.home,
    away: partial.away,
    country: partial.country,
    league: partial.league,
    odds: {
      home: 1.9,
      draw: 3.4,
      away: 4.0,
      dc1x: 1.25,
      dc12: 1.3,
      dcx2: 1.85,
      over: 1.7,
      under: 2.1,
      ouLine: 2.5,
      bttsYes: 1.8,
      bttsNo: 1.95,
      ...(partial.odds || {})
    }
  };
}

test("Goldie keeps an 80% floor and never encodes Home or away", () => {
  assert.equal(GOLDIE_ENGINE_NAME, "Goldie");
  assert.equal(GOLDIE_ENGINE_VERSION, "goldie-v1.0.0-playbook-80");
  assert.equal(GOLDIE_MIN_HIT_RATE, 80);
  assert.ok(GOLDIE_RULES.length >= 220);
  assert.ok(GOLDIE_RULES.every((rule) => rule.hitRate >= 80));
  assert.ok(GOLDIE_RULES.every((rule) => !/12|home or away/i.test(rule.type)));
  assert.ok(GOLDIE_RULES.every((rule) => rule.id !== "52"));
  assert.equal(isBanned("dc-12", "DC 12"), true);
  assert.equal(isBanned("dc-1x", "Home DC 1X"), false);
});

test("Goldie maps BetExplorer leagues onto playbook competitions", () => {
  assert.equal(matchCompetition({ country: "Netherlands", league: "Keuken Kampioen Divisie" }), "eerste");
  assert.equal(matchCompetition({ country: "Netherlands", league: "Eerste Divisie" }), "eerste");
  assert.equal(matchCompetition({ country: "Ukraine", league: "Persha Liga" }), "ukraine-persha");
  assert.equal(matchCompetition({ country: "Turkey", league: "1. Lig" }), "turkey-1-lig");
  assert.equal(matchCompetition({ country: "Sweden", league: "Allsvenskan" }), "allsvenskan");
  assert.equal(matchCompetition({ country: "Norway", league: "Eliteserien" }), "eliteserien");
  assert.equal(matchCompetition({ country: "England", league: "Premier League" }), "epl");
  assert.equal(matchCompetition({ country: "Italy", league: "Serie A" }), "serie-a");
  assert.ok(namesMatch("LASK Linz", ["lask linz", "lask"]));
  assert.ok(namesMatch("VVV-Venlo", ["vvv venlo", "vvv"]));
});

test("Heracles moneyline and Over 2.5 both publish; 12 never does", () => {
  const picks = selectGoldiePicks(fx({
    home: "Heracles Almelo",
    away: "TOP Oss",
    country: "Netherlands",
    league: "Eerste Divisie",
    odds: { home: 1.45, draw: 4.2, away: 6.5, dc1x: 1.12, dc12: 1.18, dcx2: 2.4, over: 1.55, under: 2.4, ouLine: 2.5, bttsYes: 1.7 }
  }));
  assert.ok(picks.some((p) => p.key === "home" && p.selection.includes("Heracles")));
  assert.ok(picks.some((p) => p.key === "over-25"));
  assert.ok(picks.some((p) => p.key === "dc-1x"), "fade TOP Oss when they are away is 1X");
  assert.ok(picks.every((p) => p.key !== "dc-12"));
  assert.ok(picks.every((p) => !/\b12\b/.test(p.selection)));
  assert.ok(picks.every((p) => p.hitRate >= 80));
});

test("Fade lock uses 1X when the weak side is away, X2 when the weak side is home", () => {
  const awayWeak = selectGoldiePicks(fx({
    home: "Helmond Sport",
    away: "TOP Oss",
    country: "Netherlands",
    league: "Eerste Divisie"
  }));
  assert.ok(awayWeak.some((p) => p.key === "dc-1x"));
  assert.ok(awayWeak.every((p) => p.key !== "dc-12"));

  const homeWeak = selectGoldiePicks(fx({
    home: "TOP Oss",
    away: "Helmond Sport",
    country: "Netherlands",
    league: "Eerste Divisie"
  }));
  assert.ok(homeWeak.some((p) => p.key === "dc-x2"));
  assert.ok(homeWeak.every((p) => p.key !== "dc-12"));
});

test("Over 1.5 is not rewritten to Over 2.5 when only 2.5 is listed", () => {
  const picks = selectGoldiePicks(fx({
    home: "Helmond Sport",
    away: "FC Eindhoven",
    country: "Netherlands",
    league: "Eerste Divisie",
    odds: { ouLine: 2.5, over: 1.6, under: 2.2 }
  }));
  const over15 = picks.find((p) => p.selection === "Over 1.5");
  assert.ok(over15);
  assert.equal(over15.key, "over-15");
  assert.equal(over15.odds, 0);
  assert.ok(picks.every((p) => p.selection !== "Over 2.5" || p.key === "over-25"));
});

test("League Over 1.5 with a draw-odds gate does not fire when the draw is short", () => {
  const gated = selectGoldiePicks(fx({
    home: "Random Eerste",
    away: "Other Eerste",
    country: "Netherlands",
    league: "Eerste Divisie",
    odds: { home: 2.1, draw: 3.2, away: 3.4, ouLine: 1.5, over: 1.22, under: 4.0 }
  }));
  const over15 = gated.filter((p) => p.key === "over-15");
  assert.ok(over15.every((p) => p.ruleId !== "75"));
  assert.ok(over15.some((p) => p.ruleId === "111"));
});

test("Unknown leagues, Serie A without standings, and incomplete 1X2 fail closed", () => {
  const picks = runGoldie([
    fx({ home: "Arsenal", away: "Burnley", country: "England", league: "Premier League" }),
    fx({ home: "Inter", away: "Lecce", country: "Italy", league: "Serie A", odds: { home: 1.4, draw: 4.4, away: 8.0 } }),
    fx({ home: "Random FC", away: "Other FC", country: "Faroe Islands", league: "Premier League" }),
    fx({ home: "Arsenal", away: "Fulham", country: "England", league: "Premier League", odds: { home: 0, draw: 0, away: 0 } })
  ]);
  assert.ok(picks.every((p) => p.home === "Arsenal"));
  assert.ok(picks.every((p) => p.key !== "dc-12"));
  assert.ok(picks.every((p) => p.league !== "Serie A"));
});

test("Home favourite DC 1X requires the listed home price", () => {
  const yes = selectGoldiePicks(fx({
    home: "RB Salzburg",
    away: "WSG Tirol",
    country: "Austria",
    league: "Bundesliga",
    odds: { home: 1.4, draw: 4.5, away: 7.0, dc1x: 1.1, dc12: 1.2, dcx2: 2.8 }
  }));
  assert.ok(yes.some((p) => p.key === "dc-1x"));
  const no = selectGoldiePicks(fx({
    home: "WSG Tirol",
    away: "Austria Vienna",
    country: "Austria",
    league: "Bundesliga",
    odds: { home: 2.4, draw: 3.3, away: 2.9, dc1x: 1.4, dc12: 1.3, dcx2: 1.5 }
  }));
  assert.ok(no.every((p) => p.ruleId !== "40"));
});

test("Title-club moneylines do not both fire on a clash", () => {
  const picks = selectGoldiePicks(fx({
    home: "Arsenal",
    away: "Manchester City",
    country: "England",
    league: "Premier League",
    odds: { home: 2.2, draw: 3.4, away: 3.1 }
  }));
  assert.ok(picks.every((p) => p.key !== "home" && p.key !== "away"));
});

test("LASK Linz moneyline still qualifies under the Austrian lock", () => {
  const picks = selectGoldiePicks(fx({
    home: "LASK Linz",
    away: "WSG Tirol",
    country: "Austria",
    league: "Bundesliga",
    odds: { home: 1.55, draw: 4.0, away: 5.5 }
  }));
  assert.ok(picks.some((p) => p.key === "home" && /LASK/i.test(p.selection)));
});

test("Goldie is the public homepage and live BetExplorer board", async () => {
  const [html, goldiePage, client, routes, server] = await Promise.all([
    source("index.html"),
    source("goldie.html"),
    source("assets/js/screens-app.js"),
    source("server/src/routes/publicRoutes.js"),
    source("server/src/server.js")
  ]);
  assert.match(html, /BETSPAPA_START="goldie"/);
  assert.match(goldiePage, /BETSPAPA_START="goldie"/);
  assert.match(client, /\/api\/goldie\/today/);
  assert.match(client, /function renderGoldie/);
  assert.match(client, /name: "goldie"/);
  assert.match(routes, /publicRouter\.get\("\/goldie\/today"/);
  assert.match(server, /goldie: "\/api\/goldie\/today"/);
  assert.doesNotMatch(client, /dc-12 floor|DC 12/);
});
