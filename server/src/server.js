import express from "express";
import cors from "cors";

import {
  DEFAULT_ALLOWED_ORIGINS,
  ENGINE_VERSION,
  SERVICE_NAME,
  SERVICE_VERSION
} from "./config.js";
import { accountRouter } from "./routes/accountRoutes.js";
import { adminRouter } from "./routes/adminRoutes.js";
import { publicRouter } from "./routes/publicRoutes.js";
import { getSupabaseAdmin } from "./supabase.js";
import { authFeaturesConfigured, pushFeaturesConfigured } from "./config.js";
import { getErrorDetails, HttpError } from "./utils/errors.js";

const app = express();
const PORT = Number(process.env.PORT) || 4173;

const configuredOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = new Set([
  ...DEFAULT_ALLOWED_ORIGINS,
  ...configuredOrigins
]);

function validateSupabaseEnvironment() {
  const missing = [];
  if (!process.env.SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) {
    throw new Error(`Missing required environment variable(s): ${missing.join(", ")}`);
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(process.env.SUPABASE_URL);
  } catch {
    throw new Error("SUPABASE_URL is not a valid URL");
  }
  if (!parsedUrl.hostname.endsWith(".supabase.co")) {
    throw new Error(
      "SUPABASE_URL must be the Supabase Project URL, for example https://your-project-ref.supabase.co"
    );
  }
}

async function checkDatabaseConnection() {
  validateSupabaseEnvironment();
  const supabase = getSupabaseAdmin();
  const { error, count } = await supabase
    .from("leagues")
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  return { connected: true, leaguesCount: count ?? 0 };
}

app.disable("x-powered-by");
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(new HttpError(403, `Origin not allowed by CORS: ${origin}`));
    },
    credentials: false,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-admin-secret"]
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false, limit: "2mb" }));

app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    health: "/api/health",
    demo: "/api/demo",
    predictionsToday: "/api/predictions/today",
    fixturesToday: "/api/fixtures/today",
    dashboardToday: "/api/dashboard/today",
    recentResults: "/api/results/recent",
    engineStats: "/api/stats/engine",
    processingStatus: "/api/processing/status",
    papasPick: "/api/engines/primary",
    aggressive: "/api/engines/aggressive",
    safer: "/api/engines/safer",
    venuePattern: "/api/engines/venue",
    bankers: "/api/bankers/today",
    resultsIntelligence: "/api/results/intelligence",
    adminDiagnostics: "/api/admin/diagnostics",
    accountConfig: "/api/account/config",
    account: "/api/account/me"
  });
});

app.get("/api/health", async (_req, res) => {
  try {
    const database = await checkDatabaseConnection();
    return res.status(200).json({
      status: "ok",
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      engineVersion: ENGINE_VERSION,
      database: "connected",
      leaguesCount: database.leaguesCount,
      providerKeyConfigured: Boolean(
        process.env.API_FOOTBALL_KEY ||
          process.env.FOOTBALL_API_KEY ||
          process.env.API_STATS_KEY
      ),
      adminSecretConfigured: Boolean(process.env.ADMIN_SYNC_SECRET),
      authConfigured: authFeaturesConfigured(),
      pushConfigured: pushFeaturesConfigured(),
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

app.use("/api/account", accountRouter);
app.use("/api", publicRouter);
app.use("/api/admin", adminRouter);

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    method: req.method,
    path: req.originalUrl
  });
});

app.use((error, _req, res, _next) => {
  const details = getErrorDetails(error);
  console.error("Request error:", details);
  const status = Number(error?.status) || 500;
  res.status(status).json({
    status: "error",
    message: details.message,
    code: details.code,
    details: error?.details || details.details,
    hint: details.hint
  });
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", getErrorDetails(reason));
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", getErrorDetails(error));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`${SERVICE_NAME} v${SERVICE_VERSION} running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`Supabase configured: ${Boolean(process.env.SUPABASE_URL)}`);
});
