# PapaSense v1.8 Anti-Zombie Policy

## The bug

When no historical team rows existed, both clubs were represented almost
entirely by the same league/default prior. That produced repeated values such
as 57% 1X across unrelated fixtures.

## The correction

1. Inspect real profile coverage for every team on the selected date.
2. Fetch the last completed API-Football fixtures for thin-data teams.
3. Persist those matches to Supabase.
4. Rebuild HT/FT and goal profiles for every imported league-season.
5. Require real evidence for both teams.
6. Block prior-only predictions.
7. Store sample counts and an analysis fingerprint with every prediction.

## Safer engine

The Safer engine no longer defaults to 1X/X2. Double Chance is eligible only
when the protection route is qualified, data quality is adequate and the
favoured side has a real venue/full-time edge.

A missing-history card is preferable to a fabricated duplicated pick.
