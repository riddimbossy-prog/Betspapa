-- BetsPapa v1.11 accounts, watchlist, notifications and pipeline state
-- Run this once in Supabase SQL Editor before enabling the v1.11 account pages.

create extension if not exists pgcrypto;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text not null default 'BetsPapa User',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null check (item_type in ('team','league','fixture','prediction','engine')),
  item_key text not null,
  label text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, item_type, item_key)
);

create index if not exists user_watchlist_user_created_idx
  on public.user_watchlist(user_id, created_at desc);

create table if not exists public.user_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  papa_pick_alerts boolean not null default true,
  banker_alerts boolean not null default true,
  result_alerts boolean not null default true,
  favorite_team_alerts boolean not null default true,
  kickoff_minutes integer not null default 30 check (kickoff_minutes between 5 and 180),
  quiet_start time not null default '23:00',
  quiet_end time not null default '07:00',
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions(user_id);

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  target_date date not null,
  mode text not null default 'today',
  stage text not null default 'starting',
  status text not null default 'running',
  completed_stages jsonb not null default '[]'::jsonb,
  progress jsonb not null default '{}'::jsonb,
  last_error text,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists pipeline_runs_updated_idx
  on public.pipeline_runs(updated_at desc);

alter table public.user_profiles enable row level security;
alter table public.user_watchlist enable row level security;
alter table public.user_notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_events enable row level security;
alter table public.pipeline_runs enable row level security;

drop policy if exists "Users read own profile" on public.user_profiles;
create policy "Users read own profile"
  on public.user_profiles for select
  using (auth.uid() = id);

drop policy if exists "Users update own profile" on public.user_profiles;
create policy "Users update own profile"
  on public.user_profiles for update
  using (auth.uid() = id);

drop policy if exists "Users read own watchlist" on public.user_watchlist;
create policy "Users read own watchlist"
  on public.user_watchlist for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own watchlist" on public.user_watchlist;
create policy "Users insert own watchlist"
  on public.user_watchlist for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own watchlist" on public.user_watchlist;
create policy "Users update own watchlist"
  on public.user_watchlist for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own watchlist" on public.user_watchlist;
create policy "Users delete own watchlist"
  on public.user_watchlist for delete
  using (auth.uid() = user_id);

drop policy if exists "Users read own preferences" on public.user_notification_preferences;
create policy "Users read own preferences"
  on public.user_notification_preferences for select
  using (auth.uid() = user_id);

drop policy if exists "Users update own preferences" on public.user_notification_preferences;
create policy "Users update own preferences"
  on public.user_notification_preferences for update
  using (auth.uid() = user_id);

drop policy if exists "Users read own subscriptions" on public.push_subscriptions;
create policy "Users read own subscriptions"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

-- notification_events and pipeline_runs intentionally have no public RLS policies.
-- They are available only through the Render service-role backend.

create or replace function public.handle_new_betspapa_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.user_profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(coalesce(new.email, 'BetsPapa User'), '@', 1)
    ),
    coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture'
    )
  )
  on conflict (id) do nothing;

  insert into public.user_notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_betspapa on auth.users;
create trigger on_auth_user_created_betspapa
  after insert on auth.users
  for each row execute procedure public.handle_new_betspapa_user();
