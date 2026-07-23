# Betynz Chronos Fusion v2.3

Betynz prediction platform for **today plus the next five days**, with BetExplorer as the primary all-league fixture and visible 1X2 odds feed.

## Main features

- BetExplorer fixture discovery across available countries and leagues
- Visible Home/Draw/Away odds ingestion
- Chronos historical-odds engine
- Four-engine approval: Chronos, Athena, Zeus and Leonidas
- One best market per fixture; weak matches return no pick
- Low-odds upgrade rule: selections below 1.19 must pass a stronger related market
- Daily Banker section with up to three strict picks
- Simple-English statistical explanations
- League profile, form, strength, venue, table position and late-season pressure
- Automatic sync every four hours
- Automatic settlement after historical result imports
- Responsive desktop, mobile, tablet and Z Fold interface
- Installable PWA

## Main endpoints

- `GET /api/v1/providers/status`
- `GET /api/v1/upcoming-fixtures`
- `GET /api/v1/predictions`
- `GET /api/v1/bankers?date=YYYY-MM-DD`
- `POST /api/v1/admin/test-betexplorer`
- `POST /api/v1/admin/parse-betexplorer-html`
- `POST /api/v1/admin/sync-upcoming`

Start with `docs/BETEXPLORER_PRIMARY_V2_3.md`.
