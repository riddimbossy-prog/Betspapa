# Split Form Engine v1.0

Split Form is an independent BetsPapa engine. It does not share PapaSense story routing, Venue Pattern home-vs-away logic, Athena swing arbitration or PapaLock banker supervision.

## Evidence window

Only the last five finished same-league matches for each team, before kickoff.

## Signals

1. **HT/FT split** — team-perspective transitions (WW, WD, WL, DW, DD, DL, LW, LD, LL), blown leads, recoveries, half wins.
2. **Recent 5 form** — W-D-L string, points from 15, last-two momentum.
3. **Recent 5 form goals** — scorelines, GF/GA, scored-in, conceded-in, over 1.5 / 2.5, under 3.5, BTTS, second-half goals.

## Decision

- Requires five matches on both sides.
- Picks one market or NO PICK.
- A dominant last-five side can produce a result market; five matches still prefer DNB or 1X unless the split is extremely clean.
- If neither side dominates, form goals decide Over 1.5, Over 2.5, Under 3.5, BTTS, team over 0.5 or second-half over 0.5.
- Close competing stories are withheld.

## Early season

A team's first five same-league matches are red-flagged on every public board. Those fixtures stay visible even when Split Form (and the other engines) return NO PICK.

PapaLock does not treat Split Form as a confirmation family.
