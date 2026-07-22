# PapaSense v1.18.0 — HT/FT-First Market Firing Engine

## Purpose

PapaSense now follows one fixed decision order:

1. Build the nine compatible HT/FT match routes.
2. Apply a market-specific HT/FT eligibility gate.
3. Use the relevant goal, venue, recent, clean-sheet, failed-to-score and league evidence as confirmation.
4. Apply contradictions and sample-quality penalties.
5. Compare only markets whose HT/FT gate passed.
6. Publish the strongest surviving market as Qualified, or the best broad gated direction as Directional.

A statistical score cannot qualify a market when its HT/FT firing condition failed.

## Core HT/FT map

| Route | Meaning | Direct market implications |
|---|---|---|
| 1/1 | Home leads HT and wins FT | Home Win Either Half; home-result support |
| 1/X | Home leads HT, draw FT | GG and O1.5 guaranteed; FT draw support |
| 1/2 | Home leads HT, away wins FT | GG and O2.5 guaranteed; away comeback |
| X/1 | Draw HT, home wins FT | Draw in Either Half; home second-half response |
| X/X | Draw HT and FT | Draw/under structure; never automatic O1.5 |
| X/2 | Draw HT, away wins FT | Draw in Either Half; away second-half response |
| 2/1 | Away leads HT, home wins FT | GG and O2.5 guaranteed; home comeback |
| 2/X | Away leads HT, draw FT | GG and O1.5 guaranteed; FT draw support |
| 2/2 | Away leads HT and wins FT | Away Win Either Half; away-result support |

## Market gates

### Double Chance 1X / X2
The selected side-or-draw HT/FT mass must dominate opponent-win routes. Strong opponent-win mass blocks the market.

### Either Team to Win (12)
The six win-ending routes must outweigh all draw-ending routes. Papa also requires more than one meaningful decisive route, controlled X/X, controlled lead-to-draw mass and a real underdog win path.

### Draw No Bet
After removing the draw, the selected side must lead the opponent and own a meaningful winning route.

### Straight Win
The selected FT state must lead both draw and opponent, have a visible gap and receive support from at least two winning routes. A single narrow route cannot qualify a straight win.

### Full-Time Draw
Requires meaningful X/X or lead-to-draw routes. Balanced team strength by itself is insufficient.

### Win Either Half
Uses every route that guarantees the chosen team wins the first or second half. The corrected sets include 2/X for the home team and 1/X for the away team.

### Draw in Either Half
Only X/1, X/X and X/2 count, because those routes guarantee a drawn first half. A full-time draw after a first-half lead is not falsely counted as a drawn second half.

### GG — Yes
Starts only from 1/X, 1/2, 2/1 and 2/X, because those four routes guarantee both teams score. Both teams must then pass independent scoring support and failed-to-score checks.

### GG — No
Requires stable/shutout HT/FT structure, weak forced-GG routes and clean-sheet/failed-to-score confirmation.

### Over 1.5
Requires either:

- meaningful guaranteed two-goal routes: 1/X, 1/2, 2/1 or 2/X; or
- one clearly dominant control side with strong 2+ scoring evidence.

X/X is never positive evidence. A dominant X/X route blocks O1.5 unless a separate two-goal path is genuinely strong.

### Under 1.5
Requires stable low-score HT/FT structure, weak forced-GG routes and no strong reversal path.

### Over 2.5
Requires a reversal route that structurally guarantees three goals, or a strong GG-plus-2+ route, or one-sided 3+ dominance confirmed by control routes.

### Under 2.5
Requires stable HT/FT mass, low reversal risk and under-goal confirmation.

### Over 3.5
Precision-only. Requires unusually strong reversal/equalisation structure and two-team 2+ support. It is never a weak fallback.

### Under 3.5
Requires a stable HT/FT ceiling and limited reversal risk before venue/recent U3.5 confirmation.

### Two to Three Goals
Both the O1.5 HT/FT floor and U3.5 HT/FT ceiling must fire.

### Team Over 0.5
The selected team must have HT/FT routes that guarantee it scores, then scoring-versus-opponent-conceding data confirms the route.

### Team Over 1.5
Requires a comeback route that guarantees two team goals or a control route backed by strong team 2+ evidence.

### Team Under 1.5
Requires weak team 2+ support and no meaningful comeback route that guarantees two goals.

### Clean Sheet
Starts from weak opponent-scoring HT/FT routes and low forced-GG mass, then uses clean-sheet and failed-to-score confirmation.

### First Half Over 0.5
Starts from non-draw half-time rows. A draw at half-time does not guarantee a first-half goal.

### First Half Over 1.5
Precision-only: strong non-draw HT structure, two-sided early scoring and good sample quality must all agree.

### Second Half Over 0.5
Starts from HT/FT routes whose state changes after half-time, because those routes require a second-half goal.

## Ranking and the four public engines

- **Papa's Pick:** strongest qualified market after HT/FT gate, confirmations and blockers.
- **Safer:** strongest qualified broader/cushion market; no fixed first-option shortcut.
- **Aggressive:** strongest qualified higher-upside market; still must pass its own HT/FT gate.
- **Venue Pattern:** must contain explicit home/away venue evidence.

Repeated fallback copies are marked as dependent and cannot create false Consensus Banker votes.

## Data corrections

- League baseline is used once as the smoothing prior, not twice.
- Older seasons and other competitions receive age decay.
- Current-league/current-season data remains strongest.
- The Team O0.5 price override applies only when the selected actual price is below 1.20.

## Public explanation

Each pick now exposes:

- HT/FT firing rule
- gate pass/fail state
- trigger routes and combined trigger mass
- statistical confirmations
- contradiction routes and blockers
- model score, threshold and engine strength
- alternatives that passed their own gates

The displayed Engine strength is a comparative model score, not a guaranteed real-world probability.
