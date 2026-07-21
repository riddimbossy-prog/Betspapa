import test from "node:test";
import assert from "node:assert/strict";
import { extractTeamGoalOdds } from "../src/services/oddsService.js";

test("team-goal odds parser extracts median home and away Over 0.5/1.5 prices", () => {
  const rows = [
    {
      bookmakers: [
        {
          name: "Book A",
          bets: [
            {
              name: "Home Team Total Goals",
              values: [
                { value: "Over 0.5", odd: "1.10" },
                { value: "Over 1.5", odd: "1.64" }
              ]
            },
            {
              name: "Away Team Total Goals",
              values: [
                { value: "Over 0.5", odd: "1.38" },
                { value: "Over 1.5", odd: "2.50" }
              ]
            }
          ]
        },
        {
          name: "Book B",
          bets: [
            {
              name: "Team totals",
              values: [
                { value: "Home Over 0.5", odd: "1.12" },
                { value: "Home Over 1.5", odd: "1.68" },
                { value: "Away Over 0.5", odd: "1.42" },
                { value: "Away Over 1.5", odd: "2.60" }
              ]
            }
          ]
        }
      ]
    }
  ];

  const result = extractTeamGoalOdds(rows, { homeName: "Home Alpha", awayName: "Away Beta" });

  assert.equal(result.status, "available");
  assert.equal(result.bookmakerCount, 2);
  assert.deepEqual(result.teamGoals, {
    home: { over05: 1.11, over15: 1.66 },
    away: { over05: 1.4, over15: 2.55 }
  });
});
