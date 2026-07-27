# BetsPapa v1.24.0 — Picks-Only Boards and Direct Mobile Engine Navigation

## Release purpose

This release makes the public experience match the engine safety policy:

- A fixture is shown only when at least one engine has a real selection.
- NO PICK and unprepared fixtures remain available to diagnostics and preparation counts but stay off public pick boards.
- Phones, tablets and Samsung Z Fold screens use one direct five-tab rail: Papa’s Pick, Safer, Aggressive, Athena and More.

## Public board behaviour

### Main Papa’s Pick board

A fixture is included only when one or more of these engines has an available selection:

- Papa’s Pick
- Safer
- Aggressive
- Venue Pattern
- Athena

Within each visible fixture card, only engine rows containing real picks are displayed. Withheld and preparing rows are not shown.

Choosing an individual engine filter also hides fixtures where that specific engine has no pick.

### Separate engine boards

Papa’s Pick, Safer, Aggressive and Venue Pattern boards now return only available picks. Fixtures that are:

- awaiting preparation
- marked NO PICK
- unavailable after safety gates

are counted internally but are not rendered publicly.

Athena already returns published picks only and keeps rejected fixtures in its rejection audit.

## Mobile, tablet and Z Fold navigation

The visible bottom rail is:

1. Papa’s Pick
2. Safer
3. Aggressive
4. Athena
5. More

The More sheet contains:

- Bankers
- Results
- Live & Fixtures
- Venue Pattern
- Responsible Use
- Privacy
- Terms

At widths up to 1100px, the duplicate header navigation is hidden. This gives phones, tablets and unfolded Z Fold screens one consistent navigation system.

## Caching and deployment

- New frontend assets use `portal.v1240.js`, `mobile-nav.v1240.js` and `mobile-nav.v1240.css`.
- The PWA cache is `betspapa-pwa-v1240`.
- The manifest launch version is `v=1240`.
- No new Supabase migration is required.
- Existing v1.20, v1.21 and v1.23 migrations remain required for a fresh installation.

## Verification

- 126 automated tests pass.
- Backend and frontend JavaScript syntax checks pass.
- Public board filtering is enforced in both the API and frontend cache layer.
- Z Fold navigation labels and More-sheet destinations are covered by regression tests.
