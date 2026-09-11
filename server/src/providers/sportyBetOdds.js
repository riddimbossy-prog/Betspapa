import {
  flashFromSportyMarkets,
  loadSportyBetEventMarkets,
  loadSportyBetEvents,
  matchSportyBetOdds,
  nameSimilarity,
  normalizeTeamName,
  totalsFromSportyMarkets,
  visaFromSportyMarkets
} from "./sportyBet.js";

export {
  flashFromSportyMarkets,
  nameSimilarity,
  normalizeTeamName,
  matchSportyBetOdds,
  totalsFromSportyMarkets,
  visaFromSportyMarkets
};

export async function loadSportyBetGoalOdds(fixtures = []) {
  const map = new Map();
  if (!fixtures.length) return map;
  let events = [];
  try {
    events = await loadSportyBetEvents();
  } catch {
    return map;
  }
  for (const fixture of fixtures) {
    const hit = matchSportyBetOdds(events, fixture);
    if (!hit?.odds || !Object.values(hit.odds).some((price) => Number(price) > 1)) continue;
    map.set(Number(fixture.id), {
      ...hit.odds,
      source: "sportybet",
      book: "SportyBet",
      eventId: hit.eventId,
      url: hit.url
    });
  }
  return map;
}

export async function loadSportyBetFlashOdds(fixtures = [], { concurrency = 5, force = false } = {}) {
  const map = new Map();
  if (!fixtures.length) return map;
  let events = [];
  try {
    events = await loadSportyBetEvents({ force });
  } catch {
    return map;
  }

  const matched = fixtures
    .map((fixture) => ({ fixture, hit: matchSportyBetOdds(events, fixture) }))
    .filter((row) => row.hit?.eventId);
  let cursor = 0;
  async function worker() {
    while (cursor < matched.length) {
      const index = cursor;
      cursor += 1;
      const { fixture, hit } = matched[index];
      let detailed = {};
      try {
        detailed = flashFromSportyMarkets(await loadSportyBetEventMarkets(hit.eventId, { force }));
      } catch {
        // The compact upcoming feed may already contain Flash prices. Missing
        // detail is allowed to fall through, but the engine never guesses odds.
      }
      const prices = { ...(hit.odds || {}), ...detailed };
      const hasFlash = Object.keys(prices).some((key) =>
        key.startsWith("first-half-or-match-") ||
        /-(?:or)-(?:over|under|gg|any-clean-sheet)/.test(key)
      );
      if (!hasFlash) continue;
      map.set(Number(fixture.id), {
        ...prices,
        source: "sportybet",
        book: "SportyBet",
        eventId: hit.eventId,
        url: hit.url
      });
    }
  }
  await Promise.all(Array.from(
    { length: Math.max(1, Math.min(Number(concurrency) || 5, 8)) },
    () => worker()
  ));
  return map;
}

export async function loadSportyBetVisaOdds(fixtures = [], { concurrency = 5, force = false } = {}) {
  const map = new Map();
  if (!fixtures.length) return map;
  let events = [];
  try {
    events = await loadSportyBetEvents({ force });
  } catch {
    return map;
  }

  const matched = fixtures
    .map((fixture) => ({ fixture, hit: matchSportyBetOdds(events, fixture) }))
    .filter((row) => row.hit?.eventId);
  let cursor = 0;
  async function worker() {
    while (cursor < matched.length) {
      const index = cursor;
      cursor += 1;
      const { fixture, hit } = matched[index];
      let detailed = {};
      try {
        detailed = visaFromSportyMarkets(await loadSportyBetEventMarkets(hit.eventId, { force }));
      } catch {
        // Core 1X2, totals and GG prices may still exist in the compact feed.
        // Protection routes fail closed if their exact event prices are absent.
      }
      const prices = { ...(hit.odds || {}), ...detailed };
      const hasVisaPrice = [
        "home", "away", "over-15", "btts-yes",
        "home-or-draw", "draw-or-away", "home-dnb", "away-dnb"
      ].some((key) => Number(prices[key]) > 1);
      if (!hasVisaPrice) continue;
      map.set(Number(fixture.id), {
        ...prices,
        source: "sportybet",
        book: "SportyBet",
        eventId: hit.eventId,
        url: hit.url
      });
    }
  }
  await Promise.all(Array.from(
    { length: Math.max(1, Math.min(Number(concurrency) || 5, 8)) },
    () => worker()
  ));
  return map;
}
