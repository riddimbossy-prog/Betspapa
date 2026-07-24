# What to expect after BetsPapa v1.18.5

## First deployment

Render will report service version `1.18.5` and Athena engine version `athena-transition-v1.1.0-score-safety`.

The Athena cache key changes with the engine version, so the first Athena board must be prepared again. PapaSense boards remain valid because the PapaSense engine version is unchanged.

## Athena board changes

- High-event fixtures should more often publish the strongest Over 2.5, Over 1.5 or BTTS market instead of automatically choosing Win Either Half.
- Strong team directions remain available when they pass venue, odds, lead-safety and comeback checks.
- A high-event Win Either Half selection must be within five points of the strongest goal market.
- Stable directional classifications allow a six-point safety margin.
- Matches with no safe market at 80 or higher remain hidden as NO PICK.

## Explanation popup

Each Athena fixture shows:

- best overall;
- best goal;
- best direction;
- safer alternative;
- classification;
- arbitration rule;
- RC1 priority change, when one occurred;
- overall and venue sample sizes;
- compatible-route percentages;
- reasons and cautions.

## Aktobe 2 vs Kairat Almaty 2 regression

With the supplied 15-match profiles, the expected Athena v1.1 result is:

```text
Primary: Over 2.5 — 100
Directional alternative: Kairat Almaty 2 Win Either Half — 88
Safer alternative: Over 1.5 — 96
```

## Deployment sequence

1. Replace the repository contents.
2. Commit and push.
3. Wait for GitHub Pages and Render.
4. Confirm `/api/health` reports `1.18.5`.
5. Open `/reset.html` once on each installed device.
6. Run `BetsPapa Prepare Tomorrow Board` once.

No SQL is required.
