const TRANSITION_KEYS = ['ww', 'wd', 'wl', 'dw', 'dd', 'dl', 'lw', 'ld', 'll'];

function assertNonNegativeNumber(value, path) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${path} must be a non-negative finite number`);
  }
}

function validateTeam(team, path) {
  if (!team || typeof team !== 'object') throw new TypeError(`${path} must be an object`);
  if (!team.name || typeof team.name !== 'string') throw new TypeError(`${path}.name is required`);
  assertNonNegativeNumber(team.matchesPlayed, `${path}.matchesPlayed`);
  if (!team.htft || typeof team.htft !== 'object') throw new TypeError(`${path}.htft is required`);

  let total = 0;
  for (const key of TRANSITION_KEYS) {
    assertNonNegativeNumber(team.htft[key], `${path}.htft.${key}`);
    total += team.htft[key];
  }

  if (Math.abs(total - team.matchesPlayed) > 0.001) {
    throw new RangeError(`${path}.htft counts (${total}) must equal matchesPlayed (${team.matchesPlayed})`);
  }

  if (team.goals) {
    const goalKeys = ['over25', 'under25', 'averageTotalGoals', 'goalsFor', 'goalsAgainst'];
    for (const key of goalKeys) {
      if (team.goals[key] !== undefined) assertNonNegativeNumber(team.goals[key], `${path}.goals.${key}`);
    }
    if (team.goals.over25 !== undefined && team.goals.under25 !== undefined) {
      const totalOU = team.goals.over25 + team.goals.under25;
      if (Math.abs(totalOU - team.matchesPlayed) > 0.001) {
        throw new RangeError(`${path}.goals over25 + under25 must equal matchesPlayed`);
      }
    }
  }
}

export function validateFixture(input) {
  if (!input || typeof input !== 'object') throw new TypeError('fixture input must be an object');
  validateTeam(input.home, 'home');
  validateTeam(input.away, 'away');
  if (input.odds) {
    for (const key of ['home', 'draw', 'away']) {
      if (input.odds[key] !== undefined) assertNonNegativeNumber(input.odds[key], `odds.${key}`);
    }
  }
  return true;
}
