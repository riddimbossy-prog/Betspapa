# Athena Separation Engine v2

Athena now separates high-event matches by **when** the match is expected to break open.

- `EARLY_SEPARATION`: leader-at-half-time routes dominate. Over 2.5 receives first priority when qualified.
- `LATE_SEPARATION`: draw-at-half-time to winner routes dominate. Over 1.5 is preferred to protect a quiet first half.
- `MIXED_SEPARATION`: both timings are credible. Over 1.5 is preferred unless Over 2.5 is at least five points stronger.
- `GOAL_ONLY_HIGH_EVENT`: goals are supported but timing is unclear. Over 2.5 needs 90+ and a four-point edge; otherwise Over 1.5 is used.
- `CONTROLLED_SEPARATION`: lower-event matches remain in the under/corridor logic.

`CONFLICT_NO_PICK` remains a hard stop. Scores are engine strengths, not guaranteed probabilities.
