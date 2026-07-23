# BetsPapa v1.18.3 — Papa-First Fold and Tablet Shell

## Purpose
The former marketing/home dashboard has been retired. `/` and `index.html` now render Papa's Pick directly.

## Navigation
- Papa's Pick is the first and active destination.
- The Today/Home tab was removed from desktop, tablet, Fold and mobile navigation.
- `/papas-pick.html` remains as a compatibility redirect to `/`.
- The PWA and Papa shortcut launch at `/`.

## Samsung Z Fold and tablet work
- Full navigation becomes a compact menu at 1080px and below.
- The bottom app rail remains available through 1100px.
- The Fold inner screen uses two prediction columns where space permits.
- Tablet landscape can display three prediction cards and a four-column filter bar.
- The Fold cover screen stays single-column with larger touch targets.
- Landscape and low-height postures use a compact header and hero.
- Dialogs, filters, status strips and metric cards use the available width rather than desktop leftovers.

## Performance
The prepared-board cache namespace remains v1.18.2 because the engine and board payload did not change. Existing cached picks can therefore display immediately after the UI update.

## Versions
- Service: 1.18.3
- Prediction engine: papasense-v1.18.1-no-draw-guard
- PWA cache: betspapa-pwa-v1183
