export const COMPETITION_TYPES = Object.freeze({
  LEAGUE: "LEAGUE",
  CUP: "CUP",
  FRIENDLY: "FRIENDLY",
  UNKNOWN: "UNKNOWN"
});

const FRIENDLY_PATTERN = /\b(friendl(?:y|ies)|club friendlies|international friendlies|pre[-\s]?season|training match|testimonial)\b/i;
const CUP_PATTERN = /\b(cup|copa|coupe|coppa|pokal|trophy|shield|ta[cç]a|taca|kupa|kubok|beker|supercopa|super cup|champions league|europa league|conference league|libertadores|sudamericana|club world cup|world cup|nations cup|gold cup|asian cup|africa cup|afcon|knockout|play[-\s]?off cup)\b/i;

function clean(value) {
  return String(value || "").trim();
}

export function normalizeProviderCompetitionType(value) {
  const type = clean(value).toLowerCase();
  if (!type) return COMPETITION_TYPES.UNKNOWN;
  if (type === "league") return COMPETITION_TYPES.LEAGUE;
  if (type === "cup") return COMPETITION_TYPES.CUP;
  if (type.includes("friend")) return COMPETITION_TYPES.FRIENDLY;
  return COMPETITION_TYPES.UNKNOWN;
}

export function classifyCompetitionName(name) {
  const value = clean(name);
  if (!value) return COMPETITION_TYPES.UNKNOWN;
  if (FRIENDLY_PATTERN.test(value)) return COMPETITION_TYPES.FRIENDLY;
  if (CUP_PATTERN.test(value)) return COMPETITION_TYPES.CUP;
  return COMPETITION_TYPES.UNKNOWN;
}

export function resolveCompetitionType({ providerType = null, name = "", storedType = null } = {}) {
  // An explicit cup/friendly name is a hard exclusion even if stale provider
  // metadata incorrectly labels the competition as a league.
  const named = classifyCompetitionName(name);
  if ([COMPETITION_TYPES.CUP, COMPETITION_TYPES.FRIENDLY].includes(named)) return named;

  const provider = normalizeProviderCompetitionType(providerType);
  if (provider !== COMPETITION_TYPES.UNKNOWN) return provider;

  const stored = clean(storedType).toUpperCase();
  if (Object.values(COMPETITION_TYPES).includes(stored) && stored !== COMPETITION_TYPES.UNKNOWN) {
    return stored;
  }

  return named;
}

export function competitionPolicy(league = {}) {
  const type = resolveCompetitionType({
    providerType: league.providerType || league.type,
    storedType: league.competition_type || league.competitionType,
    name: league.name
  });

  const explicitEnabled = league.prediction_enabled ?? league.predictionEnabled;
  if (explicitEnabled === false) {
    return {
      eligible: false,
      type,
      reason: league.prediction_exclusion_reason || league.predictionExclusionReason || "Competition disabled for predictions"
    };
  }

  if (type !== COMPETITION_TYPES.LEAGUE) {
    const reason = type === COMPETITION_TYPES.FRIENDLY
      ? "Friendly matches are excluded from every prediction engine"
      : type === COMPETITION_TYPES.CUP
        ? "Cup and knockout matches are excluded from every prediction engine"
        : "Competition type is unverified; predictions stay blocked until it is confirmed as a league";
    return { eligible: false, type, reason };
  }

  return { eligible: true, type, reason: null };
}

export function competitionStorageFields({ providerType = null, name = "", storedType = null } = {}) {
  const type = resolveCompetitionType({ providerType, name, storedType });
  const eligible = type === COMPETITION_TYPES.LEAGUE;
  const providerResolved = normalizeProviderCompetitionType(providerType);
  const nameResolved = classifyCompetitionName(name);
  const verified = providerResolved !== COMPETITION_TYPES.UNKNOWN ||
    [COMPETITION_TYPES.CUP, COMPETITION_TYPES.FRIENDLY].includes(nameResolved);
  return {
    competition_type: type,
    prediction_enabled: eligible,
    prediction_exclusion_reason: eligible
      ? null
      : type === COMPETITION_TYPES.FRIENDLY
        ? "Friendly competition"
        : type === COMPETITION_TYPES.CUP
          ? "Cup or knockout competition"
          : "Competition type awaiting verification",
    ...(verified ? { competition_type_verified_at: new Date().toISOString() } : {})
  };
}
