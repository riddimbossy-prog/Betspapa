# Hydration Progress Runner

The public website cannot stream progress from one long HTTP request. The
v1.8.1 script therefore uses three steps:

1. `GET /api/admin/hydration-plan`
2. `POST /api/admin/hydrate-team` once per thin-data team
3. `POST /api/admin/generate-predictions`

This makes progress visible and isolates failures to a specific team.

Normal runs skip teams that already meet the sample thresholds. `-Force`
should be reserved for deliberate full refreshes.
