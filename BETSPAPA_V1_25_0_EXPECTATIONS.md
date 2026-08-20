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

PapaLock converts a sharp pick into a banker **only when the banker market is implied by that pick**:

- Home win / home DNB → Home or Draw
- Away win / away DNB → Away or Draw
- Over 2.5, Over 3.5, BTTS Yes, Goals Both Halves, first-half Over 1.5 → Over 1.5 Goals
- Under 1.5 / Under 2.5 → Under 3.5 Goals
- Home Over 1.5, home win, home win either half, home second-half goal → Home Over 0.5
- Confirmed half-goal story → Second Half Over 0.5

Not containments, so they do not create that banker:

- Win Either Half ↛ Home or Draw
- Second-half DNB ↛ Home or Draw
- BTTS No ↛ Under 3.5
- First-half Over 0.5 ↛ Over 1.5

Team-specific second-half scoring is not a PapaLock launch market.

Athena enums such as `OVER_2_5` and `HOME_TEAM_OVER_0_5` are canonicalised onto the same keys as PapaSense.

PapaLock Score is a rule score. Evidence strength must clear 0.52. Missing evidence is not treated as a pass.

## Supabase

Run:

`supabase/BETSPAPA_V1_25_0_PAPALOCK_BANKER_ENGINE.sql`

If that file was already applied with the old unique key, also run:

`supabase/BETSPAPA_V1_25_1_PAPALOCK_CONSTRAINTS.sql`

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

- PapaLock engine tests cover family independence, containment routing, Athena key mapping, league exclusion, sample gates, Elite grading, daily limits and public-payload stripping
- Frontend and backend JavaScript syntax checks pass

