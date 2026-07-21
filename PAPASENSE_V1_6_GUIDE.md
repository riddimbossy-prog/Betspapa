# PapaSense v1.6 — Full Market Intelligence

## Core rule

Every fixture is evaluated from the same nine HT/FT transitions, but every market has its own question, formula, threshold and contradiction checks.

A strong `12` signal cannot automatically become GG. A strong GG signal cannot automatically become Over 2.5. Over 1.5 can qualify through one team scoring twice, while GG requires both teams to score.

## Shared analysis layer

1. Blend each team’s Overall, Venue and Recent-6 HT/FT profile.
2. Smooth small samples toward the league baseline.
3. Match each home transition to the away team’s opposite transition.
4. Normalize the nine compatible routes.
5. Derive full-time, half-time, DNB, double-chance and win-either-half masses.
6. Build scoring, conceding, clean-sheet, failed-to-score and goal-threshold support.
7. Apply market-specific thresholds, blockers and data-quality penalties.
8. Rank every market and select one primary direction.

## Result markets

### 1X / X2

Requires protected result mass, route breadth, scoring support and limited opposing-win mass.

### Either Team to Win (12)

Requires:

- strong six-route decisive mass;
- low three-route draw mass;
- controlled `X/X`;
- controlled `1/X + 2/X` lead-to-draw mass;
- at least two meaningful win-ending routes;
- enough goal pressure to break a level game;
- a genuine upset route when the match is favourite-led.

### Draw No Bet

Uses decisive-only side strength, the gap over the opponent, route breadth, goal edge and draw control.

### Full-time win / draw

Requires meaningful separation from the second-most-likely result. These markets are never used as weak fallbacks.

### Win Either Half

Uses the six transitions in which the selected team wins the first half or improves enough to win the second half, then confirms with scoring support.

## Goal-participation markets

### GG — Yes

Requires two independent scoring routes, recent and venue GG agreement, and credible equalisation/comeback pressure. One dominant team cannot create GG alone.

### GG — No

Requires a credible clean-sheet/failed-to-score route, low two-sided scoring support and controlled comeback/equalisation transitions.

## Total-goal markets

- **Over 1.5:** two-goal transition support plus venue/recent rates and the strongest one-team goal route.
- **Under 1.5:** low-score pressure, clean sheets, failed-to-score records and low reversal risk.
- **Over 2.5:** two-sided GG-plus-2+ support or one-sided dominant 3-goal support.
- **Under 2.5:** venue/recent Under 2.5 agreement, stable transitions and low reversal risk.
- **Over 3.5:** weak four-goal ceilings plus genuine two-team 2+ scoring support. Never a fallback.
- **Under 3.5:** venue/recent four-goal ceilings, transition stability and no dominant one-sided four-goal route.
- **2–3 Total Goals:** Over 1.5 and Under 3.5 must agree on the same corridor.

## Team and half markets

- Team Over 0.5
- Team Over 1.5
- Team Under 1.5
- Home/Away clean sheet
- First Half Over 0.5
- Second Half Over 0.5

Each is graded automatically after the fixture finishes.

## Direction labels

- **Qualified:** passed its threshold and all blockers.
- **Directional:** highest-ranked honest direction but below the strong threshold or carrying contradictions.

Directional picks are not bankers and must remain visibly labelled.
