import { HTFT_CODE } from "./overhaulConstants.js";
import { evaluateNoDrawPolicy } from "./noDrawPolicy.js";
import { clamp, round, sum } from "./utils.js";

const HOME_WIN_ROUTES = ["WW", "DW", "LW"];
const DRAW_ROUTES = ["WD", "DD", "LD"];
const AWAY_WIN_ROUTES = ["WL", "DL", "LL"];
const FORCED_GG_ROUTES = ["WD", "WL", "LW", "LD"];
const REVERSAL_ROUTES = ["WL", "LW"];
const HT_DRAW_ROUTES = ["DW", "DD", "DL"];
const HOME_SCORES_ROUTES = ["WW", "WD", "WL", "DW", "LW", "LD"];
const AWAY_SCORES_ROUTES = ["LL", "LD", "LW", "DL", "WL", "WD"];
const SECOND_HALF_CHANGE_ROUTES = ["WD", "WL", "DW", "DL", "LW", "LD"];

function mass(p, routes) {
  return sum(routes.map((route) => Number(p[route] || 0)));
}

function routeList(p, routes, minimum = 0.045) {
  return routes
    .filter((route) => Number(p[route] || 0) >= minimum)
    .sort((a, b) => Number(p[b] || 0) - Number(p[a] || 0))
    .map((route) => ({
      transition: route,
      code: HTFT_CODE[route],
      probability: round(Number(p[route] || 0))
    }));
}

function scaled(value, floor, ceiling) {
  if (ceiling <= floor) return value >= ceiling ? 1 : 0;
  return clamp((Number(value || 0) - floor) / (ceiling - floor));
}

function resultGap(direct, side) {
  const values = Object.entries(direct.ft).sort((a, b) => b[1] - a[1]);
  const selected = Number(direct.ft[side] || 0);
  const strongestOther = Math.max(
    ...values.filter(([key]) => key !== side).map(([, value]) => Number(value || 0))
  );
  return selected - strongestOther;
}

function topRoute(p) {
  return Object.entries(p)
    .map(([transition, probability]) => ({ transition, probability: Number(probability || 0) }))
    .sort((a, b) => b.probability - a.probability)[0];
}

function buildGate({
  eligible,
  score,
  rule,
  triggerRoutes = [],
  contradictionRoutes = [],
  confirmations = [],
  blockers = [],
  triggerMass = null
}) {
  const uniqueBlockers = [...new Set(blockers.filter(Boolean))];
  const finalEligible = Boolean(eligible) && uniqueBlockers.length === 0;
  return {
    eligible: finalEligible,
    score: round(clamp(score)),
    rule,
    triggerRoutes,
    contradictionRoutes,
    triggerMass: triggerMass === null ? null : round(triggerMass),
    confirmations: [...new Set(confirmations.filter(Boolean))],
    blockers: uniqueBlockers
  };
}

function sideGoalContext(side, goals, direct, p) {
  const isHome = side === "home";
  return {
    scoreSupport: isHome ? goals.metrics.homeGoalSupport : goals.metrics.awayGoalSupport,
    twoPlusSupport: isHome ? goals.metrics.home2PlusSupport : goals.metrics.away2PlusSupport,
    under15Score: isHome ? goals.scores.homeUnder15 : goals.scores.awayUnder15,
    winMass: direct.ft[side],
    scoringRoutes: isHome ? HOME_SCORES_ROUTES : AWAY_SCORES_ROUTES,
    reversalRoute: isHome ? "LW" : "WL",
    controlRoutes: isHome ? ["WW", "DW"] : ["LL", "DL"],
    opponentControlRoutes: isHome ? ["LL", "DL"] : ["WW", "DW"]
  };
}

/**
 * HT/FT-first gate. A market may have a strong statistical score, but it is
 * not allowed to qualify unless the required transition structure fires.
 */
export function evaluateHtftGate({ market, matrix, direct, structure, goals, quality }) {
  const p = matrix.normalized;
  const key = market.key;
  const top = topRoute(p);
  const forcedGgMass = mass(p, FORCED_GG_ROUTES);
  const reversalMass = mass(p, REVERSAL_ROUTES);
  const htDrawMass = mass(p, HT_DRAW_ROUTES);
  const secondHalfChangeMass = mass(p, SECOND_HALF_CHANGE_ROUTES);
  const homeScoreMass = mass(p, HOME_SCORES_ROUTES);
  const awayScoreMass = mass(p, AWAY_SCORES_ROUTES);
  const stableMass = Number(structure.stableMass || 0);
  const lowScorePressure = Number(goals.metrics.lowScorePressure || 0);
  const topRouteGap = (() => {
    const values = Object.values(p).map(Number).sort((a, b) => b - a);
    return (values[0] || 0) - (values[1] || 0);
  })();

  if (key === "home-1x" || key === "away-x2") {
    const side = key === "home-1x" ? "home" : "away";
    const opponent = side === "home" ? "away" : "home";
    const dc = side === "home" ? direct.doubleChance.homeOrDraw : direct.doubleChance.awayOrDraw;
    const routes = side === "home" ? [...HOME_WIN_ROUTES, ...DRAW_ROUTES] : [...AWAY_WIN_ROUTES, ...DRAW_ROUTES];
    const score = clamp(dc * 0.76 + (1 - direct.ft[opponent]) * 0.24);
    return buildGate({
      eligible: dc >= 0.58 && direct.ft[opponent] <= 0.42,
      score,
      rule: `${side === "home" ? "Home" : "Away"}-or-draw HT/FT mass must dominate the opponent-win routes.`,
      triggerRoutes: routeList(p, routes),
      contradictionRoutes: routeList(p, side === "home" ? AWAY_WIN_ROUTES : HOME_WIN_ROUTES),
      triggerMass: dc,
      confirmations: [`${side === "home" ? "1X" : "X2"} route mass is ${(dc * 100).toFixed(1)}%.`],
      blockers: [
        ...(direct.ft[opponent] > 0.42 ? ["Opponent-win HT/FT mass is too high for double-chance protection."] : [])
      ]
    });
  }

  if (key === "no-draw") {
    const policy = evaluateNoDrawPolicy({ matrix, direct, structure, goals });
    const meaningful = routeList(p, [...HOME_WIN_ROUTES, ...AWAY_WIN_ROUTES], 0.055);
    return buildGate({
      eligible: policy.eligible,
      score: policy.score,
      rule: "Either Team to Win must be driven by clean decisive HT/FT routes. In high-scoring environments, verified GG or Over 1.5 structures take priority over 12.",
      triggerRoutes: meaningful,
      contradictionRoutes: routeList(p, DRAW_ROUTES),
      triggerMass: policy.decisiveMass,
      confirmations: [
        `Decisive HT/FT mass is ${(policy.decisiveMass * 100).toFixed(1)}%.`,
        `Clean decisive mass is ${(policy.cleanDecisiveMass * 100).toFixed(1)}%.`,
        `${policy.meaningfulDecisiveRoutes} independent win-ending routes are meaningful.`,
        ...(policy.highScoringEnvironment
          ? [`High-scoring environment detected: league O1.5 ${(policy.leagueOver15Rate * 100).toFixed(1)}%, league GG ${(policy.leagueBttsRate * 100).toFixed(1)}%.`]
          : [])
      ],
      blockers: policy.blockers
    });
  }

  if (key === "home-dnb" || key === "away-dnb") {
    const side = key === "home-dnb" ? "home" : "away";
    const dnb = direct.dnb[side];
    const winRoutes = side === "home" ? HOME_WIN_ROUTES : AWAY_WIN_ROUTES;
    const meaningful = routeList(p, winRoutes, 0.05);
    const gap = direct.ft[side] - direct.ft[side === "home" ? "away" : "home"];
    return buildGate({
      eligible: dnb >= 0.55 && gap >= 0.04 && meaningful.length >= 1,
      score: clamp(dnb * 0.78 + scaled(gap, 0, 0.2) * 0.12 + scaled(meaningful.length, 0, 3) * 0.1),
      rule: "After removing the draw, the selected side must lead the opponent and own a credible winning route.",
      triggerRoutes: meaningful,
      contradictionRoutes: routeList(p, side === "home" ? AWAY_WIN_ROUTES : HOME_WIN_ROUTES),
      triggerMass: direct.ft[side],
      confirmations: [`Draw-removed strength is ${(dnb * 100).toFixed(1)}%.`],
      blockers: [
        ...(gap < 0.04 ? ["The selected team does not lead the opponent by enough HT/FT win mass."] : []),
        ...(meaningful.length < 1 ? ["No meaningful winning HT/FT route supports the DNB side."] : [])
      ]
    });
  }

  if (key === "home-win" || key === "away-win") {
    const side = key === "home-win" ? "home" : "away";
    const routes = side === "home" ? HOME_WIN_ROUTES : AWAY_WIN_ROUTES;
    const meaningful = routeList(p, routes, 0.045);
    const gap = resultGap(direct, side);
    return buildGate({
      eligible: direct.ft[side] >= 0.34 && gap >= 0.05 && meaningful.length >= 2,
      score: clamp(
        direct.ft[side] * 0.62 +
        scaled(gap, 0, 0.22) * 0.2 +
        scaled(meaningful.length, 1, 3) * 0.18
      ),
      rule: "A straight win needs the leading full-time mass, separation from draw/opponent, and at least two winning routes.",
      triggerRoutes: meaningful,
      contradictionRoutes: routeList(p, [...DRAW_ROUTES, ...(side === "home" ? AWAY_WIN_ROUTES : HOME_WIN_ROUTES)]),
      triggerMass: direct.ft[side],
      confirmations: [`Selected-side win mass is ${(direct.ft[side] * 100).toFixed(1)}%.`],
      blockers: [
        ...(direct.ft[side] < 0.34 ? ["Selected-side win mass is below the straight-win HT/FT floor."] : []),
        ...(gap < 0.05 ? ["The straight-win direction is not separated from draw or opponent."] : []),
        ...(meaningful.length < 2 ? ["The straight win depends on one narrow HT/FT route."] : [])
      ]
    });
  }

  if (key === "draw") {
    const drawSupport = direct.ft.draw;
    const drawRoutes = routeList(p, DRAW_ROUTES, 0.045);
    return buildGate({
      eligible: drawSupport >= 0.28 && (p.DD >= 0.1 || structure.leadToDrawMass >= 0.12),
      score: clamp(drawSupport * 0.66 + p.DD * 0.2 + structure.leadToDrawMass * 0.14),
      rule: "Full-time draw needs meaningful X/X or lead-to-draw HT/FT routes, not only balanced team strength.",
      triggerRoutes: drawRoutes,
      contradictionRoutes: routeList(p, [...HOME_WIN_ROUTES, ...AWAY_WIN_ROUTES]),
      triggerMass: drawSupport,
      confirmations: [`Draw-ending HT/FT mass is ${(drawSupport * 100).toFixed(1)}%.`],
      blockers: [
        ...(drawSupport < 0.28 ? ["Draw-ending HT/FT mass is below the draw trigger."] : []),
        ...(p.DD < 0.1 && structure.leadToDrawMass < 0.12 ? ["Neither X/X nor lead-to-draw routes are meaningful."] : [])
      ]
    });
  }

  if (key === "home-win-either-half" || key === "away-win-either-half") {
    const side = key.startsWith("home") ? "home" : "away";
    const routes = side === "home"
      ? ["WW", "WD", "WL", "DW", "LW", "LD"]
      : ["LL", "LD", "LW", "DL", "WL", "WD"];
    const routeMass = direct.winEitherHalf[side];
    return buildGate({
      eligible: routeMass >= 0.56 && routeList(p, routes, 0.045).length >= 2,
      score: routeMass,
      rule: "The selected team must have multiple HT/FT routes that guarantee it wins the first or second half.",
      triggerRoutes: routeList(p, routes),
      triggerMass: routeMass,
      confirmations: [`Win-either-half HT/FT mass is ${(routeMass * 100).toFixed(1)}%.`],
      blockers: [
        ...(routeList(p, routes, 0.045).length < 2 ? ["Too few independent half-winning routes are meaningful."] : [])
      ]
    });
  }

  if (key === "draw-either-half") {
    return buildGate({
      eligible: htDrawMass >= 0.48,
      score: htDrawMass,
      rule: "Only X/1, X/X and X/2 are guaranteed to contain a drawn first half; full-time draw alone is not treated as a drawn second half.",
      triggerRoutes: routeList(p, HT_DRAW_ROUTES),
      contradictionRoutes: routeList(p, ["WW", "WD", "WL", "LW", "LD", "LL"]),
      triggerMass: htDrawMass,
      confirmations: [`Half-time draw mass is ${(htDrawMass * 100).toFixed(1)}%.`],
      blockers: [
        ...(htDrawMass < 0.48 ? ["Guaranteed half-time draw routes are below the Draw Either Half trigger."] : [])
      ]
    });
  }

  if (key === "ht-home-or-draw" || key === "ht-away-or-draw") {
    const side = key === "ht-home-or-draw" ? "home" : "away";
    const value = direct.halfTimeDoubleChance[side === "home" ? "homeOrDraw" : "awayOrDraw"];
    return buildGate({
      eligible: value >= 0.64,
      score: value,
      rule: "The selected side must be unlikely to trail at half-time across the compatible HT/FT rows.",
      triggerRoutes: routeList(p, side === "home" ? ["WW", "WD", "WL", "DW", "DD", "DL"] : ["LW", "LD", "LL", "DW", "DD", "DL"]),
      triggerMass: value,
      confirmations: [`Half-time double-chance mass is ${(value * 100).toFixed(1)}%.`]
    });
  }

  if (["ht-home", "ht-draw", "ht-away"].includes(key)) {
    const side = key.replace("ht-", "");
    const value = direct.ht[side];
    const sorted = Object.values(direct.ht).map(Number).sort((a, b) => b - a);
    const gap = value - Math.max(...Object.entries(direct.ht).filter(([name]) => name !== side).map(([, v]) => Number(v)));
    const routes = side === "home" ? ["WW", "WD", "WL"] : side === "draw" ? HT_DRAW_ROUTES : ["LW", "LD", "LL"];
    return buildGate({
      eligible: value >= 0.38 && gap >= 0.05,
      score: clamp(value * 0.76 + scaled(gap, 0, 0.2) * 0.24),
      rule: "A half-time result needs the largest HT row and clear separation from the next state.",
      triggerRoutes: routeList(p, routes),
      triggerMass: value,
      confirmations: [`Half-time state mass is ${(value * 100).toFixed(1)}%; separation is ${(gap * 100).toFixed(1)} points.`],
      blockers: [
        ...(gap < 0.05 ? ["Half-time states are not separated enough."] : []),
        ...(sorted[0] !== value ? ["Selected half-time state is not the leading HT row."] : [])
      ]
    });
  }

  if (key === "exact-htft") {
    return buildGate({
      eligible: top.probability >= 0.19 && topRouteGap >= 0.045 && quality.score >= 0.62,
      score: clamp(top.probability * 0.68 + scaled(topRouteGap, 0, 0.16) * 0.22 + quality.score * 0.1),
      rule: "Exact HT/FT needs one dominant compatible route, a clear gap, and good sample quality.",
      triggerRoutes: [{ transition: top.transition, code: HTFT_CODE[top.transition], probability: round(top.probability) }],
      triggerMass: top.probability,
      confirmations: [`Top exact route ${HTFT_CODE[top.transition]} carries ${(top.probability * 100).toFixed(1)}%.`],
      blockers: [
        ...(topRouteGap < 0.045 ? ["Top two exact HT/FT routes are too close."] : []),
        ...(quality.score < 0.62 ? ["Sample quality is too weak for an exact HT/FT call."] : [])
      ]
    });
  }

  if (key === "gg-yes") {
    const meaningfulForced = routeList(p, FORCED_GG_ROUTES, 0.04);
    const score = clamp(
      scaled(forcedGgMass, 0.08, 0.3) * 0.58 +
      goals.metrics.twoSidedGoalFloor * 0.24 +
      goals.metrics.latestGgAgreement * 0.18
    );
    return buildGate({
      eligible: forcedGgMass >= 0.12 && meaningfulForced.length >= 1 && goals.metrics.twoSidedGoalFloor >= 0.55,
      score,
      rule: "GG starts from 1/X, 1/2, 2/1 and 2/X, because those HT/FT routes require both teams to score.",
      triggerRoutes: meaningfulForced,
      contradictionRoutes: routeList(p, ["WW", "DW", "DD", "DL", "LL"]),
      triggerMass: forcedGgMass,
      confirmations: [
        `Forced-GG HT/FT mass is ${(forcedGgMass * 100).toFixed(1)}%.`,
        `Two-sided scoring floor is ${(goals.metrics.twoSidedGoalFloor * 100).toFixed(1)}%.`
      ],
      blockers: [
        ...(forcedGgMass < 0.12 ? ["Forced-GG HT/FT routes are not strong enough."] : []),
        ...(goals.metrics.twoSidedGoalFloor < 0.55 ? ["One team lacks an independent scoring route."] : [])
      ]
    });
  }

  if (key === "gg-no") {
    const strongestShutout = Math.max(goals.metrics.homeShutoutSupport, goals.metrics.awayShutoutSupport);
    const score = clamp(
      scaled(stableMass, 0.2, 0.62) * 0.36 +
      (1 - scaled(forcedGgMass, 0.08, 0.3)) * 0.28 +
      strongestShutout * 0.24 +
      (1 - goals.metrics.twoSidedGoalFloor) * 0.12
    );
    return buildGate({
      eligible: stableMass >= 0.24 && forcedGgMass <= 0.24 && strongestShutout >= 0.42,
      score,
      rule: "GG No requires stable/no-reversal HT/FT structure plus a credible clean-sheet or failed-to-score path.",
      triggerRoutes: routeList(p, ["WW", "DD", "LL", "DW", "DL"]),
      contradictionRoutes: routeList(p, FORCED_GG_ROUTES),
      triggerMass: stableMass,
      confirmations: [
        `Stable HT/FT mass is ${(stableMass * 100).toFixed(1)}%.`,
        `Strongest shutout route is ${(strongestShutout * 100).toFixed(1)}%.`
      ],
      blockers: [
        ...(forcedGgMass > 0.24 ? ["Too much HT/FT mass guarantees both teams score."] : []),
        ...(strongestShutout < 0.42 ? ["No credible clean-sheet/failed-to-score route exists."] : [])
      ]
    });
  }

  if (key === "over-15") {
    const homeControlMass = p.WW + p.DW;
    const awayControlMass = p.LL + p.DL;
    const strongestControlMass = Math.max(homeControlMass, awayControlMass);
    const homeControlTwoGoalRoute = homeControlMass * goals.metrics.home2PlusSupport;
    const awayControlTwoGoalRoute = awayControlMass * goals.metrics.away2PlusSupport;
    const oneSideTwoGoalHtft = Math.max(homeControlTwoGoalRoute, awayControlTwoGoalRoute);
    const meaningfulForced = routeList(p, FORCED_GG_ROUTES, 0.045);
    const forcedRouteFires = forcedGgMass >= 0.12 && meaningfulForced.length >= 1;
    const oneTeamRouteFires =
      strongestControlMass >= 0.2 &&
      oneSideTwoGoalHtft >= 0.1 &&
      Math.max(goals.metrics.home2PlusSupport, goals.metrics.away2PlusSupport) >= 0.55 &&
      goals.metrics.strongestGoalRoute >= 0.66;
    const dominantXxWithoutSeparateRoute =
      top.transition === "DD" &&
      p.DD >= 0.25 &&
      forcedGgMass < 0.18 &&
      !oneTeamRouteFires;
    const triggerScore = clamp(
      scaled(forcedGgMass, 0.1, 0.3) * 0.64 +
      scaled(oneSideTwoGoalHtft, 0.08, 0.22) * 0.36
    );
    return buildGate({
      eligible: forcedRouteFires || oneTeamRouteFires,
      score: triggerScore,
      rule: "Over 1.5 starts from guaranteed two-goal routes (1/X, 1/2, 2/1, 2/X) or one clearly dominant control side backed by strong 2+ scoring support. X/X is never positive evidence.",
      triggerRoutes: routeList(p, [...FORCED_GG_ROUTES, "WW", "DW", "DL", "LL"]),
      contradictionRoutes: routeList(p, ["DD"]),
      triggerMass: forcedGgMass + oneSideTwoGoalHtft,
      confirmations: [
        `Guaranteed two-goal HT/FT mass is ${(forcedGgMass * 100).toFixed(1)}%.`,
        `Strongest one-team control mass is ${(strongestControlMass * 100).toFixed(1)}%.`,
        `Strongest one-team 2+ HT/FT route is ${(oneSideTwoGoalHtft * 100).toFixed(1)}%.`
      ],
      blockers: [
        ...(!forcedRouteFires && !oneTeamRouteFires
          ? ["No guaranteed two-goal route or strong one-team 2+ control route fired."]
          : []),
        ...(dominantXxWithoutSeparateRoute
          ? ["X/X is the leading route and no separate two-goal HT/FT path is strong enough."]
          : [])
      ]
    });
  }

  if (key === "under-15") {
    const stableLowRoute =
      p.DD +
      p.WW * (1 - goals.metrics.home2PlusSupport) +
      p.LL * (1 - goals.metrics.away2PlusSupport);
    const score = clamp(
      scaled(stableLowRoute, 0.12, 0.45) * 0.56 +
      (1 - scaled(forcedGgMass, 0.06, 0.24)) * 0.24 +
      lowScorePressure * 0.2
    );
    return buildGate({
      eligible: stableLowRoute >= 0.15 && forcedGgMass <= 0.18,
      score,
      rule: "Under 1.5 needs X/X or low-output control routes, while guaranteed two-goal HT/FT paths remain suppressed.",
      triggerRoutes: routeList(p, ["DD", "WW", "LL"]),
      contradictionRoutes: routeList(p, FORCED_GG_ROUTES),
      triggerMass: stableLowRoute,
      confirmations: [`Low-output stable HT/FT support is ${(stableLowRoute * 100).toFixed(1)}%.`],
      blockers: [
        ...(forcedGgMass > 0.18 ? ["Guaranteed two-goal HT/FT routes are too active for Under 1.5."] : [])
      ]
    });
  }

  if (key === "over-25") {
    const oneSideThreeGoalPath = Math.max(
      (p.WW + p.DW) * goals.metrics.home2PlusSupport,
      (p.LL + p.DL) * goals.metrics.away2PlusSupport
    );
    const score = clamp(
      scaled(reversalMass, 0.04, 0.18) * 0.58 +
      scaled(forcedGgMass, 0.1, 0.3) * 0.18 +
      scaled(oneSideThreeGoalPath, 0.03, 0.16) * 0.24
    );
    return buildGate({
      eligible:
        reversalMass >= 0.07 ||
        (forcedGgMass >= 0.12 && Math.max(goals.metrics.home2PlusSupport, goals.metrics.away2PlusSupport) >= 0.48) ||
        oneSideThreeGoalPath >= 0.065,
      score,
      rule: "Over 2.5 starts from 1/2 or 2/1 (three goals guaranteed), or from a forced-GG route plus a credible team 2+ path.",
      triggerRoutes: routeList(p, [...REVERSAL_ROUTES, "WD", "LD", "WW", "DW", "DL", "LL"]),
      contradictionRoutes: routeList(p, ["DD"]),
      triggerMass: reversalMass + oneSideThreeGoalPath,
      confirmations: [
        `Full-reversal HT/FT mass is ${(reversalMass * 100).toFixed(1)}%.`,
        `One-sided three-goal path is ${(oneSideThreeGoalPath * 100).toFixed(1)}%.`
      ]
    });
  }

  if (key === "under-25") {
    const ceilingStructure = clamp(
      stableMass * 0.58 +
      p.DD * 0.16 +
      (1 - reversalMass) * 0.18 +
      (1 - forcedGgMass) * 0.08
    );
    return buildGate({
      eligible: stableMass >= 0.28 && reversalMass <= 0.12 && forcedGgMass <= 0.24,
      score: ceilingStructure,
      rule: "Under 2.5 needs stable HT/FT routes and weak comeback/reversal mass before goal records may confirm it.",
      triggerRoutes: routeList(p, ["WW", "DD", "LL", "DW", "DL"]),
      contradictionRoutes: routeList(p, REVERSAL_ROUTES),
      triggerMass: stableMass,
      confirmations: [`Stable HT/FT mass is ${(stableMass * 100).toFixed(1)}%.`],
      blockers: [
        ...(reversalMass > 0.12 ? ["Full-reversal HT/FT routes create too much three-goal risk."] : [])
      ]
    });
  }

  if (key === "over-35") {
    const both2Plus = Math.min(goals.metrics.home2PlusSupport, goals.metrics.away2PlusSupport);
    const highGoalChange = reversalMass + structure.leadToDrawMass;
    return buildGate({
      eligible: highGoalChange >= 0.16 && both2Plus >= 0.46 && goals.metrics.venueU35 <= 0.66,
      score: clamp(scaled(highGoalChange, 0.12, 0.32) * 0.5 + both2Plus * 0.32 + (1 - goals.metrics.venueU35) * 0.18),
      rule: "Over 3.5 needs unusually strong reversal/equalisation HT/FT pressure plus two-team 2+ support; no single HT/FT code guarantees four goals.",
      triggerRoutes: routeList(p, [...REVERSAL_ROUTES, "WD", "LD"]),
      contradictionRoutes: routeList(p, ["DD", "WW", "LL"]),
      triggerMass: highGoalChange,
      confirmations: [`High-goal change-route mass is ${(highGoalChange * 100).toFixed(1)}%.`],
      blockers: [
        ...(both2Plus < 0.46 ? ["Both teams do not have enough 2+ goal support."] : [])
      ]
    });
  }

  if (key === "under-35") {
    const ceilingStructure = clamp(
      stableMass * 0.54 +
      (1 - reversalMass) * 0.22 +
      (1 - structure.leadToDrawMass) * 0.12 +
      p.DD * 0.12
    );
    return buildGate({
      eligible: stableMass >= 0.22 && reversalMass <= 0.16,
      score: ceilingStructure,
      rule: "Under 3.5 requires a stable HT/FT ceiling with limited full-reversal risk before venue and recent U3.5 records confirm it.",
      triggerRoutes: routeList(p, ["WW", "DD", "LL", "DW", "DL"]),
      contradictionRoutes: routeList(p, REVERSAL_ROUTES),
      triggerMass: stableMass,
      confirmations: [`Stable HT/FT ceiling mass is ${(stableMass * 100).toFixed(1)}%.`],
      blockers: [
        ...(reversalMass > 0.16 ? ["Full-reversal routes are too active for an Under 3.5 ceiling."] : [])
      ]
    });
  }

  if (key === "total-2-3") {
    const overGate = evaluateHtftGate({ market: { key: "over-15" }, matrix, direct, structure, goals, quality });
    const underGate = evaluateHtftGate({ market: { key: "under-35" }, matrix, direct, structure, goals, quality });
    return buildGate({
      eligible: overGate.eligible && underGate.eligible,
      score: clamp((overGate.score + underGate.score) / 2),
      rule: "The 2–3 goal corridor opens only when the HT/FT two-goal floor and four-goal ceiling both fire.",
      triggerRoutes: [...overGate.triggerRoutes, ...underGate.triggerRoutes].filter(
        (row, index, rows) => rows.findIndex((item) => item.transition === row.transition) === index
      ),
      confirmations: ["Over 1.5 and Under 3.5 HT/FT gates both passed."],
      blockers: [
        ...(!overGate.eligible ? ["The HT/FT two-goal floor did not fire."] : []),
        ...(!underGate.eligible ? ["The HT/FT four-goal ceiling did not fire."] : [])
      ]
    });
  }

  if (["home-over-05", "away-over-05", "home-over-15", "away-over-15", "home-under-15", "away-under-15", "home-clean-sheet", "away-clean-sheet"].includes(key)) {
    const side = key.startsWith("home-") ? "home" : "away";
    const context = sideGoalContext(side, goals, direct, p);
    const scoreMass = mass(p, context.scoringRoutes);
    const reversalRouteMass = Number(p[context.reversalRoute] || 0);
    const controlMass = mass(p, context.controlRoutes);
    const opponentScoreMass = side === "home" ? awayScoreMass : homeScoreMass;

    if (key.endsWith("over-05")) {
      return buildGate({
        eligible: scoreMass >= 0.5 && context.scoreSupport >= 0.58,
        score: clamp(scoreMass * 0.58 + context.scoreSupport * 0.42),
        rule: "Team Over 0.5 needs HT/FT routes that guarantee the team scores, confirmed by scoring-versus-conceding support.",
        triggerRoutes: routeList(p, context.scoringRoutes),
        triggerMass: scoreMass,
        confirmations: [`Guaranteed team-scoring HT/FT mass is ${(scoreMass * 100).toFixed(1)}%.`]
      });
    }

    if (key.endsWith("over-15")) {
      const teamTwoGoalRoute = reversalRouteMass + controlMass * context.twoPlusSupport;
      return buildGate({
        eligible: teamTwoGoalRoute >= 0.075 && context.twoPlusSupport >= 0.45,
        score: clamp(scaled(teamTwoGoalRoute, 0.04, 0.22) * 0.6 + context.twoPlusSupport * 0.4),
        rule: "Team Over 1.5 needs a comeback route that guarantees two team goals or a control route backed by strong team 2+ evidence.",
        triggerRoutes: routeList(p, [context.reversalRoute, ...context.controlRoutes]),
        triggerMass: teamTwoGoalRoute,
        confirmations: [`Team two-goal HT/FT support is ${(teamTwoGoalRoute * 100).toFixed(1)}%.`],
        blockers: [
          ...(context.twoPlusSupport < 0.45 ? ["Team 2+ scoring support is too weak."] : [])
        ]
      });
    }

    if (key.endsWith("under-15")) {
      const lowTeamRoute = clamp(
        (1 - context.twoPlusSupport) * 0.52 +
        (1 - reversalRouteMass) * 0.2 +
        mass(p, context.opponentControlRoutes) * 0.18 +
        (1 - context.winMass) * 0.1
      );
      return buildGate({
        eligible: context.twoPlusSupport <= 0.5 && reversalRouteMass <= 0.1,
        score: lowTeamRoute,
        rule: "Team Under 1.5 requires weak 2+ support and no meaningful comeback route that guarantees two team goals.",
        triggerRoutes: routeList(p, [...context.opponentControlRoutes, "DD"]),
        contradictionRoutes: routeList(p, [context.reversalRoute, ...context.controlRoutes]),
        triggerMass: lowTeamRoute,
        confirmations: [`Team 2+ support is ${(context.twoPlusSupport * 100).toFixed(1)}%.`]
      });
    }

    if (key.endsWith("clean-sheet")) {
      const shutout = side === "home" ? goals.metrics.homeShutoutSupport : goals.metrics.awayShutoutSupport;
      return buildGate({
        eligible: opponentScoreMass <= 0.5 && forcedGgMass <= 0.22 && shutout >= 0.42,
        score: clamp((1 - opponentScoreMass) * 0.42 + (1 - forcedGgMass) * 0.24 + shutout * 0.34),
        rule: "A clean sheet starts from weak opponent-scoring HT/FT routes and low forced-GG mass, then uses clean-sheet/failed-to-score confirmation.",
        triggerRoutes: routeList(p, side === "home" ? ["WW", "DW", "DD"] : ["LL", "DL", "DD"]),
        contradictionRoutes: routeList(p, side === "home" ? AWAY_SCORES_ROUTES : HOME_SCORES_ROUTES),
        triggerMass: 1 - opponentScoreMass,
        confirmations: [`Opponent guaranteed-scoring HT/FT mass is ${(opponentScoreMass * 100).toFixed(1)}%.`]
      });
    }
  }

  if (key === "first-half-over-05") {
    const firstHalfGoalMass = 1 - direct.ht.draw;
    return buildGate({
      eligible: firstHalfGoalMass >= 0.48,
      score: firstHalfGoalMass,
      rule: "First Half Over 0.5 starts from home-leading or away-leading half-time HT/FT rows; a half-time draw row does not guarantee a goal.",
      triggerRoutes: routeList(p, ["WW", "WD", "WL", "LW", "LD", "LL"]),
      contradictionRoutes: routeList(p, HT_DRAW_ROUTES),
      triggerMass: firstHalfGoalMass,
      confirmations: [`Non-draw half-time HT/FT mass is ${(firstHalfGoalMass * 100).toFixed(1)}%.`]
    });
  }

  if (key === "first-half-over-15") {
    const firstHalfLeadMass = 1 - direct.ht.draw;
    const earlyTwoSide = Math.min(goals.homeGoals.firstHalfScoringRate, goals.awayGoals.firstHalfScoringRate);
    return buildGate({
      eligible: firstHalfLeadMass >= 0.58 && earlyTwoSide >= 0.46 && quality.score >= 0.68,
      score: clamp(firstHalfLeadMass * 0.52 + earlyTwoSide * 0.3 + quality.score * 0.18),
      rule: "First Half Over 1.5 is precision-only: strong non-draw HT structure, two-sided early scoring and good samples must all agree.",
      triggerRoutes: routeList(p, ["WW", "WD", "WL", "LW", "LD", "LL"]),
      contradictionRoutes: routeList(p, HT_DRAW_ROUTES),
      triggerMass: firstHalfLeadMass,
      confirmations: [`Non-draw HT mass is ${(firstHalfLeadMass * 100).toFixed(1)}%.`],
      blockers: [
        ...(quality.score < 0.68 ? ["Data quality is too weak for a first-half two-goal call."] : [])
      ]
    });
  }

  if (key === "second-half-over-05") {
    return buildGate({
      eligible: secondHalfChangeMass >= 0.34,
      score: clamp(secondHalfChangeMass * 0.7 + Math.max(goals.homeGoals.secondHalfScoringRate, goals.awayGoals.secondHalfScoringRate) * 0.3),
      rule: "Second Half Over 0.5 starts from HT/FT routes whose state changes after the break, because those routes require a second-half goal.",
      triggerRoutes: routeList(p, SECOND_HALF_CHANGE_ROUTES),
      contradictionRoutes: routeList(p, ["WW", "DD", "LL"]),
      triggerMass: secondHalfChangeMass,
      confirmations: [`State-changing HT/FT mass is ${(secondHalfChangeMass * 100).toFixed(1)}%.`]
    });
  }

  return buildGate({
    eligible: false,
    score: 0,
    rule: "No HT/FT eligibility rule is registered for this market.",
    blockers: ["Market is not registered in the HT/FT-first firing map."]
  });
}

export function applyHtftGates(markets, context) {
  return markets.map((market) => {
    const htftGate = evaluateHtftGate({ market, ...context });
    const blockers = [
      ...(market.blockers || []),
      ...htftGate.blockers,
      ...(!htftGate.eligible && htftGate.blockers.length === 0
        ? ["Required HT/FT trigger did not fire."]
        : [])
    ];
    const uniqueBlockers = [...new Set(blockers)];
    const qualified =
      htftGate.eligible &&
      Number(market.safetyAdjustedScore || 0) >= Number(market.threshold || 0) &&
      uniqueBlockers.length === 0;

    return {
      ...market,
      htftGate,
      reasons: [...new Set([...(market.reasons || []), ...htftGate.confirmations])],
      blockers: uniqueBlockers,
      qualified,
      directional: !qualified,
      fallbackEligible: Boolean(market.fallbackEligible) && htftGate.eligible,
      tier: qualified ? market.tier : `Directional · HT/FT gate ${htftGate.eligible ? "passed" : "failed"}`
    };
  });
}
