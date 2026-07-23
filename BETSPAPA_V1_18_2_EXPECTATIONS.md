# What to Expect After v1.18.2

- Previously viewed prepared boards can appear immediately from the device cache.
- A quiet network check replaces the board when a newer server snapshot exists.
- The first request after a completely cold Render restart may still take longer, but later requests use the warmed snapshot.
- Opening Papa's Pick no longer starts history downloads or prediction generation.
- Missing fixtures remain marked as awaiting the scheduled preparation workflow.
- The page checks an incomplete board once per minute instead of every eight seconds.
- Manual Refresh reloads the prepared database snapshot; it does not call API-Football or run PapaSense.
- Tomorrow's workflow warms Primary, Aggressive, Safer and Venue snapshots after preparation.
- Existing v1.18.1 predictions remain valid because the engine version did not change.
- No Supabase migration is required.
