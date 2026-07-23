import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { createEngineBoardSnapshot } from "../src/services/boardSnapshotService.js";
import { ENGINE_VERSION, SERVICE_VERSION } from "../src/config.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

function fixture(id) {
  return {
    id,
    fixtureId: 9000 + id,
    status: "NS",
    kickoff: `2026-07-25T${String(10 + id).padStart(2, "0")}:00:00.000Z`,
    home: { name: `Home ${id}` },
    away: { name: `Away ${id}` },
    league: { name: "Speed League", country: "Ghana" },
    matchState: { category: "pending", label: "Pending" }
  };
}

test("prepared board snapshot never presents missing picks as visitor-triggered generation", () => {
  const snapshot = createEngineBoardSnapshot({
    date: "2026-07-25",
    engineKey: "primary",
    fixtures: [fixture(1), fixture(2)],
    predictions: [{
      internalFixtureId: 1,
      fixtureId: 9001,
      kickoff: "2026-07-25T11:00:00.000Z",
      engines: {
        primary: {
          market: "Total Goals",
          selection: "Over 1.5",
          confidence: 78,
          qualified: true
        }
      }
    }]
  });

  assert.equal(snapshot.snapshot, true);
  assert.equal(snapshot.ready, 1);
  assert.equal(snapshot.pending, 1);
  assert.equal(snapshot.processing.state, "scheduled");
  assert.match(snapshot.processing.message, /scheduled board-preparation/i);
  assert.equal(snapshot.liveRefresh.skipped, true);
  assert.equal("transitionMatrix" in snapshot.items[0], false);
  assert.equal("engine" in snapshot.items[0], false);
});

test("public board route is a read-only prepared-board endpoint", async () => {
  const source = await readFile(resolve(root, "server/src/routes/publicRoutes.js"), "utf8");
  assert.match(source, /publicRouter\.get\("\/boards\/:engineKey"/);
  assert.doesNotMatch(source, /startBackgroundGeneration/);
  assert.match(source, /fast prepared-board endpoint/i);
});

test("portal shows a local prepared board before the network refresh", async () => {
  const source = await readFile(resolve(root, "assets/js/portal.v1183.js"), "utf8");
  assert.match(source, /readCachedEngineBoard/);
  assert.match(source, /\/api\/boards\/\$\{engineKey\}/);
  assert.doesNotMatch(source, /\/api\/engines\/\$\{engineKey\}.*refresh=1/);
  assert.match(source, /setTimeout\(\(\) => load\(\{ silent: true \}\), 60000\)/);
});

test("performance release keeps the prediction-engine version stable", () => {
  assert.equal(SERVICE_VERSION, "1.18.3");
  assert.equal(ENGINE_VERSION, "papasense-v1.18.1-no-draw-guard");
});
