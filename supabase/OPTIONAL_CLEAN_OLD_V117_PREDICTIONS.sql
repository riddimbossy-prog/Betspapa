-- BetsPapa v1.17.4 OPTIONAL cleanup
-- Run only after the v1.17.4 backend is deployed.
-- The new engine version normally makes this unnecessary because current API
-- queries request papasense-v1.17.4-overhaul-all-engines only.

begin;

-- Preserve graded history. Remove only ungraded predictions created by older
-- v1.17 engines for fixtures from yesterday onward, so the board can rebuild
-- them under v1.17.4.
delete from public.predictions as p
where p.engine_version in (
  'papasense-v1.17.1-overhaul',
  'papasense-v1.17.0',
  'papasense-v1.17'
)
and exists (
  select 1
  from public.fixtures as f
  where f.id = p.fixture_id
    and f.fixture_date >= now() - interval '1 day'
)
and not exists (
  select 1
  from public.prediction_results as r
  where r.prediction_id = p.id
);

commit;
