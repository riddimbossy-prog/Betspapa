# PapaSense v1.6 Market Selection

## Core correction

Raw probabilities from unlike markets are not directly comparable.

Example:

- 1X combines Home Win + Draw.
- Over 2.5 is one goal-line event.
- A straight win is one match-result event.

Therefore, a 74% Double Chance cannot automatically outrank a 64% Over 2.5.
Every candidate is now compared with its own qualification threshold.

## Selection flow

1. Build the nine HT/FT compatibility routes.
2. Derive HT, FT, DNB and Double Chance directions.
3. Derive GG, goal-line and team-goal routes.
4. Apply data-quality and contradiction penalties.
5. Divide each adjusted score by its own threshold.
6. Add a market-family calibration.
7. Penalize broad protection markets.
8. Prefer the more informative market when it is within the calibrated tolerance.
9. Label the result Qualified or Directional.
10. Store the full comparison and all reasons.

## Friendlies

When the current friendly competition has little history, v1.6 falls back to
the teams' stored profiles from other competitions and seasons. Current-league
and current-season profiles receive the largest weights.
