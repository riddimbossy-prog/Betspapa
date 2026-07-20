# BetsPapa v1.14 — Live, Pending and Automatic Settlement

## Match states

Every prediction card can now display:

- **Pending** — the match has not started.
- **Live** — the provider reports first half, half time, second half, extra time or penalties in progress.
- **Settling** — the match is finished but its result row is still being saved or a specialist event-order check is pending.
- **WIN / LOSS / VOID** — the selection has been settled.
- **Postponed / Suspended / Cancelled** — the provider returned a non-playing state.

Live cards show the current score available from API-Football.

## Automatic settlement

PapaSense settlement now covers:

- Double Chance
- Draw No Bet
- Full-Time Result
- Half-Time Result and Half-Time Double Chance
- Exact HT/FT
- GG / No GG
- Over 1.5, Over 2.5 and Under 3.5
- Home/Away Team Over 0.5
- Home/Away Team Over 1.5
- Home/Away Team to Win Either Half
- Draw in Either Half
- First Half Over 0.5
- First Half Over 1.5
- Second Half Over 0.5

The result is written to the existing `prediction_results` table. No Supabase migration is required.

## Boss Pick settlement

OMNI Boss Picks settle from confirmed half-time and full-time scores where possible.

The two **Lead at Any Time** markets use API-Football's chronological goal events. When event order cannot be confirmed, the card shows **REVIEW/SETTLING** instead of inventing an outcome.

## Refresh system

Three layers keep the board current:

1. Public pages request a live refresh for today's date.
2. The backend allows only one provider refresh every two minutes, even when several users are browsing.
3. GitHub Actions runs **BetsPapa Live Scores and Settlement** every hour for yesterday and today.

While a page contains a live match, the browser reloads its board every 60 seconds. The backend cooldown protects API quota.

## Manual settlement endpoint

Protected admin endpoint:

`POST /api/admin/settle-date`

Body:

```json
{ "date": "2026-07-20" }
```

It synchronizes current scores and statuses, then grades all finished PapaSense predictions for that date.

## Public status endpoint

`GET /api/matches/status?date=YYYY-MM-DD`

It returns all fixtures with status categories and current scores.
