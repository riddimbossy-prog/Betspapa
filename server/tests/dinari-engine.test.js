import test from "node:test";
import assert from "node:assert/strict";
import {
  DINARI_ENGINE_NAME,
  DINARI_ENGINE_VERSION,
  OVER_25_DRAW_MIN,
  UNDER_25_DRAW_MAX,
  UNDER_35_DRAW_MAX,
  averagesOf,
  drawOddOf,
  runDinari,
  selectDinariPicks
} from "../src/engine/dinariEngine.js";

function snap(partial = {}) {
  return {
    fixtureId: partial.fixtureId || "d1",
    kickoff: partial.kickoff || "2026-09-16T15:00:00.000Z",
    homeName: partial.homeName || "Home FC",
    awayName: partial.awayName || "Away FC",
    home: {
      played: 10,
      gfAvg: 2.4,
      gaAvg: 1.6,
      ...(partial.home || {})
    },
    away: {
      played: 10,
      gfAvg: 1.5,
      gaAvg: 1.6,
      ...(partial.away || {})
    },
    odds: {
      home: 1.7,
      draw: 4.1,
      away: 4.8,
      "over-15": 1.22,
      "over-25": 1.65,
      "under-25": 2.2,
      "under-35": 1.4,
      ...(partial.odds || {})
    }
  };
}

function keys(picks) {
  return picks.map((pick) => pick.key).sort();
}

test("Dinari identity", () => {
  assert.equal(DINARI_ENGINE_NAME, "Dinari");
  assert.equal(DINARI_ENGINE_VERSION, "dinari-v1.0.0");
  assert.equal(averagesOf({ played: 8, gf: 20, ga: 6 }).gf, 2.5);
  assert.equal(averagesOf({ played: 8, gf: 20, ga: 6 }).ga, 0.75);
  assert.equal(drawOddOf({ draw: 3.61 }), 3.61);
});

test("Over 2.5 needs a 2.2+ scorer, a 1.3+ partner, and draw odds over 3.60", () => {
  const picks = selectDinariPicks(snap());
  assert.ok(picks.some((pick) => pick.key === "over-25"));
  assert.ok(picks.every((pick) => pick.key !== "over-15"), "Over 2.5 suppresses Over 1.5");
  const over = picks.find((pick) => pick.key === "over-25");
  assert.equal(over.selection, "Over 2.5");
  assert.equal(over.tier, "BANKER");
  assert.ok(over.confidence >= 70);
  assert.ok(over.drawOdd > OVER_25_DRAW_MIN);

  assert.deepEqual(keys(selectDinariPicks(snap({ odds: { draw: 3.6 } }))), []);
  assert.deepEqual(
    keys(selectDinariPicks(snap({ home: { gfAvg: 2.21, gaAvg: 1.4 }, away: { gfAvg: 1.29, gaAvg: 1.4 } }))),
    []
  );
});

test("Over 1.5 from a 2.2+ scorer who concedes less than 1", () => {
  const picks = selectDinariPicks(snap({
    home: { gfAvg: 2.3, gaAvg: 0.7 },
    away: { gfAvg: 1.1, gaAvg: 1.2 },
    odds: { draw: 3.2 }
  }));
  assert.deepEqual(keys(picks), ["over-15"]);
  assert.match(picks[0].ruleId, /over-15-solo/);
});

test("Over 1.5 from both sides scoring 1.80+ and conceding 1.5+", () => {
  const picks = selectDinariPicks(snap({
    home: { gfAvg: 1.85, gaAvg: 1.55 },
    away: { gfAvg: 1.9, gaAvg: 1.7 },
    odds: { draw: 3.2 }
  }));
  assert.deepEqual(keys(picks), ["over-15"]);
  assert.equal(picks[0].ruleId, "dinari-over-15-both");
});

test("Under 2.5 from a sub-1 scored and conceded side with draw odds not greater than 2.90", () => {
  const picks = selectDinariPicks(snap({
    home: { gfAvg: 0.8, gaAvg: 0.7 },
    away: { gfAvg: 1.2, gaAvg: 1.1 },
    odds: { draw: 2.85, home: 2.4, away: 3.1 }
  }));
  assert.deepEqual(keys(picks), ["under-25"]);
  assert.ok(picks[0].drawOdd <= UNDER_25_DRAW_MAX);

  assert.deepEqual(
    keys(selectDinariPicks(snap({
      home: { gfAvg: 0.8, gaAvg: 0.7 },
      away: { gfAvg: 1.2, gaAvg: 1.1 },
      odds: { draw: 2.91 }
    }))),
    ["under-35"]
  );
});

test("Under 3.5 from a sub-1.4 scorer who concedes less than 1, draw not greater than 3.10", () => {
  const picks = selectDinariPicks(snap({
    home: { gfAvg: 1.2, gaAvg: 0.8 },
    away: { gfAvg: 1.5, gaAvg: 1.3 },
    odds: { draw: 3.05, home: 2.2, away: 3.4 }
  }));
  assert.deepEqual(keys(picks), ["under-35"]);
  assert.ok(picks[0].drawOdd <= UNDER_35_DRAW_MAX);
  assert.ok(picks.every((pick) => pick.key !== "under-25"));
});

test("Under 3.5 both-quiet branch and sample floor", () => {
  const both = selectDinariPicks(snap({
    home: { gfAvg: 0.9, gaAvg: 1.1 },
    away: { gfAvg: 0.8, gaAvg: 1.15 },
    odds: { draw: 3.0, home: 2.3, away: 3.2 }
  }));
  assert.deepEqual(keys(both), ["under-35"]);
  assert.equal(both[0].ruleId, "dinari-under-35-both");

  assert.deepEqual(
    keys(selectDinariPicks(snap({ home: { played: 4, gfAvg: 2.5, gaAvg: 1.6 } }))),
    []
  );
});

test("runDinari sorts by kickoff and keeps one tighter line per direction", () => {
  const picks = runDinari([
    snap({
      fixtureId: "late",
      kickoff: "2026-09-16T20:00:00.000Z",
      homeName: "Late Attack"
    }),
    snap({
      fixtureId: "early",
      kickoff: "2026-09-16T12:00:00.000Z",
      homeName: "Early Attack"
    })
  ]);
  assert.equal(picks.length, 2);
  assert.equal(picks[0].homeName, "Early Attack");
  assert.ok(picks.every((pick) => pick.key === "over-25"));
});
