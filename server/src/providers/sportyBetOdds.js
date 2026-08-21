import {
  loadSportyBetEvents,
  matchSportyBetOdds,
  nameSimilarity,
  normalizeTeamName,
  totalsFromSportyMarkets
} from "./sportyBet.js";

export { nameSimilarity, normalizeTeamName, matchSportyBetOdds, totalsFromSportyMarkets };

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
