import test from "node:test";
import assert from "node:assert/strict";
import { buildProfilesFromFixtures } from "../src/services/profileService.js";

const fixtures = [
  {
    league_id: 10,
    season: 2026,
    fixture_date: "2026-07-01T12:00:00Z",
    home_team_id: 1,
    away_team_id: 2,
    halftime_home: 1,
    halftime_away: 0,
    fulltime_home: 2,
    fulltime_away: 1,
    status: "FT"
  },
  {
    league_id: 10,
    season: 2026,
    fixture_date: "2026-07-08T12:00:00Z",
    home_team_id: 2,
    away_team_id: 1,
    halftime_home: 0,
    halftime_away: 0,
    fulltime_home: 0,
    fulltime_away: 1,
    status: "FT"
  }
];

test("profile builder creates correct team-perspective HT/FT transitions", () => {
  const result = buildProfilesFromFixtures(fixtures, 10, 2026);
  const team1Overall = result.htftRows.find((row) => row.team_id === 1 && row.scope === "overall");
  const team2Overall = result.htftRows.find((row) => row.team_id === 2 && row.scope === "overall");

  assert.equal(team1Overall.ww, 1);
  assert.equal(team1Overall.dw, 1);
  assert.equal(team1Overall.matches_played, 2);

  assert.equal(team2Overall.ll, 1);
  assert.equal(team2Overall.dl, 1);
  assert.equal(team2Overall.matches_played, 2);
});

test("goal profile derives GG and totals from actual scores", () => {
  const result = buildProfilesFromFixtures(fixtures, 10, 2026);
  const team1Overall = result.goalRows.find((row) => row.team_id === 1 && row.scope === "overall");

  assert.equal(team1Overall.scoring_rate, 1);
  assert.equal(team1Overall.btts_rate, 0.5);
  assert.equal(team1Overall.over_15_rate, 0.5);
  assert.equal(team1Overall.over_25_rate, 0.5);
  assert.equal(team1Overall.under_35_rate, 1);
  assert.equal(team1Overall.second_half_scoring_rate, 1);
});
