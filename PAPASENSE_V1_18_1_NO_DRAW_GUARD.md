# PapaSense v1.18.1 — Either Team to Win Misfire Guard

## Problem corrected

In v1.18.0, Either Team to Win could qualify from a large six-route decisive mass even when the same HT/FT matrix was mainly an open scoring structure. This was especially visible in high-scoring leagues: reversal and equalisation routes made 12 look strong, although GG or Over 1.5 described the match more directly.

## New selection order

1. Build all nine compatible HT/FT routes.
2. Separate clean decisive routes from open comeback routes.
3. Measure draw persistence.
4. Test whether GG or Over 1.5 has an independent HT/FT firing route.
5. Use league scoring only as confirmation, never as the trigger.
6. Allow 12 only when the result structure remains clearer than the goal structure.

## Clean decisive routes

These routes may finish with one team scoring and the other blank:

- `1/1`
- `X/1`
- `X/2`
- `2/2`

They form the new `cleanDecisiveMass`.

## Open scoring routes

These routes guarantee or strongly indicate multiple goals:

- `1/X`
- `1/2`
- `2/1`
- `2/X`

When these routes are strong and the match also has high league, venue and recent scoring support, Papa diverts the selection to GG or Over 1.5.

## Qualified 12 requirements

Either Team to Win now requires all of the following:

- Decisive HT/FT mass at least 74%
- Draw-ending mass no more than 26%
- Clean decisive mass at least 50%
- At least three meaningful win-ending routes
- Weaker side win mass at least 12%
- `X/X` no more than 18%
- Lead-to-draw mass no more than 16%
- Full-reversal win mass no more than 20%
- Safety-adjusted market score at least 78%
- No active high-scoring goal-market diversion

## High-scoring diversion

Papa detects a high-scoring environment only when league context and team evidence agree. A league label alone cannot trigger a goal pick.

The diversion needs:

- High league O1.5 or GG rate
- Strong venue or recent O1.5 support
- Strong two-sided scoring or one-team scoring support
- A valid GG or O1.5 HT/FT firing route

When these conditions pass, 12 is blocked and the independently qualified goal market is preferred.

## Exceptional result structure

12 may survive a high-scoring context only when the result evidence is exceptional:

- Decisive mass at least 84%
- Draw mass no more than 16%
- Clean decisive mass at least 62%
- `X/X` no more than 12%
- Lead-to-draw mass no more than 10%
- Reversal-win mass no more than 14%

## Explanation output

The fixture explanation now exposes:

- Decisive mass
- Clean decisive mass
- Reversal-win mass
- Draw mass
- `X/X`
- Forced-GG mass
- League O1.5 and GG rates
- Whether the match was diverted to GG or Over 1.5
- The exact blocker that rejected 12
