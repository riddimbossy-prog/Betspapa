# BetsPapa — Visa v2.1 Rules

Visa v2 evaluates every fixture on the existing rolling seven-day board. It builds a home-only league table for the home team, an away-only league table for the away team, and strict last-five venue form for both sides. Each table needs at least seven teams and each relevant team needs at least five split matches.

## Win routes

1. **Top 4 Win**
   - The selected team is top four on its relevant venue split.
   - Its opponent is bottom three or outside the top six on the opposite venue split.
   - The exact SportyBet win price is 1.52 or shorter.

2. **Top 4 DNB**
   - The selected team is top four on its relevant venue split.
   - Its opponent is a competitive top-six team and is not bottom three.
   - Visa uses the exact SportyBet Draw No Bet price instead of forcing a straight win.

3. **Bottom 3 Loss**
   - A bottom-three team is opposed whether it appears on the home or away split.
   - The exact SportyBet opponent-win price is required.
   - Bottom-three-versus-bottom-three is skipped because both teams cannot be selected to lose.

4. **Away 2.2 GA**
   - The away team concedes at least 2.2 goals per away match.
   - The selection is Home Team to Score 2+ using the exact SportyBet home-team Over 1.5 price.

5. **Away 80% Loss**
   - The away team has lost at least 80% of its last five away matches.
   - This separate trigger qualifies Home Win.
   - When the 2.2 GA and 80% loss signals both pass, Home Team to Score 2+ is tagged **Sure Visa**.

6. **Home Power**
   - The home team scores at least 2.3 goals per home match, or it has won more than 80% of its last five home matches.
   - Either trigger qualifies Home Win.
   - When both triggers pass, the pick is tagged **Sure Visa**.

## Over 2.5 route

- At least one team has a venue GF average of 2.2 or higher.
- At least one team has a venue GA average of 2.2 or higher.
- A top-five-versus-top-five pairing is excluded.
- A bottom-three-versus-bottom-three pairing is excluded.
- The exact SportyBet Over 2.5 price is required.

## Selection order and safety

Dual-trigger Sure Visa selections are checked first, followed by Top 4 Win/DNB, Bottom 3 Loss, Away 2.2 GA, Away 80% Loss, single-trigger Home Power, and Over 2.5. This keeps one deterministic selection per fixture. A missing exact price, insufficient venue history or an unverified rank condition cannot be replaced with invented data.

“Sure Visa” describes a complete two-trigger rule match; it is not a guarantee of a sporting result. No database migration is required.
