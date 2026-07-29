# PapaLock Banker Engine v1.0

PapaLock is BetsPapa's final banker supervisor.

## Decision flow

1. Read all published PapaSense selections and the qualified Athena selection.
2. Collapse Papa's Pick, Safer and Aggressive into one family.
3. Classify every qualified selection into a shared match story.
4. Require at least two independent families.
5. Verify league type, same-season evidence and 12/8/6 sample gates.
6. Choose the safest compatible market instead of the sharpest available market.
7. Penalise directional conflict, incomplete specialist confirmation and weak calibration.
8. Publish only Prime or Elite grades.
9. Apply the three-per-day and two-per-league limits.
10. Save and settle the prepared slate when the v1.25.0 migration is installed.

## Grades

- **PapaLock Elite:** all three independent families, score 92+
- **PapaLock Prime:** at least two independent families, score 84+
- **Qualified:** audit passed at a lower score, hidden from the public Banker page
- **Withheld:** failed evidence, sample or conflict gates

PapaLock Score is a rule score. It is not a promise or guaranteed probability.
