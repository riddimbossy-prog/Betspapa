# BetsPapa v1.23.0 — League-Only Specialist Market Guards

## Release purpose

This release corrects two connected risks:

1. Athena's named-team second-half goal market could qualify from borderline overall evidence without strong enough home/away and recent confirmation.
2. Cup and friendly fixtures could enter the public prediction pipeline, while historical profiles could mix league, cup, friendly or older-season evidence.

BetsPapa v1.23.0 applies the correction to Athena and to the shared PapaSense catalogue used by Papa's Pick, Safer, Aggressive and Venue Pattern.

## Competition policy

Only competitions verified as **LEAGUE** are eligible for predictions.

The following are blocked before any engine runs:

- Club and international friendlies
- Pre-season and testimonial games
- Domestic cups
- Continental cups and knockout tournaments
- Super cups and shields
- Competitions whose type is still UNKNOWN

The main Papa board also hides excluded fixtures instead of leaving them in a permanent “preparing” state.

Each team's evidence is now restricted to the fixture's exact:

- league ID
- season
- home/away role where a venue split is required
- normal 90-minute FT results

## Specialist markets reviewed and hardened

### Team to score in the second half

Now requires overall, correct venue and recent-six evidence for both:

- the selected team's second-half scoring
- the opponent's second-half conceding

It also requires direct HT/FT routes, strong second-half goals-per-match evidence and a clear advantage over the neutral **Second Half Over 0.5** market. A named team is not selected merely because Athena expects some second-half activity.

### Second-half Draw No Bet

Now requires repeatable second-half wins in overall, correct venue and recent samples. It is blocked when the opponent's second-half loss route or the selected team's venue win rate is insufficient.

### Second Half Over 0.5

Now uses the weakest of the overall, venue and recent rates instead of allowing a strong average to hide one weak sample.

### Second Half Over 1.5

Now requires repeatable two-goal second halves in all three scopes, with sufficient second-half goal volume.

### Goals in Both Halves

Now requires the both-halves pattern in all three scopes and independently confirms the first-half and second-half goal legs.

### First Half Over 0.5 and First Half Under 1.5

Both now use conservative overall, venue and recent floors. Missing half-time data blocks the market rather than becoming a zero or a guessed value.

### Team Over 0.5 full match

Now requires the team's scoring and the opponent's conceding to agree across overall, venue and recent samples.

## Engine behaviour

- **Papa's Pick:** selects the best balanced league-only market or returns NO PICK.
- **Safer:** can only broaden Papa's same story; it inherits every specialist-market block.
- **Aggressive:** can only sharpen Papa's same story; it cannot bypass a specialist-market block.
- **Venue Pattern:** uses verified home-versus-away evidence from the same league and season only.
- **Athena:** uses the same league-only policy plus stricter swing and half-goal arbitration.

## Deliberate consequence

The board may temporarily show fewer fixtures after installation. UNKNOWN competitions remain blocked until API-Football metadata confirms them as leagues. This is intentional and safer than guessing.

## Verification

- 125 automated tests pass.
- JavaScript syntax checks pass for backend, tests and public assets.
- Normal profile statuses remain FT-only.
