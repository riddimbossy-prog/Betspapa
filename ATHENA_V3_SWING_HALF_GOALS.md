# Athena v3.0.0 — Swing Resolution & Half-Goals Engine

Athena remains an HT/FT-first engine, but it now resolves swing matches using the goals scored and conceded in each half.

## New match types

- **Full reversal:** one team recovers from trailing while the opponent loses leads.
- **Lead surrender:** one team gives up leads while the other regularly recovers to a draw.
- **Late separation:** a level first half turns into a clear second-half advantage.
- **Two-way instability:** both teams can lead, collapse and recover, so Athena avoids a forced team direction.
- **False swing:** the HT/FT table looks volatile, but the half-goal totals do not confirm enough second-half activity.

## New data layer

Athena calculates first-half and second-half goals scored and conceded, scoring and conceding rates by half, second-half Over 0.5 and Over 1.5 rates, goals in both halves, second-half result strength and event coverage.

When API-Football goal events are complete, Athena can also confirm goals scored while trailing, equalisers, winning goals after an equaliser, leads surrendered and goal timing buckets from 46–60, 61–75 and 76–90+.

Missing event timing is never converted to zero and is never guessed.
Before event data is marked complete, the reconstructed score must match the stored full-time score exactly. Failed and partial event responses are retried gradually after a cooldown instead of being requested again on every visit.

## New markets

- Second Half Over 0.5 Goals
- Second Half Over 1.5 Goals
- Home or Away Team to Score in the Second Half
- Home or Away Second-Half Draw No Bet
- Goals in Both Halves

Existing safe goal, team and directional markets remain available where their HT/FT gates pass.

## Public explanation

The Athena card and detail window now explain the pick in plain English. The public response omits internal route scores, arbitration objects and technical diagnostics. Admin users can inspect the complete audit through the protected `/api/admin/athena-audit` route.

## Coverage protection

- Half-time and full-time scores are required for Athena.
- Athena history and half-goal settlement use completed 90-minute (`FT`) results only. Extra-time, shootout, awarded and walkover results are not mixed into the model.
- Half-goal markets require direct half-goal data.
- Event-dependent comeback claims require sufficient complete event coverage.
- Conflicted directions and false swing signals return **NO PICK**.
