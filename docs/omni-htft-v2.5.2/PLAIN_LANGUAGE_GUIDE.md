# Plain-Language Guide to v2.5.2

## 1. Think of the engine as a football judge

The engine receives historical information for the home team, away team and league. It does not scrape or fetch that information itself.

It then asks four questions:

1. Do the HT/FT patterns create a believable market candidate?
2. Do goals, form, defence, xG and league statistics confirm it?
3. Do current streaks support or weaken it?
4. Are there missing fields, contradictions or outside risks that should force `NO_BET`?

## 2. How the 100 points are built

- HT/FT evidence: up to 40 points
- Market-specific confirmation: up to 35 points
- Streak evidence: up to 15 points
- Context risk: up to 10 points

Most markets need at least 80. A qualifying market normally becomes `PRIME` at 87 or higher when contradictions remain limited.

## 3. What changed from v2.4 to v2.5

v2.4 could select any active market that passed its rules.

v2.5 evaluates the 44 markets but only permits six core families to become the final pick. This is a selection-policy change, not a complete rewrite of the scoring engine.

The second-half Over 0.5 market also had one form-balance gate removed. That increases its opportunity to qualify.

In v2.5.2, **full-match Over 0.5** was removed completely because its odds were judged too small to be worthwhile. This does not affect team Over/Under 0.5 or first/second-half Over 0.5.

## 4. Why an accepted market may not be selected

Example:

- Home Win: accepted, score 86.75, `selectionEligible: false`
- Home Lead at Any Time: accepted, score 84, `selectionEligible: true`
- Home Win Either Half: accepted, score 82.25, `selectionEligible: true`

The engine chooses from the eligible core group only. It does not choose Home Win even though Home Win has the highest raw score.

## 5. What v2.5.2 fixes

The original v2.5.0 output could say “no market qualified” even when a non-core market had actually qualified. That made the result difficult to explain on a website.

v2.5.2 clearly separates:

- `accepted` — the market passed its own market rules;
- `selectionEligible` — the final policy allows the market to be selected;
- `blockedAcceptedMarkets` — accepted non-core markets blocked from selection;
- `bestCoreRejected` — the closest selectable core market that did not qualify.

## 6. Strict versus non-strict mode

Strict mode requires enough overall and venue matches, enough league matches, complete xG/xGA, complete scored-first information and explicit lead-order information.

Non-strict mode allows markets that do not need missing specialist fields. It does not invent the missing information.

## 7. What the backtester does

The backtester moves through fixtures in time order. For each fixture, it uses only matches with earlier timestamps. If only dates are available, it excludes all fixtures on the same date to avoid accidental look-ahead.

It records:

- bets;
- no-bets;
- wins, losses, pushes and unknown settlements;
- coverage and settled hit rate.

Unknown outcomes are not silently counted as wins.

## 8. What still needs real validation

Before using the engine commercially, test it with untouched historical seasons and real odds. Report results by league, market, odds band and score band. A high hit rate without odds cannot establish profit.
