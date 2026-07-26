import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  analyseFixture,
  CLASSIFICATIONS,
  MARKETS
} from "../src/engine/athena-transition-engine/src/index.js";
import {
  athenaSelectionLabel,
  settleAthenaMarket
} from "../src/services/athenaPickService.js";
import { buildProfilesFromFixtures } from "../src/services/profileService.js";
import { gradeEnginePick } from "../src/services/gradingService.js";

const root = resolve(new URL("../../", import.meta.url).pathname);

function team(name, htft, half = {}) {
  return {
    name,
    matchesPlayed: 20,
    htft,
    goals: {
      over25: 13,
      under25: 7,
      over15: 17,
      btts: 12,
      scoredMatches: 17,
      concededMatches: 16,
      failedToScoreMatches: 3,
      cleanSheetMatches: 4,
      averageTotalGoals: 3.2,
      goalsFor: 34,
      goalsAgainst: 30,
      firstHalfGoalsFor: 14,
      firstHalfGoalsAgainst: 12,
      secondHalfGoalsFor: 26,
      secondHalfGoalsAgainst: 24,
      firstHalfScoringRate: 0.55,
      firstHalfConcedingRate: 0.50,
      secondHalfScoringRate: 0.80,
      secondHalfConcedingRate: 0.75,
      firstHalfOver05Rate: 0.65,
      firstHalfOver15Rate: 0.25,
      secondHalfOver05Rate: 0.80,
      secondHalfOver15Rate: 0.50,
      scoredBothHalvesRate: 0.45,
      goalsBothHalvesRate: 0.60,
      secondHalfWinRate: 0.45,
      secondHalfDrawRate: 0.25,
      eventCoverageMatches: 16,
      goalsWhileTrailing: 3,
      equalisersScored: 2,
      winningGoalsAfterEqualising: 1,
      leadsSurrendered: 3,
      minute46To60For: 3,
      minute61To75For: 4,
      minute76To90For: 5,
      ...half
    },
    venue: { matchesPlayed: 10 }
  };
}

const recovery = { ww: 2, wd: 1, wl: 1, dw: 2, dd: 2, dl: 2, lw: 4, ld: 1, ll: 5 };
const surrender = { ww: 3, wd: 2, wl: 4, dw: 1, dd: 2, dl: 2, lw: 1, ld: 1, ll: 4 };

test("Athena v3 identifies a confirmed full-reversal swing", () => {
  const result = analyseFixture({
    id: "full-reversal",
    home: team("Recovery FC", recovery),
    away: team("Lead Drop FC", surrender),
    odds: { home: 2.2, draw: 3.4, away: 3.0 }
  });

  assert.equal(result.classification.type, CLASSIFICATIONS.SWING_FULL_REVERSAL);
  assert.equal(result.classification.side, "HOME");
  assert.equal(result.classification.eventCoverageReady, true);
  assert.equal(result.classification.eventConfirmation, true);
  assert.ok([
    MARKETS.HOME_SECOND_HALF_OVER_0_5,
    MARKETS.HOME_WIN_EITHER_HALF,
    MARKETS.SECOND_HALF_OVER_0_5,
    MARKETS.OVER_1_5
  ].includes(result.banker.market));
});

test("Athena v3 separates a lead-surrender swing from a full reversal", () => {
  const recoveryToDraw = { ww: 2, wd: 0, wl: 0, dw: 1, dd: 2, dl: 1, lw: 0, ld: 5, ll: 9 };
  const givesUpLeads = { ww: 2, wd: 5, wl: 0, dw: 1, dd: 2, dl: 1, lw: 0, ld: 0, ll: 9 };
  const result = analyseFixture({
    id: "lead-surrender",
    home: team("Recovery Draw FC", recoveryToDraw),
    away: team("Lead Surrender FC", givesUpLeads)
  });

  assert.equal(result.classification.type, CLASSIFICATIONS.SWING_LEAD_SURRENDER);
  assert.equal(result.classification.side, "HOME");
});

test("Athena v3 identifies late second-half separation", () => {
  const lateWinner = { ww: 2, wd: 0, wl: 0, dw: 5, dd: 2, dl: 1, lw: 0, ld: 0, ll: 10 };
  const lateLoser = { ww: 2, wd: 0, wl: 0, dw: 1, dd: 2, dl: 5, lw: 0, ld: 0, ll: 10 };
  const result = analyseFixture({
    id: "late-separation",
    home: team("Late Winner FC", lateWinner),
    away: team("Late Loser FC", lateLoser)
  });

  assert.equal(result.classification.type, CLASSIFICATIONS.SWING_LATE_SEPARATION);
  assert.equal(result.classification.side, "HOME");
});

test("Athena v3 keeps two-way instability on neutral markets", () => {
  const unstable = { ww: 2, wd: 2, wl: 2, dw: 2, dd: 2, dl: 2, lw: 2, ld: 2, ll: 4 };
  const result = analyseFixture({
    id: "two-way-instability",
    home: team("Swing Home", unstable),
    away: team("Swing Away", unstable)
  });

  assert.equal(result.classification.type, CLASSIFICATIONS.SWING_TWO_WAY_INSTABILITY);
  assert.equal(result.classification.side, null);
  assert.ok([
    MARKETS.SECOND_HALF_OVER_0_5,
    MARKETS.SECOND_HALF_OVER_1_5,
    MARKETS.GOALS_BOTH_HALVES,
    MARKETS.OVER_1_5,
    MARKETS.OVER_2_5,
    MARKETS.BTTS_YES
  ].includes(result.banker.market));
});

test("Athena v3 hard-stops a reversal route when half-goal data is missing", () => {
  const result = analyseFixture({
    id: "missing-half-data",
    home: {
      name: "Recovery FC",
      matchesPlayed: 20,
      htft: recovery,
      goals: { over25: 13, under25: 7, averageTotalGoals: 3.2 }
    },
    away: {
      name: "Lead Drop FC",
      matchesPlayed: 20,
      htft: surrender,
      goals: { over25: 13, under25: 7, averageTotalGoals: 3.2 }
    }
  });

  assert.equal(result.classification.type, CLASSIFICATIONS.SWING_FALSE_SIGNAL);
  assert.equal(result.banker.market, MARKETS.NO_PICK);
  assert.ok(result.classification.warnings.includes("HALF_GOAL_DATA_MISSING"));
});

test("Athena v3 measures event coverage against the recent 20-match sample", () => {
  const doubledRecovery = Object.fromEntries(Object.entries(recovery).map(([key, value]) => [key, value * 2]));
  const doubledSurrender = Object.fromEntries(Object.entries(surrender).map(([key, value]) => [key, value * 2]));
  const homeInput = team("Coverage Home", doubledRecovery, { eventCoverageMatches: 14 });
  const awayInput = team("Coverage Away", doubledSurrender, { eventCoverageMatches: 14 });
  const result = analyseFixture({
    id: "event-coverage-window",
    home: {
      ...homeInput,
      matchesPlayed: 40,
      goals: { ...homeInput.goals, over25: 26, under25: 14 }
    },
    away: {
      ...awayInput,
      matchesPlayed: 40,
      goals: { ...awayInput.goals, over25: 26, under25: 14 }
    }
  });

  assert.equal(result.metrics.home.eventCoverageDenominator, 20);
  assert.equal(result.metrics.home.eventCoverageRate, 0.7);
  assert.equal(result.metrics.home.eventDataReady, true);
});

test("Athena v3 rejects an HT/FT swing that half-goal data does not confirm", () => {
  const lowSecondHalf = {
    secondHalfScoringRate: 0.25,
    secondHalfConcedingRate: 0.25,
    secondHalfOver05Rate: 0.30,
    secondHalfOver15Rate: 0.10,
    goalsBothHalvesRate: 0.15,
    secondHalfGoalsFor: 6,
    secondHalfGoalsAgainst: 5
  };
  const result = analyseFixture({
    id: "false-swing",
    home: team("False Recovery", recovery, lowSecondHalf),
    away: team("False Collapse", surrender, lowSecondHalf)
  });

  assert.equal(result.classification.type, CLASSIFICATIONS.SWING_FALSE_SIGNAL);
  assert.equal(result.banker.market, MARKETS.NO_PICK);
});

test("profile builder stores goals scored and conceded in each half", () => {
  const profiles = buildProfilesFromFixtures([{
    id: 1,
    fixture_date: "2026-07-01T12:00:00Z",
    league_id: 77,
    season: 2026,
    home_team_id: 10,
    away_team_id: 20,
    halftime_home: 1,
    halftime_away: 0,
    fulltime_home: 2,
    fulltime_away: 2,
    status: "FT",
    eventCoverageStatus: "COMPLETE",
    events: [
      { scoring_team_id: 20, time_bucket: "46_60", is_comeback_goal: true, is_equaliser: false },
      { scoring_team_id: 20, time_bucket: "76_90_PLUS", is_comeback_goal: true, is_equaliser: true }
    ]
  }], 77, 2026);

  const home = profiles.halfGoalRows.find((row) => row.team_id === 10 && row.scope === "overall");
  const away = profiles.halfGoalRows.find((row) => row.team_id === 20 && row.scope === "overall");
  assert.equal(home.first_half_goals_for, 1);
  assert.equal(home.second_half_goals_against, 2);
  assert.equal(home.leads_surrendered, 1);
  assert.equal(away.second_half_goals_for, 2);
  assert.equal(away.goals_while_trailing, 2);
  assert.equal(away.equalisers_scored, 1);
});

test("Athena v3 second-half and both-halves markets settle automatically", () => {
  const fixture = {
    status: "FT",
    halftime_home: 1,
    halftime_away: 0,
    fulltime_home: 2,
    fulltime_away: 2
  };
  assert.equal(settleAthenaMarket(fixture, MARKETS.SECOND_HALF_OVER_1_5).outcome, "WIN");
  assert.equal(settleAthenaMarket(fixture, MARKETS.AWAY_SECOND_HALF_OVER_0_5).outcome, "WIN");
  assert.equal(settleAthenaMarket(fixture, MARKETS.GOALS_BOTH_HALVES).outcome, "WIN");
  assert.equal(gradeEnginePick({ key: "away-second-half-dnb" }, fixture, "Home", "Away"), "WIN");
});

test("Athena v3 does not mix extra-time results into 90-minute half-goal decisions", () => {
  const profiles = buildProfilesFromFixtures([
    {
      id: 1,
      fixture_date: "2026-07-01T12:00:00Z",
      league_id: 77,
      season: 2026,
      home_team_id: 10,
      away_team_id: 20,
      halftime_home: 0,
      halftime_away: 0,
      fulltime_home: 1,
      fulltime_away: 0,
      status: "FT"
    },
    {
      id: 2,
      fixture_date: "2026-07-02T12:00:00Z",
      league_id: 77,
      season: 2026,
      home_team_id: 10,
      away_team_id: 20,
      halftime_home: 0,
      halftime_away: 0,
      fulltime_home: 3,
      fulltime_away: 2,
      status: "AET"
    }
  ], 77, 2026);

  const legacy = profiles.htftRows.find((row) => row.team_id === 10 && row.scope === "overall");
  const athena = profiles.halfGoalRows.find((row) => row.team_id === 10 && row.scope === "overall");
  assert.equal(legacy.matches_played, 2);
  assert.equal(athena.matches_played, 1);
  assert.equal(athena.second_half_goals_for, 1);

  assert.equal(settleAthenaMarket({
    status: "AET",
    halftime_home: 0,
    halftime_away: 0,
    fulltime_home: 3,
    fulltime_away: 2
  }, MARKETS.SECOND_HALF_OVER_1_5).outcome, "REVIEW");
});

test("new Athena market labels are plain English", () => {
  assert.equal(
    athenaSelectionLabel(MARKETS.HOME_SECOND_HALF_OVER_0_5, "Lions", "Stars"),
    "Lions to Score in the Second Half"
  );
  assert.equal(
    athenaSelectionLabel(MARKETS.GOALS_BOTH_HALVES, "Lions", "Stars"),
    "Goals in Both Halves"
  );
});

test("Athena public UI explains the pick without exposing technical arbitration", async () => {
  const portal = await readFile(resolve(root, "assets/js/portal.v1200.js"), "utf8");
  const routes = await readFile(resolve(root, "server/src/routes/publicRoutes.js"), "utf8");
  assert.match(portal, /Why Athena picked this/);
  assert.match(portal, /Goals by half/);
  assert.match(portal, /ATHENA v3/);
  assert.doesNotMatch(portal, /RC1 priority changed/);
  assert.match(routes, /internalAudit,/);
  assert.match(routes, /routeAudit,/);
  assert.match(routes, /arbitration,/);
});

test("Athena v3 migration includes event coverage and half-goal profile tables", async () => {
  const sql = await readFile(resolve(root, "supabase/BETSPAPA_V1_20_0_ATHENA_V3.sql"), "utf8");
  assert.match(sql, /create table if not exists public\.fixture_goal_events/i);
  assert.match(sql, /create table if not exists public\.fixture_event_coverage/i);
  assert.match(sql, /create table if not exists public\.team_half_goal_profiles/i);
  assert.match(sql, /second_half_over_15_rate/i);
  assert.match(sql, /goals_while_trailing/i);
});
