export const TRANSITION_SAFETY_VERSION = "transition-safety-v1.0.0";
export const TRANSITION_RULES = Object.freeze({
  sample: 5,
  leakRedirectRate: 80,
  win: {
    weakConcedeFirstRate: 60,
    weakStayDownRate: 60,
    strongScoreFirstRate: 60,
    strongScoreFirstWinRate: 60,
    strongLeadHoldRate: 60,
    strongComebackWinRate: 50
  },
  notLose: {
    weakConcedeFirstRate: 40,
    weakStayDownRate: 50,
    strongScoreFirstRate: 40,
    strongScoreFirstNonLossRate: 80,
    strongComebackNonLossRate: 50
  }
});

const TEAM_SIDE_RULES = Object.freeze({
  "home-win": { side: "home", mode: "win" },
  "away-win": { side: "away", mode: "win" },
  "home-dnb": { side: "home", mode: "not-lose" },
  "away-dnb": { side: "away", mode: "not-lose" },
  "home-1x": { side: "home", mode: "not-lose" },
  "away-x2": { side: "away", mode: "not-lose" },
  "home-win-either-half": { side: "home", mode: "win" },
  "away-win-either-half": { side: "away", mode: "win" },
  "ht-home": { side: "home", mode: "win" },
  "ht-away": { side: "away", mode: "win" },
  "ht-home-or-draw": { side: "home", mode: "not-lose" },
  "ht-away-or-draw": { side: "away", mode: "not-lose" },
  "home-second-half-dnb": { side: "home", mode: "not-lose" },
  "away-second-half-dnb": { side: "away", mode: "not-lose" }
});

export const LEAK_GOAL_FALLBACK_KEYS = Object.freeze(["gg-yes", "over-25", "over-15"]);

function finite(value) {
  return Number.isFinite(Number(value));
}

function passes(value, minimum) {
  return finite(value) && Number(value) >= Number(minimum);
}

function row(ok, key, label, value, required = true) {
  return { ok: Boolean(ok), key, label, value: value ?? null, required };
}

export function teamSideTransitionRule(key) {
  return TEAM_SIDE_RULES[String(key || "")] || null;
}

export function evaluateTransitionSafety({
  stronger,
  weaker,
  mode = "win",
  strongerName = "Stronger team",
  weakerName = "Weaker team"
} = {}) {
  const rules = mode === "not-lose" ? TRANSITION_RULES.notLose : TRANSITION_RULES.win;
  const checks = [
    row(stronger?.ready === true, "strong-sample", `${strongerName}: complete ordered-goal coverage for the last five venue matches`, stronger?.covered),
    row(weaker?.ready === true, "weak-sample", `${weakerName}: complete ordered-goal coverage for the last five venue matches`, weaker?.covered)
  ];

  if (stronger?.ready !== true || weaker?.ready !== true) {
    return {
      version: TRANSITION_SAFETY_VERSION,
      allowed: false,
      redirectGoals: false,
      mode,
      reason: "transition-evidence-incomplete",
      checks,
      stronger: stronger || null,
      weaker: weaker || null
    };
  }

  // Strictly GREATER than 80%. With a five-match sample this means 5/5.
  const leak = finite(stronger.concededMatchRate) &&
    Number(stronger.concededMatchRate) > TRANSITION_RULES.leakRedirectRate;

  checks.push(row(
    !leak,
    "strong-leak",
    `${strongerName}: conceded in ${stronger.concededMatchRate}% of the last five; a team-side pick is forbidden above 80%`,
    stronger.concededMatchRate
  ));
  checks.push(row(
    passes(weaker.concedeFirstRate, rules.weakConcedeFirstRate),
    "weak-concede-first",
    `${weakerName}: concede-first rate`,
    weaker.concedeFirstRate
  ));
  checks.push(row(
    passes(weaker.stayDownRate, rules.weakStayDownRate),
    "weak-stay-down",
    `${weakerName}: loses after conceding first`,
    weaker.stayDownRate
  ));
  checks.push(row(
    passes(stronger.scoreFirstRate, rules.strongScoreFirstRate),
    "strong-score-first",
    `${strongerName}: score-first rate`,
    stronger.scoreFirstRate
  ));

  if (mode === "not-lose") {
    checks.push(row(
      passes(stronger.scoreFirstNonLossRate, rules.strongScoreFirstNonLossRate),
      "strong-score-first-nonloss",
      `${strongerName}: avoids defeat after scoring first`,
      stronger.scoreFirstNonLossRate
    ));
    const comebackRequired = Number(stronger.concededFirst || 0) >= 2;
    checks.push(row(
      !comebackRequired || passes(stronger.comebackNonLossRate, rules.strongComebackNonLossRate),
      "strong-comeback-nonloss",
      `${strongerName}: recovers to avoid defeat after conceding first`,
      stronger.comebackNonLossRate,
      comebackRequired
    ));
  } else {
    checks.push(row(
      passes(stronger.scoreFirstWinRate, rules.strongScoreFirstWinRate),
      "strong-score-first-win",
      `${strongerName}: converts score-first games into wins`,
      stronger.scoreFirstWinRate
    ));
    checks.push(row(
      passes(stronger.leadHoldRate, rules.strongLeadHoldRate),
      "strong-lead-hold",
      `${strongerName}: keeps the lead without surrendering it`,
      stronger.leadHoldRate
    ));
    const comebackRequired = Number(stronger.concededFirst || 0) >= 2;
    checks.push(row(
      !comebackRequired || passes(stronger.comebackWinRate, rules.strongComebackWinRate),
      "strong-comeback-win",
      `${strongerName}: comeback-to-win rate after conceding first`,
      stronger.comebackWinRate,
      comebackRequired
    ));
  }

  const allowed = !leak && checks.filter((check) => check.required).every((check) => check.ok);
  return {
    version: TRANSITION_SAFETY_VERSION,
    allowed,
    redirectGoals: leak,
    mode,
    reason: leak
      ? "stronger-team-leaks-over-80"
      : allowed
        ? "transition-safety-passed"
        : "transition-safety-failed",
    checks,
    stronger,
    weaker
  };
}

function blocker(gate) {
  if (gate.reason === "transition-evidence-incomplete") {
    return "Hard transition gate: ordered goal-event coverage is incomplete for the required last-five venue sample.";
  }
  if (gate.redirectGoals) {
    return "Hard transition gate: the stronger side conceded in more than 80% of its last five venue matches, so team-result markets are redirected to independently qualified BTTS/Over 2.5/Over 1.5 only.";
  }
  const failed = (gate.checks || []).filter((check) => check.required && !check.ok).map((check) => check.label);
  return `Hard transition gate failed: ${failed.join("; ") || "score-first, lead-hold, comeback or weaker-team stay-down evidence was not strong enough"}.`;
}

export function applyTransitionSafetyToMarkets(markets = [], transitionProfiles = null, input = {}) {
  if (!transitionProfiles?.home || !transitionProfiles?.away) {
    const output = markets.map((market) => {
      const rule = teamSideTransitionRule(market?.key);
      if (!rule) return market;
      const gate = evaluateTransitionSafety({
        stronger: null,
        weaker: null,
        mode: rule.mode,
        strongerName: rule.side === "home" ? input?.home?.name : input?.away?.name,
        weakerName: rule.side === "home" ? input?.away?.name : input?.home?.name
      });
      return {
        ...market,
        qualified: false,
        fallbackEligible: false,
        blockers: [...new Set([...(market.blockers || []), blocker(gate)])],
        transitionSafety: gate
      };
    });
    return { markets: output, leakRedirect: false, audit: { ready: false, reason: "transition-evidence-incomplete" } };
  }

  let leakRedirect = false;
  const gates = {};
  let output = markets.map((market) => {
    const rule = teamSideTransitionRule(market?.key);
    if (!rule) return market;
    const opposite = rule.side === "home" ? "away" : "home";
    const gateKey = `${rule.side}:${rule.mode}`;
    const gate = gates[gateKey] || evaluateTransitionSafety({
      stronger: transitionProfiles[rule.side],
      weaker: transitionProfiles[opposite],
      mode: rule.mode,
      strongerName: input?.[rule.side]?.name || rule.side,
      weakerName: input?.[opposite]?.name || opposite
    });
    gates[gateKey] = gate;
    if (gate.redirectGoals) leakRedirect = true;
    if (gate.allowed) {
      return {
        ...market,
        reasons: [...new Set([...(market.reasons || []), "Hard transition gate passed before this team-side decision."])],
        transitionSafety: gate
      };
    }
    return {
      ...market,
      qualified: false,
      fallbackEligible: false,
      blockers: [...new Set([...(market.blockers || []), blocker(gate)])],
      transitionSafety: gate
    };
  });

  // Once the explicit >80% leak rule is triggered, the result family is not
  // allowed to sneak back in through a different Papa engine or fallback.
  // Only already-qualified GG/O2.5/O1.5 candidates remain selectable.
  if (leakRedirect) {
    output = output.map((market) => {
      const permitted = LEAK_GOAL_FALLBACK_KEYS.includes(String(market?.key || ""));
      if (permitted) return market;
      return {
        ...market,
        qualified: false,
        fallbackEligible: false,
        blockers: [...new Set([...(market.blockers || []), "Leak redirect active: only independently qualified BTTS Yes, Over 2.5 or Over 1.5 may replace the team-side call."])]
      };
    });
  }

  return {
    markets: output,
    leakRedirect,
    audit: {
      ready: transitionProfiles.home.ready === true && transitionProfiles.away.ready === true,
      sampleBasis: transitionProfiles.sampleBasis || "last-5-venue-split",
      leakRedirect,
      permittedGoalFallbacks: leakRedirect ? [...LEAK_GOAL_FALLBACK_KEYS] : [],
      gates
    }
  };
}
