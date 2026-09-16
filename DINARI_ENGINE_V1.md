# Dinari Engine v1

Dinari is BetsPapa's totals banker. It reads season goals scored / conceded averages and the 1X2 draw price, then publishes one over line and/or one under line per match.

## Rules

1. **Over 2.5** when at least one team averages over 2.2 goals scored, the other averages not less than 1.3, and draw odds are over 3.60.
2. **Over 1.5** when at least one team averages over 2.2 goals scored and concedes less than 1, or both teams average not less than 1.80 scored and not less than 1.5 conceded.
3. **Under 2.5** when at least one team averages less than 1 goal scored and less than 1 conceded, or both do, and draw odds are not greater than 2.90.
4. **Under 3.5** when at least one team averages less than 1.4 scored and concedes less than 1, or both average less than 1 scored and less than 1.2 conceded, and draw odds are not greater than 3.10.

Over 2.5 suppresses Over 1.5 on the same fixture. Under 2.5 suppresses Under 3.5. Each team needs five finished league matches. Missing draw odds fail closed.

## Surface

- API: `GET /api/dinari/today`
- Page: `/dinari.html`
- Screens nav: Dinari
