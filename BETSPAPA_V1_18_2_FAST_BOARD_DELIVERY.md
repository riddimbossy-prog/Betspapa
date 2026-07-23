# BetsPapa v1.18.2 — Fast Prepared-Board Delivery

This release separates public board reading from provider refresh, history hydration, profile rebuilding, prediction generation and settlement.

## Public board request

`GET /api/boards/:engineKey?date=YYYY-MM-DD`

The request only reads the already-prepared board. It does not call API-Football, hydrate history, rebuild profiles, grade matches or generate picks.

The previous `/api/engines/:engineKey` route remains as a backward-compatible alias and uses the same read-only handler.

## Two-layer cache

1. Render keeps a prepared snapshot for all four engines in memory.
2. The browser stores the last prepared board for each date and engine in local storage.

When a visitor returns, the browser paints the saved board immediately and checks quietly for a newer snapshot.

## Board warming

Prediction generation now invalidates and warms all four prepared snapshots. The day-ahead workflow also calls `/api/admin/warm-board` before completion, including when the board was already fully prepared.

## Live data

Public pick pages no longer block on score refresh. Live scores and settlement remain separate background responsibilities.

## Engine logic

The prediction engine is unchanged:

`papasense-v1.18.1-no-draw-guard`

This performance release does not invalidate or regenerate correct v1.18.1 predictions solely because of a service-version change.
