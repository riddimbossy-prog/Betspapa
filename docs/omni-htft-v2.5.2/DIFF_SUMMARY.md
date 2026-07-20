# Difference Summary

## Submitted v2.5.0 versus audited v2.4

The submitted version made two policy changes:

1. `SECOND_HALF_OVER_0_5` no longer required `homePpgEdge >= -0.20`.
2. Final selection was restricted to seven core markets.

## Audited v2.5.1 versus submitted v2.5.0

v2.5.1 corrected reporting and integration transparency without changing the seven-market policy. It added eligibility metadata, honest blocked-market reporting, and testable policy exports.

## v2.5.2 versus v2.5.1

- Removed `MATCH_OVER_0_5` from the executable market registry.
- Removed its scoring rule, streak rule, safety rank and settlement entry.
- Removed it from `CORE_MARKETS`.
- Active markets changed from 45 to 44.
- Selectable core markets changed from seven to six.
- All team and half 0.5 markets remain.
- Example output, backtest reports, tests, scripts and documentation were regenerated.
