export const SERVICE_NAME = "BetsPapa Prediction API";
export const SERVICE_VERSION = "1.11.0";
export const ENGINE_VERSION = "papasense-v1.10.0";

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


export function getSupabasePublicConfig() {
  return {
    url: String(process.env.SUPABASE_URL || "").trim(),
    anonKey: String(process.env.SUPABASE_ANON_KEY || "").trim()
  };
}

export function getVapidConfig() {
  return {
    publicKey: String(process.env.VAPID_PUBLIC_KEY || "").trim(),
    privateKey: String(process.env.VAPID_PRIVATE_KEY || "").trim(),
    subject: String(process.env.PUSH_SUBJECT || "mailto:admin@betspapa.com").trim()
  };
}

export function authFeaturesConfigured() {
  const config = getSupabasePublicConfig();
  return Boolean(config.url && config.anonKey);
}

export function pushFeaturesConfigured() {
  const config = getVapidConfig();
  return Boolean(config.publicKey && config.privateKey && config.subject);
}
