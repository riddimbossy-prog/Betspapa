(function () {
  'use strict';

  const states = ['W/W','W/D','W/L','D/W','D/D','D/L','L/W','L/D','L/L'];
  const codes = ['1/1','1/X','1/2','X/1','X/X','X/2','2/1','2/X','2/2'];
  const opposite = {
    'W/W':'L/L','W/D':'L/D','W/L':'L/W','D/W':'D/L','D/D':'D/D',
    'D/L':'D/W','L/W':'W/L','L/D':'W/D','L/L':'W/W'
  };

  function safeRate(count, matches, leagueRate = 1 / 9, strength = 3) {
    if (!Number.isFinite(count) || !Number.isFinite(matches) || matches < 0) return leagueRate;
    return (count + leagueRate * strength) / (matches + strength);
  }

  function profileRate(profile, state) {
    return safeRate(profile[state] || 0, profile.mp || 0);
  }

  function transitionMatrix(home, away) {
    const raw = states.map((state, index) => {
      const homeRate = profileRate(home, state);
      const awayRate = profileRate(away, opposite[state]);
      return { state, code: codes[index], raw: Math.sqrt(homeRate * awayRate) };
    });
    const total = raw.reduce((sum, item) => sum + item.raw, 0) || 1;
    return raw.map(item => ({ ...item, probability: item.raw / total }));
  }

  function sum(matrix, codesToSum) {
    return matrix.filter(item => codesToSum.includes(item.code)).reduce((total, item) => total + item.probability, 0);
  }

  function geo(a, b) {
    return Math.sqrt(Math.max(0, a) * Math.max(0, b));
  }

  function analyze(fixture) {
    const matrix = transitionMatrix(fixture.home.profile, fixture.away.profile);
    const homeWin = sum(matrix, ['1/1','X/1','2/1']);
    const draw = sum(matrix, ['1/X','X/X','2/X']);
    const awayWin = sum(matrix, ['1/2','X/2','2/2']);
    const htHome = sum(matrix, ['1/1','1/X','1/2']);
    const htDraw = sum(matrix, ['X/1','X/X','X/2']);
    const htAway = sum(matrix, ['2/1','2/X','2/2']);
    const forcedGG = sum(matrix, ['1/X','1/2','2/X','2/1']);
    const fullReversal = sum(matrix, ['1/2','2/1']);
    const stable = sum(matrix, ['1/1','X/X','2/2']);

    const hg = geo(fixture.home.goals.scoreRate, fixture.away.goals.concedeRate);
    const ag = geo(fixture.away.goals.scoreRate, fixture.home.goals.concedeRate);
    const twoSided = Math.min(hg, ag);
    const recentGG = geo(fixture.home.goals.recentBTTS, fixture.away.goals.recentBTTS);
    const ggScore = .38 * twoSided + .28 * Math.min(1, forcedGG + .20 * stable) + .22 * recentGG + .12 * geo(fixture.home.goals.btts, fixture.away.goals.btts);

    const over15Score = Math.min(1,
      forcedGG + .40 * sum(matrix,['X/1','X/2']) + .25 * sum(matrix,['1/1','2/2'])
    ) * .45 + geo(fixture.home.goals.over15, fixture.away.goals.over15) * .55;

    const favouriteHome = homeWin >= awayWin;
    const favGoals = favouriteHome ? fixture.home.goals : fixture.away.goals;
    const dogGoals = favouriteHome ? fixture.away.goals : fixture.home.goals;
    const dominantTwoPlus = geo(favGoals.score2plus, dogGoals.concede2plus);
    const over25Score = Math.min(1,
      fullReversal + .45 * sum(matrix,['1/X','2/X']) + .30 * sum(matrix,['X/1','X/2']) + .20 * sum(matrix,['1/1','2/2'])
    ) * .40 + dominantTwoPlus * .35 + geo(fixture.home.goals.over25, fixture.away.goals.over25) * .25;

    const under35Score = geo(fixture.home.goals.under35, fixture.away.goals.under35) * .62 +
      geo(fixture.home.goals.recentUnder35, fixture.away.goals.recentUnder35) * .28 +
      Math.max(0, stable - fullReversal) * .10;

    const markets = [
      { key:'home1x', label:`${fixture.home.name} 1X`, score:homeWin + draw, type:'Result' },
      { key:'awayx2', label:`${fixture.away.name} X2`, score:awayWin + draw, type:'Result' },
      { key:'noDraw', label:'No Draw 12', score:homeWin + awayWin, type:'Result' },
      { key:'homeWin', label:`${fixture.home.name} Win`, score:homeWin, type:'Result' },
      { key:'awayWin', label:`${fixture.away.name} Win`, score:awayWin, type:'Result' },
      { key:'ht1x', label:`HT ${fixture.home.name} or Draw`, score:htHome + htDraw, type:'Half-time' },
      { key:'htx2', label:`HT Draw or ${fixture.away.name}`, score:htDraw + htAway, type:'Half-time' },
      { key:'gg', label:'GG — Yes', score:ggScore, type:'Goals' },
      { key:'over15', label:'Over 1.5 Goals', score:over15Score, type:'Goals' },
      { key:'over25', label:'Over 2.5 Goals', score:over25Score, type:'Goals' },
      { key:'under35', label:'Under 3.5 Goals', score:under35Score, type:'Goals' }
    ];

    const thresholds = { home1x:.68, awayx2:.68, noDraw:.70, homeWin:.53, awayWin:.53, ht1x:.72, htx2:.72, gg:.64, over15:.70, over25:.60, under35:.70 };
    markets.forEach(m => {
      m.status = m.score >= (thresholds[m.key] || .70) ? 'pass' : (m.score >= (thresholds[m.key] || .70) - .06 ? 'lean' : 'reject');
    });

    const riskPenalty = fixture.sample < 8 ? .06 : fixture.sample < 12 ? .025 : 0;
    const qualified = markets.filter(m => m.status === 'pass').map(m => ({...m, adjusted:m.score - riskPenalty - (m.key === 'over25' ? .02 : 0)}));
    qualified.sort((a,b) => b.adjusted - a.adjusted);
    const primary = qualified[0] || [...markets].sort((a,b)=>b.score-a.score)[0];
    const topTransition = [...matrix].sort((a,b)=>b.probability-a.probability)[0];
    const confidence = Math.max(55, Math.min(94, Math.round((primary.adjusted || primary.score) * 100)));

    let reason = 'The market has the strongest agreement after transition, venue and goal-threshold checks.';
    if (primary.key === 'gg') reason = 'Both teams have independent scoring routes and the comeback/surrender profile supports goals at both ends.';
    if (primary.key === 'over15') reason = 'Transition changes plus combined scoring and conceding thresholds support at least two match goals.';
    if (primary.key === 'under35') reason = 'Recent goal ceilings agree and complete-reversal risk remains controlled.';
    if (primary.key.includes('Win')) reason = 'The selected team has multiple winning routes and the opponent supports matching losing transitions.';
    if (primary.key === 'home1x' || primary.key === 'awayx2') reason = 'The double-chance route protects the strongest direction while accounting for the main draw pathway.';

    return {
      matrix, markets, primary, confidence, reason, topTransition,
      derived:{ homeWin,draw,awayWin,htHome,htDraw,htAway,forcedGG,fullReversal,stable,ggScore,over15Score,over25Score,under35Score,hg,ag }
    };
  }

  window.BetsPapaEngine = { analyze, states, codes };
})();
