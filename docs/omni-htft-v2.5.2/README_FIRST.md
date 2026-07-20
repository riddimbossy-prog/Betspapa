# OMNI HT/FT Gatekeeper v2.5.2 — Audited Core-Only Build

## Start here

This package contains two main programs:

1. `omni_htft_engine_v2_5_2.js` — evaluates a fixture and returns one pick or `NO_BET`.
2. `loss_forensics_v2_5_2.js` — tests the engine chronologically on historical CSV data.

The engine does not download football data. Your website, API adapter or database must provide the match histories described in `INPUT_SCHEMA.md`.

## What v2.5 means in plain language

The engine still evaluates all 44 active markets, but only six core markets may become the final selection:

- First Half Over 0.5 Goals
- Second Half Over 0.5 Goals
- Home Team to Lead at Any Time
- Away Team to Lead at Any Time
- Home Team to Win Either Half
- Away Team to Win Either Half

A non-core market can still show `accepted: true` in `allMarkets`. In v2.5.2 it also shows `selectionEligible: false`, so your app knows it passed its own rules but is blocked by the final core-only policy.

## Why v2.5.2 was created

v2.5.2 makes one user-directed market change: full-match `MATCH_OVER_0_5` is removed because its typical odds offer too little value. Team and half 0.5 markets remain.

The submitted v2.5.0 file also had a reporting defect. When only a non-core market qualified, the engine said no market reached acceptance and labelled the highest result as `bestRejected`. That was inaccurate.

v2.5.2 now:

- distinguishes accepted-but-blocked markets from rejected markets;
- reports `blockedAcceptedMarkets` on relevant `NO_BET` results;
- reports the real `bestCoreRejected` market;
- exposes the complete `selectionPolicy`;
- adds `selectionEligible` to every evaluated market;
- retains all audited v2.4 data protections;
- removes full-match Over 0.5 from evaluation and selection.

## Important scoring note

The 0–100 score is a rule score, not a calibrated probability. A score of 87 does not automatically mean an 87% chance of winning.

## Quick start on Windows

Install Node.js 18 or newer.

### Test everything

Double-click `RUN_TESTS.bat`, or run:

```powershell
npm test
```

### Run the example

Double-click `RUN_EXAMPLE.bat`, or run:

```powershell
npm run example
```

### Run the synthetic demonstration

Double-click `RUN_DEMO_BACKTEST.bat`, or run:

```powershell
npm run backtest:demo
```

The included `demo-league.csv` is synthetic. Its results prove that the workflow executes correctly; they do not prove real-world prediction performance.

## Run real historical data

Put league CSV files in the `data` folder, then run:

```powershell
node loss_forensics_v2_5_2.js --data-dir data --leagues premier-league,la-liga --season 2025-26 --output-dir reports\real-run
```

## Production recommendation

Use strict mode when your source provides complete xG, scored-first and lead-order data. Use non-strict mode only for older datasets; dependent markets remain blocked when their required fields are absent.

## Audit limitation

The submitted v2.5.0 code states that its core policy was validated across four seasons, but the supporting datasets, market odds and experiment reports were not supplied. This package preserves the policy but does not independently certify the stated hit rates, profitability or calibration.
