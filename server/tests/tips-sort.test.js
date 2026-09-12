import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const client = await readFile(resolve(root, "assets/js/screens-app.js"), "utf8");

const MARKET_RANK = { "1X2": 0, "DOUBLE CHANCE": 1, "DRAW NO BET": 2, OVER: 3, UNDER: 4, BTTS: 5 };

function marketFamily(p) {
  const blob = `${p.market || ""} ${p.selection || p.pick || ""}`.toLowerCase();
  if (/double chance|\bdc\b/.test(blob)) return "DOUBLE CHANCE";
  if (/draw no bet|\bdnb\b/.test(blob)) return "DRAW NO BET";
  if (/btts|both teams|\bgg\b/.test(blob)) return "BTTS";
  if (/under/.test(blob)) return "UNDER";
  if (/over|2\+|score 2/.test(blob)) return "OVER";
  if (/1x2|\bwin\b|moneyline/.test(blob)) return "1X2";
  return String(p.market || "PICK").toUpperCase();
}
function isBanker(p) {
  return Number(p.confidence) >= 90 || Number(p.splitHit) >= 90 || Number(p.step) === 1 || /^Step 1/.test(p.note || "");
}
function compareTips(a, b) {
  const da = String(a.kickoff || "").slice(0, 10);
  const db = String(b.kickoff || "").slice(0, 10);
  if (da !== db) return da.localeCompare(db);
  const ma = marketFamily(a);
  const mb = marketFamily(b);
  const ra = MARKET_RANK[ma] ?? 50;
  const rb = MARKET_RANK[mb] ?? 50;
  if (ra !== rb) return ra - rb;
  if (ma !== mb) return ma.localeCompare(mb);
  const ka = String(a.kickoff || "");
  const kb = String(b.kickoff || "");
  if (ka !== kb) return ka.localeCompare(kb);
  const bank = Number(isBanker(b)) - Number(isBanker(a));
  if (bank) return bank;
  return Number(b.confidence) - Number(a.confidence);
}

test("screens app groups tips by day, market, kickoff and banker", () => {
  assert.match(client, /function groupTips/);
  assert.match(client, /function groupedCards/);
  assert.match(client, /banker-chip/);
  assert.match(client, /TODAY · \$\{k\.weekday\}/);
  assert.match(client, /time-title/);
  assert.match(client, /kickParts\(row\.kickoff\)\.time/);
  assert.match(client, /groupedCards\(tips\)/);
  assert.match(client, /groupedCards\(list\)/);
  assert.match(client, /groupedCards\(state\.visa\)/);
});

test("compareTips orders day then market then kickoff then bankers", () => {
  const rows = [
    { kickoff: "2026-09-13T15:00:00.000Z", market: "1X2", selection: "Win", confidence: 70 },
    { kickoff: "2026-09-12T18:00:00.000Z", market: "Over 2.5", selection: "Over 2.5", confidence: 70 },
    { kickoff: "2026-09-12T16:00:00.000Z", market: "Double Chance", selection: "DC", confidence: 70 },
    { kickoff: "2026-09-12T12:00:00.000Z", market: "Double Chance", selection: "DC", confidence: 70 },
    { kickoff: "2026-09-12T12:00:00.000Z", market: "Double Chance", selection: "DC lock", confidence: 100 },
  ];
  const sorted = rows.slice().sort(compareTips);
  assert.equal(sorted[0].kickoff, "2026-09-12T12:00:00.000Z");
  assert.equal(marketFamily(sorted[0]), "DOUBLE CHANCE");
  assert.equal(isBanker(sorted[0]), true);
  assert.equal(isBanker(sorted[1]), false);
  assert.equal(sorted[2].kickoff, "2026-09-12T16:00:00.000Z");
  assert.equal(marketFamily(sorted[3]), "OVER");
  assert.equal(sorted[4].kickoff.slice(0, 10), "2026-09-13");
});
