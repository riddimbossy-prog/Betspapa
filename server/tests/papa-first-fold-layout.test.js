import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

async function source(path) {
  return readFile(resolve(root, path), "utf8");
}

test("the site root is the Flash Cover IQ board", async () => {
  const html = await source("index.html");
  assert.match(html, /data-page="flash"/);
  assert.match(html, /Flash — Cover IQ/);
  assert.match(html, /Fifteen cover markets enter/);
  assert.match(html, /aria-current="page" class="active" href="index\.html">Flash/);
});

test("Papa's Pick remains available on its own page", async () => {
  const html = await source("papas-pick.html");
  assert.match(html, /data-page="papa-hub"/);
  assert.match(html, /data-engine="primary"/);
  assert.match(html, /data-start-page="papas-pick"/);
  assert.match(html, /aria-current="page" class="active" href="papas-pick\.html">Papa’s Pick/);
});

test("mobile and Z Fold navigation exposes the four core engines plus More", async () => {
  const js = await source("assets/js/mobile-nav.v1240.js");
  for (const tab of ["flash", "safer", "aggressive", "athena", "more"]) {
    assert.match(js, new RegExp(`data-bp-tab="${tab}"`));
  }
  for (const label of ["Flash", "Safer", "Aggressive", "Athena", "More"]) {
    assert.match(js, new RegExp(`<small>${label}<\/small>`));
  }
  assert.match(js, /papas-pick\.html/);
  assert.match(js, /bankers\.html/);
  assert.match(js, /results-intelligence\.html/);
  assert.match(js, /live-fixtures\.html/);
  assert.match(js, /venue-pattern\.html/);
  assert.doesNotMatch(js, /data-bp-tab="bankers"/);
  assert.doesNotMatch(js, /data-bp-tab="live"/);
  assert.doesNotMatch(js, /data-bp-tab="results"/);
});

test("Fold and tablet responsive layer keeps multi-column boards", async () => {
  const css = await source("assets/css/portal.v1220.css");
  assert.match(css, /max-width:1080px/);
  assert.match(css, /min-width:520px/);
  assert.match(css, /repeat\(auto-fit,minmax\(260px,1fr\)\)/);
  assert.match(css, /orientation:landscape/);
});

test("PWA launches at the Flash root and keeps a Papa's Pick shortcut", async () => {
  const manifest = JSON.parse(await source("manifest.webmanifest"));
  assert.equal(manifest.start_url, "/?source=pwa&v=1290");
  assert.equal(manifest.version, "1.29.0");
  const flash = manifest.shortcuts.find((item) => item.name === "Flash Cover IQ");
  assert.equal(flash.url, "/?source=shortcut");
  const papa = manifest.shortcuts.find((item) => item.name === "Papa's Pick");
  assert.equal(papa.url, "/papas-pick.html?source=shortcut");
});
