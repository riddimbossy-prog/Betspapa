-- BetsPapa v1.23.0
-- League-only prediction policy plus Athena/PapaSense specialist half-market guard metadata.

alter table public.leagues
  add column if not exists competition_type text not null default 'UNKNOWN',
  add column if not exists prediction_enabled boolean not null default false,
  add column if not exists prediction_exclusion_reason text,
  add column if not exists competition_type_verified_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'leagues_competition_type_check'
  ) then
    alter table public.leagues
      add constraint leagues_competition_type_check
      check (competition_type in ('LEAGUE', 'CUP', 'FRIENDLY', 'UNKNOWN'));
  end if;
end $$;

-- Obvious friendlies and cups are blocked immediately. Everything else remains
-- UNKNOWN until the API-Football /leagues metadata refresh confirms its type.
update public.leagues
set
  competition_type = 'FRIENDLY',
  prediction_enabled = false,
  prediction_exclusion_reason = 'Friendly competition',
  competition_type_verified_at = now()
where name ~* '(friendly|friendlies|pre[- ]?season|training match|testimonial)';

update public.leagues
set
  competition_type = 'CUP',
  prediction_enabled = false,
  prediction_exclusion_reason = 'Cup or knockout competition',
  competition_type_verified_at = now()
where competition_type <> 'FRIENDLY'
  and name ~* '(\mcup\M|copa|coupe|coppa|pokal|trophy|shield|taça|taca|kupa|kubok|beker|supercopa|super cup|champions league|europa league|conference league|libertadores|sudamericana|club world cup|world cup|nations cup|gold cup|asian cup|africa cup|afcon|knockout)';

update public.leagues
set
  prediction_enabled = false,
  prediction_exclusion_reason = coalesce(prediction_exclusion_reason, 'Competition type awaiting API verification')
where competition_type = 'UNKNOWN';

create index if not exists leagues_prediction_policy_idx
  on public.leagues (competition_type, prediction_enabled);

comment on column public.leagues.competition_type is
  'Verified API-Football competition type. Only LEAGUE is eligible for prediction engines.';
comment on column public.leagues.prediction_enabled is
  'Hard master switch used by Papa, Safer, Aggressive, Venue Pattern and Athena.';

comment on column public.leagues.competition_type_verified_at is
  'Timestamp of the last provider or explicit-name competition-type verification.';
