# BetsPapa v1.17.0 — Consensus Bankers

## Purpose

The Banker page is separate from Papa’s Boss Picks.

- **Bankers** compare the four PapaSense engines for the same fixture.
- **Boss Picks** remain the separate OMNI HT/FT Gatekeeper selections.

The Banker page publishes one strongest selection per fixture only after strict agreement and evidence checks.

## Consensus rules

A normal consensus Banker must satisfy all of the following:

1. At least **two qualified engines** choose the same normalized market and exact selection.
2. Each agreeing engine meets its existing strict confidence threshold.
3. Each team has at least **six overall matches** in the profile audit.
4. Each team has at least **three relevant home/away matches**.
5. The individual team-profile audit is complete.
6. No critical caution, unstable sample, missing-data warning or strong contradiction survives.
7. Only one final Banker is published for the fixture.

Equivalent internal keys are normalized. For example, `favourite-over-15` and `home-over-15` can agree when both engines select the same named team Over 1.5.

## Banker levels

- **UNANIMOUS:** 4 of 4 engines select the exact same pick.
- **PRIME CONSENSUS:** 3 of 4 engines select the exact same pick.
- **CONSENSUS:** 2 of 4 engines select the exact same pick.
- **HIGH CONFIDENCE:** no exact engine consensus exists, but one qualified pick reaches at least 86% and passes every banker evidence gate.

## Split-decision protection

When two different selections receive an almost equal engine consensus, the fixture is withheld instead of forcing a Banker.

## Banker score

The 0–100 Banker score combines:

- average confidence of the agreeing engines;
- lowest agreeing confidence;
- number of engines agreeing;
- consistency between their confidence scores;
- audited overall and venue sample strength.

It is a rule score, not a guaranteed real-world win probability.

## Page features

- Date filter.
- Banker-level filter.
- Market filter.
- Team, league and selection search.
- Engine-vote chips showing each supporting engine and confidence.
- Full explanation popup with supporting engines, sample sizes and other engine views.
- Saved Banker board appears immediately, then refreshes quietly.
- Pending, live, settling and settled match states.
- Responsive mobile, tablet, desktop and Samsung Z Fold layouts.

## API

```text
GET /api/bankers/today?date=YYYY-MM-DD&limit=20
```

The previous per-engine slate remains available for compatibility:

```text
GET /api/bankers/by-engine?date=YYYY-MM-DD&limit=3
```

## Deployment

No Supabase migration and no new Render environment variable are required.
The PapaSense engine remains `papasense-v1.13.0`.
