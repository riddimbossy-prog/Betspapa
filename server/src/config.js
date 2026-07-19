export const SERVICE_NAME = "BetsPapa Prediction API";
export const SERVICE_VERSION = "1.12.1";
export const ENGINE_VERSION = "papasense-v1.10.0";
export const BOSS_ENGINE_VERSION = "omni-htft-v2.0";

export function getApiFootballKey() {
  return (
    process.env.API_FOOTBALL_KEY ||
    process.env.FOOTBALL_API_KEY ||
    process.env.API_STATS_KEY ||
    ""
  ).trim();
}

export const FINISHED_PROFILE_STATUSES = new Set(["FT"]);
export const PREDICTABLE_STATUSES = new Set(["NS", "TBD"]);

export const DEFAULT_ALLOWED_ORIGINS = [
  "https://betspapa.com",
  "https://www.betspapa.com",
  "https://riddimbossy-prog.github.io",
  "http://localhost:4173",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
];
