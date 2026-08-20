import test from "node:test";
import assert from "node:assert/strict";

import {
  SPLIT_FORM_VERSION,
  selectSplitFormPick,
  summarizeRecentFive,
  toPerspectiveGame
} from "../src/engine/splitFormEngine.js";

function games(rows) {
  return rows.map(([htFor, htAgainst, ftFor, ftAgainst], index) => ({
    date: `2026-08-${String(10 + index).padStart(2, "0")}`,
    htFor,
    htAgainst,
    ftFor,
    ftAgainst
  }));
}

function input(homeRows, awayRows) {
  return {
    home: { name: "Home FC", recentFive: games(homeRows) },
    away: { name: "Away FC", recentFive: games(awayRows) }
  };
}

test("toPerspectiveGame maps HT/FT from the selected team's side", () => {
  const row = toPerspectiveGame({
    id: 1,
    home_team_id: 10,
    away_team_id: 20,
    fixture_date: "2026-08-01T15:00:00.000Z",
    halftime_home: 1,
    halftime_away: 0,
    fulltime_home: 1,
    fulltime_away: 2
  }, 10);
  assert.equal(row.transition, "WL");
  assert.equal(row.ftResult, "L");
  assert.equal(row.shFor, 0);
  assert.equal(row.shAgainst, 2);
});

test("summarizeRecentFive keeps form, form goals and HT/FT counts", () => {
  const summary = summarizeRecentFive(games([
    [1, 0, 2, 0],
    [1, 0, 1, 0],
    [0, 0, 1, 0],
    [2, 0, 2, 1],
    [1, 0, 1, 0]
  ]));
  assert.equal(summary.form, "WWWWW");
  assert.equal(summary.points, 15);
  assert.equal(summary.gf, 7);
  assert.equal(summary.ga, 1);
  assert.equal(summary.transitions.WW, 4);
  assert.equal(summary.scoredIn, 5);
});

test("dominant last-five home form with clean HT/FT splits becomes a home result", () => {
  const pick = selectSplitFormPick(input(
    [[1, 0, 2, 0], [2, 0, 3, 0], [1, 0, 2, 0], [1, 0, 1, 0], [2, 0, 2, 0]],
    [[0, 1, 0, 2], [0, 1, 0, 1], [0, 0, 0, 1], [0, 1, 1, 2], [0, 1, 0, 2]]
  ));
  assert.equal(pick.available, true);
  assert.equal(pick.engineName, "Split Form");
  assert.ok(["home-win", "home-dnb", "home-1x"].includes(pick.key), pick.key);
  assert.match(pick.explanationParagraph, /last five|form/i);
  assert.equal(pick.internalAudit.home.form, "WWWWW");
  assert.equal(pick.engineVersion, SPLIT_FORM_VERSION);
});

test("busy last-five form goals prefer a goals market when neither side dominates", () => {
  const pick = selectSplitFormPick(input(
    [[1, 1, 2, 2], [2, 1, 3, 2], [1, 1, 2, 1], [0, 1, 2, 2], [1, 0, 2, 1]],
    [[1, 1, 2, 2], [1, 2, 2, 3], [1, 1, 1, 2], [2, 1, 3, 2], [1, 1, 2, 2]]
  ));
  assert.equal(pick.available, true);
  assert.ok(["over-15", "over-25", "gg-yes"].includes(pick.key), pick.key);
});

test("tight last-five scoring becomes Under 3.5", () => {
  const pick = selectSplitFormPick(input(
    [[0, 0, 1, 0], [0, 0, 0, 0], [1, 0, 1, 0], [0, 0, 0, 1], [0, 0, 1, 1]],
    [[0, 0, 0, 1], [0, 0, 1, 0], [0, 0, 0, 0], [1, 0, 1, 0], [0, 0, 0, 1]]
  ));
  assert.equal(pick.available, true);
  assert.equal(pick.key, "under-35");
});

test("fewer than five finished matches is NO PICK", () => {
  const pick = selectSplitFormPick(input(
    [[1, 0, 2, 0], [1, 0, 1, 0]],
    [[0, 1, 0, 2], [0, 1, 0, 1], [0, 0, 0, 1], [0, 1, 1, 2], [0, 1, 0, 2]]
  ));
  assert.equal(pick.available, false);
  assert.equal(pick.key, "no-pick");
  assert.match(pick.explanationParagraph, /5 finished league matches/i);
});

test("a blown HT lead blocks a straight home win", () => {
  const pick = selectSplitFormPick(input(
    [[2, 0, 2, 3], [1, 0, 1, 2], [2, 0, 2, 2], [1, 0, 1, 1], [2, 0, 2, 3]],
    [[0, 0, 1, 1], [0, 0, 0, 0], [1, 1, 1, 1], [0, 1, 1, 1], [0, 0, 0, 1]]
  ));
  assert.notEqual(pick.key, "home-win");
});
