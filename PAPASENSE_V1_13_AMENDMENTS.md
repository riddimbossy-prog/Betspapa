# PapaSense v1.13.0 — Papa's Pick Amendments

This version preserves the v1.11 account, watchlist, alert and pipeline work while replacing the old Papa's Pick logic with the amended PapaSense v1.13.0 policy.

## 1. Team Over 0.5 value protection

- A selected Home or Away Team Over 0.5 with decimal odds below **1.20** is rejected as low value.
- The engine then checks **that same team's Over 1.5**.
- The Over 1.5 replacement is allowed only when every gate passes:
  - team 2+ scoring rate at least **42%**
  - opponent 2+ conceding rate at least **42%**
  - team goal-support score at least **68%**
  - HT/FT control route at least **38%**
  - Team Over 1.5 model score at least **62%**
  - available Over 1.5 odds at least **1.20**
- When any Over 1.5 gate fails, the low-odds Over 0.5 is removed and the engine chooses another eligible market. It never forces the upgrade.
- When bookmaker odds are unavailable, the statistical engine still runs, but the low-odds rejection cannot be applied until prices are available.

## 2. HT/FT route conversions

- **1/1** → Home Team to Win Either Half
- **2/2** → Away Team to Win Either Half
- **1/2 or 2/1** → GG when both independent scoring routes pass; otherwise Match Over 1.5 when its gate passes
- **X/X, X/1, X/2, 1/X or 2/X** → Draw in Either Half

A route conversion requires a meaningful top-route probability and a usable target-market score. Exact HT/FT is not forced.

## 3. Straight-win safeguards

A Home or Away Win requires:

- at least **6 full-time wins overall**
- at least **6 full-time wins in the relevant home/away split**
- enough result separation
- at least one behavioural confirmation:
  - lead-hold evidence
  - comeback-to-win evidence
  - opponent lead-surrender evidence

Downgrade policy:

- exactly one six-win gate passes → Draw No Bet
- both six-win gates fail → remove result markets
- both pass but behavioural confirmation fails → Win Either Half, or Draw No Bet when the either-half route is not usable

## 4. Added Papa's Pick markets

- First Half Over 0.5
- First Half Over 1.5
- Second Half Over 0.5
- Home Team Over 1.5
- Away Team Over 1.5
- Home Team to Win Either Half
- Away Team to Win Either Half
- Draw in Either Half

## 5. Odds source and audit trail

The backend requests fixture odds from API-Football, extracts median Team Over 0.5 and Team Over 1.5 prices across available bookmakers, and stores:

- the parsed odds
- the selected market's policy metadata
- all rejected low-value lines
- every Papa's Pick policy action

The prediction remains explainable through `market_scores.papaPolicy` and `market_scores.odds` in Supabase.

## 6. Verification

The v1.13.0 test suite covers:

- 1/1 and 2/2 route conversions
- X-route conversion to Draw in Either Half
- successful same-team Over 0.5 → Over 1.5 upgrade
- rejection without forced upgrade
- six-win result gates
- all amended market candidates
- API-Football team-goal odds parsing
