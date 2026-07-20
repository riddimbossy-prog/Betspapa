#!/usr/bin/env node
"use strict";

/**
 * OMNI HT/FT v2.5.2 honest walk-forward backtester.
 *
 * Key rule: it never guesses score order or lead-at-any-time from FT/HT scores.
 * Markets that need unavailable event data are blocked by the engine.
 */

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const out = {
    engine: path.join(__dirname, "omni_htft_engine_v2_5_2.js"),
    dataDir: path.join(__dirname, "data"),
    outputDir: path.join(__dirname, "reports"),
    historyWindow: 20,
    leagueWindow: 60,
    season: "unspecified",
    strict: false,
    leagues: []
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (arg === "--engine" && value) { out.engine = path.resolve(value); i += 1; }
    else if (arg === "--data-dir" && value) { out.dataDir = path.resolve(value); i += 1; }
    else if (arg === "--output-dir" && value) { out.outputDir = path.resolve(value); i += 1; }
    else if (arg === "--history-window" && value) { out.historyWindow = Number(value); i += 1; }
    else if (arg === "--league-window" && value) { out.leagueWindow = Number(value); i += 1; }
    else if (arg === "--season" && value) { out.season = value; i += 1; }
    else if (arg === "--leagues" && value) {
      out.leagues = value.split(",").map(v => v.trim()).filter(Boolean);
      i += 1;
    } else if (arg === "--strict") out.strict = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`Unknown or incomplete argument: ${arg}`);
  }

  if (!Number.isInteger(out.historyWindow) || out.historyWindow < 8) {
    throw new Error("--history-window must be an integer of at least 8.");
  }
  if (!Number.isInteger(out.leagueWindow) || out.leagueWindow < 30) {
    throw new Error("--league-window must be an integer of at least 30.");
  }
  return out;
}

function usage() {
  return [
    "Usage:",
    "  node loss_forensics_v2_5_2.js [options]",
    "",
    "Options:",
    "  --data-dir <folder>         Folder containing league CSV files",
    "  --leagues <a,b,c>           CSV basenames to run; default: every CSV in data folder",
    "  --engine <file>             Engine module path",
    "  --output-dir <folder>       Report output folder",
    "  --history-window <n>        Team history size (default 20)",
    "  --league-window <n>         League history size (default 60)",
    "  --season <label>             Metadata label",
    "  --strict                     Require all strict production fields",
    "  -h, --help                   Show this help"
  ].join("\n");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }

  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter(r => r.some(cell => cell.trim() !== ""));
}

function normalizedHeader(value) {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function firstCell(record, aliases) {
  for (const alias of aliases) {
    const key = normalizedHeader(alias);
    if (Object.prototype.hasOwnProperty.call(record, key) && record[key] !== "") return record[key];
  }
  return null;
}

function numberCell(record, aliases, required = false) {
  const raw = firstCell(record, aliases);
  if (raw == null) {
    if (required) throw new Error(`Missing required column/value: ${aliases.join(" or ")}`);
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Expected number for ${aliases[0]}, received: ${raw}`);
  return value;
}

function booleanCell(record, aliases) {
  const raw = firstCell(record, aliases);
  if (raw == null) return null;
  const value = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(value)) return true;
  if (["0", "false", "no", "n"].includes(value)) return false;
  return null;
}

function loadLeagueCsv(filePath, parseDateToTimestamp) {
  const rows = parseCsv(fs.readFileSync(filePath, "utf8"));
  if (rows.length < 2) throw new Error(`${filePath} has no match rows.`);

  const headers = rows[0].map(normalizedHeader);
  const matches = rows.slice(1).map((cells, index) => {
    const record = Object.fromEntries(headers.map((header, i) => [header, (cells[i] ?? "").trim()]));
    const date = firstCell(record, ["Date", "MatchDate"]);
    const home = firstCell(record, ["HomeTeam", "Home"]);
    const away = firstCell(record, ["AwayTeam", "Away"]);
    if (!date || !home || !away) throw new Error(`${filePath} row ${index + 2}: Date, HomeTeam and AwayTeam are required.`);

    const match = {
      date,
      timestamp: parseDateToTimestamp(date, `${path.basename(filePath)} row ${index + 2} date`),
      home,
      away,
      fthg: numberCell(record, ["FTHG", "HomeGoals", "FullTimeHomeGoals"], true),
      ftag: numberCell(record, ["FTAG", "AwayGoals", "FullTimeAwayGoals"], true),
      hthg: numberCell(record, ["HTHG", "HalfTimeHomeGoals"], true),
      htag: numberCell(record, ["HTAG", "HalfTimeAwayGoals"], true),
      hxg: numberCell(record, ["HxG", "HomeXG", "xGHome"]),
      axg: numberCell(record, ["AxG", "AwayXG", "xGAway"]),
      homeScoredFirst: booleanCell(record, ["HomeScoredFirst"]),
      awayScoredFirst: booleanCell(record, ["AwayScoredFirst"]),
      homeLedAnyTime: booleanCell(record, ["HomeLedAnyTime"]),
      awayLedAnyTime: booleanCell(record, ["AwayLedAnyTime"]),
      homeTrailedAnyTime: booleanCell(record, ["HomeTrailedAnyTime"]),
      awayTrailedAnyTime: booleanCell(record, ["AwayTrailedAnyTime"])
    };

    for (const key of ["fthg", "ftag", "hthg", "htag"]) {
      if (!Number.isInteger(match[key]) || match[key] < 0) {
        throw new Error(`${filePath} row ${index + 2}: ${key} must be a non-negative integer.`);
      }
    }
    if (match.hthg > match.fthg || match.htag > match.ftag) {
      throw new Error(`${filePath} row ${index + 2}: half-time goals exceed full-time goals.`);
    }
    return match;
  });

  matches.sort((a, b) => a.timestamp - b.timestamp);
  return matches;
}

function toTeamMatch(match, side) {
  const homeSide = side === "home";
  const out = {
    date: match.date,
    venue: side,
    goalsFor: homeSide ? match.fthg : match.ftag,
    goalsAgainst: homeSide ? match.ftag : match.fthg,
    halfTimeGoalsFor: homeSide ? match.hthg : match.htag,
    halfTimeGoalsAgainst: homeSide ? match.htag : match.hthg
  };

  const xgFor = homeSide ? match.hxg : match.axg;
  const xgAgainst = homeSide ? match.axg : match.hxg;
  if (Number.isFinite(xgFor)) out.xgFor = xgFor;
  if (Number.isFinite(xgAgainst)) out.xgAgainst = xgAgainst;

  const scoredFirst = homeSide ? match.homeScoredFirst : match.awayScoredFirst;
  const ledAnyTime = homeSide ? match.homeLedAnyTime : match.awayLedAnyTime;
  const trailedAnyTime = homeSide ? match.homeTrailedAnyTime : match.awayTrailedAnyTime;
  if (typeof scoredFirst === "boolean") out.scoredFirst = scoredFirst;
  if (typeof ledAnyTime === "boolean") out.ledAnyTime = ledAnyTime;
  if (typeof trailedAnyTime === "boolean") out.trailedAnyTime = trailedAnyTime;
  return out;
}

function settle(marketId, match) {
  const h = match.fthg, a = match.ftag, h1 = match.hthg, a1 = match.htag;
  const h2 = h - h1, a2 = a - a1;
  const total = h + a, firstHalf = h1 + a1, secondHalf = h2 + a2;
  const table = {
    MATCH_OVER_1_5: total >= 2,
    MATCH_OVER_2_5: total >= 3, MATCH_OVER_3_5: total >= 4,
    MATCH_UNDER_1_5: total <= 1, MATCH_UNDER_2_5: total <= 2,
    MATCH_UNDER_3_5: total <= 3, MATCH_UNDER_4_5: total <= 4,
    HOME_OVER_0_5: h >= 1, HOME_OVER_1_5: h >= 2, HOME_OVER_2_5: h >= 3,
    AWAY_OVER_0_5: a >= 1, AWAY_OVER_1_5: a >= 2, AWAY_OVER_2_5: a >= 3,
    HOME_UNDER_0_5: h === 0, HOME_UNDER_1_5: h <= 1, HOME_UNDER_2_5: h <= 2,
    AWAY_UNDER_0_5: a === 0, AWAY_UNDER_1_5: a <= 1, AWAY_UNDER_2_5: a <= 2,
    BTTS_YES: h > 0 && a > 0, BTTS_NO: h === 0 || a === 0,
    HOME_WIN: h > a, AWAY_WIN: a > h, DRAW: h === a,
    HOME_DNB: h === a ? "PUSH" : h > a,
    AWAY_DNB: h === a ? "PUSH" : a > h,
    DOUBLE_CHANCE_1X: h >= a, DOUBLE_CHANCE_X2: a >= h, DOUBLE_CHANCE_12: h !== a,
    FIRST_HALF_OVER_0_5: firstHalf >= 1, FIRST_HALF_OVER_1_5: firstHalf >= 2,
    FIRST_HALF_UNDER_1_5: firstHalf <= 1, SECOND_HALF_OVER_0_5: secondHalf >= 1,
    HOME_WIN_EITHER_HALF: h1 > a1 || h2 > a2,
    AWAY_WIN_EITHER_HALF: a1 > h1 || a2 > h2,
    HOME_SCORE_BOTH_HALVES: h1 > 0 && h2 > 0,
    AWAY_SCORE_BOTH_HALVES: a1 > 0 && a2 > 0,
    NO_GOAL: total === 0,
    HOME_LEAD_ANYTIME: match.homeLedAnyTime,
    AWAY_LEAD_ANYTIME: match.awayLedAnyTime,
    HOME_CLEAN_SHEET: a === 0, AWAY_CLEAN_SHEET: h === 0,
    HOME_WIN_TO_NIL: h > a && a === 0,
    AWAY_WIN_TO_NIL: a > h && h === 0
  };
  if (!Object.prototype.hasOwnProperty.call(table, marketId)) return null;
  return typeof table[marketId] === "boolean" || table[marketId] === "PUSH" ? table[marketId] : null;
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(filePath, records) {
  const columns = ["league", "date", "fixture", "result", "market", "score", "grade", "outcome"];
  const lines = [columns.join(",")];
  for (const record of records) lines.push(columns.map(c => csvEscape(record[c])).join(","));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function discoverLeagues(dataDir) {
  if (!fs.existsSync(dataDir)) return [];
  return fs.readdirSync(dataDir)
    .filter(name => name.toLowerCase().endsWith(".csv"))
    .map(name => path.basename(name, path.extname(name)))
    .sort();
}

function runBacktest(options) {
  if (!fs.existsSync(options.engine)) throw new Error(`Engine not found: ${options.engine}`);
  const engine = require(options.engine);
  if (typeof engine.runEngine !== "function" || typeof engine.parseDateToTimestamp !== "function") {
    throw new Error("Engine must export runEngine and parseDateToTimestamp.");
  }

  const leagues = options.leagues.length ? options.leagues : discoverLeagues(options.dataDir);
  if (!leagues.length) throw new Error(`No CSV files found in ${options.dataDir}.`);

  const bets = [];
  const noBets = [];
  let fixturesEvaluated = 0;

  for (const league of leagues) {
    const filePath = path.join(options.dataDir, `${league}.csv`);
    if (!fs.existsSync(filePath)) throw new Error(`League file not found: ${filePath}`);
    const matches = loadLeagueCsv(filePath, engine.parseDateToTimestamp);

    for (let i = 0; i < matches.length; i += 1) {
      const fixture = matches[i];
      // Use strictly earlier timestamps. When a CSV contains dates without
      // kickoff times, every fixture on that date is excluded to prevent
      // same-day look-ahead leakage.
      const prior = matches.filter(m => m.timestamp < fixture.timestamp);
      const historyFor = team => prior
        .filter(m => m.home === team || m.away === team)
        .slice(-options.historyWindow)
        .map(m => toTeamMatch(m, m.home === team ? "home" : "away"));

      const homeHistory = historyFor(fixture.home);
      const awayHistory = historyFor(fixture.away);
      const leagueHistory = prior.slice(-options.leagueWindow).map(m => ({
        date: m.date,
        homeGoals: m.fthg,
        awayGoals: m.ftag,
        halfTimeHomeGoals: m.hthg,
        halfTimeAwayGoals: m.htag
      }));

      fixturesEvaluated += 1;
      let result;
      try {
        result = engine.runEngine({
          match: { homeTeam: fixture.home, awayTeam: fixture.away, date: fixture.date },
          strict: options.strict,
          homeMatches: homeHistory,
          awayMatches: awayHistory,
          leagueMatches: leagueHistory,
          context: { weatherRisk: 0, lineupRisk: 0, motivationRisk: 0, pitchRisk: 0, rotationRisk: 0 },
          metadata: { competition: league, season: options.season, source: path.basename(filePath) }
        });
      } catch (error) {
        noBets.push({ league, date: fixture.date, fixture: `${fixture.home} v ${fixture.away}`, reason: `ERROR: ${error.message}` });
        continue;
      }

      if (result.decision !== "BET") {
        noBets.push({ league, date: fixture.date, fixture: `${fixture.home} v ${fixture.away}`, reason: result.reason });
        continue;
      }

      const settlement = settle(result.selected.marketId, fixture);
      const outcome = settlement === true ? "W" : settlement === false ? "L" : settlement === "PUSH" ? "P" : "U";
      bets.push({
        league,
        date: fixture.date,
        fixture: `${fixture.home} v ${fixture.away}`,
        result: `${fixture.fthg}-${fixture.ftag} (HT ${fixture.hthg}-${fixture.htag})`,
        market: result.selected.marketId,
        score: result.selected.score,
        grade: result.selected.grade,
        outcome,
        selectionRule: result.selectionRule,
        availability: result.context.availability
      });
    }
  }

  const wins = bets.filter(b => b.outcome === "W").length;
  const losses = bets.filter(b => b.outcome === "L").length;
  const pushes = bets.filter(b => b.outcome === "P").length;
  const unknown = bets.filter(b => b.outcome === "U").length;
  const settled = wins + losses;
  const summary = {
    engine: engine.ENGINE_NAME || path.basename(options.engine),
    generatedAt: new Date().toISOString(),
    options: {
      ...options,
      engine: path.relative(process.cwd(), path.resolve(options.engine)) || ".",
      dataDir: path.relative(process.cwd(), path.resolve(options.dataDir)) || ".",
      outputDir: path.relative(process.cwd(), path.resolve(options.outputDir)) || "."
    },
    leagues,
    fixturesEvaluated,
    bets: bets.length,
    wins,
    losses,
    pushes,
    unknown,
    hitRateSettled: settled ? wins / settled : null,
    coverage: fixturesEvaluated ? bets.length / fixturesEvaluated : 0,
    warning: unknown > 0
      ? "Unknown settlements are excluded from hit rate. Supply event-level lead data to settle those markets."
      : null
  };

  fs.mkdirSync(options.outputDir, { recursive: true });
  fs.writeFileSync(path.join(options.outputDir, "backtest_summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(options.outputDir, "all_bets.json"), JSON.stringify(bets, null, 2));
  fs.writeFileSync(path.join(options.outputDir, "no_bets.json"), JSON.stringify(noBets, null, 2));
  writeCsv(path.join(options.outputDir, "all_bets.csv"), bets);
  return { summary, bets, noBets };
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) { console.log(usage()); return; }
    const { summary } = runBacktest(options);
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    console.error(`Backtest error: ${error.message}`);
    console.error("\n" + usage());
    process.exit(1);
  }
}

if (require.main === module) main();
module.exports = { parseCsv, loadLeagueCsv, toTeamMatch, settle, runBacktest, parseArgs };
