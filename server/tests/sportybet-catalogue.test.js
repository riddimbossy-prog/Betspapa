import test from "node:test";
import assert from "node:assert/strict";

import {
  sportyBetProviderFixtures,
  sportyEventRecord
} from "../src/providers/sportyBet.js";
import { chooseFlashBoard, historyPackage } from "../src/services/flashPickService.js";
import { alignSportyBetReferences } from "../src/services/syncService.js";

const kickoff = Date.parse("2026-09-08T15:00:00.000Z");

function catalogueFixture() {
  const record = sportyEventRecord({
    eventId: "sr:match:12345",
    estimateStartTime: kickoff,
    homeTeamId: "sr:competitor:home",
    awayTeamId: "sr:competitor:away",
    homeTeamName: "Man City",
    awayTeamName: "Arsenal FC",
    sport: {
      category: {
        name: "England",
        tournament: {
          id: "sr:tournament:17",
          name: "Premier League"
        }
      }
    },
    markets: []
  });
  return sportyBetProviderFixtures([record], "2026-09-08")[0];
}

test("SportyBet events become stable upcoming provider fixtures for the requested date", () => {
  const fixture = catalogueFixture();
  assert.equal(fixture.source, "sportybet");
  assert.equal(fixture.sportyBetEventId, "sr:match:12345");
  assert.equal(fixture.fixture.date, "2026-09-08T15:00:00.000Z");
  assert.equal(fixture.fixture.status.short, "NS");
  assert.equal(fixture.league.name, "Premier League");
  assert.equal(fixture.league.season, 2026);
  assert.equal(fixture.teams.home.name, "Man City");
  assert.ok(fixture.fixture.id < 0);
  assert.ok(fixture.league.id < 0);
  assert.ok(fixture.teams.home.id < 0);

  const repeat = catalogueFixture();
  assert.equal(repeat.fixture.id, fixture.fixture.id);
  assert.equal(repeat.teams.home.id, fixture.teams.home.id);
  assert.equal(
    sportyBetProviderFixtures([
      sportyEventRecord({
        eventId: "other-day",
        estimateStartTime: Date.parse("2026-09-09T15:00:00.000Z"),
        homeTeamName: "A",
        awayTeamName: "B",
        markets: []
      })
    ], "2026-09-08").length,
    0
  );
});

test("SportyBet catalogue reuses stored league and team identities for historical analysis", () => {
  const fixture = catalogueFixture();
  const aligned = alignSportyBetReferences([fixture], {
    teams: [
      {
        id: 11,
        external_team_id: 50,
        name: "Manchester City",
        country: "England",
        logo_url: "city.svg"
      },
      {
        id: 12,
        external_team_id: 42,
        name: "Arsenal",
        country: "England",
        logo_url: "arsenal.svg"
      }
    ],
    leagues: [
      {
        id: 7,
        external_league_id: 39,
        season: 2026,
        name: "Premier League",
        country: "England",
        logo_url: "pl.svg",
        competition_type: "LEAGUE"
      }
    ]
  });

  assert.equal(aligned.matchedTeams, 2);
  assert.equal(aligned.matchedLeagues, 1);
  assert.equal(aligned.response[0].teams.home.id, 50);
  assert.equal(aligned.response[0].teams.home.name, "Manchester City");
  assert.equal(aligned.response[0].teams.away.id, 42);
  assert.equal(aligned.response[0].league.id, 39);
  assert.equal(aligned.response[0].league.type, "League");
});

test("unmatched SportyBet identities stay isolated from API-Football ID space", () => {
  const fixture = catalogueFixture();
  const aligned = alignSportyBetReferences([fixture]);
  assert.equal(aligned.matchedTeams, 0);
  assert.equal(aligned.matchedLeagues, 0);
  assert.ok(aligned.response[0].teams.home.id < -1_000_000_000);
  assert.ok(aligned.response[0].league.id < -1_000_000_000);
});

test("the Flash history pack carries trusted same-league results across seasons", () => {
  const fixture = {
    kickoff: "2026-09-08T15:00:00.000Z",
    season: 2026,
    league: { id: 99, external_league_id: 39, season: 2026 },
    home: { id: 11 },
    away: { id: 12 }
  };
  const rows = Array.from({ length: 5 }, (_value, index) => ({
    league_id: 7,
    season: 2025,
    fixture_date: `2026-0${index + 1}-01T12:00:00.000Z`,
    home_team_id: 11,
    away_team_id: 20 + index,
    halftime_home: 1,
    halftime_away: 0,
    fulltime_home: 2,
    fulltime_away: 1,
    status: "FT"
  }));
  const history = historyPackage(rows, fixture, new Map([[39, new Set([7, 99])]]));
  assert.equal(history.homeGames.length, 5);
  assert.equal(history.homeGames[0].ftHome, 2);
});

test("Flash rolls from a fully skipped today board to tomorrow's qualified slate", () => {
  const today = { date: "2026-09-08", reviewedFixtures: 73, pickCount: 0, picks: [] };
  const tomorrow = { date: "2026-09-09", reviewedFixtures: 54, pickCount: 1, picks: [{ fixtureId: 10 }] };
  assert.deepEqual(chooseFlashBoard(today, tomorrow, today.date), {
    ...tomorrow,
    requestedDate: today.date,
    rolledForward: true
  });

  const validToday = { ...today, pickCount: 1, picks: [{ fixtureId: 9 }] };
  assert.equal(chooseFlashBoard(validToday, tomorrow, today.date).date, today.date);
});
