-- BetsPapa v1.25.1
-- PapaLock uniqueness is per fixture, engine version and prediction date.
-- Run after BETSPAPA_V1_25_0_PAPALOCK_BANKER_ENGINE.sql if that migration
-- was already applied with the old (fixture_id, engine_version) unique key.

begin;

alter table public.papalock_predictions
  drop constraint if exists papalock_predictions_fixture_id_engine_version_key;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.papalock_predictions'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%fixture_id%'
      and pg_get_constraintdef(oid) ilike '%engine_version%'
      and pg_get_constraintdef(oid) ilike '%prediction_date%'
  ) then
    alter table public.papalock_predictions
      add constraint papalock_predictions_fixture_engine_date_key
      unique (fixture_id, engine_version, prediction_date);
  end if;
end $$;

commit;
