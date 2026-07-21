# BetsPapa Live Dashboard

The public frontend loads one endpoint:

`GET /api/dashboard/today?date=YYYY-MM-DD`

The response includes:

- `predictions` — today's published qualified predictions
- `fixtures` — all imported fixtures for the requested date
- `recentResults` — latest graded predictions
- `stats` — real engine totals and win rate

The browser first calls `https://api.betspapa.com`. If that fails, it automatically
tries `https://betspapa.onrender.com`.

No demonstration fixtures or fake dashboard totals are shown.
