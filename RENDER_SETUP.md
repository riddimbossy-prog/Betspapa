# BetsPapa Render Setup

Use these values when creating the Render Web Service:

- Name: `betspapa-api`
- Language: `Node`
- Branch: `main`
- Root Directory: `server`
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/api/health`

Required environment variables:

- `NODE_ENV=production`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ALLOWED_ORIGINS=https://betspapa.com,https://www.betspapa.com`
- `ODDS_API_KEY`
- `FOOTBALL_API_KEY`
- `API_STATS_KEY`

After deployment, test:

`https://YOUR-RENDER-SERVICE.onrender.com/api/health`

Expected database-connected response:

```json
{
  "status": "ok",
  "service": "BetsPapa Prediction API",
  "version": "1.1.0",
  "database": "connected"
}
```
