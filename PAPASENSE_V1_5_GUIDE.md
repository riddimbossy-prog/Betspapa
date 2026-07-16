# PapaSense v1.5 Direction Policy

Every imported, predictable fixture receives one selected market.

## Classification

- **Qualified:** the market passed its normal threshold and all blockers.
- **Directional:** the best common-sense direction after penalties, but below the
  strong-pick threshold. It must not be presented as a banker.

## Decision sequence

1. Read the home team's Overall, Home and Recent-6 HT/FT profile.
2. Read the away team's Overall, Away and Recent-6 HT/FT profile.
3. Compare every home transition with the away team's opposite transition.
4. Normalize all nine compatible HT/FT stories.
5. Derive half-time, full-time, double-chance and DNB directions.
6. Calculate GG, O1.5, O2.5, U3.5 and team-goal support.
7. Apply sample quality, blockers and risk penalties.
8. Choose the highest-ranked qualified market.
9. When none qualifies, choose the highest-ranked broad directional market.
10. Store the full reason trace, cautions, alternatives and nine indicators.

Exact HT/FT and weak half-time-result markets are not used as fallback directions.
