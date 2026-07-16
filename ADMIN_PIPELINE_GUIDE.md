# BetsPapa Real-Data Pipeline Guide

This build imports API-Football fixtures, creates HT/FT and goal profiles, runs the BetsPapa common-sense engine, saves predictions to Supabase, and grades completed predictions.

## Required Render environment variables

```env
NODE_ENV=production
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_BACKEND_SECRET
SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_KEY
ALLOWED_ORIGINS=https://betspapa.com,https://www.betspapa.com
API_FOOTBALL_KEY=YOUR_API_FOOTBALL_KEY
ODDS_API_KEY=YOUR_THE_ODDS_API_KEY
ADMIN_SYNC_SECRET=YOUR_LONG_RANDOM_PRIVATE_SECRET
```

The backend also accepts `FOOTBALL_API_KEY` or `API_STATS_KEY` as aliases for `API_FOOTBALL_KEY`.

Never place `SUPABASE_SERVICE_ROLE_KEY`, `API_FOOTBALL_KEY`, or `ADMIN_SYNC_SECRET` in the frontend or commit them to GitHub.

## Authentication for admin routes

Use either header:

```http
x-admin-secret: YOUR_ADMIN_SYNC_SECRET
```

or:

```http
Authorization: Bearer YOUR_ADMIN_SYNC_SECRET
```

## Recommended first run

Start with one league and one season so API usage and data quality can be checked.

### 1. Bootstrap a league

```bash
curl -X POST https://api.betspapa.com/api/admin/bootstrap-league \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: YOUR_ADMIN_SYNC_SECRET" \
  -d '{
    "leagueId": 39,
    "season": 2025,
    "from": "2025-08-01",
    "to": "2026-05-31",
    "predictionDate": "2026-07-16"
  }'
```

Replace the sample league ID, season, and dates with the competition you want to import.

This performs:

1. Historical fixture import for the selected league.
2. HT/FT Overall, Home, Away, and Recent-6 profile construction.
3. Goal profile construction for GG, O1.5, O2.5, U3.5, scoring and conceding thresholds.
4. Upcoming fixture import for the requested prediction date.
5. Prediction generation and Supabase storage.

## Individual routes

### Provider account/status

```http
GET /api/admin/provider-status
```

### Import one calendar date

```http
POST /api/admin/sync-date
Content-Type: application/json
x-admin-secret: ...

{"date":"2026-07-16"}
```

### Import a league history range

`leagueId` here is the API-Football provider league ID.

```http
POST /api/admin/sync-history

{
  "leagueId": 39,
  "season": 2025,
  "from": "2025-08-01",
  "to": "2026-05-31",
  "rebuild": true
}
```

### Rebuild profiles

`leagueId` here is the internal Supabase `leagues.id`, not the provider ID.

```http
POST /api/admin/rebuild-profiles

{"leagueId":1,"season":2025}
```

### Generate predictions

```http
POST /api/admin/generate-predictions

{"date":"2026-07-16"}
```

### Grade finished predictions

```http
POST /api/admin/grade-results

{"date":"2026-07-16"}
```

### Daily pipeline

```http
POST /api/admin/run-daily

{"date":"2026-07-16"}
```

The daily route imports that date, rebuilds affected league profiles, grades completed fixtures, and generates predictions for not-started fixtures.

## Public routes

```text
GET /api/health
GET /api/fixtures/today?date=YYYY-MM-DD
GET /api/predictions/today?date=YYYY-MM-DD
GET /api/demo
POST /api/predict
```

The royal-purple frontend automatically requests:

```text
https://api.betspapa.com/api/predictions/today
```

When no live predictions have been published yet, it falls back to demonstration data.

## Data rules

- Only fixtures with status `FT` enter HT/FT profiles.
- Extra-time and penalty results are not mixed into standard league profiles.
- Each fixture is classified from both teams' perspectives.
- Profiles are stored as `overall`, `home`, `away`, and `recent6`.
- The engine publishes one highest-ranked qualified market or No Bet.
- GG needs independent scoring support for both teams.
- Over 2.5 can qualify through two-sided scoring or one-team dominance.
- Under 3.5 requires goal-ceiling confirmation and is rejected when a dominant 3+ goal route is credible.

## Important limitation

This package was tested offline with automated unit tests, but live API-Football imports could not be executed in the build environment because internet access and your private keys are unavailable here. Start with one league, inspect the imported rows, and then expand coverage.
