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
    tabTouched: false,
    returnTo: "home",
    toast: null,
    toastTimer: 0,
    pickSel: null,
    chooserOpen: false,
  };

  function pct(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n <= 1.5 ? n * 100 : n);
  }
  function pickTitle(p) {
    const sel = String(p?.selection || "").trim();
    const market = String(p?.market || "").trim();
    if (!sel || /^(yes|no)$/i.test(sel)) return market || sel || "PICK";
    return sel;
  }
  function formOf(src) {
    if (!src) return { home: [], away: [] };
    if (Array.isArray(src.home) || Array.isArray(src.away)) {
      return { home: (src.home || []).slice(-5), away: (src.away || []).slice(-5) };
    }
    return {
      home: (src.home?.form || src.form?.home || []).slice(-5),
      away: (src.away?.form || src.form?.away || []).slice(-5),
    };
  }
  function leagueRank(m) {
    const n = String(m?.league?.name || "").toLowerCase();
    const c = String(m?.league?.country || "").toLowerCase();
    if (n === "premier league" && c === "england") return 0;
    if (c === "ghana" || /ghana premier/i.test(n)) return 1;
    if (n === "la liga" && /spain/i.test(c)) return 2;
    if (n === "championship" && c === "england") return 3;
    return 8;
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
    const t = setTimeout(() => ctrl.abort(), 22000);
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
    const form = formOf(extras?.form || extras?.venueForm || f.venueForm);
    const probs = extras?.probs || (xg.home || xg.away ? matchProbs(xg.home, xg.away) : null);
    return {
      id,
      kickoff: f.kickoff,
      status: f.status,
      matchState: f.matchState || {},
      venue: f.venue?.name || f.venue || "",
      home, away, league,
      tone: toneFor(id || home.name),
      form,
      probs,
      odds: extras?.odds || null,
      flash: extras?.flash || null,
      flashList: extras?.flashList || (extras?.flash ? [extras.flash] : []),
      enginePick: extras?.enginePick || null,
      raw: f,
    };
  }

  function pickFromEngine(p, engine) {
    const home = teamOf(p.home);
    const away = teamOf(p.away);
    const id = fid(p);
    const xg = p.internalAudit?.expectedGoals || p.expectedGoals || {};
    const model = pct(p.modelProbability || p.confidence || p.score);
    const split = p.directHitRates?.combined != null ? pct(p.directHitRates.combined) : null;
    return {
      id,
      key: p.key || p.market || engine,
      engine,
      kickoff: p.kickoff,
      home, away,
      league: leagueOf(p.league),
      tone: toneFor(id || home.name),
      market: p.market || p.family || "Pick",
      selection: p.selection || p.consensusOutcome || "",
      odd: Number(p.odds) || 0,
      model,
      splitHit: split,
      confidence: pct(p.confidence || p.score),
      ev: Number(p.expectedValue) || 0,
      tier: p.tier || p.papaLockGrade || engine,
      routeLabel: p.routeLabel || "",
      note: p.publicExplanation || p.explanationParagraph || (p.reasons && p.reasons[0]) || "",
      form: formOf(p.form || p.venueForm),
      probs: xg.home || xg.away ? matchProbs(xg.home, xg.away) : null,
      sportyBetUrl: p.sportyBetUrl || "",
      matchState: p.matchState || {},
    };
  }

  function mergeByKey(list, keyFn) {
    const map = new Map();
    for (const item of list) {
      const k = keyFn(item);
      if (!k || map.has(k)) continue;
      map.set(k, item);
    }
    return [...map.values()];
  }

  function applyFixtures(fx0, fx1, flashPicks) {
    const flashLists = new Map();
    for (const p of flashPicks) {
      const list = flashLists.get(p.id) || [];
      list.push(p);
      flashLists.set(p.id, list);
    }
    const fx = []
      .concat(fx0?.fixtures || [])
      .concat(fx1?.fixtures || [])
      .map((f) => {
        const id = fid(f);
        const list = flashLists.get(id) || [];
        return normalizeFixture(f, list.length ? { flash: list[0], flashList: list, form: list[0].form, probs: list[0].probs } : null);
      });
    state.fixtures = mergeByKey(fx, (m) => m.id).sort((a, b) => {
      const rank = leagueRank(a) - leagueRank(b);
      return rank || String(a.kickoff).localeCompare(String(b.kickoff));
    });
  }

  function applyFlash(fl0, fl1) {
    const flashPicks = []
      .concat(fl0?.picks || [])
      .concat(fl1?.picks || [])
      .map((p) => pickFromEngine(p, "FLASH"));
    state.flash = mergeByKey(flashPicks, (p) => `${p.id}::${p.key}`);
    return state.flash;
  }

  function pickDefaultTab() {
    if (state.tabTouched) return;
    const tabs = leagueTabs();
    const epl = tabs.find((t) => t.name === "EPL");
    const ghana = tabs.find((t) => t.name === "GHANA");
    state.tab = (epl || ghana || tabs[0])?.key || "all";
  }

  async function bootData() {
    state.loading = true;
    state.error = null;
    render();
    const d0 = todayUtc();
    const d1 = addDays(d0, 1);

    const [fx0, fx1] = await Promise.all([
      getJson(`/api/fixtures/today?date=${d0}&refresh=skip`).catch((err) => ({ error: String(err && err.message || err) })),
      getJson(`/api/fixtures/today?date=${d1}&refresh=skip`).catch((err) => ({ error: String(err && err.message || err) })),
    ]);
    applyFixtures(fx0, fx1, []);
    state.loading = false;
    if (!state.fixtures.length) state.error = "Papa's board is still warming up. Pull again in a moment.";
    pickDefaultTab();
    render();

    const [fl0, fl1] = await Promise.all([
      getJson(`/api/flash/today?date=${d0}`).catch((err) => ({ error: String(err && err.message || err) })),
      getJson(`/api/flash/today?date=${d1}`).catch((err) => ({ error: String(err && err.message || err) })),
    ]);
    applyFlash(fl0, fl1);
    applyFixtures(fx0, fx1, state.flash);
    if (state.fixtures.length || state.flash.length) state.error = null;
    else if (!state.error) state.error = "Papa's board is still warming up. Pull again in a moment.";
    render();

    const side = await Promise.all([
      getJson(`/api/bankers/today?date=${d0}`).catch((err) => ({ error: String(err && err.message || err) })),
      getJson(`/api/athena/today?date=${d0}`).catch((err) => ({ error: String(err && err.message || err) })),
      getJson(`/api/goals-bankers/today?date=${d0}`).catch((err) => ({ error: String(err && err.message || err) })),
      getJson(`/api/wins-bankers/today?date=${d0}`).catch((err) => ({ error: String(err && err.message || err) })),
      getJson(`/api/visa/week?start=${d0}&days=7`).catch((err) => ({ error: String(err && err.message || err) })),
    ]);
    const [bankers, athena, goals, wins, visaWeek] = side;
    state.bankers = (bankers?.picks || []).map((p) => pickFromEngine(p, "BANKERS"));
    state.athena = (athena?.picks || []).map((p) => pickFromEngine(p, "ATHENA"));
    state.goals = (goals?.picks || []).map((p) => pickFromEngine(p, "GOALS"));
    state.wins = (wins?.picks || []).map((p) => pickFromEngine(p, "WINS"));
    state.visaWeek = (Array.isArray(visaWeek?.days) ? visaWeek.days : []).map((day) => ({
      date: day.date,
      reviewedFixtures: Number(day.reviewedFixtures) || 0,
      picks: (day.picks || day.items || []).map((p) => pickFromEngine(p, "VISA")),
    }));
    state.visaDate = state.visaWeek.some((day) => day.date === state.visaDate)
      ? state.visaDate
      : state.visaWeek[0]?.date || d0;
    state.visa = state.visaWeek.find((day) => day.date === state.visaDate)?.picks || [];
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
    const epl = prefer((l) => /^premier league$/i.test(l.name) && /^england$/i.test(l.country));
    const ghana = prefer((l) => /^ghana$/i.test(l.country) || /ghana premier/i.test(l.name));
    const spain = prefer((l) => /^la liga$/i.test(l.name) && /spain/i.test(l.country));
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
    const list = state.tab === "all"
      ? state.fixtures.slice()
      : state.fixtures.filter((m) => `${m.league.country}|${m.league.name}` === state.tab);
    return list;
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
    const flashList = state.flash.filter((p) => p.id === String(id));
    const boards = [...state.bankers, ...state.athena, ...state.goals, ...state.wins, ...state.visa];
    const extra = boards.filter((x) => x.id === String(id));
    const attach = (base, list) => {
      const have = new Set((list || []).map((p) => p.key));
      const merged = (list || []).slice();
      for (const p of extra) if (!have.has(p.key)) merged.push(p);
      base.flashList = merged;
      if (merged.length) base.flash = merged[0];
      return base;
    };
    if (fx) return attach(fx, flashList.length ? flashList : fx.flashList);
    if (flashList.length) return attach(flashAsMatch(flashList[0]), flashList);
    if (extra.length) return attach(flashAsMatch(extra[0]), extra);
    return null;
  }

  function parseHash() {
    const raw = (location.hash || "").replace(/^#/, "");
    const parts = raw.split("/").filter(Boolean);
    if (!parts.length) {
      if (!location.hash && START && START !== "home" && START !== "slip") return { name: START, id: null };
      return { name: "home", id: null };
    }
    if (parts[0] === "match" && parts[1]) return { name: "match", id: decodeURIComponent(parts[1]) };
    if (parts[0] === "slip" || parts[0] === "watchlist") return { name: "flash", id: null };
    const known = ["home","flash","papa","bankers","athena","goals","wins","visa"];
    if (!known.includes(parts[0])) return { name: "home", id: null };
    return { name: parts[0], id: null };
  }
  function go(name, id) {
    if (name === "slip" || name === "watchlist") name = "flash";
    if (name === "back") name = state.returnTo || "home";
    if (name !== "match") state.returnTo = name === "home" ? "home" : name;
    const hash = name === "home" ? "#/" : name === "match" ? `#/match/${encodeURIComponent(id)}` : `#/${name}`;
    if (location.hash !== hash) location.hash = hash;
    else {
      state.route = { name, id: id || null };
      state.chooserOpen = false;
      state.pickSel = null;
      render();
      document.getElementById("mainPane")?.querySelector(".view-scroll")?.scrollTo(0, 0);
    }
  }
  window.addEventListener("hashchange", () => {
    state.route = parseHash();
    state.chooserOpen = false;
    state.pickSel = null;
    render();
    document.getElementById("mainPane")?.querySelector(".view-scroll")?.scrollTo(0, 0);
  });
  window.matchMedia("(min-width: 900px)").addEventListener("change", () => render());

  function toast(title, detail) {
    state.toast = { title, detail };
    render();
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => { state.toast = null; render(); }, 2400);
  }

  function navHtml(active) {
    const items = [
      { name: "home", label: "Fixtures", icon: ICO.list },
      { name: "flash", label: "Flash", icon: ICO.zap },
      { name: "papa", label: "Papa", icon: `<img src="${PAPA}" alt="">` },
    ];
    return `<nav class="nav" aria-label="Primary"><div class="nav-bar">${items.map((it) => {
      const on = active === it.name || (active === "match" && it.name === "home") || (["bankers","athena","goals","wins","visa","results","legal"].includes(active) && it.name === "papa");
      return `<button type="button" class="nav-item${on ? " on" : ""}" data-go="${it.name}">${it.icon}<span>${it.label}</span></button>`;
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
    const list = fixturesForTab();
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
          ${state.error && !list.length ? `<div class="empty"><h2>WAIT</h2><p>${esc(state.error)}</p><button class="btn-ink" style="margin:16px auto 0;width:auto;padding:0 20px;height:44px" data-retry="1">RETRY</button></div>` : ""}
          ${state.loading ? `<div class="skel"></div><div class="skel"></div><div class="skel"></div>` : ""}
          ${!state.loading && !list.length && !state.error ? `<div class="empty"><h2>NO MATCHES</h2><p>Nothing in this league yet. Try another tab.</p></div>` : ""}
          ${list.slice(0, 80).map(matchCard).join("")}
          ${list.length > 80 ? `<p class="lede" style="text-align:center">${list.length - 80} more kickoffs sit behind these 80.</p>` : ""}
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
    const flashList = m.flashList || (engine ? [engine] : []);
    const formH = (m.form?.home && m.form.home.length) ? m.form.home : (engine?.form?.home || []);
    const formA = (m.form?.away && m.form.away.length) ? m.form.away : (engine?.form?.away || []);
    const betUrl = flashList.find((fp) => fp.sportyBetUrl)?.sportyBetUrl || engine?.sportyBetUrl || "";
    return `<div class="view view-pink">
      <header class="pad" style="display:flex;align-items:center;justify-content:space-between">
        ${nested ? `<img class="brand-mark" src="${LOGO}" alt="">` : `<button class="icon-btn" data-go="back" aria-label="Back">${ICO.back}</button>`}
        <img class="brand-mark" src="${LOGO}" alt="BetsPapa" style="outline:2px solid var(--cream)">
      </header>
      <div class="view-scroll" style="padding:4px 20px 8px">
        <p class="eyebrow">PAST GAMES</p>
        <h1 class="display" style="font-size:46px;max-width:13ch">${esc(headline)}</h1>
        <div style="margin-top:16px;display:flex;flex-direction:column;gap:6px">
          ${formDots(formH, m.home.abbr)}
          ${formDots(formA, m.away.abbr)}
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
        ${flashList.map((fp) => `<div class="card tone-${m.tone}" style="margin-top:12px">
          <p class="eyebrow">${esc(fp.tier)} · ${esc(fp.market)}</p>
          <p class="font-display" style="font-size:32px;line-height:1;margin-top:4px">${esc(pickTitle(fp))}</p>
          <p class="lede" style="max-width:none">${esc(fp.note)}</p>
          <div class="metrics">
            <div class="metric"><b>${fp.model || "—"}%</b><span>MODEL</span></div>
            <div class="metric"><b>${fp.splitHit != null ? fp.splitHit + "%" : "—"}</b><span>HIT</span></div>
            <div class="metric"><b>${fp.confidence || "—"}</b><span>CONF</span></div>
            <div class="metric"><b>${fp.ev ? fp.ev.toFixed(2) : formatOdd(fp.odd)}</b><span>${fp.ev ? "EV" : "ODD"}</span></div>
          </div>
        </div>`).join("")}
      </div>
      <div class="sticky-cta">
        ${state.chooserOpen ? `<div class="chooser">${outcomes.map((o) => `<button type="button" class="choice pressable${state.pickSel === o.key ? " on" : ""}" data-sel="${o.key}"><small>${esc(o.name)}</small><b>${formatOdd(o.odd)}</b></button>`).join("")}</div>` : ""}
        <button type="button" class="cta" id="lockBtn">${state.chooserOpen ? (state.pickSel ? outcomes.find((o) => o.key === state.pickSel)?.name || "1 · X · 2" : "1 · X · 2") : "CHOOSE THE WINNER"}</button>
        ${betUrl ? `<a class="btn-ink" href="${esc(betUrl)}" target="_blank" rel="noopener" style="margin-top:8px">OPEN ON SPORTYBET</a>` : ""}
      </div>
    </div>`;
  }

  function engineCard(p) {
    const k = kickParts(p.kickoff);
    const odd = p.odd;
    return `<article class="card tone-${p.tone}">
      <div class="card-top">
        <div class="badges">${badge(p.home)}${badge(p.away)}</div>
        <p class="card-date">${esc(k.weekday)} ${esc(k.time)}</p>
      </div>
      <a href="#/match/${encodeURIComponent(p.id)}" style="display:block;margin-top:8px">
        <p class="font-cond" style="font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:rgb(17 17 17 / 0.6)">${esc(p.home.short)} vs ${esc(p.away.short)}</p>
        <p class="font-display" style="font-size:36px;line-height:1;margin-top:2px">${esc(pickTitle(p))}</p>
        <p class="lede" style="max-width:none">${esc(p.market)}${p.routeLabel ? " · " + esc(p.routeLabel) : p.tier ? " · " + esc(p.tier) : ""} · ${formatOdd(odd)}</p>
      </a>
      <div class="metrics">
        <div class="metric"><b>${p.model ? p.model + "%" : "—"}</b><span>MODEL</span></div>
        <div class="metric"><b>${p.splitHit != null ? p.splitHit + "%" : "—"}</b><span>HIT</span></div>
        <div class="metric"><b>${p.confidence || "—"}</b><span>CONF</span></div>
        <div class="metric"><b>${p.ev ? p.ev.toFixed(2) : formatOdd(odd)}</b><span>${p.ev ? "EV" : "ODD"}</span></div>
      </div>
    </article>`;
  }

  function renderFlash() {
    const list = state.flash;
    return `<div class="view view-pink">
      <div class="view-scroll">
        ${headerBrand("COVER IQ", { title: "FLASH", sub: "PICKS", lede: "Every Cover IQ market that clears the gates ships. Model ≥ 75 · split-hit ≥ 75 · confidence ≥ 80 · EV ≥ 1.04." })}
        <div class="stack stagger">
          ${state.loading ? `<div class="skel"></div><div class="skel"></div>` : ""}
          ${!state.loading && !list.length ? `<div class="empty"><h2>NO FLASH</h2><p>No Cover IQ market cleared the gates yet. Papa would rather ship nothing than a dirty board.</p></div>` : ""}
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

  function viewFor(route, nested) {
    switch (route.name) {
      case "flash": return renderFlash();
      case "papa": return renderPapa();
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
      state.tabTouched = true;
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
    document.querySelectorAll("[data-retry]").forEach((el) => el.addEventListener("click", () => bootData()));
    const lockBtn = document.getElementById("lockBtn");
    if (lockBtn) lockBtn.addEventListener("click", () => {
      if (!state.chooserOpen) { state.chooserOpen = true; render(); }
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
