# Input Schema — OMNI HT/FT Gatekeeper v2.5.2

The engine receives one JSON object.

## Required top-level fields

```json
{
  "match": { "homeTeam": "Home", "awayTeam": "Away", "date": "2026-07-20" },
  "strict": true,
  "homeMatches": [],
  "awayMatches": [],
  "leagueMatches": [],
  "context": {},
  "metadata": {}
}
```

## Team-history row

```json
{
  "date": "2026-07-10",
  "venue": "home",
  "goalsFor": 2,
  "goalsAgainst": 1,
  "halfTimeGoalsFor": 1,
  "halfTimeGoalsAgainst": 0,
  "xgFor": 1.72,
  "xgAgainst": 0.84,
  "scoredFirst": true,
  "ledAnyTime": true,
  "trailedAnyTime": false
}
```

`venue` must describe that team in the historical fixture, not the upcoming fixture.

## League-history row

```json
{
  "date": "2026-07-10",
  "homeGoals": 2,
  "awayGoals": 1,
  "halfTimeHomeGoals": 1,
  "halfTimeAwayGoals": 0
}
```

## Minimum data gates

- At least 8 overall matches for each team.
- At least 6 relevant home matches for the upcoming home team.
- At least 6 relevant away matches for the upcoming away team.
- At least 30 league matches.

Strict mode additionally requires complete xG/xGA, scored-first and explicit led/trailed-at-any-time data for both team histories.

## Context risks

Each context risk is a decimal from 0 to 1:

```json
{
  "weatherRisk": 0.1,
  "lineupRisk": 0.2,
  "motivationRisk": 0.1,
  "pitchRisk": 0.0,
  "rotationRisk": 0.1
}
```

Any individual risk at 0.80 or higher forces `NO_BET`.

## Dates

Supported formats include:

- `YYYY-MM-DD`
- full ISO timestamps
- `DD/MM/YYYY`
- `DD-MM-YYYY`
