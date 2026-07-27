export const SERVICE_NAME = "BetsPapa Prediction API";
export const SERVICE_VERSION = "1.24.0";
export const ENGINE_VERSION = "papasense-v2.1.1-picks-only-board";
export const ATHENA_ENGINE_VERSION = "athena-v3.1.0-specialist-half-market-guards";
// Backward-compatible alias for older diagnostics clients.
export const BOSS_ENGINE_VERSION = ATHENA_ENGINE_VERSION;

export function getApiFootballKey() {
  return (
    process.env.API_FOOTBALL_KEY ||
    process.env.FOOTBALL_API_KEY ||
    process.env.API_STATS_KEY ||
    ""
  ).trim();
}

export const FINISHED_PROFILE_STATUSES = new Set(["FT"]);
// Athena markets are 90-minute markets. Extra-time, shootout and awarded results
// must not be mixed into its transition or half-goal history.
export const ATHENA_PROFILE_STATUSES = new Set(["FT"]);
export const PREDICTABLE_STATUSES = new Set(["NS", "TBD"]);

export const DEFAULT_ALLOWED_ORIGINS = [
  "https://betspapa.com",
  "https://www.betspapa.com",
  "https://riddimbossy-prog.github.io",
  "http://localhost:4173",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
];
