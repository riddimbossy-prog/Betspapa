# BetsPapa v1.10 — Engine Pages, Bankers and Diagnostics

## Dedicated engine pages

- `papas-pick.html`
- `aggressive.html`
- `safer.html`
- `venue-pattern.html`

Each page reads the same completed prediction rows but displays the selected
engine's own market, confidence, qualification status and explanation.

## Today's Bankers

`bankers.html` selects up to three strict picks per engine.

A banker must pass all of these checks:

- engine pick is Qualified
- minimum engine-specific confidence
- both teams were individually analysed
- at least six overall matches for each team
- at least three venue matches for each team
- no critical caution such as insufficient history, contradiction or small sample
- no repeated fixture inside the same engine slate

If no match passes, that engine publishes no banker.

## Results intelligence

`results-intelligence.html` grades all four engine outputs separately from the
stored final and half-time scores. It shows:

- wins, losses and voids
- win rate per engine
- recent selections and final scores
- market-family performance

## Prediction diagnostics

`diagnostics.html` is protected by `ADMIN_SYNC_SECRET`. It shows:

- fixtures imported
- current engine prediction rows
- pending and withheld fixtures
- team profile readiness
- thin teams
- market distribution
- API provider availability
- anti-zombie similarity warnings

The secret is stored only in `sessionStorage` for the current browser tab.

## Anti-zombie similarity detector

Before publication, PapaSense v1.10 compares the evidence fingerprint and all
four engine key/confidence patterns. When three or more fixtures share the same
combined signature, those rows are stored but withheld for review.

This is deliberately strict: a missing pick is safer than a cloned pick.
