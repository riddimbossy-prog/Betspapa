# PapaSense Engine Audit — v1.6

## Main weaknesses found in v1.5

1. **No Draw relied too heavily on the raw six-route decisive mass.** It did not fully enforce X/X control, lead-to-draw control, independent route breadth, upset support and enough goal pressure to break a level game.
2. **Result markets shared too much raw transition probability.** 1X, X2, DNB and outright wins needed separate structure and gap checks.
3. **GG and Over 1.5 were separated, but the distinction was not applied consistently across the full market family.**
4. **Several useful markets were missing:** Under 1.5, Under 2.5, Over 3.5, 2–3 goals, team Under 1.5, clean sheets, win either half and half-goal markets.
5. **Fallback ranking was not fully family-aware.** A complex or narrow market could compete too closely with safer broad markets.
6. **The fixture explanation showed HT/FT indicators and alternatives, but not the best score from every market family.**
7. **The grader did not support the newly needed markets.**

## v1.6 corrections

- Independent formulas and blockers for each market family.
- Stronger draw-structure intelligence for 12 and full-time draw.
- Result-gap and route-breadth confirmation for win and DNB markets.
- Two-team scoring requirement for GG.
- One-team two-goal route explicitly allowed for Over 1.5.
- Separate low-score logic for Under 1.5, Under 2.5 and Under 3.5.
- One-sided and two-sided three/four-goal route checks for Over 2.5 and Over 3.5.
- Fallback-safe market whitelist; exact HT/FT, half-time result and Over 3.5 cannot become weak fallback picks.
- Complete market-family comparison on the fixture explanation page.
- Automatic grading for all new markets.
- Seventeen automated tests covering engine structure, market separation and grading.
