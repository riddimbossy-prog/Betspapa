import express from "express";
import cors from "cors";
import { demoFixtures } from "./data/demoFixtures.js";
import { predictMatch } from "./engine/transitionEngine.js";
import { getSupabaseAdmin } from "./supabase.js";

const app = express();
const port = Number(process.env.PORT) || 4173;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable("x-powered-by");
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origin not allowed by CORS"));
    },
    credentials: false
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.json({
    service: "BetsPapa Prediction API",
    version: "1.1.0",
    health: "/api/health"
  });
});

app.get("/api/health", async (_req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("leagues").select("id").limit(1);
    if (error) throw error;

    return res.json({
      status: "ok",
      service: "BetsPapa Prediction API",
      version: "1.1.0",
      database: "connected"
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      service: "BetsPapa Prediction API",
      database: "disconnected",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

app.get("/api/demo", (_req, res) => {
  const predictions = demoFixtures.map((fixture) => predictMatch(fixture));
  res.json({ fixtures: demoFixtures, predictions });
});

app.get("/api/demo/:fixtureId", (req, res) => {
  const fixture = demoFixtures.find((item) => item.fixtureId === req.params.fixtureId);
  if (!fixture) return res.status(404).json({ error: "Fixture not found" });
  return res.json({ fixture, prediction: predictMatch(fixture) });
});

app.post("/api/predict", (req, res) => {
  try {
    const prediction = predictMatch(req.body);
    return res.json(prediction);
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Prediction failed"
    });
  }
});

app.use((error, _req, res, _next) => {
  if (error instanceof Error && error.message === "Origin not allowed by CORS") {
    return res.status(403).json({ error: error.message });
  }
  return res.status(500).json({ error: "Internal server error" });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`BetsPapa API running on port ${port}`);
});
