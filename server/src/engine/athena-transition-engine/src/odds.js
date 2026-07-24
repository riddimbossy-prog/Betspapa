export function assessOddsConflict(input, classification, config) {
  if (!config.useOddsAsConfirmation || !input.odds || !classification.side) {
    return { conflict: false, favorite: null, ratio: null };
  }

  const { home, away } = input.odds;
  if (!Number.isFinite(home) || !Number.isFinite(away) || home <= 1 || away <= 1) {
    return { conflict: false, favorite: null, ratio: null };
  }

  const favorite = home < away ? 'HOME' : 'AWAY';
  const engineSide = classification.side;
  const ratio = engineSide === 'HOME' ? away / home : home / away;

  return {
    conflict: favorite !== engineSide && ratio >= config.marketOddsConflictRatio,
    favorite,
    ratio
  };
}
