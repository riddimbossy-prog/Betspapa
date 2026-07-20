# Audit Report — OMNI HT/FT Gatekeeper v2.5.2

## Executive conclusion

The requested change has been implemented narrowly: **full-match total Over 0.5 Goals** (`MATCH_OVER_0_5`) is no longer an executable market. It cannot be evaluated, accepted, selected or emitted by the engine.

The following 0.5 markets remain unchanged:

- Home Team Over/Under 0.5
- Away Team Over/Under 0.5
- First Half Over 0.5
- Second Half Over 0.5

## Executable changes

`MATCH_OVER_0_5` was removed from:

- `MARKET_NAMES`;
- `SAFETY_RANK`;
- streak predicates;
- `marketDefinitions()`;
- `CORE_MARKETS`;
- backtest settlement logic.

The engine now evaluates **44 active markets** and permits **six core markets** as final selections:

- `FIRST_HALF_OVER_0_5`
- `SECOND_HALF_OVER_0_5`
- `HOME_LEAD_ANYTIME`
- `AWAY_LEAD_ANYTIME`
- `HOME_WIN_EITHER_HALF`
- `AWAY_WIN_EITHER_HALF`

## Regression testing

Fifteen automated tests passed. They verify version identity, date handling, controlled short-sample rejection, the 44-market registry, exact removal of full-match Over 0.5, retention of other 0.5 markets, the six-market selection policy, missing-data handling, deterministic output, CSV parsing, honest lead-market settlement and a complete walk-forward demonstration.

## Demonstration result

The regenerated synthetic demonstration produced 29 selections from 96 fixtures. No `MATCH_OVER_0_5` selection appears. This synthetic dataset verifies software behavior only and does not establish a real betting advantage.

## Validation limitation

Profitability cannot be inferred from hit rate alone. Real validation still requires untouched historical seasons and actual offered odds, with results reported by league, market, odds band and score band.
