# PapaLock Banker Engine v1.1

PapaLock is BetsPapa's final banker supervisor.

## Decision flow

1. Read all published PapaSense selections and the qualified Athena selection.
2. Collapse Papa's Pick, Safer and Aggressive into one family.
3. Classify every qualified selection into every match story it **contains**.
4. Require at least two independent families.
5. Verify league type through the shared competition policy, plus 12/8/6 sample gates.
6. Publish only a market that is a true safer expression of the supporting picks.
7. Penalise opposite-side classification, incomplete specialist confirmation and weak market evidence.
8. Publish only Prime or Elite grades.
9. Apply the three-per-day and two-per-league limits.
10. Save and settle the prepared slate when the v1.25.0 / v1.25.1 migrations are installed.

## Safe-market routing

A pick supports a story only when the PapaLock target is implied by that pick:

- Home win or home DNB → Home or Draw
- Away win or away DNB → Away or Draw
- Over 2.5 / Over 3.5 / BTTS Yes / Goals Both Halves / First-half Over 1.5 → Over 1.5
- Under 1.5 / Under 2.5 → Under 3.5
- Home Over 1.5, home win, or home win either half → Home Over 0.5
- Team second-half scoring → that team Over 0.5 **and** Second Half Over 0.5
- Athena second-half Over 0.5 / Over 1.5 → Second Half Over 0.5

These are **not** containments and do not support a banker story:

- Win Either Half → Home or Draw
- Second-half DNB → Home or Draw
- BTTS No → Under 3.5
- First-half Over 0.5 → Over 1.5

## Grades

- **PapaLock Elite:** all three independent families, score 92+
- **PapaLock Prime:** at least two independent families, score 84+, evidence strength 0.52+
- **Qualified:** audit passed at a lower score, hidden from the public Banker page
- **Withheld:** failed evidence, sample or conflict gates

PapaLock Score is a rule score. It is not a promise or guaranteed probability.
The public Banker API does not expose internal audits or rejection traces.
