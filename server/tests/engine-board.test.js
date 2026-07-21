import test from "node:test";
import assert from "node:assert/strict";
import { buildEngineBoardItems } from "../src/services/publicService.js";

function fixture(id, status = "NS") {
  return {
    id,
    fixtureId: 1000 + id,
    status,
    kickoff: `2026-07-21T${String(10 + id).padStart(2, "0")}:00:00.000Z`,
    league: { name: "Test League" },
    home: { name: `Home ${id}` },
    away: { name: `Away ${id}` },
    matchState: { category: "pending", label: "Pending" }
  };
}

test("engine board keeps imported fixtures visible while current picks are preparing", () => {
  const fixtures = [fixture(1), fixture(2)];
  const predictions = [{
    internalFixtureId: 1,
    fixtureId: 1001,
    kickoff: fixtures[0].kickoff,
    engines: {
      primary: {
        market: "Total Goals",
        selection: "Over 1.5",
        confidence: 78,
        qualified: true
      }
    }
  }];

  const items = buildEngineBoardItems({
    fixtures,
    predictions,
    engineKey: "primary",
    processing: {
      state: "running",
      message: "Preparing current-engine picks"
    }
  });

  assert.equal(items.length, 2);
  assert.equal(items[0].pick.selection, "Over 1.5");
  assert.equal(items[0].processing, false);
  assert.equal(items[1].pick, null);
  assert.equal(items[1].processing, true);
  assert.equal(items[1].processingState, "running");
});

test("engine board excludes finished fixtures without a current prediction", () => {
  const items = buildEngineBoardItems({
    fixtures: [fixture(1, "FT"), fixture(2, "NS")],
    predictions: [],
    engineKey: "primary",
    processing: { state: "idle" }
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].id, 2);
});
