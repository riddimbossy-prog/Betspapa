# BetsPapa v1.20.0 Expectations

## Release identity

- BetsPapa service: **1.20.0**
- Athena engine: **3.0.0**
- Athena public identifier: **athena-v3.0.0-swing-half-goals**
- PapaSense remains: **papasense-v1.18.1-no-draw-guard**

## Required deployment order

1. Run `supabase/BETSPAPA_V1_20_0_ATHENA_V3.sql` in Supabase SQL Editor.
2. Deploy the complete repository replacement.
3. Clear the old PWA cache through `/reset.html`.
4. Run history hydration and board preparation.

## Expected Athena behaviour

Athena distinguishes five swing types, calculates goals by half, opens second-half and both-halves markets only when their direct data exists, and returns one pick or NO PICK. Public users receive a plain-English explanation and a simple goals-by-half picture. Technical audits remain protected.

## Provider coverage

API-Football event coverage can differ by competition. The release handles that safely: complete events unlock detailed comeback analysis, partial or unavailable events do not create fake values, and confirmed half-time/full-time scores still power the half-goal layer.

Athena verifies that reconstructed goal events reproduce the stored final score before using them. Failed or incomplete event requests wait for the configured retry cooldown, protecting the provider allowance. Only normal 90-minute `FT` matches enter Athena's history; extra-time, shootout, awarded and walkover results are excluded from its transition and half-goal calculations.
