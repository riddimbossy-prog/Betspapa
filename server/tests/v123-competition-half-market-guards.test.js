import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  COMPETITION_TYPES,
  classifyCompetitionName,
  competitionPolicy,
  resolveCompetitionType
} from "../src/engine/competitionPolicy.js";
import { analyseFixture, MARKETS } from "../src/engine/athena-transition-engine/src/index.js";
import { arbitrateAthenaV11 } from "../src/engine/athenaV11Arbiter.js";
import { predictMatch } from "../src/engine/transitionEngine.js";
import { demoFixtures } from "../src/data/demoFixtures.js";

const root = resolve(new URL("../../", import.meta.url).pathname);

function goals({
  shScore = 0.6,
  shConcede = 0.6,
  shOver05 = 0.7,
  shOver15 = 0.4,
  both = 0.5,
  shWin = 0.4,
  shDraw = 0.3,
  eventCoverageMatches = 16
} = {}) {
  return {
    over25: 12,
    under25: 8,
    over15: 17,
    btts: 12,
    scoredMatches: 18,
    concededMatches: 17,
    failedToScoreMatches: 2,
    cleanSheetMatches: 3,
    averageTotalGoals: 3,
    goalsFor: 35,
    goalsAgainst: 31,
    firstHalfGoalsFor: 15,
    firstHalfGoalsAgainst: 13,
    secondHalfGoalsFor: Math.round(shScore * 24),
    secondHalfGoalsAgainst: Math.round(shConcede * 22),
    firstHalfScoringRate: 0.7,
    firstHalfConcedingRate: 0.65,
    secondHalfScoringRate: shScore,
    secondHalfConcedingRate: shConcede,
    firstHalfOver05Rate: 0.78,
    firstHalfOver15Rate: 0.25,
    secondHalfOver05Rate: shOver05,
    secondHalfOver15Rate: shOver15,
    scoredBothHalvesRate: 0.5,
    goalsBothHalvesRate: both,
    secondHalfWinRate: shWin,
    secondHalfDrawRate: shDraw,
    eventCoverageMatches,
    goalsWhileTrailing: 3,
    equalisersScored: 2,
    winningGoalsAfterEqualising: 1,
    leadsSurrendered: 3,
    minute46To60For: 3,
    minute61To75For: 4,
    minute76To90For: 5
  };
}

function team(name, htft, overall, venue, recent) {
  return {
    name,
    matchesPlayed: 20,
    htft,
    goals: overall,
    venue: { type: "HOME", matchesPlayed: 10, htft, goals: venue },
    recent: { type: "RECENT6", matchesPlayed: 6, htft: {
      ww: 1, wd: 0, wl: 1, dw: 1, dd: 0, dl: 1, lw: 1, ld: 0, ll: 1
    }, goals: recent }
  };
}

const recovery = { ww: 2, wd: 1, wl: 1, dw: 2, dd: 2, dl: 2, lw: 4, ld: 1, ll: 5 };
const surrender = { ww: 3, wd: 2, wl: 4, dw: 1, dd: 2, dl: 2, lw: 1, ld: 1, ll: 4 };

test("competition guard allows verified leagues only", () => {
  assert.equal(competitionPolicy({ name: "Premier League", competition_type: "LEAGUE", prediction_enabled: true }).eligible, true);
  assert.equal(competitionPolicy({ name: "FA Cup", competition_type: "CUP", prediction_enabled: false }).eligible, false);
  assert.equal(competitionPolicy({ name: "Club Friendlies", competition_type: "FRIENDLY", prediction_enabled: false }).eligible, false);
  assert.equal(competitionPolicy({ name: "Unverified Competition", competition_type: "UNKNOWN" }).eligible, false);
});

test("competition names identify friendlies and cup tournaments", () => {
  assert.equal(classifyCompetitionName("Club Friendlies"), COMPETITION_TYPES.FRIENDLY);
  assert.equal(classifyCompetitionName("UEFA Champions League"), COMPETITION_TYPES.CUP);
  assert.equal(classifyCompetitionName("Copa del Rey"), COMPETITION_TYPES.CUP);
  assert.equal(resolveCompetitionType({ providerType: "League", name: "FA Cup" }), COMPETITION_TYPES.CUP);
});

test("borderline team second-half scoring is blocked while neutral evidence remains available", () => {
  const lateWinner = { ww: 2, wd: 0, wl: 0, dw: 5, dd: 2, dl: 1, lw: 0, ld: 0, ll: 10 };
  const lateLoser = { ww: 2, wd: 0, wl: 0, dw: 1, dd: 2, dl: 5, lw: 0, ld: 0, ll: 10 };
  const result = analyseFixture({
    id: "borderline-team-sh",
    home: team("Recovery", lateWinner, goals({ shScore: 0.64, shConcede: 0.64 }), goals({ shScore: 0.64, shConcede: 0.64 }), goals({ shScore: 0.64, shConcede: 0.64 })),
    away: team("Surrender", lateLoser, goals({ shScore: 0.64, shConcede: 0.64 }), goals({ shScore: 0.64, shConcede: 0.64 }), goals({ shScore: 0.64, shConcede: 0.64 }))
  });

  assert.notEqual(result.banker.market, MARKETS.HOME_SECOND_HALF_OVER_0_5);
  assert.ok(result.topMarkets.some((row) => row.market === MARKETS.SECOND_HALF_OVER_0_5));
  assert.ok(!result.secondary.some((row) => row.market === MARKETS.HOME_SECOND_HALF_OVER_0_5));
});

test("Athena arbitration prefers neutral second-half goal unless named-team evidence is exceptional", () => {
  const home = team(
    "Recovery",
    recovery,
    goals({ shScore: 0.95, shConcede: 0.75, shOver05: 0.72 }),
    goals({ shScore: 0.95, shConcede: 0.75, shOver05: 0.72 }),
    goals({ shScore: 0.95, shConcede: 0.75, shOver05: 0.72 })
  );
  const away = team(
    "Surrender",
    surrender,
    goals({ shScore: 0.65, shConcede: 0.95, shOver05: 0.72 }),
    goals({ shScore: 0.65, shConcede: 0.95, shOver05: 0.72 }),
    goals({ shScore: 0.65, shConcede: 0.95, shOver05: 0.72 })
  );
  const result = analyseFixture({ id: "exceptional-team-sh", home, away });
  const venueResult = analyseFixture({ id: "exceptional-team-sh-venue", home, away });
  const arbitration = arbitrateAthenaV11({
    result,
    venueResult,
    samples: { homeOverall: 20, awayOverall: 20, homeVenue: 10, awayVenue: 10, homeRecent: 6, awayRecent: 6 },
    separation: null
  });

  assert.ok(arbitration.primary);
  assert.ok([
    MARKETS.SECOND_HALF_OVER_0_5,
    MARKETS.HOME_SECOND_HALF_OVER_0_5,
    MARKETS.OVER_1_5
  ].includes(arbitration.primary.market));
  if (arbitration.primary.market === MARKETS.HOME_SECOND_HALF_OVER_0_5) {
    const neutral = result.topMarkets.find((row) => row.market === MARKETS.SECOND_HALF_OVER_0_5);
    assert.ok(arbitration.primary.score >= 88);
    assert.ok(!neutral || arbitration.primary.score >= neutral.score + 8);
  }
});



test("PapaSense blocks related specialist markets when venue or recent evidence is weak", () => {
  const input = structuredClone(demoFixtures[0]);
  const scope = (overrides = {}) => ({
    matches: 10,
    firstHalfScoringRate: 0.72,
    firstHalfConcedingRate: 0.70,
    secondHalfScoringRate: 0.80,
    secondHalfConcedingRate: 0.80,
    firstHalfOver05Rate: 0.80,
    firstHalfOver15Rate: 0.35,
    secondHalfOver05Rate: 0.80,
    secondHalfOver15Rate: 0.60,
    scoredBothHalvesRate: 0.62,
    goalsBothHalvesRate: 0.70,
    secondHalfWinRate: 0.55,
    secondHalfDrawRate: 0.25,
    eventCoverageRate: 0.80,
    goalsWhileTrailing: 2,
    equalisersScored: 2,
    winningGoalsAfterEqualising: 1,
    leadsSurrendered: 2,
    minute61To75For: 2,
    minute76To90For: 2,
    minute61To75Against: 2,
    minute76To90Against: 2,
    ...overrides
  });

  input.home.halfGoals = {
    overall: scope(),
    venue: scope(),
    recent: scope({
      matches: 6,
      secondHalfScoringRate: 0.50,
      secondHalfWinRate: 0.30,
      firstHalfOver05Rate: 0.50,
      goalsBothHalvesRate: 0.30
    })
  };
  input.away.halfGoals = {
    overall: scope(),
    venue: scope(),
    recent: scope({
      matches: 6,
      secondHalfConcedingRate: 0.50,
      secondHalfOver05Rate: 0.50,
      firstHalfOver05Rate: 0.50,
      goalsBothHalvesRate: 0.30
    })
  };
  input.home.goals.recent.scoreRate = 0.50;
  input.away.goals.recent.concedeRate = 0.50;

  const prediction = predictMatch(input);
  const byKey = new Map(prediction.markets.map((market) => [market.key, market]));

  assert.ok(byKey.get("home-second-half-over-05").blockers.some((reason) => /conservative team-specific/i.test(reason)));
  assert.ok(byKey.get("home-second-half-dnb").blockers.some((reason) => /overall, venue and recent second-half win rates/i.test(reason)));
  assert.ok(byKey.get("first-half-over-05").blockers.some((reason) => /below 72%/i.test(reason)));
  assert.ok(byKey.get("goals-both-halves").blockers.some((reason) => /below 55%/i.test(reason)));
  assert.ok(byKey.get("home-over-05").blockers.some((reason) => /team-goal floor is below 70%/i.test(reason)));
});

test("v1.23 migration and services enforce league-only same-competition history", async () => {
  const migration = await readFile(resolve(root, "supabase/BETSPAPA_V1_23_0_COMPETITION_AND_HALF_MARKET_GUARDS.sql"), "utf8");
  const predictionService = await readFile(resolve(root, "server/src/services/predictionService.js"), "utf8");
  const athenaService = await readFile(resolve(root, "server/src/services/athenaPickService.js"), "utf8");
  const publicService = await readFile(resolve(root, "server/src/services/publicService.js"), "utf8");
  assert.match(migration, /competition_type/i);
  assert.match(migration, /prediction_enabled/i);
  assert.match(predictionService, /COMPETITION_EXCLUDED/);
  assert.match(predictionService, /sameCompetitionSeason/);
  assert.match(athenaService, /sameCompetitionSeason/);
  assert.match(athenaService, /competitionPolicy/);
  assert.match(publicService, /competitionPolicy/);
  assert.match(publicService, /allFixtures\.filter/);
});
