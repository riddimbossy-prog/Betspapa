import test from "node:test";
import assert from "node:assert/strict";
import { gradeMarket } from "../src/services/gradingService.js";

const fixture = {
  halftime_home: 1,
  halftime_away: 0,
  fulltime_home: 2,
  fulltime_away: 1
};

function prediction(selection = "Home") {
  return { primary_selection: selection };
}

test("new total-goal markets grade correctly", () => {
  assert.equal(gradeMarket("over-15", prediction(), fixture, "Home", "Away"), "WIN");
  assert.equal(gradeMarket("under-25", prediction(), fixture, "Home", "Away"), "LOSS");
  assert.equal(gradeMarket("under-35", prediction(), fixture, "Home", "Away"), "WIN");
  assert.equal(gradeMarket("total-2-3", prediction(), fixture, "Home", "Away"), "WIN");
  assert.equal(gradeMarket("over-35", prediction(), fixture, "Home", "Away"), "LOSS");
});

test("team, clean-sheet and half markets grade correctly", () => {
  assert.equal(gradeMarket("home-over-15", prediction(), fixture, "Home", "Away"), "WIN");
  assert.equal(gradeMarket("away-under-15", prediction(), fixture, "Home", "Away"), "WIN");
  assert.equal(gradeMarket("home-clean-sheet", prediction(), fixture, "Home", "Away"), "LOSS");
  assert.equal(gradeMarket("first-half-over-05", prediction(), fixture, "Home", "Away"), "WIN");
  assert.equal(gradeMarket("second-half-over-05", prediction(), fixture, "Home", "Away"), "WIN");
});

test("win-either-half uses the actual first and second half results", () => {
  assert.equal(gradeMarket("home-win-either-half", prediction(), fixture, "Home", "Away"), "WIN");
  assert.equal(gradeMarket("away-win-either-half", prediction(), fixture, "Home", "Away"), "LOSS");
});
