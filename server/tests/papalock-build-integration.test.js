import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { SERVICE_VERSION } from "../src/config.js";
import { PAPALOCK_VERSION } from "../src/engine/papaLockBankerEngine.js";

const root = resolve(process.cwd(), "..");
const source = (path) => readFile(resolve(root, path), "utf8");

test("v1.25 exposes PapaLock as the dedicated public Banker engine", async () => {
  assert.equal(SERVICE_VERSION, "1.25.0");
  assert.equal(PAPALOCK_VERSION, "papalock-v1.0.0");
  const routes = await source("server/src/routes/publicRoutes.js");
  assert.match(routes, /getPapaLockPicks/);
  assert.match(routes, /\/bankers\/today/);
  assert.match(routes, /\/bankers\/history/);
});

test("PapaLock admin prepare, audit and settlement routes are protected", async () => {
  const routes = await source("server/src/routes/adminRoutes.js");
  assert.match(routes, /adminRouter\.use\(requireAdmin\)/);
  assert.match(routes, /\/bankers\/audit/);
  assert.match(routes, /\/bankers\/prepare/);
  assert.match(routes, /\/bankers\/settle/);
});

test("PapaLock migration installs prediction, evidence, result and calibration tables", async () => {
  const sql = await source("supabase/BETSPAPA_V1_25_0_PAPALOCK_BANKER_ENGINE.sql");
  assert.match(sql, /create table if not exists public\.papalock_predictions/i);
  assert.match(sql, /create table if not exists public\.papalock_engine_evidence/i);
  assert.match(sql, /create table if not exists public\.papalock_results/i);
  assert.match(sql, /create table if not exists public\.papalock_calibration_profiles/i);
});

test("Banker page presents PapaLock grades and uses the v1.25 assets", async () => {
  const html = await source("bankers.html");
  const js = await source("assets/js/portal.v1250.js");
  const sw = await source("sw.js");
  assert.match(html, /PapaLock Banker Engine/);
  assert.match(html, /papalock-elite/);
  assert.match(js, /papalock-bankers:v1250/);
  assert.match(js, /confirmation families/i);
  assert.match(sw, /betspapa-pwa-v1250/);
  assert.match(sw, /bankers\.v1250\.css/);
});
