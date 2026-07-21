(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const page = document.body.dataset.page || "engine";
  const engineKey = document.body.dataset.engine || "primary";

  const API_BASES = [
    window.BETSPAPA_API_URL,
    "https://api.betspapa.com",
    "https://betspapa.onrender.com"
  ].filter((value, index, list) => value && list.indexOf(value) === index);
  const API_TIMEOUT_MS = 9000;
  const LAST_API_BASE_KEY = "betspapa:last-api-base:v1170";
  const RESULTS_CACHE_PREFIX = "betspapa:results-intelligence:v1161:";
  const RESULTS_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const BANKERS_CACHE_PREFIX = "betspapa:consensus-bankers:v1170:";
  const BANKERS_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

  const ENGINE_META = {
    primary: {
      name: "Papa's Pick",
      short: "Papa",
      description: "Papa’s practical HT/FT translation with price value, comeback, lead-surrender, goal evidence and automatic settlement."
    },
    aggressive: {
      name: "Aggressive",
      short: "Aggressive",
      description: "Sharper higher-variance markets such as straight results, exact HT/FT, GG, Over 2.5 and team Over 1.5."
    },
    safer: {
      name: "Safer",
      short: "Safer",
      description: "A protected expression of the match story using DNB, Double Chance, Over 1.5, Under 3.5 or team Over 0.5."
    },
    venue: {
      name: "Venue Pattern",
      short: "Venue",
      description: "Potosí-style home venue HT/FT against the away venue's opposite transitions."
    }
  };

  let activeBase = null;
  let engineItems = [];
  let resultData = null;
  let livePollTimer = null;

  function storageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Storage can be unavailable in private browsing. Network loading still works.
    }
  }

  function orderedApiBases() {
    const remembered = storageGet(LAST_API_BASE_KEY);
    return [remembered, ...API_BASES]
      .filter((value, index, list) => value && list.indexOf(value) === index);
  }

  function resultCacheKey(days) {
    return `${RESULTS_CACHE_PREFIX}${days}`;
  }

  function readCachedResults(days) {
    try {
      const raw = storageGet(resultCacheKey(days));
      if (!raw) return null;
      const record = JSON.parse(raw);
      if (!record?.payload || !record.savedAt) return null;
      if (Date.now() - Number(record.savedAt) > RESULTS_CACHE_MAX_AGE_MS) return null;
      return record;
    } catch {
      return null;
    }
  }

  function saveCachedResults(days, payload) {
    storageSet(resultCacheKey(days), JSON.stringify({
      savedAt: Date.now(),
      payload
    }));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function localIsoDate() {
    const date = new Date();
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  }

  function formatKickoff(value) {
    if (!value) return "Time pending";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat(undefined, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function confidence(value) {
    const number = Number(value || 0);
    const percent = number <= 1 ? number * 100 : number;
    return `${percent.toFixed(1)}%`;
  }


  function matchOutcome(item, engine = null) {
    return (engine ? item?.engineOutcomes?.[engine] : null) ||
      item?.consensusOutcome ||
      item?.settlement?.outcome ||
      null;
  }

  function stateClass(item, engine = null) {
    const outcome = matchOutcome(item, engine);
    if (["WIN", "LOSS", "VOID"].includes(outcome)) return "settled";
    return item?.matchState?.category || "pending";
  }

  function stateLabel(item, engine = null) {
    const state = item?.matchState || {};
    const outcome = matchOutcome(item, engine);
    if (outcome) return outcome;
    if (state.category === "finished") return "SETTLING";
    return String(state.label || item?.status || "PENDING").toUpperCase();
  }

  function matchStatusMarkup(item, engine = null) {
    const state = item?.matchState || {};
    const category = stateClass(item, engine);
    const score = state.score || item?.settlement?.fulltimeScore || null;
    const label = stateLabel(item, engine);
    return `<div class="match-state-row">
      <span class="match-state ${escapeHtml(category)}">${escapeHtml(label)}</span>
      ${score ? `<strong class="match-score">${escapeHtml(score)}</strong>` : ""}
    </div>`;
  }

  function scheduleLiveReload(load, items) {
    if (livePollTimer) {
      clearTimeout(livePollTimer);
      livePollTimer = null;
    }
    if (!(items || []).some((item) => item?.matchState?.isLive)) return;
    livePollTimer = setTimeout(() => load({ silent: true }), 60000);
  }

  function logoMarkup(team) {
    if (team?.logo_url) {
      return `<img src="${escapeHtml(team.logo_url)}" alt="" loading="lazy">`;
    }
    const initials = String(team?.name || "?")
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase();
    return `<span class="team-fallback">${escapeHtml(initials)}</span>`;
  }

  async function fetchApi(path, { headers = {}, timeoutMs = API_TIMEOUT_MS } = {}) {
    const bases = orderedApiBases();
    const controllers = bases.map(() => new AbortController());
    let settled = false;

    const attempts = bases.map(async (base, index) => {
      if (index) await new Promise((resolve) => setTimeout(resolve, index * 350));
      if (settled) throw new Error("API attempt cancelled");

      const controller = controllers[index];
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${base}${path}`, {
          headers: { Accept: "application/json", ...headers },
          cache: "no-cache",
          signal: controller.signal
        });
        if (!response.ok) {
          const body = await response.text();
          throw new Error(body || `${response.status} ${response.statusText}`);
        }
        const payload = await response.json();
        settled = true;
        controllers.forEach((item, itemIndex) => {
          if (itemIndex !== index) item.abort();
        });
        return { base, payload };
      } catch (error) {
        if (error?.name === "AbortError") {
          throw new Error(`BetsPapa API timed out after ${Math.round(timeoutMs / 1000)} seconds`);
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    });

    try {
      const result = await Promise.any(attempts);
      activeBase = result.base;
      storageSet(LAST_API_BASE_KEY, result.base);
      return result.payload;
    } catch (error) {
      const errors = Array.isArray(error?.errors) ? error.errors : [];
      const useful = errors.find((item) => !/cancelled/i.test(item?.message || ""));
      throw useful || error || new Error("No BetsPapa API endpoint was reachable");
    }
  }

  function setStatus(message, detail = "") {
    const status = $("#portalStatus");
    if (!status) return;
    status.innerHTML = `
      <span>${escapeHtml(message)}</span>
      <small>${escapeHtml(detail || (activeBase || ""))}</small>`;
  }

  function setupNavigation() {
    const menu = $("#portalMenu");
    const nav = $("#portalNav");

    const setOpen = (open) => {
      if (!menu || !nav) return;
      nav.classList.toggle("open", open);
      menu.setAttribute("aria-expanded", String(open));
    };

    menu?.addEventListener("click", (event) => {
      event.stopPropagation();
      setOpen(!nav?.classList.contains("open"));
    });

    $$("#portalNav a").forEach((link) => {
      link.addEventListener("click", () => setOpen(false));
    });

    document.addEventListener("click", (event) => {
      if (!nav?.classList.contains("open")) return;
      if (nav.contains(event.target) || menu?.contains(event.target)) return;
      setOpen(false);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && nav?.classList.contains("open")) {
        setOpen(false);
        menu?.focus({ preventScroll: true });
      }
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 800) setOpen(false);
    }, { passive: true });
  }

  function closeDialog() {
    const dialog = $("#portalDialog");
    document.body.classList.remove("portal-dialog-open");
    if (dialog?.open) dialog.close();
  }

  function openDialog(html) {
    const dialog = $("#portalDialog");
    const content = $("#portalDialogContent");
    if (!dialog || !content) return;
    content.innerHTML = html;
    document.body.classList.add("portal-dialog-open");
    if (!dialog.open) dialog.showModal();
  }

  function setupDialog() {
    const dialog = $("#portalDialog");
    $("#portalDialogClose")?.addEventListener("click", closeDialog);
    dialog?.addEventListener("click", (event) => {
      if (event.target === dialog) closeDialog();
    });
    dialog?.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeDialog();
    });
    dialog?.addEventListener("close", () => {
      document.body.classList.remove("portal-dialog-open");
    });
  }

  function explanationDialog(item, pick) {
    const explanation =
      pick?.explanationParagraph ||
      pick?.description ||
      pick?.reasons?.[0] ||
      "PapaSense selected the highest-ranked practical market.";

    return `
      <div class="dialog-title">
        <span class="eyebrow">${escapeHtml(pick?.engineName || ENGINE_META[engineKey]?.name || "BetsPapa")}</span>
        <h2>${escapeHtml(item.home?.name || "Home")} vs ${escapeHtml(item.away?.name || "Away")}</h2>
        <p>${escapeHtml(item.league?.name || "Competition")} · ${escapeHtml(formatKickoff(item.kickoff))}</p>
        ${matchStatusMarkup(item, item.activeEngine || engineKey)}
      </div>
      <div class="explanation-box">
        <span class="eyebrow">${escapeHtml(pick?.market || "Market")}</span>
        <h3>${escapeHtml(pick?.selection || "Prediction")} · ${escapeHtml(confidence(pick?.confidence ?? pick?.score))}</h3>
        <p>${escapeHtml(explanation)}</p>
      </div>
      <div class="reason-columns">
        <section>
          <h3>Why this pick</h3>
          <ul>${(pick?.reasons || []).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("") || "<li>Highest-ranked market after all checks.</li>"}</ul>
        </section>
        <section>
          <h3>Cautions</h3>
          <ul>${(pick?.cautions || []).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("") || "<li>No major contradiction survived the safety checks.</li>"}</ul>
        </section>
      </div>`;
  }

  function engineCard(item) {
    const pick = item.pick;
    return `
      <button class="pick-card" data-fixture-id="${escapeHtml(item.fixtureId)}">
        <div class="pick-meta">
          <span>${escapeHtml([item.league?.country, item.league?.name].filter(Boolean).join(" · ") || "Competition")}</span>
          <span>${escapeHtml(formatKickoff(item.kickoff))}</span>
        </div>
        ${matchStatusMarkup(item, item.activeEngine || engineKey)}
        <div class="pick-teams">
          <div class="pick-team">${logoMarkup(item.home)}<span>${escapeHtml(item.home?.name || "Home")}</span></div>
          <div class="pick-team">${logoMarkup(item.away)}<span>${escapeHtml(item.away?.name || "Away")}</span></div>
        </div>
        <span class="pick-badge">${escapeHtml(pick.qualified ? "Qualified" : "Directional")}</span>
        <strong class="pick-selection">${escapeHtml(pick.selection || pick.market)}</strong>
        <div class="pick-bottom">
          <span>${escapeHtml(pick.market || "Market")}</span>
          <b>${escapeHtml(confidence(pick.confidence ?? pick.score))}</b>
        </div>
      </button>`;
  }

  function renderEngineMetrics(items) {
    const qualified = items.filter((item) => item.pick?.qualified).length;
    const directional = items.length - qualified;
    const avg = items.length
      ? items.reduce((sum, item) => {
          const number = Number(item.pick?.confidence ?? item.pick?.score ?? 0);
          return sum + (number <= 1 ? number * 100 : number);
        }, 0) / items.length
      : 0;
    const markets = new Set(items.map((item) => item.pick?.market).filter(Boolean)).size;

    $("#portalMetrics").innerHTML = `
      <div class="metric"><span>Picks ready</span><strong>${items.length}</strong><small>Completed selections on this page</small></div>
      <div class="metric"><span>Strong picks</span><strong>${qualified}</strong><small>Passed the normal market threshold</small></div>
      <div class="metric"><span>Best-direction picks</span><strong>${directional}</strong><small>Useful direction, but not a banker</small></div>
      <div class="metric"><span>Average strength</span><strong>${avg ? `${avg.toFixed(1)}%` : "—"}</strong><small>Average engine confidence</small></div>`;
    $("#marketCount")?.replaceChildren(document.createTextNode(String(markets)));
  }

  function setupEngineFilters() {
    const league = $("#leagueFilter");
    const market = $("#marketFilter");
    const strength = $("#strengthFilter");
    const matchState = $("#matchStateFilter");
    const search = $("#searchFilter");

    const leagues = [...new Set(engineItems.map((item) =>
      [item.league?.country, item.league?.name].filter(Boolean).join(" · ")
    ).filter(Boolean))].sort();
    const markets = [...new Set(engineItems.map((item) => item.pick?.market).filter(Boolean))].sort();

    league.innerHTML = `<option value="">All leagues</option>${leagues.map((value) =>
      `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`
    ).join("")}`;
    market.innerHTML = `<option value="">All markets</option>${markets.map((value) =>
      `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`
    ).join("")}`;

    const render = () => {
      const query = search.value.trim().toLowerCase();
      const filtered = engineItems.filter((item) => {
        const leagueValue = [item.league?.country, item.league?.name].filter(Boolean).join(" · ");
        if (league.value && leagueValue !== league.value) return false;
        if (market.value && item.pick?.market !== market.value) return false;
        if (strength.value === "qualified" && !item.pick?.qualified) return false;
        if (strength.value === "directional" && item.pick?.qualified) return false;
        if (matchState?.value && stateClass(item, item.activeEngine || engineKey) !== matchState.value) return false;
        if (query) {
          const text = [
            item.home?.name,
            item.away?.name,
            leagueValue,
            item.pick?.market,
            item.pick?.selection
          ].join(" ").toLowerCase();
          if (!text.includes(query)) return false;
        }
        return true;
      });

      $("#portalContent").innerHTML = filtered.length
        ? filtered.map(engineCard).join("")
        : `<div class="empty-card">No completed picks match these filters.</div>`;

      $$(".pick-card").forEach((card) => {
        card.addEventListener("click", () => {
          const item = filtered.find((row) => String(row.fixtureId) === card.dataset.fixtureId);
          if (item) openDialog(explanationDialog(item, item.pick));
        });
      });
    };

    [league, market, strength, matchState].filter(Boolean).forEach((input) => {
      input.onchange = render;
    });
    search.oninput = render;
    const clearButton = $("#clearFilters");
    if (clearButton) clearButton.onclick = () => {
      league.value = "";
      market.value = "";
      strength.value = "";
      if (matchState) matchState.value = "";
      search.value = "";
      render();
    };
    render();
  }

  async function loadEnginePage() {
    const meta = ENGINE_META[engineKey] || ENGINE_META.primary;
    $("#portalTitle").textContent = meta.name;
    $("#portalDescription").textContent = meta.description;
    const dateInput = $("#dateFilter");
    dateInput.value = dateInput.value || localIsoDate();

    const load = async ({ silent = false } = {}) => {
      if (!silent) setStatus(`Loading ${meta.name}…`);
      const payload = await fetchApi(
        `/api/engines/${engineKey}?date=${encodeURIComponent(dateInput.value)}&refresh=1`
      );
      engineItems = payload.items || [];
      renderEngineMetrics(engineItems);
      setupEngineFilters();
      const states = payload.matchStates || {};
      setStatus(
        `${engineItems.length} ${meta.name} selections loaded`,
        `Pending ${states.pending || 0} · Live ${states.live || 0} · Settled ${states.settled || 0}`
      );
      scheduleLiveReload(load, engineItems);
    };

    dateInput.addEventListener("change", load);
    $("#refreshButton")?.addEventListener("click", load);
    await load();
  }

  function bankerCacheKey(date) {
    return `${BANKERS_CACHE_PREFIX}${date}`;
  }

  function readCachedBankers(date) {
    try {
      const raw = storageGet(bankerCacheKey(date));
      if (!raw) return null;
      const record = JSON.parse(raw);
      if (!record?.payload || !record.savedAt) return null;
      if (Date.now() - Number(record.savedAt) > BANKERS_CACHE_MAX_AGE_MS) return null;
      return record;
    } catch {
      return null;
    }
  }

  function saveCachedBankers(date, payload) {
    storageSet(bankerCacheKey(date), JSON.stringify({
      savedAt: Date.now(),
      payload
    }));
  }

  function bankerTierClass(item) {
    if (item.source === "high-confidence") return "high-confidence";
    if (item.consensusCount >= 4) return "unanimous";
    if (item.consensusCount === 3) return "prime-consensus";
    return "consensus";
  }

  function bankerEngineChips(item) {
    return (item.agreeingEngines || []).map((engine) => `
      <span class="engine-vote" title="${escapeHtml(`${engine.engineName}: ${confidence(engine.confidence)}`)}">
        <b>${escapeHtml(engine.engineName)}</b><small>${escapeHtml(confidence(engine.confidence))}</small>
      </span>`).join("");
  }

  function consensusBankerCard(item) {
    const voteText = item.source === "high-confidence"
      ? "Exceptional single-engine pick"
      : `${item.consensusCount}/${item.enginesAvailable || 4} engines agree`;
    return `
      <button class="pick-card consensus-banker-card ${bankerTierClass(item)}" data-fixture="${escapeHtml(item.fixtureId)}">
        <div class="pick-meta">
          <span>${escapeHtml([item.league?.country, item.league?.name].filter(Boolean).join(" · ") || "Competition")}</span>
          <span>${escapeHtml(formatKickoff(item.kickoff))}</span>
        </div>
        ${matchStatusMarkup(item)}
        <div class="pick-teams">
          <div class="pick-team">${logoMarkup(item.home)}<span>${escapeHtml(item.home?.name || "Home")}</span></div>
          <div class="pick-team">${logoMarkup(item.away)}<span>${escapeHtml(item.away?.name || "Away")}</span></div>
        </div>
        <div class="consensus-grade-row">
          <span class="pick-badge consensus-grade">${escapeHtml(item.tier || "BANKER")}</span>
          <strong>${escapeHtml(voteText)}</strong>
        </div>
        <strong class="pick-selection">${escapeHtml(item.selection)}</strong>
        <div class="banker-votes">${bankerEngineChips(item)}</div>
        <div class="consensus-meter" aria-label="Banker score ${escapeHtml(String(item.bankerScore || 0))} out of 100">
          <span style="width:${Math.max(0, Math.min(100, Number(item.bankerScore || 0)))}%"></span>
        </div>
        <div class="pick-bottom">
          <span>${escapeHtml(item.market || "Market")}</span>
          <b>${escapeHtml(`${Number(item.bankerScore || 0).toFixed(1)}/100`)}</b>
        </div>
      </button>`;
  }

  function consensusBankerDialog(item) {
    const otherViews = item.otherEnginePicks || [];
    const evidence = item.evidence || {};
    return `
      <div class="dialog-title">
        <span class="eyebrow">TODAY'S BANKER · ${escapeHtml(item.tier || "BANKER")}</span>
        <h2>${escapeHtml(item.home?.name || "Home")} vs ${escapeHtml(item.away?.name || "Away")}</h2>
        <p>${escapeHtml([item.league?.country, item.league?.name, formatKickoff(item.kickoff)].filter(Boolean).join(" · "))}</p>
        ${matchStatusMarkup(item)}
      </div>
      <div class="explanation-box consensus-verdict">
        <span class="eyebrow">FINAL CONSENSUS PICK</span>
        <h3>${escapeHtml(item.selection)} · ${Number(item.bankerScore || 0).toFixed(1)}/100</h3>
        <p>${item.source === "high-confidence"
          ? "No second engine selected the exact same market, but this qualified pick cleared the exceptional 86% confidence gate and every sample-safety check."
          : `${item.consensusCount} engines independently selected the same market and selection. The banker score combines agreement, confidence consistency and audited sample strength.`}</p>
      </div>
      <section class="consensus-dialog-section">
        <h3>Engines backing this pick</h3>
        <div class="dialog-engine-votes">${bankerEngineChips(item)}</div>
      </section>
      <div class="reason-columns">
        <section><h3>Why it qualified</h3><ul>${(item.reasons || []).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("") || "<li>Passed every banker gate.</li>"}</ul></section>
        <section><h3>Safety checks</h3><ul>
          <li>One final banker per fixture.</li>
          <li>At least 6 overall matches per team.</li>
          <li>At least 3 relevant home/away matches per team.</li>
          <li>No critical caution or incomplete profile.</li>
        </ul></section>
      </div>
      <div class="consensus-sample-grid">
        <div><span>${escapeHtml(item.home?.name || "Home")}</span><strong>${Number(evidence.homeOverall || 0)} overall</strong><small>${Number(evidence.homeVenue || 0)} home</small></div>
        <div><span>${escapeHtml(item.away?.name || "Away")}</span><strong>${Number(evidence.awayOverall || 0)} overall</strong><small>${Number(evidence.awayVenue || 0)} away</small></div>
        <div><span>Agreement</span><strong>${item.consensusCount}/${item.enginesAvailable || 4} engines</strong><small>Exact same selection</small></div>
      </div>
      ${otherViews.length ? `<section class="consensus-dialog-section"><h3>Other engine views</h3><div class="other-engine-views">${otherViews.map((view) => `<div><span>${escapeHtml(view.engineName)}</span><strong>${escapeHtml(view.selection || view.market || "No pick")}</strong><small>${escapeHtml(confidence(view.confidence))}${view.qualified ? " · qualified" : " · directional"}</small></div>`).join("")}</div></section>` : ""}`;
  }

  function renderConsensusBankers(payload) {
    const picks = payload.picks || [];
    const average = picks.length
      ? picks.reduce((sum, item) => sum + Number(item.bankerScore || 0), 0) / picks.length
      : 0;

    $("#portalMetrics").innerHTML = `
      <div class="metric"><span>Matches checked</span><strong>${payload.predictionsReviewed || 0}</strong><small>Published fixtures reviewed for consensus</small></div>
      <div class="metric"><span>Bankers ready</span><strong>${payload.totalSelections || 0}</strong><small>Only one strongest banker per fixture</small></div>
      <div class="metric"><span>Consensus picks</span><strong>${(payload.unanimousCount || 0) + (payload.primeCount || 0) + (payload.consensusCount || 0)}</strong><small>Two or more engines selected the exact same pick</small></div>
      <div class="metric"><span>Average banker score</span><strong>${average ? `${average.toFixed(1)}` : "—"}</strong><small>Agreement, confidence and sample-strength score</small></div>`;

    const tierFilter = $("#bankerTierFilter");
    const marketFilter = $("#bankerMarketFilter");
    const searchFilter = $("#bankerSearchFilter");

    const markets = [...new Set(picks.map((item) => item.market).filter(Boolean))].sort();
    marketFilter.innerHTML = `<option value="">All markets</option>${markets.map((market) => `<option value="${escapeHtml(market)}">${escapeHtml(market)}</option>`).join("")}`;

    const draw = () => {
      const query = String(searchFilter.value || "").trim().toLowerCase();
      const tier = tierFilter.value;
      const market = marketFilter.value;
      const filtered = picks.filter((item) => {
        if (tier && bankerTierClass(item) !== tier) return false;
        if (market && item.market !== market) return false;
        if (query) {
          const haystack = [item.home?.name, item.away?.name, item.league?.name, item.league?.country, item.selection, item.market]
            .filter(Boolean).join(" ").toLowerCase();
          if (!haystack.includes(query)) return false;
        }
        return true;
      });

      const summary = payload.rejectionSummary || [];
      $("#portalContent").innerHTML = filtered.length
        ? `<div class="portal-grid consensus-banker-grid">${filtered.map(consensusBankerCard).join("")}</div>
           <section class="banker-method-panel"><div><strong>Consensus rule</strong><p>Two or more qualified engines must choose the exact same selection. A single pick appears only when it reaches at least 86% confidence and passes every strict sample gate.</p></div><div><strong>No forced picks</strong><p>An almost-even split between two different selections is withheld. BetsPapa publishes one strongest banker per match.</p></div></section>
           ${summary.length ? `<section class="boss-rejection-panel"><h2>Why other matches stayed off the Banker page</h2>${summary.map((row) => `<div><span>${escapeHtml(row.reason)}</span><strong>${row.count}</strong></div>`).join("")}</section>` : ""}`
        : `<div class="empty-card banker-empty"><strong>NO BANKER QUALIFIED</strong><span>No match passed the selected filters and strict consensus rules.</span><small>Papa will not force a banker when engines disagree or the evidence is thin.</small></div>
           ${summary.length ? `<section class="boss-rejection-panel"><h2>Why matches were rejected</h2>${summary.map((row) => `<div><span>${escapeHtml(row.reason)}</span><strong>${row.count}</strong></div>`).join("")}</section>` : ""}`;

      $$(".consensus-banker-card").forEach((card) => {
        card.addEventListener("click", () => {
          const item = filtered.find((row) => String(row.fixtureId) === card.dataset.fixture);
          if (item) openDialog(consensusBankerDialog(item));
        });
      });
    };

    tierFilter.onchange = draw;
    marketFilter.onchange = draw;
    searchFilter.oninput = draw;
    draw();
    scheduleLiveReload(() => loadConsensusBankers({ silent: true }), picks);
  }

  async function loadConsensusBankers({ silent = false } = {}) {
    const dateInput = $("#dateFilter");
    const date = dateInput.value || localIsoDate();
    dateInput.value = date;
    const cached = readCachedBankers(date);
    let cacheShown = false;

    if (cached?.payload) {
      renderConsensusBankers(cached.payload);
      cacheShown = true;
      const ageMinutes = Math.max(0, Math.round((Date.now() - Number(cached.savedAt)) / 60000));
      setStatus("Saved Bankers displayed instantly", `Refreshing quietly · saved ${ageMinutes} min ago`);
    } else if (!silent) {
      setStatus("Building today's consensus Banker page…");
    }

    try {
      const payload = await fetchApi(`/api/bankers/today?date=${encodeURIComponent(date)}&limit=20`);
      saveCachedBankers(date, payload);
      renderConsensusBankers(payload);
      const states = payload.matchStates || {};
      setStatus(
        `${payload.totalSelections || 0} consensus Bankers ready`,
        `Unanimous ${payload.unanimousCount || 0} · Prime ${payload.primeCount || 0} · High confidence ${payload.highConfidenceCount || 0} · Pending ${states.pending || 0} · Live ${states.live || 0}`
      );
    } catch (error) {
      if (!cacheShown) throw error;
      setStatus("Showing saved Bankers", `Live refresh failed: ${error.message}`);
    }
  }

  async function loadBankersPage() {
    const dateInput = $("#dateFilter");
    dateInput.value = dateInput.value || localIsoDate();
    dateInput.onchange = () => loadConsensusBankers();
    $("#refreshButton")?.addEventListener("click", () => loadConsensusBankers());
    await loadConsensusBankers();
  }


  function bossScoreBreakdown(item) {
    const score = item.selected?.scoreBreakdown || {};
    return `
      <div class="boss-score-grid">
        <div><span>HT/FT</span><strong>${Number(score.htft || 0).toFixed(1)}<small>/40</small></strong></div>
        <div><span>Components</span><strong>${Number(score.components || 0).toFixed(1)}<small>/35</small></strong></div>
        <div><span>Streaks</span><strong>${Number(score.streaks || 0).toFixed(1)}<small>/15</small></strong></div>
        <div><span>Context</span><strong>${Number(score.context || 0).toFixed(1)}<small>/10</small></strong></div>
      </div>`;
  }

  function bossCard(item) {
    return `
      <button class="pick-card boss-card ${item.grade === "PRIME" ? "prime" : "qualified"}" data-fixture="${escapeHtml(item.fixtureId)}">
        <div class="pick-meta">
          <span>${escapeHtml([item.league?.country, item.league?.name].filter(Boolean).join(" · ") || "Competition")}</span>
          <span>${escapeHtml(formatKickoff(item.kickoff))}</span>
        </div>
        ${matchStatusMarkup(item)}
        <div class="pick-teams">
          <div class="pick-team">${logoMarkup(item.home)}<span>${escapeHtml(item.home?.name || "Home")}</span></div>
          <div class="pick-team">${logoMarkup(item.away)}<span>${escapeHtml(item.away?.name || "Away")}</span></div>
        </div>
        <div class="boss-grade-row">
          <span class="pick-badge boss-grade">${escapeHtml(item.grade || "QUALIFIED")}</span>
          <span class="boss-total-score">OMNI ${Number(item.score || 0).toFixed(1)}/100</span>
        </div>
        <strong class="pick-selection">${escapeHtml(item.selection)}</strong>
        <div class="pick-bottom"><span>${escapeHtml(item.market)}</span><b>${Number(item.score || 0).toFixed(1)}/100</b></div>
        ${bossScoreBreakdown(item)}
      </button>`;
  }

  function bossDialog(item) {
    const explanation = item.explanation || {};
    const samples = explanation.samples || item.samples || {};
    const alternatives = item.alternatives || [];
    return `
      <div class="dialog-title">
        <span class="eyebrow">PAPA'S BOSS PICK · ${escapeHtml(item.grade || "QUALIFIED")}</span>
        <h2>${escapeHtml(item.home?.name || "Home")} vs ${escapeHtml(item.away?.name || "Away")}</h2>
        <p>${escapeHtml([item.league?.country, item.league?.name, formatKickoff(item.kickoff)].filter(Boolean).join(" · "))}</p>
        ${matchStatusMarkup(item)}
      </div>
      <div class="explanation-box boss-verdict">
        <span class="eyebrow">FINAL OMNI DECISION</span>
        <h3>${escapeHtml(item.selection)} · ${Number(item.score || 0).toFixed(1)}/100</h3>
        <p>${escapeHtml(explanation.summary || "This market passed the complete Boss Pick gate.")}</p>
      </div>
      ${bossScoreBreakdown(item)}
      <div class="reason-columns">
        <section><h3>Why it passed</h3><ul>${(explanation.reasons || []).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("") || "<li>Highest safe market after all gates.</li>"}</ul></section>
        <section><h3>Cautions</h3><ul>${(explanation.cautions || []).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("") || "<li>No major contradiction survived.</li>"}</ul></section>
      </div>
      <div class="boss-sample-grid">
        <div><span>${escapeHtml(item.home?.name || "Home")}</span><strong>${samples.homeOverall || 0} overall</strong><small>${samples.homeVenue || 0} home</small></div>
        <div><span>${escapeHtml(item.away?.name || "Away")}</span><strong>${samples.awayOverall || 0} overall</strong><small>${samples.awayVenue || 0} away</small></div>
        <div><span>League</span><strong>${samples.league || 0} matches</strong><small>Current competition sample</small></div>
      </div>
      ${alternatives.length ? `<div class="boss-alternatives"><h3>Next markets below the final pick</h3>${alternatives.map((alt) => `<span>${escapeHtml(alt.marketName)} · ${Number(alt.score || 0).toFixed(1)}</span>`).join("")}</div>` : ""}`;
  }

  async function loadBossPicksPage() {
    const dateInput = $("#dateFilter");
    dateInput.value = dateInput.value || localIsoDate();

    const load = async () => {
      setStatus("OMNI is checking every fixture for the selected date…");
      const payload = await fetchApi(
        `/api/boss-picks/today?date=${encodeURIComponent(dateInput.value)}&refresh=1`
      );

      $("#portalMetrics").innerHTML = `
        <div class="metric"><span>Matches checked</span><strong>${payload.reviewedFixtures || 0}</strong><small>Fixtures evaluated for the selected date</small></div>
        <div class="metric"><span>Boss Picks</span><strong>${payload.qualifiedCount || 0}</strong><small>Every fixture that passes the full Boss gate</small></div>
        <div class="metric"><span>Prime</span><strong>${payload.primeCount || 0}</strong><small>Rule score of 87/100 or higher</small></div>
        <div class="metric"><span>Rejected</span><strong>${payload.rejectedCount || 0}</strong><small>No eligible core market passed</small></div>`;

      const picks = payload.picks || [];
      const rejectionRows = payload.rejections || [];
      $("#portalContent").innerHTML = picks.length
        ? `<div class="portal-grid boss-grid">${picks.map(bossCard).join("")}</div>
           <section class="boss-rejection-panel"><h2>Why other matches stayed off Papa's board</h2>${rejectionRows.map((row) => `<div><span>${escapeHtml(row.reason)}</span><strong>${row.count}</strong></div>`).join("") || "<p>No rejection summary was returned.</p>"}</section>`
        : `<div class="empty-card boss-empty"><strong>NO BOSS PICK</strong><span>${escapeHtml(payload.status || "No fixture passed the full OMNI gatekeeper.")}</span><small>Papa does not force a selection when the evidence is incomplete or conflicting.</small></div>
           <section class="boss-rejection-panel"><h2>Why the board is empty</h2>${rejectionRows.map((row) => `<div><span>${escapeHtml(row.reason)}</span><strong>${row.count}</strong></div>`).join("") || "<p>No fixture had enough complete history.</p>"}</section>`;

      $$(".boss-card").forEach((card) => {
        card.addEventListener("click", () => {
          const item = picks.find((row) => String(row.fixtureId) === card.dataset.fixture);
          if (item) openDialog(bossDialog(item));
        });
      });

      const states = payload.matchStates || {};
      setStatus(
        payload.status || `${picks.length} Boss Picks ready`,
        `Pending ${states.pending || 0} · Live ${states.live || 0} · Settled ${states.settled || 0} · ${payload.engine}`
      );
      scheduleLiveReload(load, picks);
    };

    dateInput.onchange = load;
    const refreshButton = $("#refreshButton");
    if (refreshButton) refreshButton.onclick = load;
    await load();
  }

  function renderResults(data, selectedEngine = "") {
    const engines = data.engines || {};
    $("#portalMetrics").innerHTML = Object.values(engines).map((engine) => `
      <div class="metric">
        <span>${escapeHtml(engine.engineName)}</span>
        <strong>${engine.winRate === null ? "—" : `${engine.winRate}%`}</strong>
        <small>${engine.wins} wins · ${engine.losses} losses · ${engine.voids} voids</small>
      </div>`).join("");

    const rows = (data.recent || []).filter((row) =>
      !selectedEngine || row.engineKey === selectedEngine
    );

    $("#portalContent").innerHTML = `
      <div class="results-table-wrap">
        <table class="portal-table">
          <thead><tr>
            <th>Date</th><th>Engine</th><th>Match</th><th>Market</th>
            <th>Pick</th><th>Confidence</th><th>Score</th><th>Outcome</th>
          </tr></thead>
          <tbody>${rows.map((row) => `
            <tr>
              <td data-label="Date">${escapeHtml(formatKickoff(row.kickoff))}</td>
              <td data-label="Engine">${escapeHtml(row.engineName)}</td>
              <td data-label="Match">${escapeHtml(`${row.home?.name || "Home"} vs ${row.away?.name || "Away"}`)}</td>
              <td data-label="Market">${escapeHtml(row.market)}</td>
              <td data-label="Pick">${escapeHtml(row.selection)}</td>
              <td data-label="Confidence">${escapeHtml(confidence(row.confidence))}</td>
              <td data-label="Final score">${escapeHtml(row.fulltimeScore || "—")}</td>
              <td data-label="Outcome"><span class="outcome ${escapeHtml(row.outcome)}">${escapeHtml(row.outcome)}</span></td>
            </tr>`).join("") || `<tr><td colspan="8">No graded engine results in this period.</td></tr>`}</tbody>
        </table>
      </div>`;

    $("#marketBreakdown").innerHTML = `
      <div class="results-table-wrap">
        <table class="portal-table">
          <thead><tr><th>Engine</th><th>Market</th><th>Selection</th><th>Graded</th><th>Win rate</th></tr></thead>
          <tbody>${(data.marketBreakdown || []).slice(0, 20).map((row) => `
            <tr>
              <td data-label="Engine">${escapeHtml(row.engineName)}</td>
              <td data-label="Market">${escapeHtml(row.market)}</td>
              <td data-label="Selection">${escapeHtml(row.selection)}</td>
              <td data-label="Graded">${row.graded}</td>
              <td data-label="Win rate">${row.winRate === null ? "—" : `${row.winRate}%`}</td>
            </tr>`).join("") || `<tr><td colspan="5">No market performance data yet.</td></tr>`}</tbody>
        </table>
      </div>`;
  }

  async function loadResultsPage() {
    const days = $("#daysFilter");
    const engine = $("#engineResultFilter");

    const load = async () => {
      const windowDays = String(days.value || "30");
      const cached = readCachedResults(windowDays);

      if (cached?.payload) {
        resultData = cached.payload;
        renderResults(resultData, engine.value);
        const ageMinutes = Math.max(1, Math.round((Date.now() - Number(cached.savedAt)) / 60000));
        setStatus("Saved results are ready", `Refreshing quietly · saved ${ageMinutes}m ago`);
      } else {
        setStatus("Loading engine performance…");
      }

      try {
        const payload = await fetchApi(`/api/results/intelligence?days=${encodeURIComponent(windowDays)}&refresh=0`);
        resultData = payload;
        saveCachedResults(windowDays, payload);
        renderResults(resultData, engine.value);
        setStatus("Engine results loaded", `${resultData.days} day window · ${activeBase || "live API"}`);
      } catch (error) {
        if (cached?.payload) {
          setStatus("Showing saved results", `${error.message}. Live refresh will retry later.`);
          return;
        }
        resultData = null;
        setStatus("Results could not load", error.message);
        $("#portalContent").innerHTML = `
          <div class="empty-card">
            <strong>Results are temporarily unavailable</strong>
            <p>${escapeHtml(error.message)}</p>
            <p>Use Refresh results after the API wakes up.</p>
          </div>`;
        $("#marketBreakdown").innerHTML = "";
      }
    };

    days.addEventListener("change", load);
    engine.addEventListener("change", () => {
      if (resultData) renderResults(resultData, engine.value);
    });
    $("#refreshButton")?.addEventListener("click", load);
    await load();
  }

  function diagnosticCard(label, value) {
    return `<div class="diagnostic-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value ?? "—"))}</strong></div>`;
  }

  function renderDiagnostics(payload) {
    const data = payload.diagnostics || {};
    const fixtures = data.fixtures || {};
    const predictions = data.predictions || {};
    const profiles = data.profiles || {};
    const antiZombie = data.antiZombie || {};

    $("#portalMetrics").innerHTML = [
      diagnosticCard("Fixtures imported", fixtures.imported || 0),
      diagnosticCard("Predictions published", predictions.published || 0),
      diagnosticCard("Pending", predictions.pending || 0),
      diagnosticCard("Withheld", predictions.withheld || 0),
      diagnosticCard("Profile readiness", profiles.readinessPercent === null ? "—" : `${profiles.readinessPercent}%`),
      diagnosticCard("Thin teams", profiles.thinTeams || 0),
      diagnosticCard("Anti-zombie status", antiZombie.status || "clear"),
      diagnosticCard("Provider available", payload.provider?.available ? "Yes" : "No")
    ].join("");

    const issues = [];
    if (predictions.pending) issues.push(`${predictions.pending} predictable fixtures do not yet have a current engine row.`);
    if (predictions.withheld) issues.push(`${predictions.withheld} predictions are stored but withheld.`);
    if (profiles.thinTeams) issues.push(`${profiles.thinTeams} teams are below the profile-readiness thresholds.`);
    for (const group of antiZombie.groups || []) {
      issues.push(`${group.count} fixtures share suspicious evidence and engine-score signature ${group.signature}.`);
    }

    $("#portalContent").innerHTML = `
      <div class="issue-list">
        ${issues.length
          ? issues.map((issue) => `<div class="issue">${escapeHtml(issue)}</div>`).join("")
          : `<div class="issue clear">No critical prediction-pipeline issue was detected for this date.</div>`}
      </div>
      <div class="section-title"><h2>Market distribution</h2><p>Current engine version: ${escapeHtml(data.engineVersion || "—")}</p></div>
      <div class="diagnostic-table-wrap">
        <table class="portal-table">
          <thead><tr><th>Engine</th><th>Market</th><th>Count</th></tr></thead>
          <tbody>${(data.markets || []).map((row) => `
            <tr><td>${escapeHtml(row.engineName)}</td><td>${escapeHtml(row.market)}</td><td>${row.count}</td></tr>`
          ).join("") || `<tr><td colspan="3">No current predictions found.</td></tr>`}</tbody>
        </table>
      </div>`;
  }

  async function loadDiagnosticsPage() {
    const login = $("#adminLogin");
    const dashboard = $("#diagnosticsDashboard");
    const secretInput = $("#adminSecret");
    const dateInput = $("#dateFilter");
    dateInput.value = localIsoDate();
    secretInput.value = sessionStorage.getItem("betspapaAdminSecret") || "";

    const load = async () => {
      const secret = secretInput.value.trim();
      if (!secret) {
        setStatus("Enter the Render ADMIN_SYNC_SECRET");
        return;
      }
      setStatus("Loading protected diagnostics…");
      const payload = await fetchApi(
        `/api/admin/diagnostics?date=${encodeURIComponent(dateInput.value)}`,
        { headers: { "x-admin-secret": secret } }
      );
      sessionStorage.setItem("betspapaAdminSecret", secret);
      login.hidden = true;
      dashboard.hidden = false;
      renderDiagnostics(payload);
      setStatus("Diagnostics loaded", `Date ${payload.date}`);
    };

    $("#adminLoginButton")?.addEventListener("click", () => {
      load().catch((error) => setStatus("Diagnostics failed", error.message));
    });
    $("#refreshButton")?.addEventListener("click", () => {
      load().catch((error) => setStatus("Diagnostics failed", error.message));
    });
    dateInput.addEventListener("change", () => {
      if (!dashboard.hidden) load().catch((error) => setStatus("Diagnostics failed", error.message));
    });

    if (secretInput.value) {
      load().catch(() => {
        login.hidden = false;
        dashboard.hidden = true;
        sessionStorage.removeItem("betspapaAdminSecret");
      });
    }
  }

  async function init() {
    setupNavigation();
    setupDialog();

    try {
      if (page === "engine") await loadEnginePage();
      if (page === "bankers") await loadBankersPage();
      if (page === "boss-picks") await loadBossPicksPage();
      if (page === "results") await loadResultsPage();
      if (page === "diagnostics") await loadDiagnosticsPage();
    } catch (error) {
      setStatus("Unable to load this page", error.message);
      if ($("#portalContent")) {
        $("#portalContent").innerHTML = `<div class="empty-card">${escapeHtml(error.message)}</div>`;
      }
    }
  }

  init();
})();