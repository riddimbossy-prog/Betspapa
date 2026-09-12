/* BetsPapa Screens app — full public UI, live engines via api.betspapa.com */
(function () {
  "use strict";

  const API = window.BETSPAPA_API_URL || "https://api.betspapa.com";
  const START = window.BETSPAPA_START || "papa";
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
    orbit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="3"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><path d="M10.4 21.9a10 10 0 0 0 9.5-9.5"/><path d="M13.6 2.1a10 10 0 0 0-9.5 9.5"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 18l-6-6 6-6"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  };

  const state = {
    route: { name: !START || START === "home" || START === "fixtures" ? "papa" : START, id: null },
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
    monika: [],
    sporty: [],
    loading: true,
    error: null,
    tabTouched: false,
    returnTo: "papa",
    toast: null,
    toastTimer: 0,
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
  function priced(p) {
    return Number(p?.odd) > 1;
  }

  const MARKET_RANK = { "1X2": 0, "DOUBLE CHANCE": 1, "DRAW NO BET": 2, OVER: 3, UNDER: 4, BTTS: 5 };

  function marketFamily(p) {
    const blob = `${p.market || ""} ${p.selection || p.pick || ""}`.toLowerCase();
    if (/double chance|\bdc\b/.test(blob)) return "DOUBLE CHANCE";
    if (/draw no bet|\bdnb\b/.test(blob)) return "DRAW NO BET";
    if (/btts|both teams|\bgg\b/.test(blob)) return "BTTS";
    if (/under/.test(blob)) return "UNDER";
    if (/over|2\+|score 2/.test(blob)) return "OVER";
    if (/1x2|\bwin\b|moneyline/.test(blob)) return "1X2";
    return String(p.market || "PICK").toUpperCase();
  }
  function isBanker(p) {
    return Number(p.confidence) >= 90 || Number(p.splitHit) >= 90 || Number(p.step) === 1 || /^Step 1/.test(p.note || "");
  }
  function dayHeading(iso) {
    const k = kickParts(iso);
    const date = String(iso || "").slice(0, 10);
    const today = todayUtc();
    const tomorrow = addDays(today, 1);
    if (date === today) return `TODAY · ${k.weekday} ${k.day} ${k.monthShort}`;
    if (date === tomorrow) return `TOMORROW · ${k.weekday} ${k.day} ${k.monthShort}`;
    return `${k.weekday} ${k.day} ${k.monthShort}`;
  }
  function compareTips(a, b) {
    const da = String(a.kickoff || "").slice(0, 10);
    const db = String(b.kickoff || "").slice(0, 10);
    if (da !== db) return da.localeCompare(db);
    const ma = marketFamily(a);
    const mb = marketFamily(b);
    const ra = MARKET_RANK[ma] ?? 50;
    const rb = MARKET_RANK[mb] ?? 50;
    if (ra !== rb) return ra - rb;
    if (ma !== mb) return ma.localeCompare(mb);
    const ka = String(a.kickoff || "");
    const kb = String(b.kickoff || "");
    if (ka !== kb) return ka.localeCompare(kb);
    const bank = Number(isBanker(b)) - Number(isBanker(a));
    if (bank) return bank;
    return Number(b.confidence) - Number(a.confidence);
  }
  function groupTips(list) {
    const sorted = (list || []).slice().sort(compareTips);
    const days = [];
    for (const row of sorted) {
      const date = String(row.kickoff || "").slice(0, 10) || "open";
      const market = marketFamily(row);
      const time = kickParts(row.kickoff).time;
      let day = days[days.length - 1];
      if (!day || day.date !== date) {
        day = { date, label: dayHeading(row.kickoff), markets: [] };
        days.push(day);
      }
      let bucket = day.markets[day.markets.length - 1];
      if (!bucket || bucket.market !== market) {
        bucket = { market, times: [] };
        day.markets.push(bucket);
      }
      let slot = bucket.times[bucket.times.length - 1];
      if (!slot || slot.time !== time) {
        slot = { time, items: [] };
        bucket.times.push(slot);
      }
      slot.items.push(row);
    }
    return days;
  }
  function marketSize(mk) {
    return (mk.times || []).reduce((n, slot) => n + slot.items.length, 0);
  }
  function groupedCards(list) {
    return groupTips(list).map((day) => {
      const n = day.markets.reduce((sum, mk) => sum + marketSize(mk), 0);
      return `<section class="day-block">
        <div class="day-head">
          <h2 class="display day-title">${esc(day.label)}</h2>
          <p class="day-count">${n}</p>
        </div>
        ${day.markets.map((mk) => `<div class="market-block">
          <p class="market-head">${esc(mk.market)} · ${marketSize(mk)}</p>
          ${mk.times.map((slot) => `<div class="time-block">
            <div class="time-head">
              <p class="time-title">${esc(slot.time)}</p>
              <p class="time-count">${slot.items.length}</p>
            </div>
            ${slot.items.map(engineCard).join("")}
          </div>`).join("")}
        </div>`).join("")}
      </section>`;
    }).join("");
  }

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

  function ghanaUrl(url, eventId) {
    if (eventId) return `https://www.sportybet.com/gh/sport/football/event/${encodeURIComponent(eventId)}`;
    const u = String(url || "");
    if (u.includes("sportybet.com")) return u.replace("/ng/", "/gh/");
    return "https://www.sportybet.com/gh/sport/football";
  }
  function normName(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/&/g, "and")
      .replace(/\b(fc|cf|sc|afc|cfc|fk|if|bk|sk|ac|as|ss|ud|cd|rcd|rc|club|de|the|women|u17|u18|u19|u20|u21|u23|reserves)\b/g, "")
      .replace(/[^a-z0-9]/g, "");
  }
  function namesAlign(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    return a.includes(b) || b.includes(a);
  }
  function findSporty(p) {
    const list = state.sporty || [];
    if (p.sportyBetEventId) {
      const hit = list.find((ev) => ev.eventId === p.sportyBetEventId);
      if (hit) return hit;
    }
    const home = normName(p.home && p.home.name);
    const away = normName(p.away && p.away.name);
    const kick = Date.parse(p.kickoff || 0);
    let best = null;
    let bestScore = 0;
    for (const ev of list) {
      const eh = normName(ev.home);
      const ea = normName(ev.away);
      const ok = namesAlign(home, eh) && namesAlign(away, ea);
      const rev = namesAlign(home, ea) && namesAlign(away, eh);
      if (!ok && !rev) continue;
      let score = ok ? 80 : 50;
      const evKick = Date.parse(ev.kickoff || 0);
      if (Number.isFinite(kick) && Number.isFinite(evKick)) {
        const delta = Math.abs(kick - evKick);
        if (delta > 18 * 3600 * 1000) continue;
        score += Math.max(0, 20 - delta / 3600000);
      }
      if (score > bestScore) {
        bestScore = score;
        best = ev;
      }
    }
    return best;
  }
  function liveOdd(odds, key, selection) {
    if (!odds) return 0;
    const k = String(key || "").toLowerCase();
    const sel = String(selection || "").toLowerCase();
    if (Number(odds[key]) > 1) return Number(odds[key]);
    if (Number(odds[k]) > 1) return Number(odds[k]);
    if (k.includes("home-over") || /score 2\+|over 1\.5/.test(sel)) return Number(odds["home-over-15"]) || 0;
    if (k.includes("away-over")) return Number(odds["away-over-15"]) || 0;
    if (k === "home" || /home win/.test(sel)) return Number(odds.home) || 0;
    if (k === "away" || /away win/.test(sel)) return Number(odds.away) || 0;
    if (k.includes("dnb") && /home/.test(k + sel)) return Number(odds["home-dnb"]) || 0;
    if (k.includes("dnb") && /away/.test(k + sel)) return Number(odds["away-dnb"]) || 0;
    if (k.includes("over-25") || /over 2\.5/.test(sel)) return Number(odds["over-25"]) || 0;
    if (k.includes("under-25") || /under 2\.5/.test(sel)) return Number(odds["under-25"]) || 0;
    if (k.includes("gg") || /both teams/.test(sel)) return Number(odds["btts-yes"]) || 0;
    return 0;
  }
  function overlayPick(p) {
    if (p.betExplorerUrl) return p;
    const ev = findSporty(p);
    if (!ev) {
      p.sportyBetUrl = ghanaUrl(p.sportyBetUrl, p.sportyBetEventId);
      return p;
    }
    const live = liveOdd(ev.odds, p.key, p.selection || p.market);
    p.sportyBetEventId = ev.eventId;
    p.sportyBetUrl = ghanaUrl(ev.url, ev.eventId);
    if (live > 1) p.odd = live;
    if (ev.odds) p.odds = ev.odds;
    return p;
  }
  function overlayList(list) {
    return (list || []).map(overlayPick).filter(priced);
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
      why: p.why || p.publicExplanation || "",
      step: p.step || null,
      trigger: p.trigger || "",
      form: formOf(p.form || p.venueForm),
      probs: xg.home || xg.away ? matchProbs(xg.home, xg.away) : null,
      sportyBetEventId: p.sportyBetEventId || "",
      sportyBetUrl: ghanaUrl(p.sportyBetUrl, p.sportyBetEventId),
      betExplorerUrl: p.betExplorerUrl || "",
      odds: p.odds1x2 || p.odds || null,
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

  function applyFlash(fl0, fl1) {
    const flashPicks = []
      .concat(fl0?.picks || [])
      .concat(fl1?.picks || [])
      .map((p) => pickFromEngine(p, "FLASH"));
    state.flash = mergeByKey(flashPicks, (p) => `${p.id}::${p.key}`).filter(priced);
    state.flash = overlayList(state.flash);
    return state.flash;
  }

  function applyVisaWeek(week) {
    state.visaWeek = (Array.isArray(week?.days) ? week.days : []).map((day) => ({
      date: day.date,
      reviewedFixtures: Number(day.reviewedFixtures) || 0,
      picks: overlayList((day.picks || day.items || []).map((p) => pickFromEngine(p, "VISA"))),
    }));
    state.visaDate = state.visaWeek.some((day) => day.date === state.visaDate)
      ? state.visaDate
      : state.visaWeek[0]?.date || todayUtc();
    state.visa = state.visaWeek.find((day) => day.date === state.visaDate)?.picks || [];
  }

  function applyMonika(slate) {
    state.monika = (slate?.picks || []).map((p) => pickFromEngine(p, "MONIKA")).filter(priced);
    return state.monika;
  }

  async function bootData() {
    state.loading = true;
    state.error = null;
    render();
    const d0 = todayUtc();
    const d1 = addDays(d0, 1);

    const [fl0, fl1, visaWeek, sporty, monika] = await Promise.all([
      getJson(`/api/flash/today?date=${d0}`).catch((err) => ({ error: String(err && err.message || err) })),
      getJson(`/api/flash/today?date=${d1}`).catch((err) => ({ error: String(err && err.message || err) })),
      getJson(`/api/visa/week?start=${d0}&days=7`).catch((err) => ({ error: String(err && err.message || err) })),
      getJson(`/api/sportybet/upcoming`).catch(() => ({ events: [] })),
      getJson(`/api/monika/today`).catch(() => ({ picks: [] })),
    ]);
    state.sporty = Array.isArray(sporty?.events) ? sporty.events : [];
    applyFlash(fl0, fl1);
    applyVisaWeek(visaWeek);
    applyMonika(monika);
    state.loading = false;
    if (!state.flash.length && !state.visa.length && !state.monika.length) {
      state.error = "Papa's tips are still warming up.";
    }
    render();

    const [bankers, athena, goals, wins] = await Promise.all([
      getJson(`/api/bankers/today?date=${d0}`).catch((err) => ({ error: String(err && err.message || err) })),
      getJson(`/api/athena/today?date=${d0}`).catch((err) => ({ error: String(err && err.message || err) })),
      getJson(`/api/goals-bankers/today?date=${d0}`).catch((err) => ({ error: String(err && err.message || err) })),
      getJson(`/api/wins-bankers/today?date=${d0}`).catch((err) => ({ error: String(err && err.message || err) })),
    ]);
    state.bankers = overlayList((bankers?.picks || []).map((p) => pickFromEngine(p, "BANKERS")));
    state.athena = overlayList((athena?.picks || []).map((p) => pickFromEngine(p, "ATHENA")));
    state.goals = overlayList((goals?.picks || []).map((p) => pickFromEngine(p, "GOALS")));
    state.wins = overlayList((wins?.picks || []).map((p) => pickFromEngine(p, "WINS")));
    if (state.flash.length || state.visa.length || state.bankers.length) state.error = null;
    render();
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
      odds: p.odds || null,
      flash: p,
      matchState: p.matchState || {},
      venue: "",
    };
  }

  function matchById(id) {
    const fx = state.fixtures.find((m) => m.id === String(id));
    const flashList = state.flash.filter((p) => p.id === String(id));
    const boards = [...state.bankers, ...state.athena, ...state.goals, ...state.wins, ...state.visa, ...state.monika];
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
      if (!location.hash && START && START !== "home" && START !== "fixtures" && START !== "slip") {
        return { name: START, id: null };
      }
      return { name: "papa", id: null };
    }
    if (parts[0] === "match" && parts[1]) return { name: "match", id: decodeURIComponent(parts[1]) };
    if (parts[0] === "slip" || parts[0] === "watchlist") return { name: "flash", id: null };
    if (parts[0] === "home" || parts[0] === "fixtures") return { name: "papa", id: null };
    const known = ["papa","flash","visa","monika","bankers","athena","goals","wins"];
    if (!known.includes(parts[0])) return { name: "papa", id: null };
    return { name: parts[0], id: null };
  }
  function go(name, id) {
    if (name === "slip" || name === "watchlist") name = "flash";
    if (name === "home" || name === "fixtures") name = "papa";
    if (name === "back") name = state.returnTo || "papa";
    if (name !== "match") state.returnTo = name;
    const hash = name === "papa" ? "#/" : name === "match" ? `#/match/${encodeURIComponent(id)}` : `#/${name}`;
    if (location.hash !== hash) location.hash = hash;
    else {
      state.route = { name, id: id || null };
      render();
      document.getElementById("mainPane")?.querySelector(".view-scroll")?.scrollTo(0, 0);
    }
  }
  window.addEventListener("hashchange", () => {
    state.route = parseHash();
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
      { name: "visa", label: "Visa", icon: ICO.ticket },
      { name: "flash", label: "Flash", icon: ICO.zap },
      { name: "monika", label: "Monika", icon: ICO.orbit },
      { name: "papa", label: "Papa", icon: `<img src="${PAPA}" alt="">` },
    ];
    return `<nav class="nav" aria-label="Primary"><div class="nav-bar">${items.map((it) => {
      const on = active === it.name
        || (active === "match" && (state.returnTo === it.name || (!state.returnTo && it.name === "visa")))
        || (["bankers","athena","goals","wins"].includes(active) && it.name === "papa");
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

  function whyHtml(fp) {
    const steps = { 1: "Club identity", 2: "Favourite price", 3: "Draw odds", 4: "League floor" };
    const step = Number(fp.step) || Number(String(fp.note || "").match(/Step (\d)/)?.[1]) || 0;
    let why = fp.why || "";
    if (!why && fp.note && !/^Step \d/.test(fp.note)) why = fp.note;
    if (!why && step && fp.trigger) why = `${steps[step] || "Monika"}. ${fp.trigger}. Priced at ${formatOdd(fp.odd)}.`;
    if (!why && fp.engine === "FLASH" && fp.model) why = `Cover IQ cleared ${fp.market}. Model ${fp.model}% at ${formatOdd(fp.odd)}.`;
    if (!why && fp.engine === "VISA" && fp.model) why = `Visa split-form route. Model ${fp.model}% at ${formatOdd(fp.odd)}.`;
    if (!why) return "";
    const kicker = step && steps[step] ? `Step ${step} · ${steps[step]}` : (fp.engine || fp.tier || "Why");
    return `<div style="margin-top:10px;background:rgb(255 247 244 / 0.65);border-radius:16px;padding:10px 12px">
      <p class="eyebrow">${esc(kicker)}</p>
      <p class="lede" style="max-width:none;margin-top:4px;color:rgb(17 17 17 / 0.8)">${esc(why)}</p>
    </div>`;
  }

  function formDots(form, label) {
    const bits = (form && form.length ? form : ["-", "-", "-", "-", "-"]).slice(-5);
    return `<div class="form-row"><span class="form-lab">${esc(label)}</span><div class="badges">${bits.map((r) => `<span class="dot ${esc(r)}">${esc(r)}</span>`).join("")}</div></div>`;
  }

  function renderMatch(m, nested) {
    if (!m) {
      return `<div class="view view-pink"><div class="view-scroll" style="display:grid;place-items:center;padding:24px;text-align:center">
        <div><h1 class="display">NO MATCH</h1><button class="btn-ink" style="margin-top:16px;width:auto;padding:0 20px" data-go="papa">BACK</button></div>
      </div></div>`;
    }
    const k = kickParts(m.kickoff);
    const headline = m.flash ? pickTitle(m.flash) : m.matchState?.isLive ? "LIVE" : "TIP";
    const lg = (m.league?.name || "").toUpperCase();
    const engine = m.flash;
    const flashList = m.flashList || (engine ? [engine] : []);
    const formH = (m.form?.home && m.form.home.length) ? m.form.home : (engine?.form?.home || []);
    const formA = (m.form?.away && m.form.away.length) ? m.form.away : (engine?.form?.away || []);
    const hasForm = (formH && formH.length) || (formA && formA.length);
    const lead = flashList[0] || engine;
    const betUrl = flashList.find((fp) => fp.betExplorerUrl)?.betExplorerUrl
      || flashList.find((fp) => fp.sportyBetUrl)?.sportyBetUrl
      || engine?.betExplorerUrl
      || engine?.sportyBetUrl
      || "";
    const cta = /betexplorer\.com/.test(betUrl) ? "OPEN ON BETEXPLORER" : "OPEN ON SPORTYBET";
    return `<div class="view view-pink">
      <header class="pad" style="display:flex;align-items:center;justify-content:space-between">
        ${nested ? `<img class="brand-mark" src="${LOGO}" alt="">` : `<button class="icon-btn" data-go="back" aria-label="Back">${ICO.back}</button>`}
        <img class="brand-mark" src="${LOGO}" alt="BetsPapa" style="outline:2px solid var(--cream)">
      </header>
      <div class="view-scroll" style="padding:4px 20px 8px">
        <h1 class="display" style="font-size:46px;max-width:13ch">${esc(headline)}</h1>
        ${lead ? whyHtml(lead) : ""}
        ${hasForm ? `<div style="margin-top:16px;display:flex;flex-direction:column;gap:6px">
          ${formDots(formH, m.home.abbr)}
          ${formDots(formA, m.away.abbr)}
        </div>` : ""}
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
        ${m.odds && Number(m.odds.home) > 1 ? `<div class="metrics" style="margin-top:12px">
          <div class="metric"><b>${formatOdd(m.odds.home)}</b><span>${esc(m.home.abbr)}</span></div>
          <div class="metric"><b>${formatOdd(m.odds.draw)}</b><span>DRAW</span></div>
          <div class="metric"><b>${formatOdd(m.odds.away)}</b><span>${esc(m.away.abbr)}</span></div>
        </div>` : ""}
        ${flashList.map((fp) => `<div class="card tone-${m.tone}" style="margin-top:12px">
          <p class="eyebrow">${esc(fp.engine || fp.tier)} · ${esc(fp.market)}</p>
          <p class="font-display" style="font-size:32px;line-height:1;margin-top:4px">${esc(pickTitle(fp))}</p>
          <p class="lede" style="max-width:none">${esc(fp.market)} · ${/betexplorer/.test(fp.betExplorerUrl || "") ? "BetExplorer" : "SportyBet"} ${formatOdd(fp.odd)}</p>
          ${whyHtml(fp)}
          <div class="metrics">
            <div class="metric"><b>${formatOdd(fp.odd)}</b><span>ODD</span></div>
            <div class="metric"><b>${fp.model ? fp.model + "%" : "—"}</b><span>MODEL</span></div>
            <div class="metric"><b>${fp.splitHit != null ? fp.splitHit + "%" : "—"}</b><span>HIT</span></div>
            <div class="metric"><b>${fp.confidence || "—"}</b><span>CONF</span></div>
          </div>
        </div>`).join("")}
      </div>
      ${betUrl ? `<div class="sticky-cta"><a class="cta" href="${esc(betUrl)}" target="_blank" rel="noopener">${cta}</a></div>` : ""}
    </div>`;
  }

  function engineCard(p) {
    const k = kickParts(p.kickoff);
    const odd = p.odd;
    return `<article class="card tone-${p.tone}">
      <div class="card-top">
        <div class="badges">${badge(p.home)}${badge(p.away)}</div>
        <div class="card-meta">
          ${isBanker(p) ? `<span class="banker-chip">BANKER</span>` : ""}
          <p class="card-date">${esc(k.weekday)} ${esc(k.time)}</p>
        </div>
      </div>
      <a href="#/match/${encodeURIComponent(p.id)}" style="display:block;margin-top:8px">
        <p class="font-cond" style="font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:rgb(17 17 17 / 0.6)">${esc(p.home.short)} vs ${esc(p.away.short)}</p>
        <p class="font-display" style="font-size:36px;line-height:1;margin-top:2px">${esc(pickTitle(p))}</p>
        <p class="lede" style="max-width:none">${esc(p.engine || p.market)} · ${p.betExplorerUrl ? "BetExplorer" : "SportyBet"} ${formatOdd(odd)}</p>
      </a>
      <div class="metrics">
        <div class="metric"><b>${formatOdd(odd)}</b><span>ODD</span></div>
        <div class="metric"><b>${p.model ? p.model + "%" : "—"}</b><span>MODEL</span></div>
        <div class="metric"><b>${p.splitHit != null ? p.splitHit + "%" : "—"}</b><span>HIT</span></div>
        <div class="metric"><b>${p.confidence || "—"}</b><span>CONF</span></div>
      </div>
    </article>`;
  }

  function renderMonika() {
    const list = state.monika;
    return `<div class="view view-pink">
      <div class="view-scroll">
        ${headerBrand("DECISION TREE", { title: "MONIKA", sub: "TIPS" })}
        <div class="stack stagger">
          ${state.loading ? `<div class="skel"></div><div class="skel"></div>` : ""}
          ${!state.loading && !list.length ? `<div class="empty"><h2>NO MONIKA</h2><p>No BetExplorer price cleared the tree.</p></div>` : ""}
          ${groupedCards(list)}
        </div>
      </div>
    </div>`;
  }

  function renderFlash() {
    const list = state.flash;
    return `<div class="view view-pink">
      <div class="view-scroll">
        ${headerBrand("COVER IQ", { title: "FLASH", sub: "TIPS" })}
        <div class="stack stagger">
          ${state.loading ? `<div class="skel"></div><div class="skel"></div>` : ""}
          ${!state.loading && !list.length ? `<div class="empty"><h2>NO FLASH</h2><p>No SportyBet price cleared the gates.</p></div>` : ""}
          ${groupedCards(list)}
        </div>
      </div>
    </div>`;
  }

  function renderBoard(title, sub, lede, list) {
    return `<div class="view view-pink">
      <div class="view-scroll">
        ${headerBrand("PAPA'S ENGINE", { title, sub })}
        <div class="stack stagger">
          ${state.loading ? `<div class="skel"></div>` : ""}
          ${!state.loading && !list.length ? `<div class="empty"><h2>NO LOCKS</h2><p>Nothing qualified on this board yet.</p></div>` : ""}
          ${groupedCards(list)}
        </div>
      </div>
    </div>`;
  }

  function renderVisa() {
    const tabs = state.visaWeek.map((day) => {
      const date = new Date(`${day.date}T12:00:00.000Z`);
      const label = `${WEEK[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()].slice(0, 3)}`;
      return `<button type="button" class="tab${day.date === state.visaDate ? " on" : ""}" data-visa-date="${esc(day.date)}" role="tab" aria-selected="${day.date === state.visaDate}">${esc(label)} · ${day.picks.length}</button>`;
    }).join("");
    return `<div class="view view-pink">
      <div class="view-scroll">
        ${headerBrand("VISA", { title: "VISA", sub: "TIPS" })}
        <div class="tabs" role="tablist" aria-label="Visa dates">${tabs}</div>
        <div class="stack stagger">
          ${state.loading ? `<div class="skel"></div>` : ""}
          ${!state.loading && !state.visa.length ? `<div class="empty"><h2>NO VISA</h2><p>No SportyBet Visa tip today.</p></div>` : ""}
          ${groupedCards(state.visa)}
        </div>
      </div>
    </div>`;
  }

  function renderPapa() {
    const monikaHome = (state.monika || []).filter((p) => Number(p.confidence) >= 90);
    const tips = []
      .concat(monikaHome.map((p) => ({ ...p, engine: p.engine || "MONIKA" })))
      .concat(state.flash.map((p) => ({ ...p, engine: p.engine || "FLASH" })))
      .concat(state.visa.map((p) => ({ ...p, engine: p.engine || "VISA" })));
    return `<div class="view view-ink">
      <div class="view-scroll">
        <div class="papa-hero" style="height:200px">
          <img class="cover" src="${PAPA}" alt="BetsPapa">
          <div class="fade"></div>
          <div class="brand-left"><img class="brand-mark" src="${LOGO}" alt="" style="outline:2px solid var(--cream)"><p class="eyebrow" style="color:#fff7f4">BETSPAPA</p></div>
        </div>
        <div class="pad">
          <h1 class="display">PAPA</h1>
          <p class="display" style="color:var(--papa)">TIPS</p>
        </div>
        <div class="metrics pad-x" style="grid-template-columns:repeat(3,1fr);margin-top:8px">
          <div class="metric" style="background:rgb(255 247 244 / 0.1);color:#fff7f4"><b>${monikaHome.length}</b><span>MONIKA</span></div>
          <div class="metric" style="background:rgb(255 247 244 / 0.1);color:#fff7f4"><b>${state.flash.length}</b><span>FLASH</span></div>
          <div class="metric" style="background:rgb(255 247 244 / 0.1);color:#fff7f4"><b>${state.visa.length}</b><span>VISA</span></div>
        </div>
        <div class="stack">
          ${state.loading ? `<div class="skel"></div>` : ""}
          ${!state.loading && !tips.length ? `<div class="empty"><h2>NO TIPS</h2><p>Waiting on live prices.</p></div>` : ""}
          ${groupedCards(tips)}
        </div>
      </div>
    </div>`;
  }

  function viewFor(route, nested) {
    switch (route.name) {
      case "flash": return renderFlash();
      case "monika": return renderMonika();
      case "papa": return renderPapa();
      case "bankers": return renderBoard("BANKERS", "LOCKS", "", state.bankers);
      case "athena": return renderBoard("ATHENA", "SWING", "", state.athena);
      case "goals": return renderBoard("GOALS", "BANKER", "", state.goals);
      case "wins": return renderBoard("WINS", "BANKER", "", state.wins);
      case "visa": return renderVisa();
      case "match": return renderMatch(matchById(route.id), nested);
      default: return renderPapa();
    }
  }

  function render() {
    const root = document.getElementById("app");
    if (!root) return;
    const route = state.route;
    root.innerHTML = `
      <div class="app-root">
        <div class="wallpaper" aria-hidden="true">
          <p class="wallpaper-type" style="top:-24px;left:-16px;font-size:180px">BETS</p>
          <p class="wallpaper-type" style="top:18%;right:-32px;font-size:180px">PAPA</p>
          <p class="wallpaper-type" style="top:48%;left:-40px;font-size:160px">FLASH</p>
          <p class="wallpaper-type" style="right:0;bottom:-20px;font-size:140px">KNOWS</p>
        </div>
        <div class="stage">
          <div class="phone phone-list" id="listPane">${renderVisa()}</div>
          <div class="phone phone-main" id="mainPane">
            ${viewFor(route, false)}
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
    document.querySelectorAll("[data-retry]").forEach((el) => el.addEventListener("click", () => bootData()));
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
