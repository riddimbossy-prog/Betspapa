import test from "node:test";
import assert from "node:assert/strict";

import {
  detectSuspiciousPredictionCandidates,
  selectBankerSlate
} from "../src/services/intelligenceService.js";

function prediction(id, confidence = 80) {
  const pick = (engineKey) => ({
    engineKey,
    engineName: engineKey,
    key: engineKey === "primary" ? "home-win" : "over-15",
    market: engineKey === "primary" ? "Full-Time Result" : "Total Goals",
    selection: engineKey === "primary" ? `Home ${id} Win` : "Over 1.5",
    confidence,
    qualified: true,
    reasons: ["Individual history agrees"],
    cautions: []
  });

  return {
    fixtureId: String(id),
    internalFixtureId: id,
    kickoff: "2026-07-16T12:00:00.000Z",
    home: { name: `Home ${id}` },
    away: { name: `Away ${id}` },
    league: { name: "Test League" },
    engines: {
      primary: pick("primary"),
      aggressive: pick("aggressive"),
      safer: pick("safer"),
      venue: pick("venue")
    },
    profileAudit: {
      individuallyAnalysed: true,
      evidenceFingerprint: `evidence-${id}`,
      home: { evidence: { overall: 10, venue: 5, recent: 6 } },
      away: { evidence: { overall: 10, venue: 5, recent: 6 } }
    }
  };
}

test("banker slate selects up to three strict picks per engine", () => {
  const slate = selectBankerSlate([
    prediction(1, 84),
    prediction(2, 82),
    prediction(3, 80),
    prediction(4, 78)
  ]);

  assert.equal(slate.totalSelections, 12);
  assert.equal(slate.engines.primary.picks.length, 3);
  assert.equal(slate.engines.aggressive.picks.length, 3);
  assert.equal(slate.engines.safer.picks.length, 3);
  assert.equal(slate.engines.venue.picks.length, 3);
});

test("banker slate rejects thin individual samples", () => {
  const thin = prediction(1, 90);
  thin.profileAudit.home.evidence.venue = 1;
  const slate = selectBankerSlate([thin]);
  assert.equal(slate.totalSelections, 0);
  assert.match(
    slate.rejectionSummary.primary.topReasons[0].reason,
    /venue history/i
  );
});

test("anti-zombie detector withholds three cloned evidence signatures", () => {
  const candidates = [1, 2, 3].map((id) => ({
    fixture: { id },
    prediction: {
      profileAudit: { evidenceFingerprint: "same-evidence" },
      enginePicks: {
        primary: { key: "home-1x", confidence: 57 },
        aggressive: { key: "over-15", confidence: 60 },
        safer: { key: "home-1x", confidence: 57 },
        venue: { key: "ht-draw", confidence: 36.9 }
      }
    }
  }));

  const result = detectSuspiciousPredictionCandidates(candidates);
  assert.equal(result.withheld, 3);
  assert.equal(result.flaggedGroups.length, 1);
});
