# BetsPapa v1.22.0 — Papa’s Pick All-Engine Board

## Main change

The site root is now one fixture-centred board containing all five engines:

1. Papa’s Pick
2. Safer
3. Aggressive
4. Venue Pattern
5. Athena

Each match appears once. Every engine has its own row, selection, strength, settlement state and plain-English explanation.

## Filters

The main board supports date, engine, league, market, strength, match-state and text search filters. Engine tabs provide fast switching between the complete board and one-engine views.

## Performance

The browser makes one request to `/api/main-board/today`. The backend loads the primary prepared snapshot first, which warms the other PapaSense boards, then merges Safer, Aggressive, Venue Pattern and Athena without visitor-triggered prediction generation.

## Compatibility

The separate Aggressive, Safer, Venue Pattern and Athena pages remain available. No Supabase migration is required for v1.22.0.
