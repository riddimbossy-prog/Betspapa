# Papa’s Boss Picks — OMNI HT/FT Gatekeeper v2.0

## Public URL

`https://betspapa.com/boss-picks.html`

## API

`GET /api/boss-picks/today?date=YYYY-MM-DD`

## Gate order

1. HT/FT statistics create the candidate.
2. Market-specific goals, results, clean sheets, failed-to-score patterns and other relevant components test it.
3. Current overall and venue streaks adjust the score.
4. Context and data quality are scored.
5. Hard failures and contradictions can force NO BOSS PICK.
6. Only one final market can survive for a fixture.

## Thresholds

- Prime: 87–100
- Qualified: 80–86.99
- Rejected: below 80 or any mandatory gate failure

## Current data mode

BetsPapa’s existing Supabase fixture history stores HT and FT scores but does not store complete xG and event-order history for every historical fixture. OMNI therefore runs in available-data mode. Markets requiring missing evidence fail their own mandatory checks instead of receiving invented values.

## Public direction

Boss Picks are free and public. No accounts, subscriptions, personal watchlists or account-based push alerts are included.

## Unlimited qualified slate

Every fixture scoring at least 80 and passing all mandatory OMNI gates is displayed. PRIME ranks first, followed by score and kickoff time.
