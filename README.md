# BetsPapa

## v1.18.3 Papa-First Z Fold and Tablet Shell

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
- PapaSense remains `papasense-v1.13.0`; Boss Picks remain powered separately by OMNI v2.5.2.

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
- `/boss-picks.html` — Papa’s Boss Picks, powered by OMNI HT/FT Gatekeeper v2.5.2
- `/bankers.html` — consensus picks across Papa’s Pick, Aggressive, Safer and Venue Pattern
- `/results-intelligence.html`
- `/admin/` — private diagnostics (not linked publicly)

See `BETSPAPA_V1_17_CONSENSUS_BANKERS.md` for current Banker criteria and `BETSPAPA_V1_10_GUIDE.md` for diagnostics and the anti-zombie similarity policy.


## Papa’s Boss Picks v1.12

Boss Picks are free and public. No account, login, watchlist, subscription, Supabase Auth migration or VAPID setup is required. The OMNI engine evaluates up to 48 markets and returns every selection scoring 80 or higher that passes all mandatory gates.


## Live status and settlement

- Public match state: `/api/matches/status`
- Manual protected settlement: `/api/admin/settle-date`
- Hourly workflow: `BetsPapa Live Scores and Settlement`
- Full guide: `LIVE_MATCHES_AND_SETTLEMENT_GUIDE.md`


## Live & Fixtures

The dedicated `/live-fixtures.html` page provides responsive pending, live, settling, settled and delayed match views, including mobile and Samsung Z Fold 6 layouts.
