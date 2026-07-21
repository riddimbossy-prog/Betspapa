function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decimalOdd(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : null;
}

function detectLine(text) {
  if (/over\s*0[ ._-]?5/.test(text) || /o\s*0[ ._-]?5/.test(text)) return "over05";
  if (/over\s*1[ ._-]?5/.test(text) || /o\s*1[ ._-]?5/.test(text)) return "over15";
  return null;
}

function detectSide({ betName, valueName, homeName, awayName }) {
  const combined = `${betName} ${valueName}`;
  const home = normalizeText(homeName);
  const away = normalizeText(awayName);

  if (/home team total|home total|team 1 total|1st team total/.test(betName)) return "home";
  if (/away team total|away total|team 2 total|2nd team total/.test(betName)) return "away";
  if (/\bhome\b|\bteam 1\b|\b1st team\b/.test(valueName)) return "home";
  if (/\baway\b|\bteam 2\b|\b2nd team\b/.test(valueName)) return "away";
  if (home && combined.includes(home)) return "home";
  if (away && combined.includes(away)) return "away";
  return null;
}

function median(values) {
  const sorted = values
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 1)
    .sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return Number(sorted[middle].toFixed(3));
  return Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(3));
}

export function extractTeamGoalOdds(providerRows, { homeName, awayName } = {}) {
  const collected = {
    home: { over05: [], over15: [] },
    away: { over05: [], over15: [] }
  };
  let bookmakerCount = 0;

  for (const event of providerRows || []) {
    for (const bookmaker of event?.bookmakers || []) {
      bookmakerCount += 1;
      for (const bet of bookmaker?.bets || []) {
        const betName = normalizeText(bet?.name);
        for (const value of bet?.values || []) {
          const valueName = normalizeText(value?.value);
          const line = detectLine(`${betName} ${valueName}`);
          if (!line) continue;
          const side = detectSide({ betName, valueName, homeName, awayName });
          if (!side) continue;
          const odd = decimalOdd(value?.odd);
          if (odd) collected[side][line].push(odd);
        }
      }
    }
  }

  return {
    source: "api-football",
    status: bookmakerCount ? "available" : "unavailable",
    bookmakerCount,
    teamGoals: {
      home: {
        over05: median(collected.home.over05),
        over15: median(collected.home.over15)
      },
      away: {
        over05: median(collected.away.over05),
        over15: median(collected.away.over15)
      }
    }
  };
}
