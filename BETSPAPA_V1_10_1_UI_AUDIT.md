# BetsPapa v1.10.1 UI Audit

## Public navigation

- Diagnostics removed from all public menus.
- Inactive account and watchlist controls removed.
- Consistent mobile bottom navigation added to all public pages.
- Dedicated mobile More sheet links to secondary engines and legal pages.

## Readability

- No core portal label uses 8–10px text on normal screens.
- Filters use 15–16px text and 50px touch targets.
- Prediction selections use 21–22px text.
- Explanation paragraphs use 15–16px text.
- Table text uses 12px headers and 14px body text.
- Mobile pages include bottom padding so navigation does not cover content.

## Admin separation

- Public diagnostics links removed.
- Private diagnostics moved to `/admin/`.
- Admin page uses `noindex,nofollow,noarchive`.
- `robots.txt` disallows the admin path.
- API requests still require `ADMIN_SYNC_SECRET`.

## Oversights corrected

- Duplicate Cautions heading removed.
- Engine filter handlers no longer multiply after refreshes.
- Dialog scroll lock is restored on close.
- Mobile header nav closes on outside click, Escape and desktop resize.
- Old homepage-only mobile nav removed to prevent duplicate tabs.
- Legal and 404 pages rebuilt with the current BetsPapa typography.
