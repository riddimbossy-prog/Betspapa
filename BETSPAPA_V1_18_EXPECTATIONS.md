# What to Expect After BetsPapa v1.18.0

## Immediately after deployment

The API health endpoint should report:

- Service version: `1.18.0`
- Engine version: `papasense-v1.18.0-htft-first`
- Database: connected

Because the engine version changed, existing v1.17 prediction rows will not be used for current boards. Papa will regenerate the board under v1.18.0. During that preparation, imported fixtures may temporarily show Processing or Waiting for history.

## Expected pick behaviour

- X/X by itself will not produce Over 1.5.
- 1/X, 1/2, 2/1 and 2/X are the direct GG routes.
- 1/2 and 2/1 open the strongest structural Over 2.5 path.
- 1/1 favours Home Win Either Half and home-result markets.
- 2/2 favours Away Win Either Half and away-result markets.
- X/1, X/X and X/2 can support Draw in Either Half because half-time is drawn.
- Full-time draw after a first-half lead does not count as Draw in Either Half.
- Team goal markets require matching team-scoring HT/FT routes before goal records confirm them.
- Under markets require a stable HT/FT ceiling and must survive reversal/volatility blockers.

## Expected differences between engine pages

- Papa's Pick chooses the strongest overall eligible interpretation.
- Safer chooses the strongest eligible broader protection, not simply the first market on a fixed list.
- Aggressive chooses the strongest eligible higher-upside option, but cannot bypass the firing gate.
- Venue Pattern only fires from a market containing real venue evidence.

## Explanations

Clicking a fixture should show a dedicated HT/FT firing-rule section. It will state:

- why that market was allowed to enter the ranking
- which routes triggered it
- which statistics confirmed it
- which contradictions were checked
- why competing markets were weaker or blocked

## Board preparation

Run the Prepare Tomorrow Board workflow once after deployment. Future scheduled runs prepare tomorrow automatically. No Supabase SQL migration is required.
