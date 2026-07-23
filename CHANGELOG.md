## v1.18.3 — Papa-First Z Fold and Tablet Shell

# BetsPapa Changelog

## v1.18.2 — Fast Prepared-Board Delivery

- Public engine pages now read prepared snapshots only.
- Removed blocking `refresh=1` provider refresh from engine and Boss Pick page loads.
- Removed visitor-triggered prediction generation from the engine route.
- Added local prepared-board cache for instant repeat visits.
- Added Render-side stale-while-revalidate board snapshots.
- Consolidated fixture/prediction board loading to avoid duplicate fixture, team and league queries.
- Added `/api/admin/warm-board` and automatic warming after board preparation.
- Increased incomplete-board polling from eight seconds to sixty seconds.
- Kept engine version `papasense-v1.18.1-no-draw-guard` unchanged.
- No database migration required.

# Changelog

## v1.18.1 — Either Team to Win Misfire Guard

- Rebuilt the No Draw policy around clean decisive HT/FT routes.
- Raised the No Draw market threshold from 74% to 78%.
- Added a high-scoring diversion to GG or Over 1.5 when their own HT/FT gates pass.
- Added league Over 1.5 context as confirmation for O1.5.
- Prevented a high-scoring league label from triggering a goal market by itself.
- Prevented Venue Pattern from selecting a blocked No Draw market.
- Added detailed No Draw diagnostics and four regression tests.
- Engine version is `papasense-v1.18.1-no-draw-guard`.

## v1.18.0 — HT/FT-First Market Firing Engine

- Rebuilt the final selection architecture so HT/FT eligibility is the first hard gate for every market.
- Goal, venue, recent-form, clean-sheet and failed-to-score data now confirm an eligible HT/FT direction instead of creating a market by themselves.
- Removed market-family ranking bonuses; qualified markets are compared by threshold-relative strength, HT/FT gate strength and threshold margin.
- Fixed X/X being treated as positive Over 1.5 evidence.
- Added strict HT/FT firing maps for Double Chance, No Draw, DNB, result markets, GG, totals, team goals, clean sheets and half markets.
- Corrected Home/Away Win Either Half route sets.
- Corrected Draw in Either Half so only X/1, X/X and X/2 count as guaranteed drawn-half routes.
- Fixed the Team Over 0.5 odds override so it applies only when the actual selected price is below 1.20.
- Merged common-sense blockers before selecting the final primary market.
- Changed Safer and Aggressive from fixed first-option lists to strongest eligible-market comparison.
- Made Venue Pattern require real venue evidence.
- Added historical age decay and removed double application of the league baseline.
- Changed public wording from probability/confidence to Engine strength where appropriate.
- Added the HT/FT firing rule, trigger routes, confirmations and blockers to the explanation popup.
- Engine version is `papasense-v1.18.0-htft-first`; existing boards must regenerate.
- No Supabase migration is required.

## v1.17.5 — Country Flags Beside Leagues

- Added the correct country flag beside league names on Today, Papa’s Pick, Aggressive, Safer, Venue Pattern, Bankers, Boss Picks, Results and Live Fixtures.
- Added flags to league filter options and match explanation dialogs.
- Added football-specific handling for England, Scotland, Wales, Northern Ireland, Kosovo and international competitions.
- Added a complete ISO country-name and three-letter-code resolver with football aliases.
- No database migration is required; flags are derived from the existing league country value.
- PapaSense remains `papasense-v1.17.4-overhaul-all-engines`; predictions do not need regeneration.

## v1.17.4 — Full Overhaul Across All Four Engines

- Fixed Aggressive, Safer and Venue still using the older support-engine picks.
- All four engines now select from the audited full-market catalogue.
- Safer cannot choose blocked or sub-threshold Over 1.5 merely because it is a lower line.
- Goal explanations now cite goal evidence instead of treating the strongest exact HT/FT transition as proof.
- GG and Over 1.5 common-sense nominations must independently qualify in the overhaul.
- Repeated fallback picks no longer count as independent Consensus Banker votes.
- Added an optional Supabase cleanup script for ungraded old v1.17 predictions.
- Engine version bumped to `papasense-v1.17.4-overhaul-all-engines` so boards regenerate automatically.

## v1.17.3 — Day-Ahead Board Preparation

- Added a dedicated workflow that prepares tomorrow's board at 17:25 and 22:25 UTC.
- Imports tomorrow's fixtures, hydrates missing team histories, generates picks and verifies board coverage.
- Added `/api/board-preparation/status`.
- Match-day automation now maintains today's already-prepared board.
- Added a second evening pass for late fixture additions.
- Preserved PapaSense v1.17.1 Overhaul, Consensus Bankers, Boss Picks and live settlement.

## v1.17.2 — Zero Picks Automatic Preparation Fix

- Fixed Papa’s Pick and the other engine pages showing zero games after an engine-version upgrade.
- Engine pages now trigger current-version prediction generation automatically.
- Imported fixtures remain visible while current picks are processing.
- Added eight-second polling only while the preparation job is running.
- Added Waiting for history cards for teams still below the evidence minimum.
- Disabled public caching while picks remain incomplete.
- Bumped portal and PWA assets to v1.17.2.
- Kept the audited engine version `papasense-v1.17.1-overhaul` unchanged.

## v1.17.1 — Full-Market Engine Overhaul

- Replaced the Papa's Pick core with the audited full-market overhaul.
- Preserved Consensus Bankers, OMNI Boss Picks, PWA and live settlement.
- Kept the v1.17 anti-zombie evidence gate and later common-sense rules.
- Merged later blockers into duplicate overhaul markets.
- Added independent scoring for the complete goal, result, team and half-market catalogue.
- Engine version is now `papasense-v1.17.1-overhaul`.
- No database migration is required.

## v1.17.0 — Consensus Banker Page

- Added a real public `/bankers.html` page instead of redirecting to Boss Picks.
- Compares Papa’s Pick, Aggressive, Safer and Venue Pattern for every fixture.
- Publishes one strongest Banker when at least two qualified engines choose the exact same selection.
- Adds Unanimous 4/4, Prime Consensus 3/4 and Consensus 2/4 levels.
- Allows an exceptional single-engine pick only at 86%+ after every strict evidence gate passes.
- Requires six overall and three relevant venue matches for both teams.
- Withholds almost-even split decisions instead of forcing a selection.
- Normalizes equivalent team-goal market keys before measuring agreement.
- Adds engine-vote chips, banker score, filters, explanations and rejection summaries.
- Adds instant saved Banker display with quiet live refresh.
- Promotes Bankers into desktop, mobile and PWA navigation while preserving Boss Picks.
- Retains the legacy per-engine Banker API at `/api/bankers/by-engine`.
- Adds six consensus-specific tests; the complete suite now has 50 passing tests.
- No Supabase migration or new Render environment variable is required.

## v1.16.1 — Faster Picks and Results Repair

- Preserved the complete v1.16 branded PWA, walkthrough, live match and PapaSense v1.13 features.
- Displays the most recent saved dashboard immediately, then refreshes live data quietly in the background.
- Remembers the last working API endpoint and reduces frontend API timeouts from 35–45 seconds to 9 seconds.
- Stops public dashboard and Results requests from waiting for live-score refresh work.
- Adds short server-side stale-while-revalidate caches for dashboard and Results responses.
- Keeps saved picks and saved Results visible during temporary Render or network failures.
- Repairs Results queries by batching large Supabase ID lists instead of sending one oversized request.
- Includes historical published predictions across engine versions instead of filtering Results to only the newest engine version.
- Recognizes FT, AET, PEN, AWD and WO as completed statuses.
- Adds clear Results error and retry messaging instead of leaving the tab stuck on Loading.
- Bumps the API, manifest and service-worker build to v1.16.1.

## v1.16.0 — Branded PWA and First-User Walkthrough

- Added official BetsPapa standard and maskable PWA icons.
- Added a fresh Apple touch icon.
- Rebuilt portrait and landscape launch screens.
- Added a five-step first-user walkthrough.
- Added swipe, keyboard, focus-trap and reduced-motion support.
- Added responsive layouts for mobile and Samsung Z Fold 6.
- Added a replay button and `?tour=1` replay URL.
- Delayed the installation prompt until onboarding closes.
- Bumped the PWA cache and service version.

## v1.15.3 — Today Desktop Width Hotfix

- Fixed the left-aligned desktop canvas and large blank area on the right.
- Widened and centred the Today page.
- Reasserted the full-width fixture board after legacy CSS.
- Contained filter controls inside the fixture panel.
- Preserved mobile and Samsung Z Fold 6 layouts.
- Bumped the PWA cache and Today stylesheet filename.

## v1.15.1 — Live & Fixtures Responsive UI

- Added a dedicated `live-fixtures.html` match centre.
- Added separate Pending, Live, Settling, Settled and Delayed views.
- Added real-time score cards with Papa's published analysis.
- Added cached-board fallback when the live API is temporarily unavailable.
- Added automatic 60-second refresh while matches are live.
- Added a mobile filter sheet and narrow cover-screen layout.
- Added dedicated Samsung Z Fold 6 cover and unfolded breakpoints.
- Redesigned the homepage fixture preview as a full-width responsive grid.
- Updated every public navigation link and PWA shortcut to the live match centre.
- No prediction logic, settlement rules or database schema changed.

## v1.15.0 — Modern Unified UI

- Introduced one consistent navigation system.
- Added mobile bottom navigation and mobile filter bottom sheet.
- Reorganised the homepage around featured analysis, fixtures, status and results.
- Redesigned match, metric, Boss Pick and result cards.
- Improved accessibility, touch targets and responsive behavior.
- Preserved all prediction and settlement logic.

## v1.14.0 — Live Match States and Automatic Settlement

- Added Pending, Live, Settling and Settled labels to prediction cards.
- Added current scores for live and completed matches.
- Added automatic settlement for every active PapaSense v1.13 market.
- Added separate outcomes for Papa's Pick, Aggressive, Safer and Venue Pattern.
- Added dynamic Boss Pick settlement, including goal-event checks for lead-at-any-time markets.
- Added a two-minute backend live-refresh cooldown.
- Added 60-second browser refresh while a match is live.
- Added an hourly lightweight GitHub settlement workflow.
- Added `/api/matches/status` and protected `/api/admin/settle-date` endpoints.
- Extended finished-state support to FT, AET and PEN.
- Kept BetsPapa free and public.

## v1.13.0 — Papa Common-Sense Market Intelligence

- Added practical HT/FT translations.
- Added win either half, draw either half and half-goal markets.
- Added actual-odds Team O0.5 value upgrade.
- Added comeback and lead-surrender checks for straight wins.
- Added first-half lead-pressure logic.
- Preserved OMNI v2.5.2 Boss Picks.

## v1.12.2 — OMNI v2.5.2 Boss Picks

- Upgraded Boss Picks to uploaded audited OMNI v2.5.2.
- Evaluates 44 active markets.
- Only six audited core markets can become final selections.
- Removes full-match Over 0.5.
- Shows scores as rule points out of 100.
- Preserves unlimited qualifying Boss Picks.
- Keeps BetsPapa free and public.

## v1.12.1 — Unlimited Papa’s Boss Picks

- Removed the maximum-three Boss Pick cap.
- Every fixture passing all OMNI gates at 80 or higher is published.
- PRIME picks remain ranked above Qualified picks.
- Removed the Boss Picks `limit=3` API request and backend clamp.
- No account, subscription or database migration was added.

## v1.12.0 — Papa’s Boss Picks

- Replaced the public Bankers page with Papa’s Boss Picks.
- Integrated the uploaded OMNI HT/FT Gatekeeper Engine v2.0.
- Added a live `/api/boss-picks/today` endpoint.
- Evaluates 48 markets and publishes one final market per accepted fixture.
- Qualified threshold is 80; Prime threshold is 87.
- Limits the board to the strongest three fixtures and never forces a selection.
- Uses eight overall matches, six relevant venue matches and a 30-match league minimum.
- Added score breakdowns for HT/FT, components, streaks and context.
- Added rejection summaries explaining why other fixtures stayed off the board.
- Kept the site free and public with no account, login, subscription or watchlist system.
- Preserved the larger PWA install prompt, custom splash screen and mobile navigation.

## v1.10.3 — Bigger PWA Install and Custom Splash Screen

- Restored a real service worker instead of unregistering it on every visit.
- Added a large branded install card with a 78px app icon and 56px install button.
- Added a prominent Install BetsPapa App button to the homepage hero.
- Added iPhone and iPad Add to Home Screen instructions.
- Added custom portrait and landscape BetsPapa launch artwork.
- Added Apple startup images for common iPhone and iPad screen sizes.
- Added an installed-app launch screen with BetsPapa branding and animation.
- Added maskable Android icons with a safe crop zone.
- Added richer manifest screenshots, app shortcuts and install metadata.
- Added offline fallback handling.
- Added the PWA metadata and install experience across every public page.
- Prediction engine remains `papasense-v1.10.0`; no prediction regeneration is required.

## v1.10.2 — Match Card Contrast Fix

- Fixed invisible/black fixture text on the dark Bankers and engine pages.
- Explicitly reset button-based prediction cards to the BetsPapa light text color.
- Restored bright team names, selections, market labels and confidence figures.
- Added stronger keyboard focus styling for fixture cards.
- Added a fresh `portal.v112.css` asset so old cached CSS cannot keep the bug.
- Applied the correction to Papa's Pick, Aggressive, Safer, Venue Pattern, Bankers, Results and private Admin pages.
- Prediction engine remains `papasense-v1.10.0`; no prediction regeneration is needed.

## v1.10.1 — Readability, Private Admin URL and Universal Mobile Navigation

- Increased text sizes, line spacing and contrast across all engine, banker and results pages.
- Enlarged filters, status messages, metrics, fixture cards, explanations and tables.
- Reworded technical metrics in simpler English.
- Fixed the duplicate “Cautions” heading in prediction popups.
- Prevented engine-filter event listeners from multiplying after date refreshes.
- Improved dialog closing, body-scroll restoration and mobile header navigation.
- Removed Diagnostics from every public menu and homepage link.
- Removed inactive Login, Sign Up, Watchlist, Alerts and Settings controls.
- Created a separate private admin URL: `/admin/`.
- Added `noindex` and `robots.txt` exclusions for the admin area.
- Added a consistent fixed mobile navigation tab to every public mobile page.
- Rebuilt Privacy, Terms, Responsible Use and 404 pages with readable modern typography.
- Added public footers to the dedicated engine pages.
- Engine logic remains `papasense-v1.10.0`; this is a UI and navigation release.

## v1.10.0 — Engine Pages, Bankers and Prediction Diagnostics

- Added dedicated branded pages for Papa's Pick, Aggressive, Safer and Venue Pattern.
- Added strict Today's Bankers page with up to three picks per engine.
- Added banker eligibility checks for qualification, confidence, overall samples, venue samples and cautions.
- Added Results Intelligence with separate grading for all four engines.
- Added admin-only Prediction Diagnostics.
- Diagnostics reports imported fixtures, current predictions, pending rows, withheld rows, profile readiness, thin teams, market distribution and provider status.
- Added anti-zombie similarity detection before publication.
- Suspicious groups of three or more cloned evidence/engine signatures are withheld.
- Updated home navigation and added direct links to every engine page.
- Added responsive desktop, tablet, mobile and Z Fold layouts for all new pages.
- Added public API endpoints for engine pages, bankers and results intelligence.
- Added protected admin diagnostics endpoint.
- Added regression tests for banker selection and similarity detection.
- Engine version updated to `papasense-v1.10.0`.

## v1.9.2 — Simple English, Faster Pipeline and Broader Markets

- Replaced raw weighted numbers such as `1.9500000000000002 of 3.9000000000000004` with readable samples such as `about 2 of 4 home matches (50%)`.
- Added structured explanation cards for the strongest HT/FT pattern, home support, away opposite support, next pattern and final market decision.
- Rewrote market reasons in short, plain English.
- Added defensive number cleanup for older cached prediction rows.
- Added broad grouped filters for result, goal, team-goal, BTTS, first-half and exact HT/FT markets.
- Reduced frontend API failover time from 150 seconds to 35 seconds.
- Bulk-loaded profile coverage instead of querying Supabase once per team.
- Increased backend hydration concurrency from 2 to 4.
- Added four parallel GitHub hydration workers, configurable with `HYDRATION_WORKERS`.
- Engine version updated to `papasense-v1.9.2` so explanations regenerate cleanly.

## v1.9.1 — targetTeamIds Hydration Hotfix

- Fixed GitHub Actions failure: `targetTeamIds is not defined`.
- Moved `targetTeamIds` into the correct `hydrateProfilesForFixtures` options.
- Removed the unused option from `planHydrationForFixtures`.
- Fixed both `/api/admin/hydrate-team` and `/api/admin/generate-predictions`.
- Added a regression test that exercises targeted hydration.
- Automatic fixture and prediction workflow remains unchanged.

## v1.9.0 — Automatic Fixture and Prediction Pipeline

- Added a GitHub Actions scheduler that runs every four hours.
- Added an automatic run after successful GitHub Pages deployments.
- Added manual workflow dispatch with optional date, force-hydration and team-limit controls.
- Added `scripts/automatic-pipeline.mjs`.
- Automatically refreshes yesterday, today and tomorrow.
- Automatically grades previous results.
- Automatically imports today's and tomorrow's fixtures.
- Automatically hydrates thin-data team histories.
- Automatically generates all four engine picks.
- Rotates hydration order so permanently unavailable teams do not block later teams.
- Caps hydration work per run to protect API usage.
- The website no longer depends on a PowerShell window or visitor-triggered fetching.
- Preserved anti-zombie rules and the clean completed-picks-only catalogue.

## v1.8.3 — Clean Background Picks

- Removed repeated processing/history cards from the public catalogue.
- Only completed real predictions are displayed as match cards.
- Missing preparation runs in the Render background and the dashboard returns immediately.
- Added one compact ready/pending/withheld notice and automatic 15-second refresh.
- When no picks are ready, one clean preparation panel is shown instead of dozens of placeholders.
- Added `/api/processing/status`.
- Anti-zombie protections remain active.

## v1.8.2 — Papa's Pick, Full Explanation and Popup Close Fix

- Renamed **Papa Primary** to **Papa's Pick** everywhere.
- Papa's Pick remains the default engine.
- Fixed the reason-popup close button:
  - the application script now loads after the dialog exists
  - added delegated close handling
  - added backdrop click
  - added Escape/cancel handling
  - restored body scrolling after close
- Added a full match-specific explanation paragraph in the Real Potosí style.
- The explanation now states:
  - the selected pick
  - the leading home venue HT/FT pattern
  - the away team's opposite pattern
  - the strongest exact transition
  - the next compatible route
  - why the practical market captures those routes
  - why a broader Double Chance market was or was not needed
- Added the explanation to every engine output.
- Engine version updated to `papasense-v1.8.2`.

## v1.8.1 — Hydration Progress and No-Hang Runner

- Diagnosed the apparent PowerShell freeze: the old script made one long synchronous request and printed nothing until every team completed.
- Added a protected hydration-plan endpoint.
- Added a protected one-team hydration endpoint.
- Rebuilt the PowerShell runner to process one thin-data team at a time.
- Added visible team-by-team progress, counts, errors and a percentage progress bar.
- Added an API health/database check before hydration starts.
- Added a local transcript log: `hydration-YYYY-MM-DD.log`.
- Removed forced rehydration by default. Use `-Force` only when a complete refresh is intentional.
- Added configurable request timeout and optional `-SkipGenerate`.
- Preserved PapaSense v1.8 anti-zombie rules and engine logic.

## v1.8.0 — Individual History Hydration / Anti-Zombie Engine

- Diagnosed the repeated 57% 1X cards as prior-only predictions produced when team profiles were empty.
- PapaSense now fetches each thin-data team's recent completed fixtures from API-Football.
- Imported history is persisted to Supabase and the affected league/season profiles are rebuilt.
- Predictions require real HT/FT evidence from both teams.
- Prior-only league-default predictions are blocked.
- Added profile audits with Overall, Venue and Recent sample counts.
- Added an analysis fingerprint so each fixture's actual input set can be verified.
- Added honest `History unavailable` states instead of copied predictions.
- Safer engine now places Double Chance last and only allows it with:
  - sufficient data quality
  - a real side edge
  - a qualified protection score
- Added `/api/admin/hydrate-date`.
- Added `scripts/hydrate-and-generate.ps1`.
- Engine version updated to `papasense-v1.8`, causing clean regeneration.

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
