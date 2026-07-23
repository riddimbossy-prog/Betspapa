# Betynz v2.3 — BetExplorer Primary Feed

This release makes BetExplorer the primary source for upcoming football fixtures and visible 1X2 odds across every league present on the pages it can read.

## What changed

- BetExplorer is the default fixture provider.
- The collector first checks BetExplorer football landing pages, then discovers daily links.
- It tries configurable daily URL templates instead of depending on one guessed URL.
- It parses both HTML fixture rows and embedded JSON/JSON-LD event data.
- It reads dates from each fixture row, so one page can contain several days.
- It reports how many fixtures have a complete Home/Draw/Away price.
- The GitHub test workflow now fails when it parses zero fixtures or zero complete 1X2 prices. A green workflow therefore means usable data was found.
- No league ID is required. Country and league filters remain optional and blank by default.
- No CAPTCHA, login, access-control or rate-limit bypass is included.

## Render environment

Set these on the `betynz-v2` API service:

```text
FIXTURE_PROVIDER=betexplorer
BETEXPLORER_ENABLED=true
BETEXPLORER_BASE_URL=https://www.betexplorer.com
BETEXPLORER_FIXTURE_URL_TEMPLATE=https://www.betexplorer.com/football/?year={YYYY}&month={MM}&day={DD}
BETEXPLORER_FALLBACK_URL_TEMPLATES=https://www.betexplorer.com/next/soccer/?year={YYYY}&month={MM}&day={DD};https://www.betexplorer.com/?year={YYYY}&month={MM}&day={DD}
BETEXPLORER_DISCOVERY_URLS=https://www.betexplorer.com/football/;https://www.betexplorer.com/next/soccer/
BETEXPLORER_RATE_MS=1800
BETEXPLORER_TIMEOUT_MS=25000
BETEXPLORER_MAX_PAGES=24
BETEXPLORER_UTC_OFFSET_MINUTES=0
PREDICTION_DAYS=6
PREDICTION_TIMEZONE=Africa/Accra
```

Leave these blank to avoid restrictions:

```text
INCLUDED_COUNTRIES=
EXCLUDED_COUNTRIES=
EXCLUDED_LEAGUE_IDS=
API_FOOTBALL_LEAGUE_IDS=
API_FOOTBALL_SEASON=
```

`API_FOOTBALL_KEY` may remain in Render, but it is ignored while `FIXTURE_PROVIDER=betexplorer`.

## Deployment

1. Copy the replacement files into the local `betynz-v2` repository.
2. Commit: `Make BetExplorer the primary all-league feed`.
3. Push to GitHub Desktop.
4. Wait for the Render API and static site builds to become Live.
5. Run `Actions → Test BetExplorer fixture feed`.
6. Confirm the report has `parsedFixtures > 0` and `fixturesWith1X2 > 0`.
7. Run `Actions → Sync upcoming Betynz predictions`.

## API checks

```text
https://betynz-v2.onrender.com/api/v1/providers/status
https://betynz-v2.onrender.com/api/v1/upcoming-fixtures?oddsOnly=true
https://betynz-v2.onrender.com/api/v1/predictions
https://betynz-v2.onrender.com/api/v1/bankers
```

The provider status report now includes:

```text
requestedUrl
finalUrl
redirected
page title
rowCandidates
jsonCandidates
tableFixtures
jsonFixtures
fixturesWith1X2
interstitial
```

## Saved-page parser test

If BetExplorer changes its page again, save the page source and send it to the protected endpoint:

```text
POST /api/v1/admin/parse-betexplorer-html
x-admin-token: YOUR_ADMIN_IMPORT_TOKEN
content-type: application/json
```

Body:

```json
{
  "date": "2026-07-23",
  "pageUrl": "https://www.betexplorer.com/football/",
  "html": "THE_SAVED_PAGE_SOURCE"
}
```

This endpoint only tests the parser. It does not save fixtures and does not bypass access controls.

## Prediction coverage

The upcoming fixture board can include all leagues parsed from BetExplorer. Qualified Chronos predictions still depend on historical evidence. A league with little or no settled history may appear on the fixture board but return no pick until enough historical matches are imported or a validated global odds pattern passes the strict fallback rules.
