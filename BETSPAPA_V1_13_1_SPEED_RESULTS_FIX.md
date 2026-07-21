# BetsPapa v1.13.1

This release preserves PapaSense v1.13.0 and all Papa's Pick amendments.

## Speed changes
- Cached picks render immediately on repeat visits.
- Live data refreshes in the background.
- API failover no longer waits 35–45 seconds on each unavailable host.
- API responses use short public cache windows with stale-while-revalidate.

## Results repair
- Finished fixtures include FT, AET, PEN, AWD and WO.
- Prediction lookups are batched to avoid oversized Supabase requests.
- Historical predictions are included instead of filtering only the newest engine version.
- Saved results remain visible during a Render cold start or brief outage.
