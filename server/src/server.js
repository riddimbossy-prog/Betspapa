import express from "express";
import cors from "cors";

import { demoFixtures } from "./data/demoFixtures.js";
import { predictMatch } from "./engine/transitionEngine.js";
import { getSupabaseAdmin } from "./supabase.js";

const app = express();
const PORT = Number(process.env.PORT) || 4173;
const SERVICE_NAME = "BetsPapa Prediction API";
const SERVICE_VERSION = "1.1.1";

const defaultAllowedOrigins = [
  "https://betspapa.com",
  "https://www.betspapa.com",
  "https://riddimbossy-prog.github.io",
  "http://localhost:4173",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
];

const configuredOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = new Set([
  ...defaultAllowedOrigins,
  ...configuredOrigins
]);

function getErrorDetails(error) {
  if (!error) {
    return {
      message: "Unknown error"
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack:
        process.env.NODE_ENV === "production"
          ? undefined
          : error.stack
    };
  }

  if (typeof error === "string") {
    return {
      message: error
    };
  }

  if (typeof error === "object") {
    return {
      message:
        error.message ||
        error.error_description ||
        error.details ||
        error.hint ||
        JSON.stringify(error),
      code: error.code,
      details: error.details,
      hint: error.hint,
      status: error.status
    };
  }

  return {
    message: String(error)
  };
}

function validateSupabaseEnvironment() {
  const missing = [];

  if (!process.env.SUPABASE_URL) {
    missing.push("SUPABASE_URL");
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}`
    );
  }

  try {
    const parsedUrl = new URL(process.env.SUPABASE_URL);

    if (!parsedUrl.hostname.endsWith(".supabase.co")) {
      throw new Error(
        "SUPABASE_URL must be the Supabase Project URL, for example https://your-project-ref.supabase.co"
      );
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("SUPABASE_URL must")
    ) {
      throw error;
    }

    throw new Error("SUPABASE_URL is not a valid URL");
  }
}

async function checkDatabaseConnection() {
  validateSupabaseEnvironment();

  const supabase = getSupabaseAdmin();

  const {
    error,
    count
  } = await supabase
    .from("leagues")
    .select("id", {
      count: "exact",
      head: true
    });

  if (error) {
    throw error;
  }

  return {
    connected: true,
    leaguesCount: count ?? 0
  };
}

app.disable("x-powered-by");

app.use(
  cors({
    origin(origin, callback) {
      // Allow server-to-server requests and direct browser navigation.
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error(`Origin not allowed by CORS: ${origin}`)
      );
    },
    credentials: false,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

app.get("/", (_req, res) => {
  return res.json({
    status: "ok",
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    health: "/api/health",
    demo: "/api/demo",
    predictionsToday: "/api/predictions/today"
  });
});

app.get("/api/health", async (_req, res) => {
  try {
    const database = await checkDatabaseConnection();

    return res.status(200).json({
      status: "ok",
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      database: "connected",
      leaguesCount: database.leaguesCount,
      environment: process.env.NODE_ENV || "development",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const details = getErrorDetails(error);

    console.error("Supabase health-check error:", details);

    return res.status(500).json({
      status: "error",
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      database: "disconnected",
      message: details.message,
      code: details.code,
      details: details.details,
      hint: details.hint,
      timestamp: new Date().toISOString()
    });
  }
});

app.get("/api/demo", (_req, res) => {
  try {
    const predictions = demoFixtures.map((fixture) =>
      predictMatch(fixture)
    );

    return res.json({
      fixtures: demoFixtures,
      predictions
    });
  } catch (error) {
    const details = getErrorDetails(error);

    return res.status(500).json({
      error: "Unable to generate demo predictions",
      message: details.message
    });
  }
});

app.get("/api/demo/:fixtureId", (req, res) => {
  const fixture = demoFixtures.find(
    (item) => item.fixtureId === req.params.fixtureId
  );

  if (!fixture) {
    return res.status(404).json({
      error: "Fixture not found"
    });
  }

  try {
    return res.json({
      fixture,
      prediction: predictMatch(fixture)
    });
  } catch (error) {
    const details = getErrorDetails(error);

    return res.status(500).json({
      error: "Unable to generate prediction",
      message: details.message
    });
  }
});

app.post("/api/predict", (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({
        error: "A JSON fixture object is required"
      });
    }

    const prediction = predictMatch(req.body);

    return res.status(200).json(prediction);
  } catch (error) {
    const details = getErrorDetails(error);

    return res.status(400).json({
      error: "Prediction failed",
      message: details.message
    });
  }
});

app.get("/api/predictions/today", async (_req, res) => {
  try {
    validateSupabaseEnvironment();

    const supabase = getSupabaseAdmin();

    const now = new Date();
    const start = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0,
        0,
        0,
        0
      )
    );
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);

    const {
      data,
      error
    } = await supabase
      .from("predictions")
      .select(`
        id,
        fixture_id,
        engine_version,
        primary_market,
        primary_selection,
        probability,
        confidence,
        confidence_tier,
        strongest_transition,
        transition_probability,
        home_goal_support,
        away_goal_support,
        gg_score,
        over_15_score,
        over_25_score,
        under_35_score,
        market_scores,
        transition_matrix,
        reasons,
        warnings,
        rejected_markets,
        published,
        created_at,
        fixtures (
          id,
          external_fixture_id,
          fixture_date,
          status,
          halftime_home,
          halftime_away,
          fulltime_home,
          fulltime_away,
          home_team_id,
          away_team_id,
          league_id
        )
      `)
      .eq("published", true)
      .gte("fixtures.fixture_date", start.toISOString())
      .lt("fixtures.fixture_date", end.toISOString())
      .order("confidence", {
        ascending: false
      });

    if (error) {
      throw error;
    }

    return res.json({
      date: start.toISOString().slice(0, 10),
      count: data?.length || 0,
      predictions: data || []
    });
  } catch (error) {
    const details = getErrorDetails(error);

    console.error("Predictions-today error:", details);

    return res.status(500).json({
      status: "error",
      error: "Unable to load today's predictions",
      message: details.message,
      code: details.code,
      details: details.details,
      hint: details.hint
    });
  }
});

app.use((req, res) => {
  return res.status(404).json({
    error: "Route not found",
    method: req.method,
    path: req.originalUrl
  });
});

app.use((error, _req, res, _next) => {
  const details = getErrorDetails(error);

  console.error("Unhandled request error:", details);

  if (
    details.message &&
    details.message.startsWith("Origin not allowed by CORS")
  ) {
    return res.status(403).json({
      error: details.message
    });
  }

  return res.status(500).json({
    error: "Internal server error",
    message: details.message
  });
});

process.on("unhandledRejection", (reason) => {
  console.error(
    "Unhandled promise rejection:",
    getErrorDetails(reason)
  );
});

process.on("uncaughtException", (error) => {
  console.error(
    "Uncaught exception:",
    getErrorDetails(error)
  );
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`${SERVICE_NAME} running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(
    `Supabase URL configured: ${Boolean(process.env.SUPABASE_URL)}`
  );
  console.log(
    `Supabase backend key configured: ${Boolean(
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )}`
  );
});
