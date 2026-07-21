# BetsPapa v1.6

Royal-purple responsive football prediction platform with a private Render backend, Supabase database, API-Football importer, HT/FT profile builder, PapaSense v1.6 multi-market engine, complete explanations and automatic result grading.

## Architecture

```text
betspapa.com             GitHub Pages frontend
api.betspapa.com         Render Node.js backend
Supabase                 Database and authentication
API-Football             Fixtures, teams, half-time and full-time scores
The Odds API             Reserved for bookmaker-odds validation
```

## PapaSense v1.6

Every imported fixture receives one honest market direction after the engine:

1. blends Overall, Venue and Recent-6 profiles;
2. matches all nine home HT/FT transitions to the away team’s opposite transitions;
3. builds result, draw, goal, clean-sheet and half-specific intelligence;
4. scores each market independently;
5. applies market-specific blockers and sample-quality penalties;
6. compares the best option from every market family;
7. labels the final output **Qualified** or **Directional**.

### Supported market families

- 1X, X2 and Either Team to Win (12)
- Home/Away DNB
- Home/Away win and Full-Time Draw
- Half-Time Double Chance and Half-Time Result
- Exact HT/FT
- Home/Away to Win Either Half
- GG / NG
- Over/Under 1.5, 2.5 and 3.5
- 2–3 Total Goals
- Team Over 0.5, Over 1.5 and Under 1.5
- Home/Away Clean Sheet
- First Half Over 0.5
- Second Half Over 0.5

## Main features

- Responsive Papa-branded UI for desktop, tablet, phone and Z Fold.
- Date, league, market, strength and team filters.
- Click any fixture for the complete explanation.
- All nine HT/FT indicators displayed.
- Market-family comparison showing why the chosen pick beat other markets.
- Live fixture, prediction, result and performance feeds.
- Automatic missing-prediction generation on the dashboard.
- Automatic grading for every supported market.
- No fake fixture, result or performance data.

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

See `RENDER_SETUP.md`, `ADMIN_PIPELINE_GUIDE.md`, and `PAPASENSE_V1_6_GUIDE.md`.

## Test

```bash
cd server
npm install
npm test
```
