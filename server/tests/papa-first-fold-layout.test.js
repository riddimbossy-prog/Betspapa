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

test("the site root is Papa's Pick rather than the retired home dashboard", async () => {
  const html = await source("index.html");
  assert.match(html, /data-page="engine"/);
  assert.match(html, /data-engine="primary"/);
  assert.match(html, /data-start-page="papas-pick"/);
  assert.match(html, /Papa’s Pick/);
  assert.doesNotMatch(html, /data-page="dashboard"/);
  assert.doesNotMatch(html, />Today<\/a>/);
});

test("old Papa's Pick bookmarks redirect to the new root", async () => {
  const html = await source("papas-pick.html");
  assert.match(html, /location\.replace\(target\)/);
  assert.match(html, /canonical" href="https:\/\/betspapa\.com\//);
});

test("mobile navigation starts with Papa and has no Home tab", async () => {
  const js = await source("assets/js/mobile-nav.v1170.js");
  assert.match(js, /data-bp-tab="picks"/);
  assert.match(js, /<small>Papa<\/small>/);
  assert.doesNotMatch(js, /data-bp-tab="home"/);
  assert.doesNotMatch(js, /<small>Home<\/small>/);
});

test("Fold and tablet responsive layer keeps multi-column boards", async () => {
  const css = await source("assets/css/portal.v1183.css");
  assert.match(css, /max-width:1080px/);
  assert.match(css, /min-width:520px/);
  assert.match(css, /repeat\(auto-fit,minmax\(260px,1fr\)\)/);
  assert.match(css, /orientation:landscape/);
});

test("PWA launches at the Papa's Pick root", async () => {
  const manifest = JSON.parse(await source("manifest.webmanifest"));
  assert.equal(manifest.start_url, "/?source=pwa&v=1183");
  assert.equal(manifest.version, "1.18.3");
  const papa = manifest.shortcuts.find((item) => item.name === "Papa's Pick");
  assert.equal(papa.url, "/?source=shortcut");
});
