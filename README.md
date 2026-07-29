## v1.25.0 PapaLock Banker Engine

The Banker section is now populated by PapaLock, a dedicated supervisor that counts Papa, Safer and Aggressive as one PapaSense family, then checks Venue Pattern and Athena independently. It requires two independent families, 12 overall matches, eight venue matches and recent-six evidence, chooses the safest common market, and publishes at most three Prime or Elite bankers per day. Run `supabase/BETSPAPA_V1_25_0_PAPALOCK_BANKER_ENGINE.sql` before enabling persistence and settlement. See `PAPALOCK_BANKER_ENGINE_V1.md`.

## v1.24.0 Picks-Only Boards and Direct Mobile Navigation

Public boards now show only fixtures with real engine selections. The main Papa’s Pick board keeps a fixture when at least one of Papa, Safer, Aggressive, Venue Pattern or Athena has a pick, and displays only the engines that selected a market. Phones, tablets and Samsung Z Fold screens now use Papa’s Pick, Safer, Aggressive, Athena and More as the direct bottom navigation. No new Supabase migration is required. See `BETSPAPA_V1_24_0_EXPECTATIONS.md`.

## v1.22.0 PapaSense v2 Four-Engine Resolution

Papa’s Pick, Safer, Aggressive and Venue Pattern now use separate decision contracts on top of the shared HT/FT, venue, half-goal and event-aware evidence layer. Papa can return NO PICK; Safer must be a true broader containment market; Aggressive must be a same-story escalation; and Venue Pattern is independently generated from home-versus-away evidence. Per-engine settled results feed conservative confidence calibration. Run `supabase/BETSPAPA_V1_21_0_PAPASENSE_V2.sql` after the Athena v3 migration. See `PAPASENSE_V2_FOUR_ENGINE_RESOLUTION.md`.

## v1.20.0 Athena v3 Swing Resolution & Half-Goals

Athena now separates five kinds of swing match, measures goals scored and conceded in each half, supports second-half and goals-in-both-halves markets, hydrates goal-event history in the background, and explains every published pick in plain English. Run `supabase/BETSPAPA_V1_20_0_ATHENA_V3.sql` before deployment. See `ATHENA_V3_SWING_HALF_GOALS.md`.

## v1.19.0 Athena Separation Engine v2

Athena now predicts whether separation is likely early, late, mixed or goal-only before choosing the final market. See `ATHENA_SEPARATION_ENGINE_V2.md`.

# BetsPapa

## v1.18.6 Athena Conflict Hard Stop

Athena now treats `CONFLICT_NO_PICK` as a mandatory final decision. A market score above 80 can remain an internal observation, but it cannot be promoted to an official pick, graded, or counted in Consensus Bankers when the HT/FT classifier found no clear shared market. High-event goal classifications still work normally. See `ATHENA_TRANSITION_ENGINE_V1_18_6.md`.

## v1.18.5 Athena v1.1 Score-and-Safety Arbitration

Athena now evaluates every qualified market before publishing its primary selection. The original RC1 scoring core remains intact, but the old “first market above 80 wins” priority is replaced by classification-specific score-and-safety arbitration. High-event fixtures normally select the strongest qualified attacking goal market; a directional Win Either Half selection may replace it only when it is fully confirmed and within five points. Stable directional fixtures keep a team market only after overall direction, venue split, bookmaker direction, lead protection and opponent comeback checks all pass. See `ATHENA_TRANSITION_ENGINE_V1_18_5.md`.

## v1.18.4 Papa-First Z Fold and Tablet Shell

BetsPapa now opens directly on Papa's Pick. The retired home dashboard and Today/Home navigation were removed. The portal layout now uses the Samsung Z Fold inner display and tablet widths with responsive two/three-column boards while keeping the cover display readable. Prediction logic remains `papasense-v1.18.1-no-draw-guard`. See `BETSPAPA_V1_18_3_PAPA_FIRST_FOLD_TABLET.md`.

## v1.18.2 Fast Prepared-Board Delivery

Public pick pages now display prepared boards without running live provider refresh, history hydration or prediction generation. Repeat visits render the locally saved board immediately while the API checks quietly for a newer snapshot. PapaSense remains `papasense-v1.18.1-no-draw-guard`; this release changes delivery speed, not prediction logic. See `BETSPAPA_V1_18_2_FAST_BOARD_DELIVERY.md`.

## v1.18.1 Either Team to Win Misfire Guard

PapaSense now separates clean decisive HT/FT routes from open scoring routes before allowing Either Team to Win. In high-scoring environments, 12 is blocked when GG or Over 1.5 has the stronger independently gated explanation. A high-scoring league alone cannot trigger a goal market. The API engine version is `papasense-v1.18.1-no-draw-guard`. See `PAPASENSE_V1_18_1_NO_DRAW_GUARD.md`.

## v1.18.0 HT/FT-first market firing engine

Papa, Aggressive, Safer and Venue Pattern now use one authoritative HT/FT-first catalogue. Every market must pass a market-specific HT/FT eligibility gate before goal, venue, recent-form and defensive evidence can confirm it. The API engine version is `papasense-v1.18.0-htft-first`. See `PAPASENSE_V1_18_HTFT_FIRST_ENGINE.md`.

Royal-purple responsive football prediction platform with a private Render backend, Supabase database, API-Football importer, HT/FT profile builder, common-sense prediction engine, and automatic result grading.


## v1.17.0 consensus Bankers

- `/bankers.html` now compares all four PapaSense engines for each fixture.
- Two or more qualified engines must choose the same selection for a normal Banker.
- Unanimous, Prime Consensus and Consensus levels show 4/4, 3/4 and 2/4 agreement.
- A single-engine pick appears only at 86%+ after every strict evidence gate passes.
- One strongest Banker is published per fixture; split decisions are withheld.
- Saved Bankers display immediately and refresh quietly in the background.
- PapaSense remains the primary engine; Athena Transition Engine v1.0-RC1 now replaces the retired OMNI Boss Picks page.

## v1.16.1 performance and Results repair

- Saved picks render immediately while the live API refreshes in the background.
- Public API requests use shorter failover timeouts and remember the last working endpoint.
- Dashboard and Results responses use short stale-while-revalidate caches.
- Results loads historical published prediction versions in safe Supabase batches.
- Temporary API problems keep the last saved picks and Results visible.
- PapaSense remains `papasense-v1.13.0`; no prediction-rule amendment was removed.

## Architecture

```text
betspapa.com             GitHub Pages frontend
api.betspapa.com         Render Node.js backend
Supabase                 Database and authentication
API-Football             Fixtures, teams, halftime and fulltime scores
The Odds API             Reserved for bookmaker-odds validation
```

## Main features

- Responsive royal-purple UI for desktop, tablet, phone and Z Fold.
- Consensus Banker page comparing all four PapaSense engines with one pick per fixture.
- Hamburger drawer and mobile bottom navigation.
- HT/FT transition matrix covering 1/1 through 2/2.
- Correct home/away orientation.
- Overall, Home, Away and Recent-6 profiles.
- Latest GG confirmation from both teams' scoring and conceding thresholds.
- One-sided dominant-team Over 2.5 route.
- Under 3.5 ceiling safeguards.
- Protected API-Football fixture importer.
- Automatic prediction storage in Supabase.
- Automatic grading after fixtures finish.
- Live frontend feed with demo fallback.

## Deploy frontend

Push the repository root to `riddimbossy-prog/Betspapa`. GitHub Pages serves the root through `betspapa.com`.

## Deploy backend

Render settings:

```text
Root Directory: server
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
```

See `RENDER_SETUP.md` and `ADMIN_PIPELINE_GUIDE.md`.

## Test

```bash
cd server
npm install
npm test
```


## v1.10 portal pages

- `/papas-pick.html`
- `/aggressive.html`
- `/safer.html`
- `/venue-pattern.html`
- `/athena.html` — Athena Transition Picks, powered by RC1 scoring plus Athena v1.1 arbitration
- `/bankers.html` — consensus picks across Papa’s Pick, Aggressive, Safer and Venue Pattern
- `/results-intelligence.html`
- `/admin/` — private diagnostics (not linked publicly)

See `BETSPAPA_V1_17_CONSENSUS_BANKERS.md` for current Banker criteria and `BETSPAPA_V1_10_GUIDE.md` for diagnostics and the anti-zombie similarity policy.


## Athena v3 Swing Resolution & Half-Goals

Athena is free and public. Run `supabase/BETSPAPA_V1_20_0_ATHENA_V3.sql` before deployment. Athena remains HT/FT-first, then resolves full reversals, surrendered leads, late separation, two-way instability and false swings with verified goals-by-half evidence. Public cards explain the choice in plain English; the technical audit is protected. Only normal 90-minute FT history is used, and incomplete event timing never becomes a guessed value.


## Live status and settlement

- Public match state: `/api/matches/status`
- Manual protected settlement: `/api/admin/settle-date`
- Hourly workflow: `BetsPapa Live Scores and Settlement`
- Full guide: `LIVE_MATCHES_AND_SETTLEMENT_GUIDE.md`


## Live & Fixtures

The dedicated `/live-fixtures.html` page provides responsive pending, live, settling, settled and delayed match views, including mobile and Samsung Z Fold 6 layouts.


## v1.22.0 main board

Papa’s Pick now displays Papa, Safer, Aggressive, Venue Pattern and Athena together on one fixture-centred board.
