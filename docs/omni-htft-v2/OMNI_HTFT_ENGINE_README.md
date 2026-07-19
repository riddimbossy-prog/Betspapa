# OMNI HT/FT Gatekeeper Engine v2.0

A deterministic Node.js engine that evaluates 48 standard football pre-match markets.

## Execution

```bash
node omni_htft_engine.js omni_htft_input_example.json
```

Or import it:

```js
const { runEngine, calculateMetrics } = require("./omni_htft_engine");
const result = runEngine(input);
```

No third-party packages are required.

## Governing order

1. HT/FT statistics create the market candidate.
2. Market-specific goal, result, clean-sheet, failed-to-score, xG and timing metrics test it.
3. Current overall and venue streaks adjust the score.
4. Hard rejections and contradictions can force `NO_BET`.
5. The engine chooses one final market.

A market cannot qualify when its HT/FT gate fails, regardless of its other statistics.

## Required raw team match fields

Each item in `homeMatches` and `awayMatches` is from that team's perspective:

```json
{
  "date": "2026-07-10",
  "venue": "home",
  "goalsFor": 2,
  "goalsAgainst": 1,
  "halfTimeGoalsFor": 1,
  "halfTimeGoalsAgainst": 0,
  "xgFor": 1.8,
  "xgAgainst": 0.9,
  "scoredFirst": true,
  "ledAnyTime": true,
  "trailedAnyTime": false
}
```

In strict mode, `xgFor`, `xgAgainst`, `scoredFirst`, `ledAnyTime`, and `trailedAnyTime` are required. For a 0-0 match, `scoredFirst` must be `null`.

## Required league match fields

League records are from the normal home/away perspective:

```json
{
  "date": "2026-07-10",
  "homeGoals": 2,
  "awayGoals": 1,
  "halfTimeHomeGoals": 1,
  "halfTimeAwayGoals": 0
}
```

## Exact sample weighting

For every team metric:

```text
Weighted metric =
  0.50 × season venue metric
+ 0.30 × last 10 overall metric
+ 0.20 × last 6 venue metric
```

Home-team venue data means home matches. Away-team venue data means away matches.

## Exact core calculations

```text
Combined rate = (home weighted rate + away weighted rate) / 2

Expected goal environment =
  (home GF + home GA + away GF + away GA) / 2

Scoring reliability = 1 − failed-to-score rate

Defensive vulnerability = 1 − clean-sheet rate

Goal dependency ratio =
  max(home scoring average, away scoring average)
  / (home scoring average + away scoring average)
```

## Exact HT/FT calculations

The engine derives standard categories: `1/1`, `X/1`, `2/1`, `1/X`, `X/X`, `2/X`, `1/2`, `X/2`, `2/2`.

```text
Dynamic HT/FT = X/1 + X/2 + 1/X + 2/X + 1/2 + 2/1

Reversal = 1/2 + 2/1

Equalizer = 1/X + 2/X

Reversal/equalizer = 1/X + 2/X + 1/2 + 2/1

Static HT/FT = 1/1 + X/X + 2/2

HT draw = X/1 + X/X + X/2

Home full-time win = 1/1 + X/1 + 2/1

Full-time draw = 1/X + X/X + 2/X

Away full-time win = 2/2 + X/2 + 1/2

Home led at halftime = 1/1 + 1/X + 1/2

Away led at halftime = 2/2 + 2/X + 2/1

Home guaranteed to have scored from HT/FT =
  1/1 + X/1 + 2/1 + 1/X + 1/2

Away guaranteed to have scored from HT/FT =
  2/2 + X/2 + 1/2 + 2/X + 2/1
```

## Exact streak calculation

The engine calculates both venue-specific and overall current streaks.

```text
Length 0–2 = 0 points
Length 3   = 2 points
Length 4   = 4 points
Length 5   = 6 points
Length 6+  = 8 points
```

Overall streak points receive 50% weight. Venue streaks receive full weight.

```text
Raw streak balance =
  venue positive points
+ 0.5 × overall positive points
− venue negative points
− 0.5 × overall negative points
```

When the season venue rate is below the market's consistency threshold, raw streak weight is halved.

The raw balance is capped to `[-15, +15]`, then converted to the 15-point score:

```text
Streak score = clamp(7.5 + raw balance / 2, 0, 15)
```

Neutral streak evidence therefore scores 7.5/15.

## Confidence score

```text
HT/FT foundation       40 points
Relevant components    35 points
Relevant streaks       15 points
Context/data quality   10 points
Contradiction penalties subtracted
```

```text
Prime      = 87–100
Qualified  = 80–86.99
Rejected   = below 80 or any mandatory gate failure
```

The engine outputs `NO_BET` when no market qualifies. It also outputs `NO_BET` when the top two markets conflict and are fewer than three confidence points apart.

## Supported markets

The file evaluates 48 markets, including:

- Match Over/Under 0.5 to 4.5
- Home and away team Over/Under 0.5, 1.5 and 2.5
- BTTS Yes/No
- 1X2, Draw No Bet and Double Chance
- First-half and second-half goals
- Win either half and score in both halves
- Team to score first
- Team to lead at any time
- Clean sheet and win to nil

The engine does not claim certainty or guaranteed profit. It is a repeatable statistical filter.
