import test from "node:test";
import assert from "node:assert/strict";

import {
  PAPALOCK_VERSION,
  buildPapaLockSlate,
  canonicalKey,
  storiesForPick,
  toPublicPapaLockSlate
} from "../src/engine/papaLockBankerEngine.js";

function pick(engineKey, {
  key = "over-15",
  market = "Total Goals",
  selection = "Over 1.5 Goals",
  confidence = 78,
  qualified = true,
  cautions = [],
  evidence = true
} = {}) {
  return {
    engineKey,
    engineName: engineKey,
    key,
    market,
    selection,
    confidence,
    score: confidence,
    qualified,
    cautions,
    internalAudit: evidence ? {
      htftGate: { score: 0.76, triggerMass: 0.72 }
    } : {},
    explanationEvidence: evidence ? {
      goalScores: {
        over15: 0.78,
        under35: 0.74,
        homeOver05: 0.77,
        awayOver05: 0.75,
        secondHalfOver05: 0.73
      },
      goalMetrics: {
        venueO15: 0.76,
        recentO15: 0.75,
        venueU35: 0.78,
        recentU35: 0.76,
        homeGoalSupport: 0.74,
        awayGoalSupport: 0.72,
        secondHalfChangeMass: 0.71
      }
    } : {}
  };
}

function prediction(id, leagueId = 1) {
  return {
    id,
    fixtureId: String(1000 + id),
    internalFixtureId: id,
    kickoff: `2026-07-${String(10 + id).padStart(2, "0")}T18:00:00.000Z`,
    status: "NS",
    home: { name: `Home ${id}` },
    away: { name: `Away ${id}` },
    league: {
      id: leagueId,
      name: `League ${leagueId}`,
      country: "Test",
      competition_type: "LEAGUE",
      prediction_enabled: true
    },
    engines: {},
    profileAudit: {
      individuallyAnalysed: true,
      evidenceFingerprint: `fingerprint-${id}`,
      home: { evidence: { overall: 18, venue: 9, recent: 6 } },
      away: { evidence: { overall: 18, venue: 9, recent: 6 } }
    }
  };
}

function athenaFor(row, {
  marketId = "SECOND_HALF_OVER_0_5",
  market = "Second-Half Goals",
  selection = "Second Half Over 0.5 Goals",
  score = 88,
  side = null,
  type = "LATE_SEPARATION"
} = {}) {
  return {
    fixtureId: row.fixtureId,
    marketId,
    market,
    selection,
    score,
    selected: { market: marketId, score, warnings: [] },
    classification: { type, side },
    samples: {
      homeOverall: 18,
      homeVenue: 9,
      homeRecent: 6,
      awayOverall: 18,
      awayVenue: 9,
      awayRecent: 6
    }
  };
}

test("PapaLock counts Papa, Safer and Aggressive as one family", () => {
  const row = prediction(1);
  row.engines = {
    primary: pick("primary"),
    safer: pick("safer", { confidence: 82 }),
    aggressive: pick("aggressive", { key: "over-25", selection: "Over 2.5 Goals", confidence: 80 })
  };

  const result = buildPapaLockSlate([row], []);
  assert.equal(result.totalSelections, 0);
  assert.match(result.rejectionSummary[0].reason, /two independent/i);
});

test("PapaLock chooses the safest common goal market from two independent families", () => {
  const row = prediction(2);
  row.engines = {
    primary: pick("primary", { key: "over-25", selection: "Over 2.5 Goals", confidence: 82 }),
    safer: pick("safer", { key: "over-15", selection: "Over 1.5 Goals", confidence: 80 }),
    aggressive: pick("aggressive", { key: "over-25", selection: "Over 2.5 Goals", confidence: 84 }),
    venue: pick("venue", { key: "over-15", selection: "Over 1.5 Goals", confidence: 79 })
  };

  const result = buildPapaLockSlate([row], []);
  assert.equal(result.totalSelections, 1);
  assert.equal(result.picks[0].key, "over-15");
  assert.equal(result.picks[0].selection, "Over 1.5 Goals");
  assert.equal(result.picks[0].confirmationFamilies, 2);
  assert.equal(result.picks[0].engineVersion, PAPALOCK_VERSION);
  assert.equal(result.picks[0].papaLockGrade, "PRIME");
});

test("PapaLock produces Elite when PapaSense, Venue and Athena support the same home-protection story", () => {
  const row = prediction(3);
  row.engines = {
    primary: pick("primary", { key: "home-1x", market: "Double Chance", selection: "Home 3 or Draw (1X)", confidence: 86 }),
    safer: pick("safer", { key: "home-1x", market: "Double Chance", selection: "Home 3 or Draw (1X)", confidence: 88 }),
    aggressive: pick("aggressive", { key: "home-win", market: "Full-Time Result", selection: "Home 3 Win", confidence: 84 }),
    venue: pick("venue", { key: "home-dnb", market: "Draw No Bet", selection: "Home 3 DNB", confidence: 85 })
  };
  const athena = athenaFor(row, {
    marketId: "HOME_OR_DRAW",
    market: "Double Chance",
    selection: "Home 3 or Draw",
    score: 91,
    side: "HOME",
    type: "STABLE_LEADER"
  });

  const result = buildPapaLockSlate([row], [athena]);
  assert.equal(result.totalSelections, 1);
  assert.equal(result.picks[0].key, "home-1x");
  assert.equal(result.picks[0].papaLockGrade, "ELITE");
  assert.equal(result.picks[0].confirmationFamilies, 3);
});

test("PapaLock blocks cup and friendly fixtures", () => {
  const row = prediction(4);
  row.league.name = "National Cup";
  row.league.competition_type = "CUP";
  row.engines = {
    primary: pick("primary"),
    venue: pick("venue")
  };

  const result = buildPapaLockSlate([row], []);
  assert.equal(result.totalSelections, 0);
  assert.match(result.rejectionSummary[0].reason, /verified league/i);
});

test("PapaLock blocks Champions League even when labelled as a league", () => {
  const row = prediction(14);
  row.league.name = "UEFA Champions League";
  row.league.competition_type = "LEAGUE";
  row.engines = {
    primary: pick("primary"),
    venue: pick("venue")
  };

  const result = buildPapaLockSlate([row], []);
  assert.equal(result.totalSelections, 0);
  assert.match(result.rejectionSummary[0].reason, /verified league/i);
});

test("PapaLock enforces 12 overall, eight venue and recent-six samples", () => {
  const row = prediction(5);
  row.profileAudit.home.evidence.venue = 7;
  row.engines = {
    primary: pick("primary"),
    venue: pick("venue")
  };

  const result = buildPapaLockSlate([row], []);
  assert.equal(result.totalSelections, 0);
  assert.match(result.rejectionSummary[0].reason, /eight relevant home or away/i);
});

test("PapaLock publishes at most three daily and no more than two from one league", () => {
  const rows = [prediction(6, 9), prediction(7, 9), prediction(8, 9), prediction(9, 10)];
  for (const row of rows) {
    row.engines = {
      primary: pick("primary", { confidence: 88 }),
      venue: pick("venue", { confidence: 86 })
    };
  }

  const result = buildPapaLockSlate(rows, [], { limit: 3 });
  assert.equal(result.totalSelections, 3);
  const leagueNine = result.picks.filter((item) => item.league.id === 9);
  assert.equal(leagueNine.length, 2);
});

test("canonicalKey maps Athena enums onto PapaSense market keys", () => {
  assert.equal(canonicalKey({ marketId: "OVER_2_5" }), "over-25");
  assert.equal(canonicalKey({ marketId: "OVER_1_5" }), "over-15");
  assert.equal(canonicalKey({ marketId: "UNDER_2_5" }), "under-25");
  assert.equal(canonicalKey({ marketId: "UNDER_3_5" }), "under-35");
  assert.equal(canonicalKey({ marketId: "HOME_TEAM_OVER_0_5" }), "home-over-05");
  assert.equal(canonicalKey({ marketId: "HOME_SECOND_HALF_OVER_0_5" }), "home-second-half-over-05");
  assert.equal(canonicalKey({ marketId: "SECOND_HALF_OVER_0_5" }), "second-half-over-05");
  assert.equal(canonicalKey({ marketId: "HOME_OR_DRAW" }), "home-1x");
  assert.equal(canonicalKey({ marketId: "BTTS_YES" }), "gg-yes");
  assert.equal(canonicalKey({ marketId: "HOME_WIN_EITHER_HALF" }), "home-win-either-half");
});

test("Athena Over 2.5 supports the Over 1.5 banker story", () => {
  const row = prediction(20);
  row.engines = {
    primary: pick("primary", { key: "over-25", selection: "Over 2.5 Goals", confidence: 84 }),
    venue: pick("venue", { key: "over-15", selection: "Over 1.5 Goals", confidence: 82 })
  };
  const athena = athenaFor(row, {
    marketId: "OVER_2_5",
    market: "Total Goals",
    selection: "Over 2.5 Match Goals",
    score: 90
  });

  const result = buildPapaLockSlate([row], [athena]);
  assert.equal(result.totalSelections, 1);
  assert.equal(result.picks[0].key, "over-15");
  assert.equal(result.picks[0].confirmationFamilies, 3);
});

test("Win Either Half does not count as Home or Draw", () => {
  const row = prediction(21);
  row.engines = {
    primary: pick("primary", { key: "home-1x", market: "Double Chance", selection: "Home 21 or Draw (1X)", confidence: 86 }),
    venue: pick("venue", { key: "home-dnb", market: "Draw No Bet", selection: "Home 21 DNB", confidence: 85 })
  };
  const athena = athenaFor(row, {
    marketId: "HOME_WIN_EITHER_HALF",
    market: "Result Protection",
    selection: "Home 21 to Win Either Half",
    score: 91,
    side: "HOME"
  });

  const result = buildPapaLockSlate([row], [athena]);
  assert.equal(result.totalSelections, 1);
  assert.equal(result.picks[0].key, "home-1x");
  assert.equal(result.picks[0].confirmationFamilies, 2);
  assert.notEqual(result.picks[0].papaLockGrade, "ELITE");
  assert.ok(storiesForPick({
    key: "HOME_WIN_EITHER_HALF",
    marketId: "HOME_WIN_EITHER_HALF",
    selection: "Home 21 to Win Either Half",
    qualified: true
  }, "Home 21", "Away 21").includes("HOME_GOAL"));
  assert.equal(storiesForPick({
    key: "HOME_WIN_EITHER_HALF",
    marketId: "HOME_WIN_EITHER_HALF",
    selection: "Home 21 to Win Either Half",
    qualified: true
  }, "Home 21", "Away 21").includes("HOME_PROTECTION"), false);
});

test("BTTS No does not become Under 3.5", () => {
  const row = prediction(22);
  row.engines = {
    primary: pick("primary", { key: "gg-no", market: "Both Teams To Score", selection: "Both Teams to Score — No", confidence: 88 }),
    venue: pick("venue", { key: "gg-no", market: "Both Teams To Score", selection: "Both Teams to Score — No", confidence: 86 })
  };

  const result = buildPapaLockSlate([row], []);
  assert.equal(result.totalSelections, 0);
  assert.equal(storiesForPick({
    key: "gg-no",
    selection: "Both Teams to Score — No",
    qualified: true
  }).includes("LOW_EVENT"), false);
});

test("First-half Over 0.5 does not become Over 1.5", () => {
  const row = prediction(23);
  row.engines = {
    primary: pick("primary", { key: "first-half-over-05", selection: "First Half Over 0.5 Goals", confidence: 88 }),
    venue: pick("venue", { key: "first-half-over-05", selection: "First Half Over 0.5 Goals", confidence: 86 })
  };

  const result = buildPapaLockSlate([row], []);
  assert.equal(result.totalSelections, 0);
});

test("Missing market evidence does not mint a Prime banker", () => {
  const row = prediction(24);
  row.engines = {
    primary: pick("primary", { confidence: 88, evidence: false }),
    venue: pick("venue", { confidence: 86, evidence: false })
  };

  const result = buildPapaLockSlate([row], []);
  assert.equal(result.totalSelections, 0);
  assert.match(JSON.stringify(result.rejectionSummary), /evidence|independent/i);
});

test("Opposite home and away protection stories that are close together are withheld", () => {
  const row = prediction(25);
  row.engines = {
    primary: pick("primary", {
      key: "home-1x",
      market: "Double Chance",
      selection: "Home 25 or Draw (1X)",
      confidence: 86
    }),
    safer: pick("safer", {
      key: "home-1x",
      market: "Double Chance",
      selection: "Home 25 or Draw (1X)",
      confidence: 86
    }),
    aggressive: pick("aggressive", {
      key: "away-x2",
      market: "Double Chance",
      selection: "Away 25 or Draw (X2)",
      confidence: 86
    }),
    venue: pick("venue", {
      key: "home-dnb",
      market: "Draw No Bet",
      selection: "Home 25 DNB",
      confidence: 86
    })
  };
  const athena = athenaFor(row, {
    marketId: "AWAY_OR_DRAW",
    market: "Double Chance",
    selection: "Away 25 or Draw",
    score: 86
  });

  const result = buildPapaLockSlate([row], [athena]);
  assert.equal(result.totalSelections, 0);
  assert.match(JSON.stringify(result.rejectionSummary), /too close|almost equal/i);
});

test("toPublicPapaLockSlate strips internal audit fields", () => {
  const row = prediction(26);
  row.engines = {
    primary: pick("primary", { confidence: 88 }),
    venue: pick("venue", { confidence: 86 })
  };
  const internal = buildPapaLockSlate([row], []);
  assert.ok(internal.picks[0].internalAudit);
  assert.ok(internal.internalRejections);

  const published = toPublicPapaLockSlate(internal);
  assert.equal(published.picks[0].internalAudit, undefined);
  assert.equal(published.internalRejections, undefined);
  assert.equal(published.picks[0].evidence.homeOverall, 18);
  assert.equal(published.picks[0].evidence.evidenceFingerprint, undefined);
});

test("Athena team-goal enum supports Home Over 0.5", () => {
  const row = prediction(27);
  row.engines = {
    primary: pick("primary", {
      key: "home-over-15",
      market: "Team Goals",
      selection: "Home 27 Over 1.5 Team Goals",
      confidence: 84
    }),
    venue: pick("venue", {
      key: "home-over-05",
      market: "Team Goals",
      selection: "Home 27 Over 0.5 Team Goals",
      confidence: 82
    })
  };
  const athena = athenaFor(row, {
    marketId: "HOME_TEAM_OVER_0_5",
    market: "Team Goals",
    selection: "Home 27 Over 0.5 Team Goals",
    score: 89,
    side: "HOME"
  });

  const result = buildPapaLockSlate([row], [athena]);
  assert.equal(result.totalSelections, 1);
  assert.equal(result.picks[0].key, "home-over-05");
});

test("Bookmaker disagreement does not drop the Athena family", () => {
  const row = prediction(28);
  row.engines = {
    primary: pick("primary", { key: "over-15", confidence: 84 }),
    venue: pick("venue", { key: "over-15", confidence: 82 })
  };
  const athena = athenaFor(row, {
    marketId: "OVER_1_5",
    market: "Total Goals",
    selection: "Over 1.5 Match Goals",
    score: 90
  });
  athena.oddsConflict = { conflict: true };

  const result = buildPapaLockSlate([row], [athena]);
  assert.equal(result.totalSelections, 1);
  assert.equal(result.picks[0].confirmationFamilies, 3);
});
