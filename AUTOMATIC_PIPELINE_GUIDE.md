# BetsPapa Automatic Fixture and Prediction Pipeline

BetsPapa no longer depends on a PowerShell window or a visitor opening the site.

## What runs automatically

The GitHub Actions workflow `.github/workflows/automatic-picks.yml` runs:

- every four hours
- after a successful GitHub Pages deployment
- whenever you manually select **Run workflow**

Each run:

1. Checks the Render API and Supabase connection.
2. Refreshes yesterday's fixtures and grades results.
3. Imports today's fixtures.
4. Checks every team's individual HT/FT profile coverage.
5. Hydrates thin-data teams from completed API-Football matches.
6. Generates today's four engine picks.
7. Refreshes tomorrow's fixtures and generates early picks.

## Required GitHub secret

Create this repository secret:

```text
ADMIN_SYNC_SECRET
```

Its value must be exactly the same as `ADMIN_SYNC_SECRET` in Render.

Path:

```text
GitHub repository
→ Settings
→ Secrets and variables
→ Actions
→ New repository secret
```

Do not place the value in source code.

## Optional GitHub variable

You may create:

```text
BETSPAPA_API_BASE=https://api.betspapa.com
```

Path:

```text
Settings
→ Secrets and variables
→ Actions
→ Variables
```

This is optional because the script already defaults to the BetsPapa API domain.

## First manual run

Open:

```text
GitHub → Actions → BetsPapa Automatic Picks → Run workflow
```

Leave the date blank to process yesterday, today and tomorrow relative to UTC.

## Logs

Every run displays:

- fixtures returned by API-Football
- fixtures imported into Supabase
- teams already ready
- teams needing history
- history requests attempted
- picks generated
- picks published
- fixtures withheld

The workflow fails visibly when the Render secret, API key, database, or provider is unavailable.
