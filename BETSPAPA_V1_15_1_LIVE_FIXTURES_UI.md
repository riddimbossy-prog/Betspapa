# BetsPapa v1.15.1 — Live & Fixtures UI Guide

## Public page

`https://betspapa.com/live-fixtures.html`

## What changed

The live board is now a dedicated page instead of a cramped homepage anchor.

It shows:

- All fixtures
- Live matches
- Pending matches
- Matches awaiting settlement
- Settled matches
- Delayed, postponed or cancelled matches

Every card displays the league, current state, kickoff or live status, teams, score, half-time score when available, Papa's Pick, rule score and verified outcome.

## Responsive behaviour

### Standard phones

- One-column match board
- Horizontally scrollable status tabs
- Filters open in a bottom sheet
- Safe-area padding for gesture navigation
- No horizontal page overflow

### Samsung Z Fold 6 cover screen

The `max-width: 380px` layout uses:

- Compact 2-column status summary
- Single-column match cards
- Smaller team crests and score area
- Shorter navigation labels
- Full-width date and filter controls

### Samsung Z Fold 6 unfolded

The `600px–900px` layout uses:

- Two-column match cards
- Three-column status summary
- Compact scoreboards
- Wider explanation space without oversized desktop gaps

### Desktop

- Three-column fixture grid
- Inline league, search and sort controls
- Full-width homepage fixture preview

## Live-data behaviour

- Refreshes every 60 seconds while at least one match is live.
- Refreshes every three minutes on today's board when no match is live.
- Historical dates do not auto-refresh.
- Saves the most recent successful board locally.
- When the API is temporarily unavailable, the cached board is clearly labelled instead of showing invented data.

## Deployment

No new environment variable or database migration is required.
