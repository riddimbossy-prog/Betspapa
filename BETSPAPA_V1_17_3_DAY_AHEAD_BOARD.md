# BetsPapa v1.17.3 — Day-Ahead Board Preparation

Papa now prepares tomorrow's board before match day instead of waiting for a visitor to open the page.

## Schedule

- **17:25 UTC:** first preparation pass for tomorrow.
- **22:25 UTC:** second pass for late fixtures and missing team histories.
- **04:17, 10:17 and 15:17 UTC:** match-day maintenance for today's prepared board.
- **Hourly:** live-score refresh and settlement continue separately.

## Day-ahead preparation sequence

1. Import tomorrow's fixtures.
2. Inspect every home and away team's stored history.
3. Hydrate teams that do not yet have enough individual data.
4. Rebuild profiles affected by newly imported history.
5. Run PapaSense v1.17.1 Overhaul for every predictable fixture.
6. Save all completed engine selections to Supabase.
7. Verify board coverage through `/api/board-preparation/status`.
8. Repeat once for teams that were not ready in the first pass.

## Why two evening passes?

Fixture providers can add or change matches after the first import. The second pass catches:

- late-added fixtures
- changed kickoff times
- newly available history
- teams that failed temporarily during the first hydration pass

## Board status endpoint

`GET /api/board-preparation/status?date=YYYY-MM-DD`

Returns:

- fixtures found
- picks ready
- teams waiting for history
- coverage percentage
- board state: `ready`, `partial`, `preparing`, or `empty`

No database migration is required.
