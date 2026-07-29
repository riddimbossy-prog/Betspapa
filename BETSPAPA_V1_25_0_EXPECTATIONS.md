# BetsPapa v1.25.0 — PapaLock Banker Engine

## Release purpose

The Banker page is now populated by a dedicated supervisor called **PapaLock**. It does not copy the old exact-vote consensus slate.

PapaLock treats:

- Papa's Pick, Safer and Aggressive as one PapaSense family
- Venue Pattern as one independent family
- Athena as one independent family

At least two independent families must support the same match story before PapaLock performs a fresh market audit.

## Public rules

- Maximum three bankers per day
- Maximum two bankers from one league
- One banker per fixture
- Verified league fixtures only
- At least 12 same-league matches per team
- At least eight correct home/away matches per team
- Complete recent-six evidence
- Prime score 84+
- Elite score 92+ with all three families
- No forced banker

## Safe-market routing

PapaLock converts compatible sharp picks into the safest common expression:

- Home result story → Home or Draw
- Away result story → Away or Draw
- General goal story → Over 1.5 Goals
- Low-event story → Under 3.5 Goals
- Home team-goal story → Home Over 0.5
- Away team-goal story → Away Over 0.5
- Confirmed half-goal story → Second Half Over 0.5

Team-specific second-half scoring is not a PapaLock launch market.

## Supabase

Run:

`supabase/BETSPAPA_V1_25_0_PAPALOCK_BANKER_ENGINE.sql`

The migration creates:

- `papalock_predictions`
- `papalock_engine_evidence`
- `papalock_results`
- `papalock_calibration_profiles`

## API

Public:

- `GET /api/bankers/today`
- `GET /api/bankers/history`

Protected admin:

- `GET /api/admin/bankers/audit`
- `POST /api/admin/bankers/prepare`
- `POST /api/admin/bankers/settle`

## Verification

- 136 automated tests pass
- PapaLock engine tests cover family independence, safe-market routing, league exclusion, sample gates, Elite grading and daily limits
- Frontend and backend JavaScript syntax checks pass
