import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

import {
  inferScoreOrder,
  marketGroup,
  rankBossPicks,
  selectionLabel,
  toTeamMatch
} from "../src/services/bossPickService.js";

const require = createRequire(import.meta.url);
const { runEngine } = require("../src/engine/omni_htft_engine.cjs");

test("score order is inferred only when the score makes it certain", () => {
  assert.equal(inferScoreOrder({ goalsFor: 2, goalsAgainst: 0, htFor: 0, htAgainst: 0 }), true);
  assert.equal(inferScoreOrder({ goalsFor: 1, goalsAgainst: 2, htFor: 0, htAgainst: 1 }), false);
  assert.equal(inferScoreOrder({ goalsFor: 2, goalsAgainst: 2, htFor: 1, htAgainst: 1 }), undefined);
  assert.equal(inferScoreOrder({ goalsFor: 0, goalsAgainst: 0, htFor: 0, htAgainst: 0 }), null);
});

test("team history conversion preserves the selected team perspective", () => {
  const fixture = {
    fixture_date: "2026-07-01T18:00:00Z",
    home_team_id: 10,
    away_team_id: 20,
    halftime_home: 1,
    halftime_away: 0,
    fulltime_home: 2,
    fulltime_away: 1
  };
  const away = toTeamMatch(fixture, 20);
  assert.equal(away.venue, "away");
  assert.equal(away.goalsFor, 1);
  assert.equal(away.goalsAgainst, 2);
  assert.equal(away.scoredFirst, false);
});

test("Boss Pick labels use real team names", () => {
  assert.equal(selectionLabel("Home Team Over 0.5 Goals", "Hearts", "Lions"), "Hearts Over 0.5 Goals");
  assert.equal(selectionLabel("Away Win", "Hearts", "Lions"), "Lions to Win");
  assert.equal(marketGroup("DOUBLE_CHANCE_1X"), "Match Result");
});

test("all qualifying Boss Picks are retained and Prime ranks first", () => {
  const rows = rankBossPicks([
    { grade: "QUALIFIED", score: 82, kickoff: "2026-07-17T11:00:00Z" },
    { grade: "QUALIFIED", score: 86.9, kickoff: "2026-07-17T12:00:00Z" },
    { grade: "PRIME", score: 87.1, kickoff: "2026-07-17T13:00:00Z" },
    { grade: "PRIME", score: 91, kickoff: "2026-07-17T14:00:00Z" }
  ]);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].score, 91);
  assert.equal(rows[1].grade, "PRIME");
  assert.equal(rows[3].score, 82);
});

test("uploaded OMNI sample produces a qualified final market", () => {
  const sample = JSON.parse(fs.readFileSync(new URL("../../docs/omni-htft-v2/omni_htft_input_example.json", import.meta.url), "utf8"));
  const output = runEngine(sample);
  assert.equal(output.decision, "BET");
  assert.equal(output.selected.accepted, true);
  assert.ok(output.selected.score >= 80);
});

test("available-data mode does not globally fail incomplete score-order and xG fields", () => {
  const sample = JSON.parse(fs.readFileSync(new URL("../../docs/omni-htft-v2/omni_htft_input_example.json", import.meta.url), "utf8"));
  sample.strict = false;
  for (const row of [...sample.homeMatches, ...sample.awayMatches]) {
    delete row.xgFor;
    delete row.xgAgainst;
    delete row.scoredFirst;
    delete row.ledAnyTime;
    delete row.trailedAnyTime;
  }
  const output = runEngine(sample);
  assert.notEqual(output.reason, "Global data-quality gate failed.");
});
