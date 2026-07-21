# BetsPapa v1.17.2 — Zero Picks Fix

## Root cause

PapaSense v1.17.1 introduced a new engine version. The engine pages queried only
published rows for that exact version, but unlike the Today dashboard they did
not start background generation. The result was a valid fixture date displaying
zero selections until the admin workflow had regenerated every row.

## Fix

- Every engine page now loads imported fixtures and current predictions together.
- Missing current-engine rows automatically start background generation.
- Imported fixtures remain visible as Processing cards while PapaSense works.
- The page polls every eight seconds only while generation is running.
- Completed fixtures are replaced by real Qualified or Directional picks.
- Fixtures that still lack individual history show Waiting for history instead of
  disappearing or being mislabeled as predictions.
- Public responses are not cached while current picks are incomplete.
- PWA cache and portal asset filenames were bumped to v1.17.2.

The prediction logic remains `papasense-v1.17.1-overhaul`; this release fixes
loading and preparation rather than changing market calculations.
