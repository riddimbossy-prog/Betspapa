# BetsPapa v1.29.0 — Visa v2 Rules

Visa v2 evaluates every fixture on the existing rolling seven-day board. It builds a home-only league table for the home team, an away-only league table for the away team, and strict last-five venue form for both sides. Each table needs at least seven teams and each relevant team needs at least five split matches.

## Win routes

1. **Top 3 Win**
   - The selected team is top three on its relevant venue split.
   - Its opponent is outside the top six on the opposite venue split.
   - The exact SportyBet win price is 1.52 or shorter.

2. **Bottom 3 Away**
   - The away team is bottom three on its away split.
   - The home team is outside the bottom six on its home split.
   - The exact SportyBet Home Win price is present.

3. **Away 2.2 GA**
   - The away team concedes at least 2.2 goals per away match.
   - The selection is Home Team to Score 2+ using the exact SportyBet home-team Over 1.5 price.

4. **Away 80% Loss**
   - The away team has lost at least 80% of its last five away matches.
   - This separate trigger qualifies Home Win.
   - When the 2.2 GA and 80% loss signals both pass, Home Team to Score 2+ is tagged **Sure Visa**.

5. **Home Power**
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

Dual-trigger Sure Visa selections are checked first, followed by Away 2.2 GA, Top 3 Win, Bottom 3 Away, Away 80% Loss, single-trigger Home Power, and Over 2.5. This keeps one deterministic selection per fixture. A missing exact price, insufficient venue history or an unverified rank condition cannot be replaced with invented data.

“Sure Visa” describes a complete two-trigger rule match; it is not a guarantee of a sporting result. No database migration is required.
