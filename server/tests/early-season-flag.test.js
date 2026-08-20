import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { buildEarlySeasonFlag, EARLY_SEASON_WINDOW } from "../src/engine/earlySeasonFlag.js";
import { createEngineBoardSnapshot } from "../src/services/boardSnapshotService.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

function fixture(id, extra = {}) {
  return {
    id,
    fixtureId: 9000 + id,
    kickoff: "2026-08-20T15:00:00.000Z",
    status: "NS",
    league: { name: "Premier League" },
    home: { name: "Home FC" },
    away: { name: "Away FC" },
    ...extra
  };
}

test("first five league matches get a red early-season flag", () => {
  for (const played of [0, 1, 2, 3, 4]) {
    const flag = buildEarlySeasonFlag({
      homePlayed: played,
      awayPlayed: 12,
      homeName: "Home FC",
      awayName: "Away FC"
    });
    assert.equal(flag.level, "red");
    assert.equal(flag.label, "EARLY SEASON");
    assert.equal(flag.homeMatchNumber, played + 1);
    assert.match(flag.reason, /Red flag/);
  }
  assert.equal(EARLY_SEASON_WINDOW, 5);
});

test("match six and later are not early-season flagged", () => {
  const flag = buildEarlySeasonFlag({
    homePlayed: 5,
    awayPlayed: 5,
    homeName: "Home FC",
    awayName: "Away FC"
  });
  assert.equal(flag, null);
});

test("public boards keep first-five matches visible with the red flag", () => {
  const snapshot = createEngineBoardSnapshot({
    date: "2026-08-20",
    engineKey: "primary",
    fixtures: [fixture(1, {
      earlySeason: buildEarlySeasonFlag({ homePlayed: 1, awayPlayed: 2, homeName: "Home FC", awayName: "Away FC" })
    }), fixture(2)],
    predictions: [{
      internalFixtureId: 1,
      fixtureId: 9001,
      kickoff: "2026-08-20T15:00:00.000Z",
      earlySeason: buildEarlySeasonFlag({ homePlayed: 1, awayPlayed: 2, homeName: "Home FC", awayName: "Away FC" }),
      engines: {
        primary: {
          key: "no-pick",
          market: "No Pick",
          selection: "NO PICK",
          available: false,
          qualified: false
        }
      }
    }]
  });

  assert.equal(snapshot.items.length, 1);
  assert.equal(snapshot.items[0].earlySeason.level, "red");
  assert.equal(snapshot.items[0].earlySeason.label, "EARLY SEASON");
});

test("portal paints an early-season red flag on hub and engine cards", async () => {
  const js = await readFile(resolve(root, "assets/js/portal.v1250.js"), "utf8");
  const css = await readFile(resolve(root, "assets/css/portal.v1220.css"), "utf8");
  assert.match(js, /function earlySeasonMarkup/);
  assert.match(js, /early-season-flag/);
  assert.match(js, /item\?\.earlySeason/);
  assert.match(css, /\.early-season-flag/);
  assert.match(css, /\.papa-hub-card\.early-season/);
});
