# BetsPapa Live Dashboard

The public frontend loads:

`GET /api/dashboard/today?date=YYYY-MM-DD`

The response includes:

- `predictions` — every current PapaSense v1.6 direction for the selected date;
- `fixtures` — all imported fixtures for the requested date;
- `recentResults` — latest graded predictions;
- `stats` — real engine totals and win rate;
- `generation` — automatic backfill information when predictions were missing.

Each prediction includes:

- primary market and selection;
- Qualified or Directional status;
- confidence and strongest transition;
- all nine HT/FT indicators;
- full market-family comparison;
- reasons, cautions and alternatives.

The browser first calls `https://api.betspapa.com`. If that fails, it automatically tries `https://betspapa.onrender.com`.

No demonstration fixtures, fake results or fake dashboard totals are shown.
