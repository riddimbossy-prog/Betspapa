# BetsPapa PWA v1.10.3

## Install experience

The custom install card is displayed only when installation is available.

- Chromium browsers use `beforeinstallprompt`.
- iPhone and iPad display Add to Home Screen instructions.
- Installed/standalone mode hides all install controls.
- A dismissed card stays hidden for three days.

## Splash screen

BetsPapa now has three launch layers:

1. Android/browser generated splash using the manifest background and maskable icon.
2. iOS startup images for supported screen dimensions.
3. A short in-app branded launch screen shown only in standalone mode.

## Service worker

The service worker uses:

- network-first navigation
- stale-while-revalidate static assets
- a versioned application-shell cache
- a branded offline fallback
- automatic removal of old BetsPapa caches

Private `/admin/` requests are not cached.
