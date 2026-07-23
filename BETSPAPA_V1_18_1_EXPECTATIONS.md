# What to Expect After BetsPapa v1.18.1

## Fewer No Draw selections

Either Team to Win will appear less often. It is now reserved for fixtures where clean win-ending routes clearly dominate the draw and goal-market structures.

## More appropriate goal selections in open leagues

When high-scoring league context agrees with forced HT/FT goal routes, the fixture can move from 12 to:

- GG — Yes when both teams have independent scoring support
- Over 1.5 when the two-goal route is stronger than the two-team scoring route

## High-scoring league context cannot act alone

A high league O1.5 or GG rate does not automatically create a goal prediction. The relevant HT/FT gate must still fire.

## Genuine No Draw matches remain available

Clean decisive fixtures with low draw persistence and limited reversal pressure can still qualify 12.

## Venue Pattern is corrected

Venue Pattern can no longer select 12 when the shared catalogue has blocked it for high-scoring goal diversion.

## Current boards regenerate

- Service version: `1.18.1`
- Engine version: `papasense-v1.18.1-no-draw-guard`

Existing v1.18.0 board rows are not used for new v1.18.1 queries. Papa prepares fresh rows for the selected date.

## What users will see

The explanation popup will state whether:

- 12 passed as a clean decisive result structure, or
- 12 was rejected because GG or Over 1.5 described the fixture better.
