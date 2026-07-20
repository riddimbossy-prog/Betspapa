# BetsPapa Render Setup

## Web service

```text
Name: betspapa-api
Language: Node
Branch: main
Root Directory: server
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
```

## Required environment variables

```env
NODE_ENV=production
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ALLOWED_ORIGINS=https://betspapa.com,https://www.betspapa.com
API_FOOTBALL_KEY=
ODDS_API_KEY=
ADMIN_SYNC_SECRET=
```

The API-Football key can alternatively be stored as `FOOTBALL_API_KEY` or `API_STATS_KEY`.

## Custom domain

Add `api.betspapa.com` in Render and point the Hostinger DNS `api` CNAME to `betspapa.onrender.com`.

## Health check

```text
https://api.betspapa.com/api/health
```

A healthy response includes:

```json
{
  "status": "ok",
  "service": "BetsPapa Prediction API",
  "version": "1.2.0",
  "database": "connected",
  "providerKeyConfigured": true,
  "adminSecretConfigured": true
}
```

Then follow `ADMIN_PIPELINE_GUIDE.md` to import the first league.
