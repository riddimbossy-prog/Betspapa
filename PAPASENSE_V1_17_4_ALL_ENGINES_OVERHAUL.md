# PapaSense v1.17.4 — Audited Overhaul Across All Four Engines

## What was wrong

Papa's primary pick used the audited full-market overhaul, but the auxiliary
Aggressive, Safer and Venue picks were still copied from the older support
engine. In particular, Safer could select Over 1.5 when its adjusted score was
only 45%, and its explanation could incorrectly present the strongest exact
HT/FT route as the reason for a goal-market decision.

An exact route such as X/X does not prove Over 1.5. X/X can finish 0–0 or 1–1.
Over 1.5 must be supported by its own goal evidence.

## Correct v1.17.4 architecture

All four public engines now select from the same audited market catalogue:

- Papa's Pick
- Aggressive
- Safer
- Venue Pattern

The support engine is limited to:

- prior-only anti-zombie checks
- real-odds Team Over 0.5 upgrade rules
- venue context
- practical markets absent from the original overhaul

It can no longer revive a blocked or sub-threshold GG or Over 1.5 selection.

## Safer Over 1.5 rule

Safer may select Over 1.5 only when the audited Over 1.5 market:

1. passes its own threshold;
2. has no market blocker;
3. has adequate venue or recent Over 1.5 agreement;
4. does not have excessive low-score pressure; and
5. is aligned with the broader match reading.

Its explanation must cite:

- venue Over 1.5 agreement;
- recent Over 1.5 agreement;
- strongest one-team scoring route;
- low-score pressure;
- adjusted score and threshold.

The leading exact HT/FT transition may be shown as context, but it is explicitly
identified as not being the source of the goal pick.

## Consensus protection

When an auxiliary engine has no independent qualified alternative, it may repeat
Papa's Pick for display consistency. Such a repeated fallback is marked:

`consensusEligible: false`

It therefore cannot be counted as an independent Banker vote.

## Version

- Service: `1.17.4`
- Engine: `papasense-v1.17.4-overhaul-all-engines`
