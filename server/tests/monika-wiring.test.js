import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const source = (path) => readFile(resolve(root, path), "utf8");

test("Monika is wired through the phone app, public API and PWA cache", async () => {
  const [html, client, routes, server, sw, css] = await Promise.all([
    source("index.html"),
    source("assets/js/screens-app.js"),
    source("server/src/routes/publicRoutes.js"),
    source("server/src/server.js"),
    source("sw.js"),
    source("assets/css/screens-app.css")
  ]);
  assert.match(html, /screens-app\.js\?v=20260912k/);
  assert.match(client, /\/api\/monika\/today/);
  assert.match(client, /function renderMonika/);
  assert.match(client, /name: "monika"/);
  assert.match(client, /BetExplorer/);
  assert.match(client, /OPEN ON BETEXPLORER/);
  assert.match(client, /function whyHtml/);
  assert.match(client, /Club identity/);
  assert.match(client, /applyMonika/);
  assert.match(client, /if \(p\.betExplorerUrl\) return p;/);
  assert.match(client, /function groupTips/);
  assert.match(client, /function marketFamily/);
  assert.match(client, /function groupedCards/);
  assert.match(client, /TODAY ·/);
  assert.match(client, /banker-chip/);
  assert.match(client, /BANKER/);
  assert.match(routes, /publicRouter\.get\("\/monika\/today"/);
  assert.match(server, /monika: "\/api\/monika\/today"/);
  assert.match(server, /monikaEngineVersion/);
  assert.match(sw, /betspapa-screens-20260912k/);
  assert.match(css, /min-width: 56px/);
});
