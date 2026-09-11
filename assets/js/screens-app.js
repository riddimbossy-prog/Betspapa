/* BetsPapa Screens app — full public UI, live engines via api.betspapa.com */
(function () {
  "use strict";

  const API = window.BETSPAPA_API_URL || "https://api.betspapa.com";
  const START = window.BETSPAPA_START || "home";
  const TONES = ["pink", "blue", "mint", "gold", "lilac", "peach", "sky"];
  const MONTHS = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
  const WEEK = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
  const LOGO = "/assets/images/logo-papa.png";
  const PAPA = "/assets/images/papa-square.png";
  const SLIP_KEY = "betspapa-slip";
  const PALETTE = ["#C8102E","#034694","#111111","#0B6E4F","#6CABDD","#E30613","#1B458F","#670E36","#132257","#DA291C","#0057B8","#241F20"];

  const ICO = {
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    zap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
    ticket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V9z"/><path d="M13 5v14"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 18l-6-6 6-6"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  };

  const state = {
    route: { name: START === "home" ? "home" : START, id: null },
    tab: "all",
    fixtures: [],
    flash: [],
    bankers: [],
    athena: [],
    goals: [],
    wins: [],
    visa: [],
    visaWeek: [],
    visaDate: null,
    loading: true,
    error: null,
    slip: loadSlip(),
    toast: null,
    toastTimer: 0,
    pickSel: null,
    chooserOpen: false,
  };

  function loadSlip() {
    try {
      const raw = JSON.parse(localStorage.getItem(SLIP_KEY) || "{}");
      return { picks: Array.isArray(raw.picks) ? raw.picks : [], stake: Number(raw.stake) || 20 };
    } catch {
      return { picks: [], stake: 20 };
    }
  }
  function saveSlip() {
    localStorage.setItem(SLIP_KEY, JSON.stringify(state.slip));
  }

  function esc(s) {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return String(s ?? "").replace(/[&<>"']/g, (c) => map[c]);
  }
  function hash(s) {
    let h = 0;
    const t = String(s || "");
    for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
    return Math.abs(h);
  }
  function toneFor(id) { return TONES[hash(id) % TONES.length]; }
  function teamColor(name) { return PALETTE[hash(name) % PALETTE.length]; }
  function teamColor2(name) { return PALETTE[(hash(name) + 3) % PALETTE.length]; }
  function abbr(name) {
    const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
    return parts.slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  }
  function shortName(name) {
    const n = String(name || "");
    if (n.length <= 16) return n;
    return n.split(/\s+/)[0];
  }
  function pad(n) { return String(n).padStart(2, "0"); }
  function kickParts(iso) {
    const d = new Date(iso || Date.now());
    if (Number.isNaN(d.getTime())) return { time: "TBD", date: "", day: "", monthShort: "", weekday: "" };
    return {
      time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
      date: `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]}`,
      day: pad(d.getUTCDate()),
      monthShort: MONTHS[d.getUTCMonth()].slice(0, 3),
      weekday: WEEK[d.getUTCDay()],
      iso: d.toISOString(),
    };
  }
  function todayUtc() { return new Date().toISOString().slice(0, 10); }
  function addDays(iso, n) {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function formatOdd(n) {
    const x = Number(n);
    return Number.isFinite(x) && x > 1 ? x.toFixed(2) : "—";
  }
  function formatGhs(n) { return `GHS ${Number(n || 0).toFixed(2)}`; }

  function poisson(l, k) {
    if (l <= 0) return k === 0 ? 1 : 0;
    let p = Math.exp(-l);
    for (let i = 1; i <= k; i++) p *= l / i;
    return p;
  }
  function matchProbs(xh, xa) {
    const homeXG = Math.max(0.2, Number(xh) || 1.2);
    const awayXG = Math.max(0.2, Number(xa) || 1.0);
    let h = 0, d = 0, a = 0;
    for (let i = 0; i <= 8; i++) {
      for (let j = 0; j <= 8; j++) {
        const p = poisson(homeXG, i) * poisson(awayXG, j);
        if (i > j) h += p;
        else if (i === j) d += p;
        else a += p;
      }
    }
    const s = h + d + a || 1;
    return {
      home: Math.round((h / s) * 100),
      draw: Math.round((d / s) * 100),
      away: Math.max(0, 100 - Math.round((h / s) * 100) - Math.round((d / s) * 100)),
    };
  }
  function oddsFromProb(p) {
    const x = Number(p) / 100;
    if (x <= 0.04) return 12;
    if (x >= 0.92) return 1.08;
    return Math.round((1 / x) * 100) / 100;
  }

  function teamOf(obj) {
    if (!obj) return { name: "TBD", short: "TBD", abbr: "TBD", color: "#111", color2: "#fff", logo: "" };
    const name = obj.name || obj.short || "TBD";
    return {
      name,
      short: shortName(name),
      abbr: abbr(name),
      color: teamColor(name),
      color2: teamColor2(name),
      logo: obj.logo_url || obj.logo || "",
    };
  }
  function leagueOf(obj) {
    const lg = obj || {};
    return { name: lg.name || "League", country: lg.country || "", id: lg.id || lg.name || "x" };
  }
  function fid(item) {
    return String(item?.fixtureId ?? item?.internalFixtureId ?? item?.id ?? "");
  }

  function badge(team, size) {
    const cls = size === "lg" ? "badge lg" : "badge";
    if (team.logo) {
      return `<span class="${cls}" title="${esc(team.name)}"><img src="${esc(team.logo)}" alt=""></span>`;
    }
    return `<span class="${cls}" title="${esc(team.name)}" style="background:${esc(team.color)};color:#fff7f4"><span class="badge-stripe" style="background:${esc(team.color2)}"></span>${esc(team.abbr)}</span>`;
  }

  async function getJson(path) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 18000);
    try {
      const res = await fetch(`${API}${path}`, { headers: { Accept: "application/json" }, signal: ctrl.signal });
      if (!res.ok) throw new Error(`${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  function normalizeFixture(f, extras) {
    const home = teamOf(f.home);
    const away = teamOf(f.away);
    const league = leagueOf(f.league);
    const id = fid(f);
    const xg = extras?.expectedGoals || f.expectedGoals || {};
    const formH = extras?.venueForm?.home?.form || f.venueForm?.home?.form || [];
    const formA = extras?.venueForm?.away?.form || f.venueForm?.away?.form || [];
    const probs = extras?.probs || (xg.home || xg.away ? matchProbs(xg.home, xg.away) : null);
    return {
      id,
      kickoff: f.kickoff,
      status: f.status,
      matchState: f.matchState || {},
      venue: f.venue?.name || f.venue || "",
      home, away, league,
      tone: toneFor(id || home.name),
      form: { home: formH.slice(-5), away: formA.slice(-5) },
      probs,
      odds: extras?.odds || null,
      flash: extras?.flash || null,
      enginePick: extras?.enginePick || null,
      raw: f,
    };
  }

  function pickFromEngine(p, engine) {
    const home = teamOf(p.home);
    const away = teamOf(p.away);
    const id = fid(p);
    const xg = p.internalAudit?.expectedGoals || p.expectedGoals || {};
    const model = Math.round((Number(p.modelProbability) || Number(p.confidence) || Number(p.score) || 0) * (Number(p.modelProbability) <= 1 ? 100 : 1));
    const split = p.directHitRates?.combined ? Math.round(p.directHitRates.combined * 100) : null;
    return {
      id,
      engine,
      kickoff: p.kickoff,
      home, away,
      league: leagueOf(p.league),
      tone: toneFor(id || home.name),
      market: p.market || p.family || "Pick",
      selection: p.selection || p.consensusOutcome || "",
      odd: Number(p.odds) || 0,
      model: model || Math.round(Number(p.confidence) || 0),
      splitHit: split,
      confidence: Math.round(Number(p.confidence) || Number(p.score) || 0),
      ev: Number(p.expectedValue) || 0,
      tier: p.tier || p.papaLockGrade || engine,
      routeLabel: p.routeLabel || "",
      note: p.publicExplanation || p.explanationParagraph || (p.reasons && p.reasons[0]) || "",
      form: {
        home: (p.venueForm?.home?.form || []).slice(-5),
        away: (p.venueForm?.away?.form || []).slice(-5),
      },
      probs: xg.home || xg.away ? matchProbs(xg.home, xg.away) : null,
      sportyBetUrl: p.sportyBetUrl || "",
      matchState: p.matchState || {},
    };
  }

  function mergeById(list) {
    const map = new Map();
    for (const item of list) {
      if (!item?.id) continue;
      if (!map.has(item.id)) map.set(item.id, item);
    }
    return [...map.values()];
  }

  async function bootData() {
    state.loading = true;
    state.error = null;
    render();
    const d0 = todayUtc();
    const d1 = addDays(d0, 1);
    const jobs = [
      ["fixtures0", `/api/fixtures/today?date=${d0}&refresh=skip`],
      ["fixtures1", `/api/fixtures/today?date=${d1}&refresh=skip`],
      ["flash0", `/api/flash/today?date=${d0}`],
      ["flash1", `/api/flash/today?date=${d1}`],
      ["bankers", `/api/bankers/today?date=${d0}`],
      ["athena", `/api/athena/today?date=${d0}`],
      ["goals", `/api/goals-bankers/today?date=${d0}`],
      ["wins", `/api/wins-bankers/today?date=${d0}`],
      ["visaWeek", `/api/visa/week?start=${d0}&days=7`],
    ];
    const got = {};
    await Promise.all(
      jobs.map(async ([key, path]) => {
        try { got[key] = await getJson(path); }
        catch (err) { got[key] = { error: String(err && err.message || err) }; }
      }),
    );

    const flashPicks = []
      .concat(got.flash0?.picks || [])
      .concat(got.flash1?.picks || [])
      .map((p) => pickFromEngine(p, "FLASH"));
    state.flash = mergeById(flashPicks);

    const flashMap = new Map(state.flash.map((p) => [p.id, p]));
    const fx = []
      .concat(got.fixtures0?.fixtures || [])
      .concat(got.fixtures1?.fixtures || [])
      .map((f) => {
        const extra = flashMap.get(fid(f));
        return normalizeFixture(f, extra ? { flash: extra, venueForm: extra, expectedGoals: extra, probs: extra.probs } : null);
      });
    state.fixtures = mergeById(fx).sort((a, b) => String(a.kickoff).localeCompare(String(b.kickoff)));

    state.bankers = (got.bankers?.picks || []).map((p) => pickFromEngine(p, "BANKERS"));
    state.athena = (got.athena?.picks || []).map((p) => pickFromEngine(p, "ATHENA"));
    state.goals = (got.goals?.picks || []).map((p) => pickFromEngine(p, "GOALS"));
    state.wins = (got.wins?.picks || []).map((p) => pickFromEngine(p, "WINS"));
    state.visaWeek = (Array.isArray(got.visaWeek?.days) ? got.visaWeek.days : []).map((day) => ({
      date: day.date,
      reviewedFixtures: Number(day.reviewedFixtures) || 0,
      picks: (day.picks || day.items || []).map((p) => pickFromEngine(p, "VISA")),
    }));
    state.visaDate = state.visaWeek.some((day) => day.date === state.visaDate)
      ? state.visaDate
      : state.visaWeek[0]?.date || d0;
    state.visa = state.visaWeek.find((day) => day.date === state.visaDate)?.picks || [];

    if (!state.fixtures.length && !state.flash.length) {
      state.error = "Papa's board is still warming up. Pull again in a moment.";
    }
    state.loading = false;
    const leagues = leagueTabs();
    if (!leagues.some((l) => l.key === state.tab)) state.tab = leagues[0]?.key || "all";
    render();
  }

  function leagueTabs() {
    const counts = new Map();
    for (const m of state.fixtures) {
      const key = `${m.league.country}|${m.league.name}`;
      const rec = counts.get(key) || { key, name: m.league.name, country: m.league.country, count: 0 };
      rec.count += 1;
      counts.set(key, rec);
    }
    const all = [...counts.values()];
    const prefer = (pred) => all.filter(pred).sort((a, b) => b.count - a.count);
    const epl = prefer((l) => /premier league/i.test(l.name) && /england|united kingdom/i.test(l.country));
    const ghana = prefer((l) => /ghana/i.test(l.country) || /ghana/i.test(l.name));
    const spain = prefer((l) => /la liga|laliga/i.test(l.name) || (/spain/i.test(l.country) && /primera|la liga/i.test(l.name)));
    const used = new Set([...epl, ...ghana, ...spain].map((l) => l.key));
    const rest = all.filter((l) => !used.has(l.key) && l.count >= 3).sort((a, b) => b.count - a.count).slice(0, 6);
    const tabs = [{ key: "all", name: "ALL", country: "", count: state.fixtures.length }];
    const push = (arr, label) => {
      if (!arr.length) return;
      tabs.push({ key: arr[0].key, name: label || arr[0].name, country: arr[0].country, count: arr[0].count });
    };
    push(epl, "EPL");
    push(ghana, "GHANA");
    push(spain, "SPAIN");
    rest.forEach((l) => {
      if (tabs.length >= 8) return;
      tabs.push({ key: l.key, name: l.name.replace(/premier/i, "PREM").slice(0, 12), country: l.country, count: l.count });
    });
    return tabs;
  }

  function fixturesForTab() {
    if (state.tab === "all") return state.fixtures;
    return state.fixtures.filter((m) => `${m.league.country}|${m.league.name}` === state.tab);
  }

  function featuredMatch() {
    const live = state.fixtures.find((m) => m.matchState?.isLive);
    if (live) return live;
    if (state.flash[0]) return matchById(state.flash[0].id) || flashAsMatch(state.flash[0]);
    return fixturesForTab()[0] || state.fixtures[0] || null;
  }

  function flashAsMatch(p) {
    return {
      id: p.id,
      kickoff: p.kickoff,
      home: p.home,
      away: p.away,
      league: p.league,
      tone: p.tone,
      form: p.form,
      probs: p.probs,
      flash: p,
      matchState: p.matchState || {},
      venue: "",
    };
  }

  function matchById(id) {
    const fx = state.fixtures.find((m) => m.id === String(id));
    if (fx) {
      const fl = state.flash.find((p) => p.id === String(id));
      if (fl) fx.flash = fl;
      return fx;
    }
    const fl = state.flash.find((p) => p.id === String(id));
    if (fl) return flashAsMatch(fl);
    const boards = [...state.bankers, ...state.athena, ...state.goals, ...state.wins, ...state.visa];
    const p = boards.find((x) => x.id === String(id));
    return p ? flashAsMatch(p) : null;
  }

  function parseHash() {
    const raw = (location.hash || "").replace(/^#/, "");
    const parts = raw.split("/").filter(Boolean);
    if (!parts.length) {
      if (!location.hash && START && START !== "home") return { name: START, id: null };
      return { name: "home", id: null };
    }
    if (parts[0] === "match" && parts[1]) return { name: "match", id: decodeURIComponent(parts[1]) };
    return { name: parts[0], id: null };
  }
  function go(name, id) {
    const hash = name === "home" ? "#/" : name === "match" ? `#/match/${encodeURIComponent(id)}` : `#/${name}`;
    if (location.hash !== hash) location.hash = hash;
    else {
      state.route = { name, id: id || null };
      state.chooserOpen = false;
      state.pickSel = null;
      render();
      const pane = document.getElementById("mainPane");
      if (pane) pane.querySelector(".view-scroll")?.scrollTo(0, 0);
    }
  }
  window.addEventListener("hashchange", () => {
    state.route = parseHash();
    state.chooserOpen = false;
    state.pickSel = null;
    render();
  });

  function toast(title, detail) {
    state.toast = { title, detail };
    render();
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => { state.toast = null; render(); }, 2400);
  }

  function addPick(pick) {
    const rest = state.slip.picks.filter((p) => !(p.matchId === pick.matchId && p.market === pick.market));
    state.slip.picks = [...rest, pick];
    saveSlip();
    toast("Locked on the slip", `${pick.label} @ ${formatOdd(pick.odd)}`);
    render();
  }
  function removePick(matchId, market) {
    state.slip.picks = state.slip.picks.filter((p) => !(p.matchId === matchId && p.market === market));
    saveSlip();
    render();
  }
  function onSlip(matchId, market) {
    return state.slip.picks.some((p) => p.matchId === matchId && p.market === market);
  }

  function navHtml(active) {
    const count = state.slip.picks.length;
    const items = [
      { name: "home", label: "Fixtures", icon: ICO.list },
      { name: "flash", label: "Flash", icon: ICO.zap },
      { name: "slip", label: "Slip", icon: ICO.ticket },
      { name: "papa", label: "Papa", icon: `<img src="${LOGO}" alt="">` },
    ];
    return `<nav class="nav" aria-label="Primary"><div class="nav-bar">${items.map((it) => {
      const on = active === it.name || (active === "match" && it.name === "home") || (["bankers","athena","goals","wins","visa","results","legal"].includes(active) && it.name === "papa");
      return `<button type="button" class="nav-item${on ? " on" : ""}" data-go="${it.name}">${it.icon}<span>${it.label}</span>${it.name === "slip" && count ? `<span class="nav-count">${count}</span>` : ""}</button>`;
    }).join("")}</div></nav>`;
  }

  function headerBrand(kicker, ghost) {
    return `<header class="pad">
      <div class="brand-row">
        <div class="brand-left"><img class="brand-mark" src="${LOGO}" alt="BetsPapa"><p class="eyebrow">${esc(kicker)}</p></div>
        <span class="chip">GMT</span>
      </div>
      <h1 class="display">${esc(ghost.title)}</h1>
      <p class="display ghost">${esc(ghost.sub)}</p>
      ${ghost.lede ? `<p class="lede">${esc(ghost.lede)}</p>` : ""}
    </header>`;
  }

  function matchCard(m) {
    const k = kickParts(m.kickoff);
    const live = m.matchState?.isLive;
    const score = live && m.matchState?.score ? m.matchState.score : k.time;
    return `<a class="card pressable tone-${m.tone}" href="#/match/${encodeURIComponent(m.id)}">
      <div class="card-top">
        <div class="badges">${badge(m.home)}${badge(m.away)}</div>
        <p class="card-date">${live ? `<span class="live-dot"></span>LIVE` : esc(k.date)}</p>
      </div>
      <div class="card-bottom">
        <p class="card-time">${esc(score)}</p>
        <div class="card-names"><p>${esc(m.home.short)}</p><p>${esc(m.away.short)}</p></div>
      </div>
    </a>`;
  }

  function formDots(form, label) {
    const bits = (form && form.length ? form : ["-", "-", "-", "-", "-"]).slice(-5);
    return `<div class="form-row"><span class="form-lab">${esc(label)}</span><div class="badges">${bits.map((r) => `<span class="dot ${esc(r)}">${esc(r)}</span>`).join("")}</div></div>`;
  }

  function titleForTab() {
    const tabs = leagueTabs();
    const cur = tabs.find((t) => t.key === state.tab) || tabs[0];
    if (!cur || cur.key === "all") return { title: "TODAY", sub: "BOARD" };
    const n = (cur.name || "LEAGUE").toUpperCase();
    if (n === "EPL") return { title: "PREMIER", sub: "LEAGUE" };
    if (n === "GHANA") return { title: "GHANA", sub: "PREMIER" };
    if (n === "SPAIN") return { title: "LA LIGA", sub: "SPAIN" };
    const parts = n.split(/\s+/);
    return { title: parts[0], sub: parts.slice(1).join(" ") || (cur.country || "LEAGUE").toUpperCase() };
  }

  function renderFixtures() {
    const tabs = leagueTabs();
    const list = fixturesForTab().slice(0, 40);
    const titles = titleForTab();
    return `<div class="view view-cream">
      <div class="view-scroll">
        <header class="pad">
          <div class="brand-row">
            <div class="brand-left"><img class="brand-mark" src="${LOGO}" alt="BetsPapa"><p class="eyebrow">BETSPAPA</p></div>
            <span class="chip">GMT</span>
          </div>
          <h1 class="display">${esc(titles.title)}</h1>
          <p class="display ghost">${esc(titles.sub)}</p>
          <div class="tabs">${tabs.map((t) => `<button type="button" class="tab${t.key === state.tab ? " on" : ""}" data-tab="${esc(t.key)}">${esc(t.name)}</button>`).join("")}</div>
        </header>
        <div class="stack stagger">
          ${state.loading ? `<div class="skel"></div><div class="skel"></div><div class="skel"></div>` : ""}
          ${!state.loading && !list.length ? `<div class="empty"><h2>NO MATCHES</h2><p>Nothing in this league yet. Try another tab.</p></div>` : ""}
          ${list.map(matchCard).join("")}
        </div>
      </div>
    </div>`;
  }

  function renderMatch(m, nested) {
    if (!m) {
      return `<div class="view view-pink"><div class="view-scroll" style="display:grid;place-items:center;padding:24px;text-align:center">
        <div><h1 class="display">NO MATCH</h1><button class="btn-ink" style="margin-top:16px;width:auto;padding:0 20px" data-go="home">BACK TO FIXTURES</button></div>
      </div></div>`;
    }
    const k = kickParts(m.kickoff);
    const headline = m.flash ? "PAPA'S FLASH" : m.matchState?.isLive ? "LIVE MATCH" : "COVER IQ MATCH";
    const lg = (m.league?.name || "").toUpperCase();
    const probs = m.probs || m.flash?.probs;
    const odds = m.odds || (probs ? { home: oddsFromProb(probs.home), draw: oddsFromProb(probs.draw), away: oddsFromProb(probs.away) } : { home: 0, draw: 0, away: 0 });
    const outcomes = [
      { key: "home", name: m.home.short, odd: odds.home },
      { key: "draw", name: "Draw", odd: odds.draw },
      { key: "away", name: m.away.short, odd: odds.away },
    ];
    const engine = m.flash;
    return `<div class="view view-pink">
      <header class="pad" style="display:flex;align-items:center;justify-content:space-between">
        ${nested ? `<img class="brand-mark" src="${LOGO}" alt="">` : `<button class="icon-btn" data-go="home" aria-label="Back">${ICO.back}</button>`}
        <img class="brand-mark" src="${LOGO}" alt="BetsPapa" style="outline:2px solid var(--cream)">
      </header>
      <div class="view-scroll" style="padding:4px 20px 8px">
        <p class="eyebrow">PAST GAMES</p>
        <h1 class="display" style="font-size:46px;max-width:13ch">${esc(headline)}</h1>
        <div style="margin-top:16px;display:flex;flex-direction:column;gap:6px">
          ${formDots(m.form?.home || engine?.form?.home, m.home.abbr)}
          ${formDots(m.form?.away || engine?.form?.away, m.away.abbr)}
        </div>
        ${probs ? `<div class="prob"><div class="prob-track"><div class="prob-h" style="width:${probs.home}%"></div><div class="prob-d" style="width:${probs.draw}%"></div><div class="prob-a" style="width:${probs.away}%"></div></div>
          <div class="prob-stats"><div><strong>${probs.home}%</strong><span>${esc(m.home.abbr)}</span></div><div><strong>${probs.draw}%</strong><span>DRAW</span></div><div><strong>${probs.away}%</strong><span>${esc(m.away.abbr)}</span></div></div></div>` : ""}
        <div class="match-sheet">
          <div class="brand-row"><img class="brand-mark" src="${LOGO}" alt="" style="width:28px;height:28px"><p class="eyebrow">${esc(k.day)} ${esc(k.monthShort)}</p></div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px">
            ${badge(m.home, "lg")}<p class="match-kick">${esc(m.matchState?.isLive && m.matchState.score ? m.matchState.score : k.time)}</p>${badge(m.away, "lg")}
          </div>
          <div style="display:flex;justify-content:space-between;gap:8px;margin-top:8px">
            <p class="font-cond" style="max-width:40%;font-size:13px;text-transform:uppercase">${esc(m.home.name)}</p>
            <p class="eyebrow" style="text-align:center">${esc(lg)}</p>
            <p class="font-cond" style="max-width:40%;font-size:13px;text-transform:uppercase;text-align:right">${esc(m.away.name)}</p>
          </div>
        </div>
        ${engine ? `<div class="card tone-${m.tone}" style="margin-top:12px">
          <p class="eyebrow">${esc(engine.tier)} · ${esc(engine.market)}</p>
          <p class="font-display" style="font-size:32px;line-height:1;margin-top:4px">${esc(engine.selection)}</p>
          <p class="lede" style="max-width:none">${esc(engine.note)}</p>
          <div class="metrics">
            <div class="metric"><b>${engine.model || "—"}%</b><span>MODEL</span></div>
            <div class="metric"><b>${engine.splitHit != null ? engine.splitHit + "%" : "—"}</b><span>HIT</span></div>
            <div class="metric"><b>${engine.confidence || "—"}</b><span>CONF</span></div>
            <div class="metric"><b>${engine.ev ? engine.ev.toFixed(2) : "—"}</b><span>EV</span></div>
          </div>
        </div>` : ""}
      </div>
      <div class="sticky-cta">
        ${state.chooserOpen ? `<div class="chooser">${outcomes.map((o) => `<button type="button" class="choice pressable${state.pickSel === o.key ? " on" : ""}" data-sel="${o.key}"><small>${esc(o.name)}</small><b>${formatOdd(o.odd)}</b></button>`).join("")}</div>` : ""}
        <button type="button" class="cta" id="lockBtn">${!state.chooserOpen ? "CHOOSE THE WINNER" : state.pickSel ? "LOCK THIS PICK" : "PICK 1 · X · 2"}</button>
        ${state.pickSel ? `<p style="text-align:center;margin-top:6px;font-size:11px;color:rgb(17 17 17 / 0.55)">${esc(outcomes.find((o)=>o.key===state.pickSel)?.name || "")} · ${formatOdd(outcomes.find((o)=>o.key===state.pickSel)?.odd)} · from ${formatGhs(1)}</p>` : ""}
      </div>
    </div>`;
  }

  function engineCard(p) {
    const k = kickParts(p.kickoff);
    const locked = onSlip(p.id, p.engine || "pick");
    const odd = p.odd;
    return `<article class="card tone-${p.tone}">
      <div class="card-top">
        <div class="badges">${badge(p.home)}${badge(p.away)}</div>
        <p class="card-date">${esc(k.weekday)} ${esc(k.time)}</p>
      </div>
      <a href="#/match/${encodeURIComponent(p.id)}" style="display:block;margin-top:8px">
        <p class="font-cond" style="font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:rgb(17 17 17 / 0.6)">${esc(p.home.short)} vs ${esc(p.away.short)}</p>
        <p class="font-display" style="font-size:36px;line-height:1;margin-top:2px">${esc(p.selection || p.market)}</p>
        <p class="lede" style="max-width:none">${esc(p.market)}${p.routeLabel ? " · " + esc(p.routeLabel) : p.tier ? " · " + esc(p.tier) : ""}</p>
      </a>
      <div class="metrics">
        <div class="metric"><b>${p.model ? p.model + "%" : "—"}</b><span>MODEL</span></div>
        <div class="metric"><b>${p.splitHit != null ? p.splitHit + "%" : "—"}</b><span>HIT</span></div>
        <div class="metric"><b>${p.confidence || "—"}</b><span>CONF</span></div>
        <div class="metric"><b>${p.ev ? p.ev.toFixed(2) : formatOdd(odd)}</b><span>${p.ev ? "EV" : "ODD"}</span></div>
      </div>
      <button type="button" class="btn-ink pressable" style="height:40px;margin-top:12px;font-size:12px" data-add="${encodeURIComponent(JSON.stringify({
        matchId: p.id, market: p.engine || "pick", selection: p.selection, label: p.selection || p.market,
        detail: `${p.home.abbr} vs ${p.away.abbr} · ${p.engine}`, odd: odd || 1.01,
      }))}">${locked ? `ON SLIP · ${formatOdd(odd || 1.01)}` : `ADD · ${formatOdd(odd || 1.01)}`}</button>
    </article>`;
  }

  function renderFlash() {
    const list = state.flash;
    return `<div class="view view-pink">
      <div class="view-scroll">
        ${headerBrand("COVER IQ", { title: "FLASH", sub: "PICKS", lede: "Model ≥ 75 · split-hit ≥ 75 · confidence ≥ 80 · EV ≥ 1.04. Papa only ships the clean ones." })}
        <div class="stack stagger">
          ${state.loading ? `<div class="skel"></div><div class="skel"></div>` : ""}
          ${!state.loading && !list.length ? `<div class="empty"><h2>SKIP</h2><p>No Flash pick cleared the gates. Papa would rather ship nothing than a dirty board.</p></div>` : ""}
          ${list.map(engineCard).join("")}
        </div>
      </div>
    </div>`;
  }

  function renderBoard(title, sub, lede, list) {
    return `<div class="view view-pink">
      <div class="view-scroll">
        ${headerBrand("PAPA'S ENGINE", { title, sub, lede })}
        <div class="stack stagger">
          ${state.loading ? `<div class="skel"></div>` : ""}
          ${!state.loading && !list.length ? `<div class="empty"><h2>NO LOCKS</h2><p>Nothing qualified on this board yet.</p></div>` : ""}
          ${list.map(engineCard).join("")}
        </div>
      </div>
    </div>`;
  }

  function renderVisa() {
    const activeDay = state.visaWeek.find((day) => day.date === state.visaDate);
    const tabs = state.visaWeek.map((day) => {
      const date = new Date(`${day.date}T12:00:00.000Z`);
      const label = `${WEEK[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()].slice(0, 3)}`;
      return `<button type="button" class="tab${day.date === state.visaDate ? " on" : ""}" data-visa-date="${esc(day.date)}" role="tab" aria-selected="${day.date === state.visaDate}">${esc(label)} · ${day.picks.length}</button>`;
    }).join("");
    return `<div class="view view-pink">
      <div class="view-scroll">
        ${headerBrand("PAPA'S ENGINE", {
          title: "VISA",
          sub: "SPLIT",
          lede: "Top 4 win against weaker splits. Top 4 vs a competitive top-six team becomes DNB. Bottom 3 is opposed."
        })}
        <div class="tabs" role="tablist" aria-label="Visa dates">${tabs}</div>
        ${activeDay ? `<p class="eyebrow" style="margin-top:8px">${activeDay.picks.length} PICKS · ${activeDay.reviewedFixtures} GAMES CHECKED</p>` : ""}
        <div class="stack stagger">
          ${state.loading ? `<div class="skel"></div>` : ""}
          ${!state.loading && !state.visa.length ? `<div class="empty"><h2>NO VISA</h2><p>No selection cleared the exact split-rank and SportyBet gates for this date.</p></div>` : ""}
          ${state.visa.map(engineCard).join("")}
        </div>
      </div>
    </div>`;
  }

  function renderPapa() {
    const nFlash = state.flash.length;
    const nBank = state.bankers.length;
    const nAth = state.athena.length;
    return `<div class="view view-ink">
      <div class="view-scroll">
        <div class="papa-hero">
          <img class="cover" src="${PAPA}" alt="BetsPapa — Papa knows the game">
          <div class="fade"></div>
          <div class="brand-left"><img class="brand-mark" src="${LOGO}" alt="" style="outline:2px solid var(--cream)"><p class="eyebrow" style="color:#fff7f4">BETSPAPA</p></div>
        </div>
        <div class="pad">
          <p class="eyebrow" style="color:rgb(255 247 244 / 0.5)">COVER IQ · 2026</p>
          <h1 class="display">PAPA</h1>
          <p class="display" style="color:var(--papa)">KNOWS</p>
          <p class="display">THE GAME</p>
          <p class="lede" style="color:rgb(255 247 244 / 0.7);font-size:14px;max-width:38ch">BetsPapa reads the board so you do not have to. Flash is the shortlist. Bankers, Athena and the rest only ship when the gates clear.</p>
        </div>
        <div class="metrics pad-x" style="grid-template-columns:repeat(4,1fr);margin-top:16px">
          <div class="metric" style="background:rgb(255 247 244 / 0.1);color:#fff7f4"><b>${nFlash}</b><span>FLASH</span></div>
          <div class="metric" style="background:rgb(255 247 244 / 0.1);color:#fff7f4"><b>${nBank}</b><span>BANKERS</span></div>
          <div class="metric" style="background:rgb(255 247 244 / 0.1);color:#fff7f4"><b>${nAth}</b><span>ATHENA</span></div>
          <div class="metric" style="background:rgb(255 247 244 / 0.1);color:#fff7f4"><b>${state.fixtures.length}</b><span>GAMES</span></div>
        </div>
        <div class="stack hub" style="gap:8px">
          <div class="rule"><b>01</b><div><p class="font-cond" style="letter-spacing:.12em">MODEL</p><p class="lede" style="color:rgb(255 247 244 / 0.6)">Cover IQ prices the match off chance quality, not the table.</p></div></div>
          <div class="rule"><b>02</b><div><p class="font-cond" style="letter-spacing:.12em">SPLIT HIT</p><p class="lede" style="color:rgb(255 247 244 / 0.6)">The pick has to clear 75% on both home and away samples.</p></div></div>
          <div class="rule"><b>03</b><div><p class="font-cond" style="letter-spacing:.12em">VALUE</p><p class="lede" style="color:rgb(255 247 244 / 0.6)">Only ships if EV sits at 1.04 or better, odds 1.20 to 1.85.</p></div></div>
          <button type="button" class="cta" data-go="flash">OPEN TODAY'S FLASH</button>
          <button type="button" data-go="bankers">PapaLock Bankers</button>
          <button type="button" data-go="athena">Athena</button>
          <button type="button" data-go="goals">Goals Banker</button>
          <button type="button" data-go="wins">Wins Banker</button>
          <button type="button" data-go="visa">Visa Engine</button>
          <a href="/results-intelligence.html">Results</a>
          <a href="/responsible.html">18+ · Responsible use</a>
        </div>
      </div>
    </div>`;
  }

  function renderSlip() {
    const picks = state.slip.picks;
    const combined = picks.reduce((a, p) => a * (Number(p.odd) || 1), 1);
    const returns = state.slip.stake * (picks.length ? combined : 0);
    return `<div class="view view-cream">
      <div class="view-scroll">
        ${headerBrand("YOUR TICKET", { title: "SLIP", sub: String(picks.length).padStart(2, "0") + " LEGS" })}
        <div class="stack">
          ${!picks.length ? `<div class="empty"><h2>EMPTY</h2><p>Lock a winner from fixtures or grab a Flash pick.</p><button class="btn-ink" style="margin:20px auto 0;width:auto;padding:0 20px;height:44px;font-size:12px" data-go="flash">OPEN FLASH</button></div>` : picks.map((p) => `<div class="slip-row">
            <a href="#/match/${encodeURIComponent(p.matchId)}" style="flex:1;min-width:0">
              <p class="font-cond" style="font-size:15px;text-transform:uppercase">${esc(p.label)}</p>
              <p class="lede" style="margin:0">${esc(p.detail)}</p>
            </a>
            <p class="odd">${formatOdd(p.odd)}</p>
            <button class="kill" data-del="${esc(p.matchId)}|${esc(p.market)}" aria-label="Remove">${ICO.x}</button>
          </div>`).join("")}
          <label class="stake-box"><span class="eyebrow">STAKE · GHS</span>
            <input id="stakeInput" type="number" min="1" max="5000" value="${esc(state.slip.stake)}">
          </label>
          <div class="sum-grid">
            <div class="sum-box ink"><span>COMBINED</span><b>${picks.length ? formatOdd(combined) : "—"}</b></div>
            <div class="sum-box cta"><span>RETURNS</span><b>${picks.length ? formatGhs(returns) : "—"}</b></div>
          </div>
          <button class="btn-ink" id="confirmSlip" ${picks.length ? "" : "disabled"}>CONFIRM TICKET</button>
          <p style="text-align:center;font-size:11px;color:rgb(17 17 17 / 0.45)">18+ · Demo ticket · Gamble responsibly</p>
        </div>
      </div>
    </div>`;
  }

  function viewFor(route, nested) {
    switch (route.name) {
      case "flash": return renderFlash();
      case "papa": return renderPapa();
      case "slip": return renderSlip();
      case "bankers": return renderBoard("BANKERS", "LOCKS", "PapaLock consensus. Elite and Prime only.", state.bankers);
      case "athena": return renderBoard("ATHENA", "SWING", "Half-goal and swing-resolution board.", state.athena);
      case "goals": return renderBoard("GOALS", "BANKER", "Total-goals locks.", state.goals);
      case "wins": return renderBoard("WINS", "BANKER", "Win-market locks.", state.wins);
      case "visa": return renderVisa();
      case "match": return renderMatch(matchById(route.id), nested);
      default: return renderFixtures();
    }
  }

  function render() {
    const root = document.getElementById("app");
    if (!root) return;
    const route = state.route;
    const desktopMatch = featuredMatch();
    const mainRoute = route.name === "home" && window.matchMedia("(min-width: 900px)").matches
      ? { name: "match", id: desktopMatch?.id }
      : route;
    root.innerHTML = `
      <div class="app-root">
        <div class="wallpaper" aria-hidden="true">
          <p class="wallpaper-type" style="top:-24px;left:-16px;font-size:180px">BETS</p>
          <p class="wallpaper-type" style="top:18%;right:-32px;font-size:180px">PAPA</p>
          <p class="wallpaper-type" style="top:48%;left:-40px;font-size:160px">FLASH</p>
          <p class="wallpaper-type" style="right:0;bottom:-20px;font-size:140px">KNOWS</p>
        </div>
        <div class="stage">
          <div class="phone phone-list" id="listPane">${renderFixtures()}</div>
          <div class="phone phone-main" id="mainPane">
            ${viewFor(mainRoute, route.name === "home")}
            ${navHtml(route.name)}
          </div>
        </div>
        ${state.toast ? `<div class="toast"><strong>${esc(state.toast.title)}</strong><div>${esc(state.toast.detail || "")}</div></div>` : ""}
      </div>`;
    bind();
  }

  function bind() {
    document.querySelectorAll("[data-go]").forEach((el) => el.addEventListener("click", () => go(el.getAttribute("data-go"))));
    document.querySelectorAll("[data-tab]").forEach((el) => el.addEventListener("click", () => {
      state.tab = el.getAttribute("data-tab");
      render();
    }));
    document.querySelectorAll("[data-visa-date]").forEach((el) => el.addEventListener("click", () => {
      state.visaDate = el.getAttribute("data-visa-date");
      state.visa = state.visaWeek.find((day) => day.date === state.visaDate)?.picks || [];
      render();
    }));
    document.querySelectorAll("[data-sel]").forEach((el) => el.addEventListener("click", () => {
      state.pickSel = el.getAttribute("data-sel");
      render();
    }));
    document.querySelectorAll("[data-add]").forEach((el) => el.addEventListener("click", () => {
      try { addPick(JSON.parse(decodeURIComponent(el.getAttribute("data-add")))); } catch {}
    }));
    document.querySelectorAll("[data-del]").forEach((el) => el.addEventListener("click", () => {
      const [id, market] = (el.getAttribute("data-del") || "").split("|");
      removePick(id, market);
    }));
    const lockBtn = document.getElementById("lockBtn");
    if (lockBtn) lockBtn.addEventListener("click", () => {
      const m = matchById(state.route.id) || featuredMatch();
      if (!m) return;
      if (!state.chooserOpen) { state.chooserOpen = true; render(); return; }
      if (!state.pickSel) return;
      const probs = m.probs || m.flash?.probs || { home: 40, draw: 28, away: 32 };
      const odds = { home: oddsFromProb(probs.home), draw: oddsFromProb(probs.draw), away: oddsFromProb(probs.away) };
      const label = state.pickSel === "home" ? m.home.short : state.pickSel === "away" ? m.away.short : "Draw";
      addPick({
        matchId: m.id,
        market: "1x2",
        selection: state.pickSel,
        label,
        detail: `${m.home.abbr} vs ${m.away.abbr} · ${kickParts(m.kickoff).date}`,
        odd: odds[state.pickSel],
      });
    });
    const stake = document.getElementById("stakeInput");
    if (stake) stake.addEventListener("change", () => {
      state.slip.stake = Math.max(1, Math.min(5000, Number(stake.value) || 1));
      saveSlip();
      render();
    });
    const confirm = document.getElementById("confirmSlip");
    if (confirm) confirm.addEventListener("click", () => {
      if (!state.slip.picks.length) return;
      toast("Ticket noted", `${state.slip.picks.length} legs · demo slip, no real money.`);
      state.slip.picks = [];
      saveSlip();
      render();
    });
  }

  function boot() {
    state.route = parseHash();
    const app = document.getElementById("app");
    if (!app) return;
    render();
    bootData();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
