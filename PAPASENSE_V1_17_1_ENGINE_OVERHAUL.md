# PapaSense v1.17.1 — Full-Market Engine Overhaul

## Purpose

This is an engine-only correction to BetsPapa v1.17.0. The Consensus Banker page,
OMNI Boss Picks, PWA, frontend pages, live settlement and Supabase schema are
preserved.

The authoritative Papa's Pick core is now the audited full-market overhaul.
The later v1.17 common-sense, venue and consensus engines remain as supporting
layers.

## Architecture

1. The v1.17 anti-zombie gate first confirms that both teams have real HT/FT history.
2. The full-market overhaul builds the nine compatible HT/FT transitions.
3. Every market is scored independently against its own threshold and blockers.
4. Duplicate markets inherit later v1.17 blockers and common-sense cautions.
5. Explicit later rules remain active:
   - low-priced team Over 0.5 odds may upgrade to team Over 1.5;
   - 1/1 or 2/2 control stories may become Win Either Half;
   - draw transition families may become Draw in Either Half;
   - reversal stories may become GG or Over 1.5;
   - weak straight wins remain blocked without resilience evidence.
6. The winning Papa's Pick enters the four-engine Consensus Banker layer.

## Independently scored market families

- Double Chance: 1X, X2 and Either Team to Win (12)
- Draw No Bet
- Full-Time Result and Draw
- Half-Time Result and Half-Time Double Chance
- Exact HT/FT
- Win Either Half
- GG Yes and GG No
- Over/Under 1.5
- Over/Under 2.5
- Over/Under 3.5
- Two to Three Total Goals
- Team Over 0.5
- Team Over/Under 1.5
- Clean Sheet
- First Half Over 0.5
- Second Half Over 0.5
- Later v1.17 practical markets such as Draw Either Half and First Half Over 1.5

## Important separations

- No Draw requires controlled draw routes and several decisive routes.
- GG requires independent scoring support from both teams.
- Over 1.5 can qualify through one dominant team and does not imply GG.
- Under markets require venue, recent and transition-ceiling agreement.
- Exact HT/FT and Over 3.5 are not weak fallback markets.

## Versions

- API service: `1.17.1`
- PapaSense engine: `papasense-v1.17.1-overhaul`
- Consensus Banker: preserved
- Boss Picks: OMNI HT/FT v2.5.2 preserved

No database migration is required.
