# Changelog

## v1.7.0 — Four Engine Picks and Desktop Layout Repair

- Every fixture now has four named engine outputs:
  - Papa Primary
  - Aggressive
  - Safer
  - Venue Pattern
- Papa Primary is the default everywhere.
- Added an engine switcher and engine filter.
- Date, league, market and strength filters now use the active engine pick.
- Clicking a fixture explains the currently selected engine.
- Venue Pattern reads the home venue HT/FT profile against the away venue's opposite transitions, Potosi-style.
- Papa Primary receives a venue-alignment adjustment when the venue pattern supports the same route.
- Aggressive removes broad protection markets and prefers sharper outcomes.
- Safer converts the primary story into DNB, Double Chance, O1.5, U3.5 or team O0.5 where appropriate.
- Fixed desktop header, hero, metric and dashboard grid alignment.
- Removed the mobile-style layout from normal desktop widths.
- Engine version updated to `papasense-v1.7`, causing automatic regeneration.

## v1.6.0 — Balanced Markets and Reasons Popup

- Fixed Double Chance dominating because its raw two-outcome probability is naturally larger.
- Markets are now ranked by support relative to each market's own threshold.
- Double Chance and Half-Time Double Chance receive a protection-market penalty.
- A protection market must also show a genuine side edge before it can qualify.
- A more informative goal, team-goal, DNB or result market wins when its calibrated evidence is close or stronger.
- Added cross-competition team profile fallback for friendlies and data-light leagues.
- Clicking a fixture now opens a responsive reasons popup.
- The popup shows:
  - selected pick and confidence
  - full reasons and cautions
  - calibrated comparison against other markets
  - all nine HT/FT indicators
- Engine version updated to `papasense-v1.6`, causing automatic regeneration.
- Preserved filters, automatic predictions, modern fonts, Papa branding, Render and Supabase.

## v1.5.1 — Automatic Predictions and Readable Mobile UI

- The public dashboard now automatically generates missing PapaSense v1.5 predictions.
- No admin secret or PowerShell command is required just to populate the public page.
- Added a generation lock and cooldown to prevent duplicate server work.
- Increased the API timeout for the first automatic generation pass.
- Fixed unprocessed fixtures being incorrectly labelled Directional.
- Added a clear Processing state until a real market is saved.
- Increased fixture, filter, explanation, navigation and mobile-tab text sizes.
- Uses one fixture column on narrow phones and Z Fold portrait layouts.
- Preserved all filters, explanations, Papa branding, Render and Supabase.

## v1.5.0 — Every Match Gets a Pick + Full Explanation

- Every imported fixture now receives one selected market direction.
- Strong selections remain **Qualified**; weaker selections are clearly labelled **Directional**.
- The fallback logic avoids forcing weak exact HT/FT and half-time-result calls.
- The engine reviews all nine HT/FT transition indicators before ranking markets.
- Added date, league, market, strength and team/competition filters.
- Added pagination so every fixture remains accessible without an excessively long page.
- Clicking any fixture now opens a full explanation:
  - why the market was chosen
  - cautions and sample-quality warnings
  - next-best alternatives
  - all nine HT/FT profile/opposite/combined readings
- Added PapaSense engine version `papasense-v1.5`.
- Preserved live Render, Supabase, modern fonts, Papa branding and result grading.

## v1.4.1 — Compact Fixtures and Layout Repair

- Limited the homepage to six upcoming fixtures.
- Qualified predictions are shown before fixtures with no published pick.
- Added a live summary showing qualified, displayed and imported fixture counts.
- Moved upcoming fixtures out of the tall right sidebar and into a compact responsive grid.
- Removed the large blank vertical space beneath the main prediction area.
- Preserved modern fonts, Papa branding, live data, Render, Supabase and the HT/FT engine.

## v1.4.0 — Modern Fonts and Complete Live Data

- Added modern **Manrope** body typography and **Space Grotesk** display typography.
- Removed hard-coded demonstration fixtures, metric totals and recent results from the public site.
- Added one live dashboard endpoint: `/api/dashboard/today`.
- Added live upcoming fixtures with team and league names, logos, status and kickoff.
- Added live qualified predictions and HT/FT matrices.
- Added live recent graded results from `prediction_results`.
- Added live win rate, qualified-pick count, GG count and Under 3.5 count.
- Added automatic fallback from `api.betspapa.com` to the Render service URL.
- Added live connection state, last-updated time, refresh control and empty/error states.
- Added no-cache API response headers.
- Preserved the Papa branding, responsive UI, Supabase integration and Render engine.

## v1.3.1 — Search Overlay and Legacy Cache Hard Fix

- Search is now controlled by an explicit `.is-open` state and cannot display on page load.
- Added an inline critical search guard before the main stylesheet.
- Added unique v1.3.1 CSS and JavaScript filenames to bypass old service-worker caches.
- Removed active frontend service-worker registration during development.
- Added automatic cleanup of legacy service-worker registrations and caches.
- Added `reset.html` as a one-click emergency cache reset page.
- Preserved the official Papa branding, live API, Render backend, Supabase integration and prediction engine.

## v1.3.0 — Official Papa Branding

- Added the approved BetsPapa wise-Papa mascot logo.
- Added the official tagline: **Papa Knows the Game**.
- Rebranded the header, hero, sidebar and footer.
- Added favicon, Apple touch icon and PWA app icons based on the Papa mascot.
- Added social-sharing artwork and Open Graph metadata.
- Preserved the live API, Supabase, Render, prediction engine and search-overlay fixes.
- Updated the service worker cache to force the new branding onto mobile devices and PWAs.

## v1.2.2 — Search launch fix
- Search overlay is now guaranteed hidden on every initial page load.
- Search opens only after the user presses the search button.
- Backdrop tap, Escape key, result selection, and close button all dismiss it.
- Empty queries no longer display every fixture automatically.
- Service-worker cache version bumped and navigation made network-first so the fix reaches installed/PWA users.

## v1.2.0

- Added API-Football fixture importer with key aliases and retry handling.
- Added protected admin routes using `ADMIN_SYNC_SECRET`.
- Added league/date synchronization and one-click league bootstrap.
- Added Overall, Home, Away, and Recent-6 HT/FT profile generation.
- Added GG, Over 1.5, Over 2.5, Under 3.5, scoring, conceding, clean-sheet, and failed-to-score profiles.
- Added real prediction generation and Supabase storage.
- Added automatic result grading.
- Added public live fixtures and predictions endpoints.
- Connected the royal-purple frontend to `api.betspapa.com` with demo fallback.
- Expanded automated tests from five to seven.
