# BetsPapa v1.27.0 — Visa Engine

Visa is a separate public engine at `/visa.html`. It uses only the home team's five most recent completed home league matches and the away team's five most recent completed away league matches from the same season. Overall form and older matches do not enter the decision.

## Grades

- Three losses or wins from five: 60% grade.
- Four losses or wins from five: 80% grade.
- Five losses or wins from five: 100% grade.
- A low-loss team must be strictly below 40% losses. Two losses from five is exactly 40% and does not qualify.

## One-pick decision routes

1. **Loss Denial — Match Result**
   - One team has an 80–100% loss grade.
   - Its opponent is strictly below 40% losses.
   - The loss-rate separation is at least 40 percentage points.
   - The opponent also has a 60%+ win grade.
   - The exact SportyBet Match Result price must exist.

2. **Protected Loss Denial — Double Chance or DNB**
   - The same loss mismatch qualifies, but the low-loss opponent is below 60% wins.
   - Visa uses the exact SportyBet 1X/X2 price when available and falls back to DNB.
   - It never upgrades this draw-heavy route to a straight win.

3. **Dual Win — GG**
   - Both teams have 60%+ split win grades.
   - Each scored in at least 80%, conceded in at least 60%, and recorded GG in at least 60% of its five-match venue sample.
   - The exact SportyBet GG price must exist.

4. **Dual Loss — Over 1.5**
   - Both teams have 60%+ split loss grades.
   - Each venue sample produced Over 1.5 in at least 60%.
   - The cross-checked goal expectation is at least 2.00.
   - The exact SportyBet Over 1.5 price must exist.

If none of these routes clears every required gate, Visa publishes no pick for the fixture. Only one selection can be returned per fixture.

## Delivery

- Public endpoint: `/api/visa/today?date=YYYY-MM-DD`
- SportyBet supplies 1X2, totals, GG, Double Chance and DNB prices.
- The responsive decision file shows both teams' W-D-L, form, loss and win percentages, goal evidence and every required gate.
- No database migration is required.
