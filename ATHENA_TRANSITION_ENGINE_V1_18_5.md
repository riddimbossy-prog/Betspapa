# BetsPapa v1.18.5 — Athena v1.1 Score-and-Safety Arbitration

## Purpose

Athena v1.1 keeps the original Athena v1.0-RC1 HT/FT metrics, classifications and market scores, but replaces the final fixed-priority selector.

The old selector stopped at the first classification-preferred market scoring 80 or higher. That could publish a lower-scoring directional market even when a substantially stronger goal market existed.

The new flow is:

```text
RC1 validates fixture and builds HT/FT metrics
→ RC1 classifies the matchup
→ RC1 scores every market
→ v1.1 removes unsafe or blocked markets
→ v1.1 applies classification-specific arbitration
→ one strongest safe market or NO PICK
```

## Core thresholds

- Qualified primary: 80/100
- Prime: 88/100
- Minimum overall history: 8 completed matches per team
- Minimum venue history: 5 home matches and 5 away matches
- One primary selection per fixture

The score is an internal rule-strength score, not a guaranteed real-world probability.

## Directional safety gate

A directional result market can become Athena's primary only when all of the following pass:

1. The overall HT/FT classification supports the same side.
2. The relevant home/away venue classification supports the same side.
3. The bookmaker direction does not conflict.
4. Lead-hold rate is at least 65%.
5. Opponent comeback weakness is at least 45%.
6. The market carries no odds-direction warning.

This applies to Win Either Half, Draw No Bet and Double Chance directional markets.

## Classification arbitration

### High-Event Early Separation

The strongest qualified attacking goal market is selected first:

- Over 2.5
- Over 1.5
- BTTS Yes
- First Half Over 0.5

Win Either Half may replace the goal market only when:

- it passes the full directional safety gate, and
- it is within five points of the strongest attacking goal market.

### Swing Game

The strongest qualified attacking goal market is selected. A directional market is not preferred merely because it appears earlier in the RC1 list.

### Stable Leader, Multi-Route Advantage, Late Separation

The strongest safe directional market is retained when it is within six points of the strongest non-directional market. When the non-directional option is more than six points stronger, Athena selects the stronger non-directional market.

### Draw Lock

Athena selects the strongest qualified draw or under-control market.

### False Over Trap

Athena selects the strongest qualified option among:

- First Half Under 1.5
- Half-Time Draw
- Under 3.5
- Under 2.5

### Controlled 2–3 Goal Corridor

Athena selects the strongest qualified option among:

- Under 3.5
- Over 1.5
- Under 2.5

## Hard primary blockers

A candidate cannot become the primary when it has:

- a fatal engine flag;
- score below 80;
- insufficient BTTS scoring evidence;
- a first-half goal warning requiring direct first-half goal data;
- an unresolved directional safety failure.

## New diagnostics

Every Athena pick now exposes:

- selected primary market;
- best overall safe market;
- best goal market;
- best directional market;
- safer qualified alternative;
- arbitration rule used;
- whether v1.1 replaced the old RC1 priority pick;
- old RC1 priority market and score;
- compatible HT/FT route audit;
- overall and venue sample sizes;
- odds-direction status.

## Verified example

Aktobe 2 vs Kairat Almaty 2 produced these RC1 scores:

```text
Over 2.5                        100
Over 1.5                         96
Kairat Almaty 2 Win Either Half 88
Kairat Almaty 2 DNB              82
BTTS Yes                         80
```

RC1 selected Kairat Win Either Half because directional markets were checked first for a high-event match.

Athena v1.1 selects:

```text
Primary: Over 2.5 — 100
Best directional: Kairat Almaty 2 Win Either Half — 88
Safer alternative: Over 1.5 — 96
```

The directional option trails the strongest goal market by 12 points, so it cannot use the five-point high-event replacement allowance.

## Versions

```text
BetsPapa service: 1.18.5
Athena public engine: athena-transition-v1.1.0-score-safety
Athena scoring runtime: 1.0.0-rc.1
PapaSense: papasense-v1.18.1-no-draw-guard
```

No Supabase migration is required.
