# BetsPapa v1.11 Setup Guide

## 1. Run the SQL migration

Run:

`server/supabase/migrations/20260717_v111_accounts_watchlist_push.sql`

This creates:

- user_profiles
- user_watchlist
- user_notification_preferences
- push_subscriptions
- notification_events
- pipeline_runs

## 2. Configure authentication

Render:

- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY

Supabase Authentication:

- Set Site URL to `https://betspapa.com`
- Add `https://betspapa.com/account.html` as a redirect URL
- Enable Google provider for Google sign-in

## 3. Configure Web Push

Install server dependencies, then run:

```bash
cd server
npm install
npm run vapid
```

Copy the three VAPID values into Render.

## 4. Test

1. Open `/account.html`
2. Create an email account
3. Save a prediction from a dedicated engine-page popup
4. Open `/watchlist.html`
5. Open `/settings.html`
6. Enable notifications
7. Send a test alert
8. Run GitHub Actions → BetsPapa Automatic Picks

## Security

- The anon key is public and is protected by Supabase RLS.
- The service-role key remains only in Render.
- VAPID private key remains only in Render.
- Push subscriptions and watchlists are scoped to the authenticated user.
