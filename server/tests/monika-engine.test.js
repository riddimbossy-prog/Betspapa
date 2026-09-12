import test from "node:test";
import assert from "node:assert/strict";
import { matchCompetition, runMonika, selectMonikaPick } from "../src/engine/monikaEngine.js";
import { parseBetExplorerHtml } from "../src/providers/betExplorer.js";

function fx(partial) {
  return {
    id: partial.id || "m1",
    kickoff: partial.kickoff || "2026-09-12T15:00:00.000Z",
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

test("Monika maps BetExplorer league names onto the 49-competition keys", () => {
  assert.equal(matchCompetition({ country: "China", league: "League One" }), "china-league-one");
  assert.equal(matchCompetition({ country: "Brazil", league: "Serie A Betano" }), "brazil-a");
  assert.equal(matchCompetition({ country: "Serbia", league: "Mozzart Bet Super Liga" }), "serbia");
  assert.equal(matchCompetition({ country: "Qatar", league: "QSL" }), "qatar");
  assert.equal(matchCompetition({ country: "USA", league: "MLS Next Pro" }), null);
  assert.equal(matchCompetition({ country: "Germany", league: "Bundesliga Women" }), null);
});

test("Guangdong GZ-Power is a China League One DC banker", () => {
  const pick = selectMonikaPick(fx({
    home: "Guangdong GZ-Power",
    away: "Yanbian Longding",
    country: "China",
    league: "League One",
    odds: { home: 1.55, draw: 3.6, away: 5.5, dc1x: 1.18, dc12: 1.22, dcx2: 2.2, over: 1.8, under: 1.95, ouLine: 2.5, bttsYes: 1.9, bttsNo: 1.8 }
  }));
  assert.equal(pick?.key, "dc-1x");
  assert.equal(pick?.step, 1);
});

test("Arsenal Premier League fixture is a moneyline lock", () => {
  const pick = selectMonikaPick(fx({
    home: "Arsenal",
    away: "Burnley",
    country: "England",
    league: "Premier League"
  }));
  assert.equal(pick?.key, "home");
  assert.equal(pick?.selection, "Arsenal Win");
});

test("runMonika fail-closes unknown leagues", () => {
  const picks = runMonika([
    fx({ home: "Arsenal", away: "Fulham", country: "England", league: "Premier League" }),
    fx({ home: "Random FC", away: "Other FC", country: "Faroe Islands", league: "Premier League" })
  ]);
  assert.equal(picks.length, 1);
});

test("parses BetExplorer homepage AJAX 1X2 rows", () => {
  const html = `
<ul class="leagues-list" data-country="china">
<li><a data-league-name="League One" data-country-name="China"></a></li>
<li data-event-id="GzTest01">
<ul class="table-main__matchInfo" data-dt="12,9,2026,15,00">
<div class="table-main__participantHome"><p>Guangdong GZ-Power</p></div>
<div class="table-main__participantAway"><p>Yanbian Longding</p></div>
<a href="/football/china/league-one/guangdong-yanbian/GzTest01/"></a>
<button data-odd="1.55"></button><button data-odd="3.60"></button><button data-odd="5.50"></button>
</ul>
</li>
</ul>`;
  const rows = parseBetExplorerHtml(html, "1x2");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].home, "Guangdong GZ-Power");
  assert.equal(rows[0].odds.home, 1.55);
});
