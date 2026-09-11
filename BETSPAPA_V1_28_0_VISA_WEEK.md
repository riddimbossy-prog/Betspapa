# BetsPapa v1.28.0 — Visa Seven-Day Board

Visa now runs a rolling seven-date window instead of making the reader load each day separately.

## Public experience

- Seven date tabs begin with today and continue through the next six calendar dates.
- Every tab shows its approved-pick count and total fixtures reviewed.
- The week-start control can run a different seven-date window.
- The selected date stays in the page URL and can be shared or reopened.
- Arrow Left, Arrow Right, Home and End move through the date tabs by keyboard.

## API

`GET /api/visa/week?start=YYYY-MM-DD&days=7`

The response contains `startDate`, `endDate`, weekly totals and seven complete daily slates. The service loads the fixtures and strict venue history for the range, matches SportyBet prices once, and then evaluates every fixture under the existing Visa rules. The original `GET /api/visa/today` endpoint remains available.

The automatic data workflow now synchronizes all seven dates before warming the weekly endpoint. This ensures the final two tabs receive fixture data instead of relying on the older five-day preload.

## Safety contract

This release changes the delivery window, not the Visa selection rules. Each fixture still receives at most one published selection, exact SportyBet pricing remains mandatory, and an unqualified fixture receives no visa.

No database migration is required.
