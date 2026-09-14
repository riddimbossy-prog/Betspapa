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

test("the site root is the Goldie playbook board", async () => {
  const html = await source("index.html");
  assert.match(html, /BETSPAPA_START="goldie"/);
  assert.match(html, /screens-app/);
  assert.match(html, /Goldie/);
});

test("Papa's Pick remains available on its own page", async () => {
  const html = await source("papas-pick.html");
  assert.match(html, /BETSPAPA_START="papa"/);
  assert.match(html, /screens-app/);
  assert.match(html, /papas-pick\.html/);
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

test("PWA launches at the Goldie root and keeps Flash and Papa shortcuts", async () => {
  const manifest = JSON.parse(await source("manifest.webmanifest"));
  assert.equal(manifest.start_url, "/?source=pwa&v=20260914g");
  assert.equal(manifest.version, "1.29.1");
  const goldie = manifest.shortcuts.find((item) => item.name === "Goldie");
  assert.equal(goldie.url, "/?source=shortcut");
  const flash = manifest.shortcuts.find((item) => item.name === "Flash Cover IQ");
  assert.equal(flash.url, "/flash.html?source=shortcut");
  const papa = manifest.shortcuts.find((item) => item.name === "Papa's Pick");
  assert.equal(papa.url, "/papas-pick.html?source=shortcut");
});
