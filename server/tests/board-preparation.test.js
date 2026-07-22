import test from "node:test";
import assert from "node:assert/strict";
import { summarizeBoardPreparation } from "../src/services/publicService.js";

function fixture(id, status = "NS") {
  return { id, status };
}

function prediction(id) {
  return { internalFixtureId: id };
}

test("day-ahead board reports ready when every predictable fixture has a pick", () => {
  const status = summarizeBoardPreparation({
    date: "2026-07-22",
    fixtures: [fixture(1), fixture(2)],
    predictions: [prediction(1), prediction(2)]
  });

  assert.equal(status.state, "ready");
  assert.equal(status.prepared, true);
  assert.equal(status.coveragePercent, 100);
  assert.equal(status.waitingForHistory, 0);
});

test("day-ahead board reports partial coverage while histories are still missing", () => {
  const status = summarizeBoardPreparation({
    date: "2026-07-22",
    fixtures: [fixture(1), fixture(2), fixture(3)],
    predictions: [prediction(1), prediction(2)]
  });

  assert.equal(status.state, "partial");
  assert.equal(status.prepared, false);
  assert.equal(status.readyPredictions, 2);
  assert.equal(status.waitingForHistory, 1);
  assert.equal(status.coveragePercent, 66.7);
});

test("finished fixtures do not count toward tomorrow board coverage", () => {
  const status = summarizeBoardPreparation({
    date: "2026-07-22",
    fixtures: [fixture(1), fixture(2, "FT")],
    predictions: [prediction(1)]
  });

  assert.equal(status.fixturesFound, 1);
  assert.equal(status.prepared, true);
});
