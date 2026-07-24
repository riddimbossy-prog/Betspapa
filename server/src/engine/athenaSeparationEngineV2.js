export const ATHENA_SEPARATION_VERSION = "2.0.0";

export const SEPARATION_TYPES = Object.freeze({
  EARLY: "EARLY_SEPARATION",
  LATE: "LATE_SEPARATION",
  MIXED: "MIXED_SEPARATION",
  GOAL_ONLY: "GOAL_ONLY_HIGH_EVENT",
  CONTROLLED: "CONTROLLED_SEPARATION",
  NONE: "NO_SEPARATION_SIGNAL"
});

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function avg(values) {
  const valid = values.map((v) => Number(v)).filter(Number.isFinite);
  return valid.length ? valid.reduce((a,b)=>a+b,0)/valid.length : 0;
}

export function evaluateAthenaSeparationV2(result) {
  const r = result?.routes || {};
  const home = result?.metrics?.home || {};
  const away = result?.metrics?.away || {};
  const classification = result?.classification || {};
  const earlyLeadMass = finite(r.homeWW?.adjusted) + finite(r.awayWW?.adjusted);
  const lateWinMass = finite(r.homeDW?.adjusted) + finite(r.awayDW?.adjusted);
  const reversalMass = finite(r.homeLW?.adjusted) + finite(r.awayLW?.adjusted);
  const htDrawPressure = avg([home.htDrawRate, away.htDrawRate]);
  const over25 = finite(classification.combinedOver25);
  const avgGoals = finite(classification.combinedAvgGoals);
  const highEvent = over25 >= 0.60 && avgGoals >= 2.8;

  let type = SEPARATION_TYPES.NONE;
  let confidence = 0;
  const reasons = [];

  if (highEvent) {
    const earlyStrong = earlyLeadMass >= 0.24 && earlyLeadMass >= lateWinMass + 0.06 && htDrawPressure < 0.46;
    const lateStrong = lateWinMass >= 0.18 && (htDrawPressure >= 0.40 || lateWinMass >= earlyLeadMass + 0.05);
    const mixed = (earlyLeadMass >= 0.18 && lateWinMass >= 0.14) || ((earlyLeadMass + lateWinMass) >= 0.20 && Math.abs(earlyLeadMass-lateWinMass) < 0.05);
    if (earlyStrong) {
      type = SEPARATION_TYPES.EARLY;
      confidence = Math.min(100, Math.round(58 + earlyLeadMass*90 + (0.46-htDrawPressure)*35));
      reasons.push("Leader-at-half-time routes dominate the shared HT/FT structure.");
    } else if (lateStrong) {
      type = SEPARATION_TYPES.LATE;
      confidence = Math.min(100, Math.round(58 + lateWinMass*100 + htDrawPressure*22));
      reasons.push("Draw-at-half-time to full-time winner routes dominate the shared HT/FT structure.");
    } else if (mixed) {
      type = SEPARATION_TYPES.MIXED;
      confidence = Math.min(100, Math.round(55 + (earlyLeadMass+lateWinMass)*70));
      reasons.push("Both early-lead and late-break routes are credible, so timing is mixed.");
    } else {
      type = SEPARATION_TYPES.GOAL_ONLY;
      confidence = Math.min(100, Math.round(52 + over25*35 + Math.max(0,avgGoals-2.8)*10));
      reasons.push("The goal environment is strong, but HT/FT timing routes do not identify when separation should occur.");
    }
  } else if (avgGoals <= 2.8) {
    type = SEPARATION_TYPES.CONTROLLED;
    confidence = Math.min(100, Math.round(55 + Math.max(0,2.8-avgGoals)*18));
    reasons.push("The combined goal profile supports controlled rather than high-event separation.");
  }

  return {
    version: ATHENA_SEPARATION_VERSION, type, confidence, highEvent,
    earlyLeadMass, lateWinMass, reversalMass, htDrawPressure, over25, averageGoals: avgGoals,
    firstHalfExpectation: type === SEPARATION_TYPES.EARLY ? "ACTIVE" : type === SEPARATION_TYPES.LATE ? "CAUTIOUS" : "NEUTRAL",
    reasons
  };
}
