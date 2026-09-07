# Flash — Cover IQ v1

Flash is a separate BetsPapa decision engine and page. For each upcoming fixture it evaluates only the 15 SportyBet markets listed below, publishes at most one selection, and otherwise returns `SKIP`.

## Market catalogue

1. 1st Half Result or Match Result — Home, Draw, Away
2. Home Team, Draw, or Away + Over 2.5 — Yes
3. Home Team, Draw, or Away + Under 2.5 — Yes
4. Home Team, Draw, or Away Team + GG — Yes
5. Home Team, Draw, or Away Team + Any Clean Sheet — Yes

These are OR markets. Flash calculates the probability of the joint event directly; it never adds the two component probabilities.

## Firing sequence

1. Load eligible upcoming league fixtures and finished matches from the same competition and season.
2. Build two venue-correct samples: the home side’s latest 10 home games and the away side’s latest 10 away games. The latest five receive 70% of the recency weight.
3. Estimate full-time and half-time scoring rates, blend them with the league scoring prior, and create a Poisson score-state distribution.
4. Fetch the matched SportyBet event and parse markets by exact displayed name. A missing or inactive price is never estimated.
5. Remove bookmaker margin using the paired Yes/No prices, or all three prices for the 1st Half Result or Match Result market when available.
6. Test all 15 choices against the component, direct-hit, model, rescue, agreement, price, value, lower-bound, and confidence gates.
7. Rank survivors and publish the strongest one. If two are separated by less than two confidence points, withhold the fixture as ambiguous.

## Hard gates

| Gate | Requirement |
|---|---:|
| Venue samples | At least 5 home and 5 away split games |
| SportyBet odds | 1.20–1.85 |
| Each split direct hit rate | At least 70% |
| Combined split direct hit rate | At least 75% |
| Model probability | At least 75% |
| Second-route rescue gain | At least 10 percentage points |
| Model disagreement | No more than 20 percentage points |
| Model edge over de-vigged price | At least 3 percentage points |
| Expected-value index | At least 1.04 |
| Lower probability estimate | At least 68% |
| Evidence-weighted confidence | At least 80 |

Early-season, unsupported-competition, and other blocking fixture-risk flags fail closed.

## Runtime surfaces

- Public page: `/flash.html`
- Public API: `GET /api/flash/today?date=YYYY-MM-DD`
- Forced refresh: append `&force=1`
- Engine key: `flash`
- Engine version: `flash-cover-iq-v1.0.0`

The API response includes the model probability, de-vigged fair probability, value index, component routes, venue split rates, rescue gain, and the exact losing zone shown in the page audit dialog.
