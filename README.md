# BetsPapa

Royal-purple responsive football prediction platform with a private Render backend, Supabase database, API-Football importer, HT/FT profile builder, common-sense prediction engine, and automatic result grading.

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
- `/boss-picks.html` — Papa’s Boss Picks, powered by OMNI HT/FT Gatekeeper v2.0
- `/bankers.html` — redirects to Boss Picks
- `/results-intelligence.html`
- `/admin/` — private diagnostics (not linked publicly)

See `BETSPAPA_V1_10_GUIDE.md` for banker criteria, diagnostics access and the
anti-zombie similarity policy.


## Papa’s Boss Picks v1.12

Boss Picks are free and public. No account, login, watchlist, subscription, Supabase Auth migration or VAPID setup is required. The OMNI engine evaluates up to 48 markets and returns every selection scoring 80 or higher that passes all mandatory gates.
