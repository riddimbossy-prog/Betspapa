# BetsPapa v1.18.6 — Athena Conflict Hard Stop

## Purpose

Athena v1.1.1 corrects a contradiction in the v1.1 arbitration layer. Previously, the RC1 classifier could return `CONFLICT_NO_PICK`, while a market such as Over 1.5 still crossed 80 and was promoted by the fallback `HIGHEST_SAFE_SCORE` rule.

That behaviour is now prohibited.

## New mandatory rule

When the Athena classifier returns:

```text
CONFLICT_NO_PICK
```

Athena must publish:

```text
NO PICK
```

The hard stop applies even when a goal, result or half market has an 80–100 engine score.

## Observation versus official selection

Athena continues calculating market scores for auditing. The highest market may be stored as an observation, but it cannot become an official selection while the classification remains `CONFLICT_NO_PICK`.

Example:

```text
Classification: CONFLICT_NO_PICK
Over 1.5 score: 86
Official Athena output: NO PICK
Observation: Over 1.5 · 86
```

The observation is not published as a pick, not graded as a pick and cannot enter consensus.

## What remains allowed

A high-event classification with only a team-direction disagreement is different:

```text
HIGH_EVENT_EARLY_SEPARATION
warning: DIRECTIONAL_CONFLICT
```

Athena may still publish a qualified goal market there because the classifier has identified a shared high-event market family. Only the final `CONFLICT_NO_PICK` classification creates the mandatory stop.

## Kopavogur vs Njardvik regression

Input:

```text
Kopavogur HT/FT: 5,1,0,4,0,1,0,0,4
Njardvik HT/FT: 4,0,1,2,2,4,0,0,1
Kopavogur O2.5: 11/15 · 4.1 goals
Njardvik O2.5: 6/14 · 2.8 goals
```

RC1 classification:

```text
CONFLICT_NO_PICK
```

RC1 market observation:

```text
Over 1.5 · 86
```

Athena v1.1.1 official result:

```text
NO PICK
Rule: CONFLICT_HARD_STOP
```

## Version identity

```text
BetsPapa service: 1.18.6
Athena engine: athena-transition-v1.1.1-conflict-hard-stop
Athena arbitration: 1.1.1
Frozen RC1 scoring runtime: 1.0.0-rc.1
PapaSense: papasense-v1.18.1-no-draw-guard
```

No Supabase migration is required.
