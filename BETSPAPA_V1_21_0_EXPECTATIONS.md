# BetsPapa v1.21.0 Expectations

## Versions

- BetsPapa service: `1.21.0`
- PapaSense: `papasense-v2.0.0-four-engine-resolution`
- Athena: `athena-v3.0.0-swing-half-goals`

## Installation order

1. Run `supabase/BETSPAPA_V1_20_0_ATHENA_V3.sql` if Athena v3 is not already installed.
2. Run `supabase/BETSPAPA_V1_21_0_PAPASENSE_V2.sql`.
3. Replace the existing repository with this package.
4. Deploy the backend and static site.
5. Open `/reset.html` once to clear the previous PWA cache.
6. Run history hydration, profile rebuild and prepared-board generation.

## Expected engine behaviour

- Papa can publish a qualified selection or `NO PICK`.
- Safer appears only as a broader same-story containment market.
- Aggressive appears only as a sharper same-story escalation.
- Venue Pattern is independent and can return `NO PICK`.
- Missing evidence is never treated as zero.
- Standard profiles use only normal 90-minute `FT` results.
- Half-goal and event evidence from Athena v3 are available to all four PapaSense engines.
- Public explanations are plain English; detailed calculations remain in `internalAudit`.
- Per-engine calibration starts after 50 settled selections for the same engine and market.

## Verification

Run from `server/`:

```bash
npm test
```

The packaged release contains 115 automated tests covering the existing application plus PapaSense v2 contracts, calibration, NO PICK handling, venue independence, PWA behaviour and Athena compatibility.
