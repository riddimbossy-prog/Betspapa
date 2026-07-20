# Changelog

## 2.5.2 — Remove Match Total Over 0.5

- Removed `MATCH_OVER_0_5` completely from market names, safety ranking, streak logic, market definitions and final-selection eligibility.
- Reduced active executable markets from 45 to 44.
- Reduced selectable core markets from seven to six.
- Kept `HOME_OVER_0_5`, `AWAY_OVER_0_5`, `HOME_UNDER_0_5`, `AWAY_UNDER_0_5`, `FIRST_HALF_OVER_0_5` and `SECOND_HALF_OVER_0_5`.
- Updated the backtester, tests, examples, documentation and package scripts to v2.5.2.

## 2.5.1 — Audited reporting release

- Preserved the submitted v2.5 core-only selection policy.
- Added `selectionEligible` to every market result.
- Added top-level `selectionPolicy` metadata.
- Added `blockedAcceptedMarkets` when non-core markets qualify but no core market qualifies.
- Added `bestCoreRejected` and retained `bestRejected` as a compatibility alias.
- Corrected misleading `NO_BET` reasons.
- Removed stale “score first” wording from supported-market documentation.
- Updated the backtester, scripts, examples and package metadata to v2.5.1.
- Expanded the automated suite from 12 to 14 tests.

## 2.5.0 — Submitted policy change

- Removed the form-balance requirement from Second Half Over 0.5.
- Restricted final selection to seven core markets.
- Retained the audited v2.4 data and date protections.

## 2.4.0 — Prior audited infrastructure

- Corrected version mismatch between engine and examiner.
- Removed guessed score-order data.
- Required explicit lead-order information.
- Added safe date parsing and same-day leakage protection.
- Corrected HT/FT venue orientation.
- Added explicit missing-xG gates.
- Added controlled short-sample `NO_BET` responses.
- Removed retired executable market entries.
- Expanded near-tie conflict checking.