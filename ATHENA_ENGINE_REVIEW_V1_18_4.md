# Athena Transition Engine RC1 — BetsPapa Review

## Review result

The uploaded engine is a clean, server-side ESM package with input validation, nine HT/FT state handling, compatible-route matching, match classification, market scoring, odds-disagreement checks, one-pick selection and an explicit `NO_PICK` outcome.

The original four-package tests passed before integration. The frozen RC1 constants and scoring files were copied without changing their thresholds.

## Strong parts

- Uses all nine W/W through L/L states.
- Matches opposite routes such as home W/W against away L/L.
- Separates stable leaders, late separation, draw locks, controlled corridors, high-event games, false-over traps, swing games and multi-route advantages.
- Compares lead protection against opponent comeback ability.
- Uses sample reliability rather than treating a small sample as fully reliable.
- Checks material 1X2 odds disagreement.
- Returns one strongest market or `NO_PICK` instead of forcing coverage.
- Keeps a complete audit object for testing.

## Important limitations

- Scores are rule-strength values, not calibrated outcome probabilities.
- Goal markets use score history and totals, not xG or shot quality.
- The original RC1 core only checked whether venue data existed when a directional odds conflict occurred; it did not independently score the venue split.
- Some classifications can support several related markets, so evaluation should be reviewed by market and classification after a frozen batch.

## BetsPapa integration safeguard

BetsPapa now runs a second Athena analysis using the home team's home history and the away team's away history. When an overall directional pick conflicts with bookmaker direction or carries `DIRECTIONAL_CONFLICT`, the venue classification must confirm the same side or the fixture receives `NO PICK`.

This safeguard is outside the frozen Athena scoring files, so the uploaded RC1 thresholds remain unchanged.
