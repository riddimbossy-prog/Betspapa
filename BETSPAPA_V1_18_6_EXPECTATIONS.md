# What to expect after BetsPapa v1.18.6

## Athena will publish fewer picks

Fixtures classified as `CONFLICT_NO_PICK` will disappear from the official Athena selection list, even when one statistical market has a high score.

## High scores no longer override a failed classification

A score above 80 is necessary but not sufficient. The match must first have a valid Athena classification with a shared market story.

## Goal observations remain internal

For rejected conflict fixtures, Athena may retain the strongest goal score for diagnostics. It will not be shown as a pick, graded, or counted toward Consensus Bankers.

## High-event goal picks still work

A `HIGH_EVENT_EARLY_SEPARATION` match with a directional conflict may still publish Over 1.5, Over 2.5 or GG when the high-event classification and market safety rules pass.

## Existing PapaSense selections are unchanged

This update changes only Athena arbitration. Papa's Pick, Aggressive, Safer, Venue Pattern and the current PapaSense engine remain unchanged.

## Deployment checks

Expected `/api/health` values:

```text
version: 1.18.6
engineVersion: papasense-v1.18.1-no-draw-guard
athenaEngineVersion: athena-transition-v1.1.1-conflict-hard-stop
```

After deployment, clear the previous PWA cache and run Prepare Tomorrow Board so Athena regenerates under the new version.
