# PapaSense v2.0 — Four-Engine Resolution System

BetsPapa v1.21.0 upgrades Papa’s Pick, Safer, Aggressive and Venue Pattern so they no longer behave like four labels choosing from the same ranked list. They share one verified evidence foundation, but each engine now has a separate decision contract.

## Shared evidence foundation

Every engine receives:

- all nine HT/FT transitions for overall, venue and recent form;
- goal scoring and conceding rates;
- first-half and second-half goal profiles from Athena v3;
- event coverage and comeback/lead-surrender evidence when available;
- sample-size and data-quality flags;
- bookmaker-odds validation when stored odds are available;
- historical global and league-specific engine/market calibration when at least 50 settled selections exist.

Only normal 90-minute `FT` results enter standard profiles. Extra time, penalties, awarded results and walkovers are excluded.

## Match classification

PapaSense classifies the match before opening markets. Supported classes include stable home or away leadership, late separation, full reversal, lead surrender, two-way instability, draw lock, two-sided goals, one-sided team-goal routes, low-event ceilings, directional conflict, venue conflict and insufficient data.

A market must fit the classification. A high raw market score cannot override an incompatible story.

## Market-specific sample gates

| Market group | Overall minimum | Home/Away minimum |
|---|---:|---:|
| Broad goals | 8 per team | 5 per team |
| Protection markets | 10 per team | 6 per team |
| Straight results | 12 per team | 7 per team |
| Exact HT/FT | 14 per team | 8 per team |

Half-specific selections also require complete half-time data. Event-dependent claims are blocked when event coverage is incomplete.

## Papa’s Pick

Papa publishes the strongest balanced market that:

1. passes its original HT/FT firing rule;
2. fits the match classification;
3. passes the market-specific sample gate;
4. survives all contradictions and blockers;
5. clears the calibrated confidence floor.

Papa may return **NO PICK**. A weak fixture is analysed but is not forced into a public direction.

## Safer

Safer is a true containment market: a mathematically broader version of Papa’s exact story.

Examples:

- Home Win → Home DNB or Home/Draw;
- Away Win → Away DNB or Away/Draw;
- Over 2.5 → Over 1.5;
- Team Over 1.5 → Team Over 0.5;
- Under 2.5 → Under 3.5.

Safer is published only when the broader market is independently qualified and has a clear calibrated confidence cushion. Otherwise it returns **NO PICK**.

## Aggressive

Aggressive is a same-story escalation. It adds one condition without changing the original match reading.

Examples:

- Home/Draw → Home DNB or Home Win;
- Away/Draw → Away DNB or Away Win;
- Over 1.5 → Over 2.5 or Over 3.5;
- Team Over 0.5 → Team Over 1.5;
- Second-Half Over 0.5 → Second-Half Over 1.5.

Every aggressive selection must pass its own HT/FT, sample and calibrated confidence gates. If the sharper market does not qualify, Aggressive returns **NO PICK**.

## Venue Pattern

Venue Pattern is now independent. It compares only the home team’s home behaviour against the away team’s away behaviour, then uses overall form as a contradiction check.

It can identify stable venue control, late venue separation, venue comeback routes, draw locks and neutral venue swings. It requires at least six relevant venue matches per team plus a clear route margin. It does not copy Papa when the venue evidence is weak.

## Confidence calibration

The system stores settled results for each engine, market and league, while also maintaining a global fallback. When at least 50 settled selections exist, the displayed confidence uses the historical Wilson lower bound rather than the raw model score. Until then, confidence is reduced conservatively.

The calibration report also stores hit rate and Brier score. Calibration changes displayed confidence; it does not bypass HT/FT gates or create a pick.

## Public explanation and internal audit

Public cards explain the selection in plain English. Technical values such as route scores, sample gates, blockers, calibration source and evidence fields are stored in `internalAudit` for protected diagnostics.

## NO PICK behaviour

A withheld engine decision:

- appears as `NO PICK` on its page;
- is not settled as a bet;
- is not counted in Bankers or consensus;
- does not become a fallback selection;
- keeps the reason and technical audit for review.
