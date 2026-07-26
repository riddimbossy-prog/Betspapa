import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const source = (path) => readFile(resolve(root, path), "utf8");

test("Papa's Pick main page exposes all five engines", async () => {
  const html = await source("index.html");
  assert.match(html, /data-page="papa-hub"/);
  for (const name of ["Papa’s Pick", "Safer", "Aggressive", "Venue Pattern", "Athena"]) {
    assert.match(html, new RegExp(name));
  }
  assert.match(html, /id="engineFilter"/);
  assert.match(html, /id="hubEngineTabs"/);
});

test("main board client renders fixture-centred engine rows", async () => {
  const js = await source("assets/js/portal.v1220.js");
  assert.match(js, /HUB_ENGINE_ORDER = \["primary", "safer", "aggressive", "venue", "athena"\]/);
  assert.match(js, /\/api\/main-board\/today/);
  assert.match(js, /function hubEngineRow/);
  assert.match(js, /function loadPapaHubPage/);
});

test("public API merges all engines for the main board", async () => {
  const routes = await source("server/src/routes/publicRoutes.js");
  assert.match(routes, /publicRouter\.get\("\/main-board\/today"/);
  assert.match(routes, /normalizedAthenaForMainBoard/);
  assert.match(routes, /engines: \["primary", "safer", "aggressive", "venue", "athena"\]/);
});

test("v1.22 PWA caches the all-engine assets", async () => {
  const sw = await source("sw.js");
  assert.match(sw, /betspapa-pwa-v1220/);
  assert.match(sw, /portal\.v1220\.css/);
  assert.match(sw, /portal\.v1220\.js/);
});
