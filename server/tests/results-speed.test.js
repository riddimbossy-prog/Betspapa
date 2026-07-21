import test from "node:test";
import assert from "node:assert/strict";

import { getResultsIntelligence } from "../src/services/intelligenceService.js";

class Query {
  constructor(rows, tracker) {
    this.rows = rows;
    this.tracker = tracker;
    this.filters = [];
    this.sort = null;
  }

  select() { return this; }

  in(column, values) {
    this.tracker.maxInSize = Math.max(this.tracker.maxInSize, values.length);
    if (values.length > 100) throw new Error(`Oversized .in() request: ${values.length}`);
    const set = new Set(values);
    this.filters.push((row) => set.has(row[column]));
    return this;
  }

  eq(column, value) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  gte(column, value) {
    this.filters.push((row) => String(row[column]) >= String(value));
    return this;
  }

  lte(column, value) {
    this.filters.push((row) => String(row[column]) <= String(value));
    return this;
  }

  order(column, { ascending = true } = {}) {
    this.sort = { column, ascending };
    return this;
  }

  async range(from, to) {
    let rows = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
    if (this.sort) {
      const { column, ascending } = this.sort;
      rows = [...rows].sort((a, b) => {
        const av = String(a[column] ?? "");
        const bv = String(b[column] ?? "");
        return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    return { data: rows.slice(from, to + 1), error: null };
  }
}

function fakeSupabase(tables, tracker) {
  return {
    from(name) {
      return new Query(tables[name] || [], tracker);
    }
  };
}

test("Results handles large historical fixture sets in safe Supabase batches", async () => {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() - 1);
  const kickoff = now.toISOString();
  const createdAt = new Date(now.getTime() - 60_000).toISOString();

  const fixtures = [];
  const predictions = [];
  const teams = [];

  for (let index = 1; index <= 101; index += 1) {
    const homeId = index * 2 - 1;
    const awayId = index * 2;
    fixtures.push({
      id: index,
      external_fixture_id: `fixture-${index}`,
      fixture_date: kickoff,
      status: index === 1 ? "AWD" : "FT",
      league_id: 1,
      home_team_id: homeId,
      away_team_id: awayId,
      halftime_home: 1,
      halftime_away: 0,
      fulltime_home: 1,
      fulltime_away: 0
    });
    teams.push(
      { id: homeId, name: `Home ${index}`, logo_url: null },
      { id: awayId, name: `Away ${index}`, logo_url: null }
    );
    predictions.push({
      id: index,
      fixture_id: index,
      engine_version: "papasense-v1.10.0",
      published: true,
      created_at: createdAt,
      market_scores: {
        enginePicks: {
          primary: {
            key: "home-win",
            market: "Full-Time Result",
            selection: `Home ${index} Win`,
            confidence: 80
          }
        }
      }
    });
  }

  const tracker = { maxInSize: 0 };
  const supabase = fakeSupabase({
    fixtures,
    predictions,
    teams,
    leagues: [{ id: 1, name: "Test League", country: "Test" }]
  }, tracker);

  const result = await getResultsIntelligence(supabase, 7);

  assert.equal(result.engines.primary.wins, 101);
  assert.equal(result.engines.primary.losses, 0);
  assert.equal(result.recent.length, 80);
  assert.ok(tracker.maxInSize <= 100);
});
