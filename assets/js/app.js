(function () {
  'use strict';

  const fixtures = [
    {
      id:'merlo-pilar', league:'Argentina · Primera B', kickoff:'Today · 20:30', sample:13,
      home:{ name:'Deportivo Merlo', short:'DM', profile:{mp:13,'W/W':2,'W/D':0,'W/L':0,'D/W':2,'D/D':2,'D/L':2,'L/W':2,'L/D':2,'L/L':1}, goals:{scoreRate:.77,concedeRate:.69,recentBTTS:.67,btts:.62,over15:.77,over25:.54,under35:.77,recentUnder35:.67,score2plus:.46,concede2plus:.38}},
      away:{ name:'Real Pilar', short:'RP', profile:{mp:13,'W/W':2,'W/D':2,'W/L':1,'D/W':2,'D/D':1,'D/L':1,'L/W':1,'L/D':1,'L/L':2}, goals:{scoreRate:.69,concedeRate:.69,recentBTTS:.67,btts:.62,over15:.77,over25:.54,under35:.69,recentUnder35:.67,score2plus:.38,concede2plus:.46}}
    },
    {
      id:'ituzaingo-burzaco', league:'Argentina · Primera B', kickoff:'Today · 23:00', sample:13,
      home:{ name:'Ituzaingó', short:'ITU', profile:{mp:13,'W/W':0,'W/D':1,'W/L':0,'D/W':1,'D/D':4,'D/L':1,'L/W':0,'L/D':0,'L/L':6}, goals:{scoreRate:.54,concedeRate:.77,recentBTTS:.50,btts:.46,over15:.69,over25:.38,under35:.77,recentUnder35:.83,score2plus:.23,concede2plus:.46}},
      away:{ name:'San Martín Burzaco', short:'SMB', profile:{mp:13,'W/W':4,'W/D':0,'W/L':0,'D/W':2,'D/D':5,'D/L':0,'L/W':0,'L/D':0,'L/L':2}, goals:{scoreRate:.77,concedeRate:.54,recentBTTS:.50,btts:.46,over15:.69,over25:.38,under35:.85,recentUnder35:.83,score2plus:.38,concede2plus:.23}}
    },
    {
      id:'tensung-thimphu', league:'Bhutan · Premier League', kickoff:'Tomorrow · 11:00', sample:9,
      home:{ name:'Tensung', short:'TEN', profile:{mp:9,'W/W':1,'W/D':1,'W/L':0,'D/W':0,'D/D':1,'D/L':2,'L/W':0,'L/D':0,'L/L':4}, goals:{scoreRate:.44,concedeRate:.89,recentBTTS:.33,btts:.33,over15:.78,over25:.56,under35:.56,recentUnder35:.50,score2plus:.22,concede2plus:.67}},
      away:{ name:'Thimphu City', short:'TC', profile:{mp:9,'W/W':4,'W/D':0,'W/L':0,'D/W':2,'D/D':2,'D/L':1,'L/W':0,'L/D':0,'L/L':0}, goals:{scoreRate:.89,concedeRate:.44,recentBTTS:.33,btts:.33,over15:.89,over25:.67,under35:.56,recentUnder35:.50,score2plus:.67,concede2plus:.22}}
    },
    {
      id:'juventud-provincial', league:'Argentina · Torneo Amateur', kickoff:'Tomorrow · 17:00', sample:7,
      home:{ name:'Juventud de Bernal', short:'JDB', profile:{mp:7,'W/W':0,'W/D':0,'W/L':0,'D/W':0,'D/D':0,'D/L':2,'L/W':1,'L/D':0,'L/L':4}, goals:{scoreRate:.43,concedeRate:.86,recentBTTS:.33,btts:.29,over15:.71,over25:.57,under35:.57,recentUnder35:.50,score2plus:.14,concede2plus:.57}},
      away:{ name:'Provincial', short:'PRO', profile:{mp:7,'W/W':2,'W/D':0,'W/L':0,'D/W':0,'D/D':0,'D/L':2,'L/W':0,'L/D':0,'L/L':3}, goals:{scoreRate:.71,concedeRate:.71,recentBTTS:.33,btts:.29,over15:.71,over25:.57,under35:.57,recentUnder35:.50,score2plus:.57,concede2plus:.43}}
    }
  ];

  const recentResults = [
    ['15 Jul 2026','Vinotinto 2–1 El Nacional','Ecuador Serie B','Vinotinto Win','2–1','WIN','1.64'],
    ['15 Jul 2026','Tensung 0–4 Thimphu City','Bhutan Premier','Thimphu Win','0–4','WIN','1.48'],
    ['14 Jul 2026','Juventud 0–4 Provincial','Torneo Amateur','Provincial DNB','0–4','WIN','1.72'],
    ['14 Jul 2026','Dep. Merlo 3–2 Real Pilar','Argentina Primera B','Over 1.5','3–2','WIN','1.36'],
    ['14 Jul 2026','Ituzaingó 1–2 San Martín','Argentina Primera B','San Martín X2','1–2','WIN','1.44']
  ];

  const $ = (selector) => document.querySelector(selector);
  const pct = (n) => `${Math.round(n * 100)}%`;
  let selectedId = fixtures[0].id;

  function tier(score) {
    if (score >= .85) return 'Elite';
    if (score >= .80) return 'Strong';
    if (score >= .74) return 'Qualified';
    if (score >= .68) return 'Lean';
    return 'Rejected';
  }

  function renderFixtures() {
    $('#fixtureList').innerHTML = fixtures.map(f => {
      const a = BetsPapaEngine.analyze(f);
      return `<button class="fixture-item ${f.id === selectedId ? 'active' : ''}" data-id="${f.id}">
        <div class="fixture-top"><span>${f.league}</span><span>${f.kickoff}</span></div>
        <div class="fixture-teams">
          <div class="fixture-team"><span class="mini-badge">${f.home.short}</span>${f.home.name}</div>
          <div class="fixture-team"><span class="mini-badge">${f.away.short}</span>${f.away.name}</div>
        </div>
        <div class="fixture-bottom"><strong>${a.primary.label}</strong><span>${a.confidence}%</span></div>
      </button>`;
    }).join('');
    document.querySelectorAll('.fixture-item').forEach(button => button.addEventListener('click', () => {
      selectedId = button.dataset.id;
      renderFixtures();
      renderAnalysis();
    }));
  }

  function renderMatrix(analysis) {
    const sorted = [...analysis.matrix].sort((a,b)=>b.probability-a.probability);
    const topCode = sorted[0].code;
    $('#transitionMatrix').innerHTML = analysis.matrix.map(item => `<div class="matrix-cell ${item.code === topCode ? 'top' : ''}">
      <header><strong>${item.code}</strong><span>${pct(item.probability)}</span></header>
      <div class="matrix-bar"><i style="width:${Math.max(5,item.probability*260)}%"></i></div>
    </div>`).join('');
  }

  function renderInsights(analysis) {
    const picks = [
      ['GG — Yes','Both scoring paths',analysis.derived.ggScore,'GG'],
      ['Over 1.5','Minimum goal route',analysis.derived.over15Score,'O1.5'],
      ['Over 2.5','Two-sided or dominant team',analysis.derived.over25Score,'O2.5'],
      ['Under 3.5','Ceiling confirmation',analysis.derived.under35Score,'U3.5']
    ];
    $('#marketInsights').innerHTML = picks.map(([label,sub,score,icon],i) => {
      const t = tier(score); const status = t === 'Elite' || t === 'Strong' || t === 'Qualified' ? 'pass' : t === 'Lean' ? 'lean' : 'reject';
      return `<div class="insight-row">
        <span class="insight-icon ${i===3?'gold':''}">${icon}</span>
        <div class="insight-copy"><strong>${label}</strong><small>${sub}</small></div>
        <span class="insight-percent">${pct(score)}</span>
        <span class="insight-status ${status}">${t}</span>
      </div>`;
    }).join('');
  }

  function renderAnalysis() {
    const fixture = fixtures.find(f => f.id === selectedId) || fixtures[0];
    const a = BetsPapaEngine.analyze(fixture);
    $('#leagueLabel').textContent = fixture.league.toUpperCase();
    $('#kickoffLabel').textContent = fixture.kickoff.toUpperCase();
    $('#homeTeam').textContent = fixture.home.name;
    $('#awayTeam').textContent = fixture.away.name;
    $('#homeBadge').textContent = fixture.home.short;
    $('#awayBadge').textContent = fixture.away.short;
    $('#primaryPick').textContent = a.primary.label;
    $('#primaryReason').textContent = a.reason;
    $('#confidenceScore').textContent = `${a.confidence}%`;
    $('#confidenceBar').style.width = `${a.confidence}%`;
    $('#confidenceTier').textContent = tier(a.confidence/100);
    $('#htStory').textContent = a.topTransition.code;
    const goals = [
      ['GG',a.derived.ggScore],['O1.5',a.derived.over15Score],['O2.5',a.derived.over25Score],['U3.5',a.derived.under35Score]
    ].sort((x,y)=>y[1]-x[1]);
    $('#goalRoute').textContent = `${goals[0][0]} ${pct(goals[0][1])}`;
    $('#riskLabel').textContent = fixture.sample < 8 ? 'Small sample' : a.derived.fullReversal > .16 ? 'Volatile' : 'Controlled';
    renderMatrix(a);
    renderInsights(a);
  }

  function renderResults() {
    $('#resultsTable').innerHTML = recentResults.map(row => `<tr>
      <td data-label="Date">${row[0]}</td><td data-label="Match"><strong>${row[1]}</strong></td><td data-label="Competition">${row[2]}</td><td data-label="Prediction">${row[3]}</td><td data-label="Result">${row[4]}</td>
      <td data-label="Outcome"><span class="outcome ${row[5] === 'WIN' ? 'win' : 'loss'}">${row[5]}</span></td><td data-label="Odd">${row[6]}</td>
    </tr>`).join('');
  }

  function setupModal() {
    const modal = $('#methodModal');
    ['#howItWorks','#matrixHelp'].forEach(id => $(id).addEventListener('click', () => modal.showModal()));
    $('#modalClose').addEventListener('click', () => modal.close());
  }

  function setupMobile() {
    const menu = $('#mobileMenu');
    const more = $('#mobileMore');
    const sidebar = $('#sidebar');
    const backdrop = $('#drawerBackdrop');
    const tabs = [...document.querySelectorAll('[data-mobile-tab]')];

    const setDrawer = (open) => {
      sidebar.classList.toggle('open', open);
      menu.setAttribute('aria-expanded', String(open));
      backdrop.hidden = !open;
      document.body.classList.toggle('menu-open', open);
      if (open) {
        const firstLink = sidebar.querySelector('a');
        window.setTimeout(() => firstLink && firstLink.focus({preventScroll:true}), 80);
      }
    };

    menu.addEventListener('click', () => setDrawer(!sidebar.classList.contains('open')));
    more.addEventListener('click', () => setDrawer(true));
    backdrop.addEventListener('click', () => setDrawer(false));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && sidebar.classList.contains('open')) setDrawer(false);
    });

    document.querySelectorAll('.side-link').forEach(link => link.addEventListener('click', () => setDrawer(false)));
    tabs.forEach(tab => tab.addEventListener('click', () => {
      tabs.forEach(item => item.classList.remove('active'));
      tab.classList.add('active');
    }));

    const observed = ['dashboard','prediction-board','engine','results']
      .map(id => document.getElementById(id))
      .filter(Boolean);
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        const visible = entries.filter(entry => entry.isIntersecting).sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.mobileTab === visible.target.id));
      }, { rootMargin: '-20% 0px -65% 0px', threshold: [0.05, .2, .5] });
      observed.forEach(section => observer.observe(section));
    }

    window.addEventListener('resize', () => {
      if (window.innerWidth > 1020) setDrawer(false);
    }, {passive:true});
  }

  function setupSearch() {
    const drawer = $('#searchDrawer');
    $('#searchButton').addEventListener('click', () => { drawer.hidden = false; $('#globalSearch').focus(); });
    $('#searchClose').addEventListener('click', () => { drawer.hidden = true; });
    $('#globalSearch').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      const results = fixtures.filter(f => !q || `${f.home.name} ${f.away.name} ${f.league}`.toLowerCase().includes(q));
      $('#searchResults').innerHTML = results.map(f => `<button class="search-result" data-search-id="${f.id}">${f.home.name} vs ${f.away.name} · ${f.league}</button>`).join('');
      document.querySelectorAll('[data-search-id]').forEach(btn => btn.addEventListener('click', () => {
        selectedId = btn.dataset.searchId; drawer.hidden = true; renderFixtures(); renderAnalysis();
        document.querySelector('#prediction-board').scrollIntoView({behavior:'smooth'});
      }));
    });
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  renderFixtures();
  renderAnalysis();
  renderResults();
  setupModal();
  setupMobile();
  setupSearch();
  registerServiceWorker();
})();
