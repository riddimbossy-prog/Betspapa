export const EARLY_SEASON_WINDOW = 5;

export function buildEarlySeasonFlag({
  homePlayed = 0,
  awayPlayed = 0,
  homeName = "Home",
  awayName = "Away"
} = {}) {
  const homeMatchNumber = Math.max(1, Number(homePlayed) + 1);
  const awayMatchNumber = Math.max(1, Number(awayPlayed) + 1);
  const homeEarly = homeMatchNumber <= EARLY_SEASON_WINDOW;
  const awayEarly = awayMatchNumber <= EARLY_SEASON_WINDOW;
  if (!homeEarly && !awayEarly) return null;

  const sides = [
    homeEarly ? `${homeName} is on league match ${homeMatchNumber} of ${EARLY_SEASON_WINDOW}` : null,
    awayEarly ? `${awayName} is on league match ${awayMatchNumber} of ${EARLY_SEASON_WINDOW}` : null
  ].filter(Boolean);

  return {
    level: "red",
    code: "EARLY_SEASON",
    label: "EARLY SEASON",
    window: EARLY_SEASON_WINDOW,
    homePlayed: Number(homePlayed) || 0,
    awayPlayed: Number(awayPlayed) || 0,
    homeMatchNumber,
    awayMatchNumber,
    homeEarly,
    awayEarly,
    reason: `Red flag: first ${EARLY_SEASON_WINDOW} league matches. ${sides.join("; ")}.`
  };
}

export function playedBeforeKickoff(games = [], kickoff) {
  const cutoff = new Date(kickoff || 0).getTime();
  if (!Number.isFinite(cutoff)) return 0;
  return games.filter((game) => {
    const time = new Date(game.date || game.fixture_date || 0).getTime();
    return Number.isFinite(time) && time < cutoff;
  }).length;
}
