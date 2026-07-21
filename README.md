# BetsPapa

Royal-purple responsive football prediction platform with a private Render backend, Supabase database, API-Football importer, HT/FT profile builder, common-sense prediction engine, and automatic result grading.

## Architecture

```text
betspapa.com             GitHub Pages frontend
api.betspapa.com         Render Node.js backend
Supabase                 Database and authentication
API-Football             Fixtures, teams, HT/FT scores and available bookmaker odds
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
- PapaSense v1.13 Team Over 0.5 value floor and same-team Over 1.5 upgrade policy.
- Win Either Half, Draw in Either Half, and first/second-half goal markets.
- Six-win and HT/FT behavioural safeguards for straight result selections.
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
- `/bankers.html`
- `/results-intelligence.html`
- `/admin/` — private diagnostics (not linked publicly)

See `BETSPAPA_V1_10_GUIDE.md` for banker criteria, diagnostics access and the
anti-zombie similarity policy.


## v1.11 user pages

- `/account.html`
- `/watchlist.html`
- `/settings.html`

Run the v1.11 Supabase migration before opening these pages in production.


## v1.13 Papa's Pick engine

The active backend engine is `papasense-v1.13.0`. It preserves the v1.11 account features and adds the amended Papa's Pick rules, including the 1.20 Team Over 0.5 value floor. See `PAPASENSE_V1_13_AMENDMENTS.md`.
