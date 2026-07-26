import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ENGINE_VERSION, FINISHED_PROFILE_STATUSES, SERVICE_VERSION } from "../src/config.js";
import { predictMatch } from "../src/engine/transitionEngine.js";
import { demoFixtures } from "../src/data/demoFixtures.js";

const testRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

function robustFixture({
  homeTransitions,
  awayTransitions,
  homeGoals = {},
  awayGoals = {},
  calibration = {}
}) {
  const profile = (matches, values) => ({ matches, ...values });
  const goals = (matches, values) => ({
    matches,
    scoreRate: 0.8,
    concedeRate: 0.45,
    failedToScoreRate: 0.2,
    cleanSheetRate: 0.4,
    bttsRate: 0.48,
    over15Rate: 0.72,
    over25Rate: 0.46,
    under35Rate: 0.82,
    scored2PlusRate: 0.42,
    conceded2PlusRate: 0.3,
    firstHalfScoringRate: 0.55,
    secondHalfScoringRate: 0.62,
    ...values
  });
  const halfGoals = (matches) => ({
    matches,
    firstHalfScoringRate: 0.55,
    firstHalfConcedingRate: 0.35,
    secondHalfScoringRate: 0.65,
    secondHalfConcedingRate: 0.4,
    firstHalfOver05Rate: 0.7,
    firstHalfOver15Rate: 0.25,
    secondHalfOver05Rate: 0.75,
    secondHalfOver15Rate: 0.35,
    scoredBothHalvesRate: 0.32,
    goalsBothHalvesRate: 0.45,
    eventCoverageRate: 0.8
  });

  const team = (name, transitions, goalValues) => ({
    name,
    htft: {
      overall: profile(24, transitions),
      venue: profile(12, transitions),
      recent: profile(6, transitions)
    },
    goals: {
      overall: goals(24, goalValues),
      venue: goals(12, goalValues),
      recent: goals(6, goalValues)
    },
    halfGoals: {
      overall: halfGoals(24),
      venue: halfGoals(12),
      recent: halfGoals(6)
    }
  });

  return {
    fixtureId: "papasense-v2-test",
    competition: "Resolution Test League",
    kickoff: "2026-07-20T12:00:00Z",
    calibration,
    home: team("Home Test", homeTransitions, homeGoals),
    away: team("Away Test", awayTransitions, awayGoals),
    league: { goals: { bttsRate: 0.48, under35Rate: 0.8 } }
  };
}

const stableHome = robustFixture({
  homeTransitions: { WW: 14, WD: 2, WL: 0, DW: 3, DD: 1, DL: 1, LW: 1, LD: 0, LL: 2 },
  awayTransitions: { WW: 1, WD: 0, WL: 1, DW: 1, DD: 1, DL: 3, LW: 0, LD: 1, LL: 17 }
});

test("v1.21.0 exposes PapaSense v2 and uses only normal FT history", () => {
  assert.equal(SERVICE_VERSION, "1.21.0");
  assert.equal(ENGINE_VERSION, "papasense-v2.0.0-four-engine-resolution");
  assert.deepEqual([...FINISHED_PROFILE_STATUSES], ["FT"]);
});

test("thin samples return a real NO PICK instead of a forced direction", () => {
  const prediction = predictMatch(demoFixtures[2]);
  assert.equal(prediction.noBet, true);
  assert.equal(prediction.directionMode, "no-pick");
  assert.equal(prediction.enginePicks.primary.key, "no-pick");
  assert.equal(prediction.enginePicks.primary.consensusEligible, false);
});

test("Safer is a true same-story containment market", () => {
  const prediction = predictMatch(stableHome);
  assert.equal(prediction.enginePicks.primary.key, "home-win-either-half");
  assert.ok(["home-dnb", "home-1x"].includes(prediction.enginePicks.safer.key));
  assert.equal(prediction.enginePicks.safer.marketPolicy.purpose, "containment");
  assert.equal(prediction.enginePicks.safer.marketPolicy.parentKey, "home-win-either-half");
  assert.ok(prediction.enginePicks.safer.confidence > prediction.enginePicks.primary.confidence);
});

test("Aggressive only escalates Papa's existing story", () => {
  const prediction = predictMatch(demoFixtures[0]);
  assert.equal(prediction.enginePicks.primary.key, "away-x2");
  assert.equal(prediction.enginePicks.aggressive.key, "away-dnb");
  assert.equal(prediction.enginePicks.aggressive.marketPolicy.purpose, "same-story-escalation");
  assert.equal(prediction.enginePicks.aggressive.marketPolicy.parentKey, "away-x2");
});

test("Venue Pattern is independently generated from home-versus-away evidence", () => {
  const prediction = predictMatch(stableHome);
  const venue = prediction.enginePicks.venue;
  assert.equal(venue.available, true);
  assert.equal(venue.marketPolicy.venueIndependent, true);
  assert.equal(venue.marketPolicy.purpose, "independent-venue");
  assert.ok(venue.venueRoute);
  assert.match(venue.explanationParagraph, /home record|away record|home.*away/i);
});

test("each engine keeps separate calibration metadata", () => {
  const fixture = structuredClone(stableHome);
  fixture.calibration = {
    primary: {
      "home-win-either-half": { sampleCount: 80, lowerBound: 0.78, observedHitRate: 0.82 }
    },
    safer: {
      "home-dnb": { sampleCount: 90, lowerBound: 0.84, observedHitRate: 0.87 }
    }
  };
  const prediction = predictMatch(fixture);
  assert.equal(prediction.enginePicks.primary.internalAudit.calibrationSource, "settled-history-calibration");
  assert.equal(prediction.enginePicks.primary.confidence, 78);
  assert.equal(prediction.enginePicks.safer.internalAudit.calibrationSource, "settled-history-calibration");
});

test("public explanations are plain English while technical detail stays in internalAudit", () => {
  const prediction = predictMatch(stableHome);
  for (const pick of Object.values(prediction.enginePicks)) {
    assert.ok(pick.publicExplanation);
    assert.ok(pick.internalAudit || pick.available === false);
    assert.doesNotMatch(pick.publicExplanation, /resolutionScore|sampleGate|RC1|arbiter/i);
  }
});

test("v1.21 migration installs result and calibration tables", async () => {
  const sql = await readFile(resolve(testRoot, "supabase/BETSPAPA_V1_21_0_PAPASENSE_V2.sql"), "utf8");
  assert.match(sql, /create table if not exists public\.engine_pick_results/i);
  assert.match(sql, /create table if not exists public\.engine_calibration_profiles/i);
  assert.match(sql, /unique \(prediction_id, engine_key\)/i);
});
