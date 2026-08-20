import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { buildTopFiveClashFlag, rankLeagueTable } from "../src/engine/topFiveClashFlag.js";
import { collectRedFlags } from "../src/services/fixtureRiskService.js";
import { createEngineBoardSnapshot } from "../src/services/boardSnapshotService.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

function match(id, home, away, homeGoals, awayGoals, date) {
  return {
    id,
    league_id: 1,
    season: 2026,
    fixture_date: date,
    home_team_id: home,
    away_team_id: away,
    fulltime_home: homeGoals,
    fulltime_away: awayGoals,
    status: "FT"
  };
}

test("table ranks teams by points and goal difference", () => {
  const rows = [
    match(1, 10, 20, 4, 0, "2026-08-01T15:00:00.000Z"),
    match(2, 11, 20, 1, 0, "2026-08-02T15:00:00.000Z"),
    match(3, 12, 20, 3, 1, "2026-08-03T15:00:00.000Z"),
    match(4, 13, 21, 1, 0, "2026-08-04T15:00:00.000Z"),
    match(5, 14, 21, 2, 2, "2026-08-05T15:00:00.000Z")
  ];
  const table = rankLeagueTable(rows, { leagueId: 1, season: 2026, cutoff: Date.parse("2026-08-10T00:00:00.000Z") });
  assert.equal(table[0].teamId, 10);
  assert.ok(table.find((row) => row.teamId === 10).points >= 3);
});

test("two top-five teams after five games get red flag 2", () => {
  const rows = [];
  let id = 1;
  const teams = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  for (const home of teams) {
    for (const away of teams) {
      if (home === away) continue;
      const homeWin = home <= 5;
      rows.push(match(id++, home, away, homeWin ? 2 : 0, homeWin ? 0 : 1, "2026-07-01T15:00:00.000Z"));
    }
  }
  const table = rankLeagueTable(rows, { leagueId: 1, season: 2026, cutoff: Date.parse("2026-08-20T00:00:00.000Z") });
  const home = table.find((row) => row.teamId === 1);
  const away = table.find((row) => row.teamId === 2);
  const flag = buildTopFiveClashFlag({
    homeRank: home.rank,
    awayRank: away.rank,
    tableSize: table.length,
    homePlayed: home.played,
    awayPlayed: away.played,
    homeName: "Team 1",
    awayName: "Team 2"
  });
  assert.equal(flag.number, 2);
  assert.equal(flag.code, "TOP5_CLASH");
  assert.match(flag.reason, /Red flag 2/);
});

test("sixth vs top five is not a top-five clash", () => {
  const flag = buildTopFiveClashFlag({
    homeRank: 3,
    awayRank: 6,
    tableSize: 16,
    homePlayed: 10,
    awayPlayed: 10,
    homeName: "Third",
    awayName: "Sixth"
  });
  assert.equal(flag, null);
});

test("public boards keep top-five clashes visible across engines", () => {
  const clash = buildTopFiveClashFlag({
    homeRank: 1,
    awayRank: 4,
    tableSize: 18,
    homePlayed: 12,
    awayPlayed: 12,
    homeName: "Leaders",
    awayName: "Fourth"
  });
  const snapshot = createEngineBoardSnapshot({
    date: "2026-08-20",
    engineKey: "athena",
    fixtures: [{
      id: 1,
      fixtureId: 9001,
      kickoff: "2026-08-20T15:00:00.000Z",
      status: "NS",
      topFiveClash: clash,
      redFlags: collectRedFlags(clash),
      league: { name: "Premier League" },
      home: { name: "Leaders" },
      away: { name: "Fourth" }
    }],
    predictions: [{
      internalFixtureId: 1,
      fixtureId: 9001,
      topFiveClash: clash,
      redFlags: collectRedFlags(clash),
      engines: {
        athena: {
          key: "no-pick",
          available: false,
          redFlags: collectRedFlags(clash)
        }
      }
    }]
  });
  assert.equal(snapshot.items.length, 1);
  assert.equal(snapshot.items[0].topFiveClash.code, "TOP5_CLASH");
});

test("portal paints fixture red flags on every engine row", async () => {
  const js = await readFile(resolve(root, "assets/js/portal.v1250.js"), "utf8");
  assert.match(js, /TOP 5 CLASH|topFiveClash/);
  assert.match(js, /hasRedFlag/);
  assert.match(js, /hub-engine-row[\s\S]*flagged/);
});
