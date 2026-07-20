import test from "node:test";
import assert from "node:assert/strict";

import { gradeEnginePick } from "../src/services/gradingService.js";
import {
  fixtureMatchState,
  summarizeMatchStates
} from "../src/services/matchStateService.js";

const finished = {
  status: "FT",
  halftime_home: 1,
  halftime_away: 0,
  fulltime_home: 2,
  fulltime_away: 1,
  updated_at: "2026-07-20T12:00:00.000Z"
};

test("pending, live and settled fixture states are classified", () => {
  assert.equal(fixtureMatchState({ status: "NS" }).category, "pending");
  assert.equal(
    fixtureMatchState({ status: "2H", fulltime_home: 1, fulltime_away: 1 }).category,
    "live"
  );
  assert.equal(
    fixtureMatchState(finished, { outcome: "WIN" }).category,
    "settled"
  );
});

test("new PapaSense v1.13 markets settle automatically", () => {
  assert.equal(gradeEnginePick({ key: "home-win-either-half" }, finished), "WIN");
  assert.equal(gradeEnginePick({ key: "away-win-either-half" }, finished), "LOSS");
  assert.equal(gradeEnginePick({ key: "draw-either-half" }, finished), "WIN");
  assert.equal(gradeEnginePick({ key: "first-half-over-05" }, finished), "WIN");
  assert.equal(gradeEnginePick({ key: "first-half-over-15" }, finished), "LOSS");
  assert.equal(gradeEnginePick({ key: "second-half-over-05" }, finished), "WIN");
  assert.equal(gradeEnginePick({ key: "home-over-15" }, finished), "WIN");
  assert.equal(gradeEnginePick({ key: "away-over-15" }, finished), "LOSS");
});

test("match-state summary counts each public category", () => {
  const summary = summarizeMatchStates([
    { matchState: fixtureMatchState({ status: "NS" }) },
    { matchState: fixtureMatchState({ status: "1H", fulltime_home: 0, fulltime_away: 0 }) },
    { matchState: fixtureMatchState(finished, { outcome: "WIN" }) }
  ]);
  assert.deepEqual(summary, {
    total: 3,
    pending: 1,
    live: 1,
    finished: 0,
    settled: 1,
    delayed: 0,
    cancelled: 0
  });
});
