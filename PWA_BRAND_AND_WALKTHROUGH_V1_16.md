# BetsPapa v1.16 — Branded PWA and First-User Walkthrough

## Branded PWA assets

The installed application now uses the official BetsPapa artwork rather than a generic Papa-only icon.

Included assets:

- 192px and 512px standard app icons
- 192px and 512px maskable icons
- 180px Apple touch icon
- New portrait and landscape branded launch screens
- Updated install prompt using the official branded icon

Fresh asset filenames are used so Android, Chrome, Samsung Internet and iOS do not continue showing an older cached icon.

## First-user walkthrough

The walkthrough appears automatically once on the Today page.

It contains five steps:

1. BetsPapa introduction
2. Today’s match board
3. Papa’s Pick and Boss Pick levels
4. Pending, Live, Settling and Settled states
5. Results transparency

The completion state is stored locally under:

`betspapa-walkthrough-v1-complete`

No account or database is needed.

## Replay

Users can replay the walkthrough from the **Take app tour** button in the Today page footer.

It can also be opened directly with:

`https://betspapa.com/?tour=1`

## Responsive support

The walkthrough has dedicated rules for:

- desktop
- tablets
- Samsung Z Fold 6 unfolded display
- normal phones
- Samsung Z Fold 6 cover display
- short landscape displays

It supports swipe navigation, keyboard arrows, focus trapping and reduced-motion preferences.

## Install sequencing

The PWA install card waits until the first-user walkthrough closes. This prevents two overlays from competing for attention.
