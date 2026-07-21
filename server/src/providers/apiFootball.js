import { getApiFootballKey } from "../config.js";
import { HttpError } from "../utils/errors.js";

const BASE_URL = "https://v3.football.api-sports.io";
const MAX_ATTEMPTS = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUrl(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function quotaFromHeaders(headers) {
  return {
    dailyRemaining: headers.get("x-ratelimit-requests-remaining"),
    dailyLimit: headers.get("x-ratelimit-requests-limit"),
    minuteRemaining: headers.get("x-ratelimit-remaining"),
    minuteLimit: headers.get("x-ratelimit-limit")
  };
}

export async function apiFootballRequest(path, params = {}) {
  const key = getApiFootballKey();
  if (!key) {
    throw new HttpError(
      503,
      "API-Football key is missing. Configure API_FOOTBALL_KEY, FOOTBALL_API_KEY, or API_STATS_KEY in Render."
    );
  }

  const url = buildUrl(path, params);
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "x-apisports-key": key,
          Accept: "application/json"
        },
        signal: AbortSignal.timeout(25000)
      });

      const text = await response.text();
      let payload;
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = { raw: text };
      }

      if (!response.ok) {
        const providerMessage =
          payload?.message ||
          payload?.errors?.token ||
          payload?.errors?.requests ||
          JSON.stringify(payload?.errors || payload);
        const error = new HttpError(
          response.status,
          `API-Football request failed: ${providerMessage}`,
          { url: url.toString(), quota: quotaFromHeaders(response.headers) }
        );

        if ((response.status === 429 || response.status >= 500) && attempt < MAX_ATTEMPTS) {
          lastError = error;
          await sleep(700 * attempt);
          continue;
        }
        throw error;
      }

      const providerErrors = payload?.errors;
      if (providerErrors && Object.keys(providerErrors).length > 0) {
        throw new HttpError(502, "API-Football returned an error", providerErrors);
      }

      return {
        response: Array.isArray(payload?.response) ? payload.response : [],
        results: Number(payload?.results || 0),
        paging: payload?.paging || { current: 1, total: 1 },
        parameters: payload?.parameters || {},
        quota: quotaFromHeaders(response.headers)
      };
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS && !(error instanceof HttpError && error.status < 500)) {
        await sleep(700 * attempt);
        continue;
      }
      throw error;
    }
  }

  throw lastError || new HttpError(502, "API-Football request failed");
}

export async function fetchFixturesByDate(date) {
  return apiFootballRequest("/fixtures", { date, timezone: "UTC" });
}

export async function fetchLeagueFixtures({ leagueId, season, from, to }) {
  return apiFootballRequest("/fixtures", {
    league: leagueId,
    season,
    from,
    to,
    timezone: "UTC"
  });
}


export async function fetchTeamRecentFixtures({ teamId, last = 24 }) {
  const safeLast = Math.max(6, Math.min(Number(last) || 24, 40));
  return apiFootballRequest("/fixtures", {
    team: Number(teamId),
    last: safeLast,
    status: "FT",
    timezone: "UTC"
  });
}

export async function fetchProviderStatus() {
  return apiFootballRequest("/status");
}

export async function fetchFixtureEvents(fixtureId) {
  return apiFootballRequest("/fixtures/events", {
    fixture: Number(fixtureId)
  });
}
