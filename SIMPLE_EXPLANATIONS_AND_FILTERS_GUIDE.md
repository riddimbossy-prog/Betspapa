# Simple Explanation Format

Every reason popup now separates the proof into five readable parts:

1. Strongest HT/FT pattern and its meaning.
2. Home-team venue support, rounded to whole matches and a percentage.
3. Away-team opposite-pattern support, rounded the same way.
4. The next supporting HT/FT pattern.
5. A plain-English sentence explaining why the final market was chosen.

Weighted cross-competition samples are labelled **about** and never shown as long decimal counts.

# Faster Processing

- Profile-plan queries are bulk-loaded.
- Render can hydrate four teams concurrently.
- GitHub Actions can run four team requests concurrently.
- `HYDRATION_WORKERS` can be set from 1 to 6; 4 is recommended.

# Broad Market Filter

The filter operates on the currently selected engine and supports market families plus specific markets.
