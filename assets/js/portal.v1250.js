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
  const API_TIMEOUT_MS = 30000;
  const LAST_API_BASE_KEY = "betspapa:last-api-base:v1175";
  const RESULTS_CACHE_PREFIX = "betspapa:results-intelligence:v1161:";
  const RESULTS_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const BANKERS_CACHE_PREFIX = "betspapa:papalock-bankers:v1250:";
  const BANKERS_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
  const ENGINE_BOARD_CACHE_PREFIX = "betspapa:prepared-board:v1250:";
  const ENGINE_BOARD_CACHE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
  const ATHENA_CACHE_PREFIX = "betspapa:athena-board:v1250:";
  const PAPA_HUB_CACHE_PREFIX = "betspapa:papa-hub:v1250:";
  const ATHENA_CACHE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

  const ENGINE_META = {
    primary: {
      name: "Papa's Pick",
      short: "Papa",
      description: "Papa classifies the match first, checks sample quality, half-goal evidence, contradictions and calibrated confidence, then publishes one balanced market or NO PICK."
    },
    aggressive: {
      name: "Aggressive",
      short: "Aggressive",
      description: "A sharper version of Papa’s exact match story. It adds one condition only when that same-story escalation passes its own sample, market and confidence gates."
    },
    safer: {
      name: "Safer",
      short: "Safer",
      description: "A mathematically broader version of Papa’s exact match story. It appears only when the containment market has a clear confidence cushion."
    },
    venue: {
      name: "Venue Pattern",
      short: "Venue",
      description: "An independent comparison of the home team’s home behaviour against the away team’s away behaviour. It can return NO PICK when the venue route is weak or conflicted."
    },
    form: {
      name: "Split Form",
      short: "Form",
      description: "An independent last-five engine. It only uses HT/FT splits, W-D-L form and form goals from each team’s last five finished league matches."
    },
    athena: {
      name: "Athena",
      short: "Athena",
      description: "Athena resolves HT/FT swing routes with goals-by-half and match-state evidence, then keeps one qualified market or NO PICK."
    }
  };

  let activeBase = null;
  let engineItems = [];
  let hubItems = [];
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

  function engineBoardCacheKey(engine, date) {
    return `${ENGINE_BOARD_CACHE_PREFIX}${engine}:${date}`;
  }

  function readCachedEngineBoard(engine, date) {
    try {
      const raw = storageGet(engineBoardCacheKey(engine, date));
      if (!raw) return null;
      const record = JSON.parse(raw);
      if (!record?.payload || !record.savedAt) return null;
      if (Date.now() - Number(record.savedAt) > ENGINE_BOARD_CACHE_MAX_AGE_MS) return null;
      if (record.payload.date !== date || record.payload.engineKey !== engine) return null;
      return record;
    } catch {
      return null;
    }
  }

  function saveCachedEngineBoard(engine, date, payload) {
    storageSet(engineBoardCacheKey(engine, date), JSON.stringify({
      savedAt: Date.now(),
      payload
    }));
  }

  function papaHubCacheKey(date) {
    return `${PAPA_HUB_CACHE_PREFIX}${date}`;
  }

  function readCachedPapaHub(date) {
    try {
      const raw = storageGet(papaHubCacheKey(date));
      if (!raw) return null;
      const record = JSON.parse(raw);
      if (!record?.payload || !record.savedAt) return null;
      if (Date.now() - Number(record.savedAt) > ENGINE_BOARD_CACHE_MAX_AGE_MS) return null;
      if (record.payload.date !== date) return null;
      return record;
    } catch {
      return null;
    }
  }

  function saveCachedPapaHub(date, payload) {
    storageSet(papaHubCacheKey(date), JSON.stringify({
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

  function countryFlag(country) {
    return window.BetsPapaFlags?.countryFlag(country) || "🌐";
  }

  function leagueText(league) {
    return window.BetsPapaFlags?.leagueText(league) ||
      [league?.country, league?.name].filter(Boolean).join(" · ") ||
      "Competition";
  }

  function leagueNameText(league) {
    return window.BetsPapaFlags?.leagueNameText(league) ||
      league?.name ||
      "Competition";
  }

  function localIsoDate() {
    const date = new Date();
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  }

  function utcIsoDate() {
    return new Date().toISOString().slice(0, 10);
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

  async function fetchApi(path, { headers = {}, timeoutMs = API_TIMEOUT_MS, cacheMode = "default" } = {}) {
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
          cache: cacheMode,
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
      if (window.innerWidth > 1080) setOpen(false);
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

  function htftGateMarkup(pick) {
    const gate = pick?.htftGate || pick?.explanationEvidence?.htftGate || null;
    if (!gate) return "";
    const triggers = (gate.triggerRoutes || [])
      .slice(0, 6)
      .map((row) => `<span>${escapeHtml(row.code || row.transition || "HT/FT")} ${escapeHtml(confidence((row.probability || 0) * 100))}</span>`)
      .join("");
    return `
      <section class="htft-firing-box ${gate.eligible ? "passed" : "failed"}">
        <div><span class="eyebrow">HT/FT FIRING RULE</span><strong>${gate.eligible ? "Gate passed" : "Gate failed"} · ${escapeHtml(confidence((gate.score || 0) * 100))} strength</strong></div>
        <p>${escapeHtml(gate.rule || "No firing rule recorded.")}</p>
        ${triggers ? `<div class="htft-trigger-chips">${triggers}</div>` : ""}
        ${(gate.blockers || []).length ? `<ul>${gate.blockers.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>` : ""}
      </section>`;
  }

  function noDrawPolicyMarkup(pick) {
    const policy = pick?.explanationEvidence?.marketEvidence?.noDrawPolicy || null;
    if (!policy) return "";
    const status = policy.divertedToGoals
      ? `Diverted to ${policy.preferredGoalMarket === "gg-yes" ? "GG" : "Over 1.5"}`
      : "Result structure retained";
    return `
      <section class="no-draw-policy-box ${policy.divertedToGoals ? "diverted" : "retained"}">
        <div><span class="eyebrow">NO DRAW DECISION CHECK</span><strong>${escapeHtml(status)}</strong></div>
        <div class="no-draw-policy-grid">
          <span>Decisive <b>${escapeHtml(confidence((policy.decisiveMass || 0) * 100))}</b></span>
          <span>Clean decisive <b>${escapeHtml(confidence((policy.cleanDecisiveMass || 0) * 100))}</b></span>
          <span>Draw mass <b>${escapeHtml(confidence((policy.drawMass || 0) * 100))}</b></span>
          <span>Forced GG <b>${escapeHtml(confidence((policy.forcedGgMass || 0) * 100))}</b></span>
          <span>League O1.5 <b>${escapeHtml(confidence((policy.leagueOver15Rate || 0) * 100))}</b></span>
          <span>League GG <b>${escapeHtml(confidence((policy.leagueBttsRate || 0) * 100))}</b></span>
        </div>
      </section>`;
  }

  function formPictureMarkup(pick) {
    const picture = pick?.explanationEvidence?.formPicture || pick?.internalAudit?.formPicture;
    if (!picture?.home || !picture?.away) return "";
    const side = (row) => `
      <div>
        <strong>${escapeHtml(row.name || "Team")}</strong>
        <span>Form <b>${escapeHtml(row.form || "—")}</b></span>
        <span>Points <b>${escapeHtml(String(row.points ?? "—"))}/15</b></span>
        <span>Form goals <b>${escapeHtml(row.goals || "—")}</b></span>
        <small>${escapeHtml(row.scoreline || "")}</small>
      </div>`;
    return `<section class="athena-half-picture">
      <h3>Last five — HT/FT, form and form goals</h3>
      <div class="athena-half-grid">${side(picture.home)}${side(picture.away)}</div>
    </section>`;
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
        <p>${escapeHtml(leagueText(item.league))} · ${escapeHtml(formatKickoff(item.kickoff))}</p>
        ${matchStatusMarkup(item, item.activeEngine || engineKey)}
      </div>
      ${earlySeasonMarkup(item)}
      <div class="explanation-box">
        <span class="eyebrow">${escapeHtml(pick?.market || "Market")}</span>
        <h3>${escapeHtml(pick?.selection || "Prediction")}</h3>
        <small class="engine-strength-label">Engine strength: ${escapeHtml(confidence(pick?.confidence ?? pick?.score))}</small>
        <p>${escapeHtml(explanation)}</p>
      </div>
      ${htftGateMarkup(pick)}
      ${noDrawPolicyMarkup(pick)}
      ${formPictureMarkup(pick)}
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

  function leagueClimateMarkup(item) {
    const climate = item?.leagueScoring;
    if (!climate || (climate.label !== "high" && climate.label !== "low")) return "";
    const pct = Math.round((Number(climate.over25Rate) || 0) * 100);
    const rising = climate.trend?.direction === "rising";
    const falling = climate.trend?.direction === "falling";
    const title = climate.label === "high"
      ? `High-scoring league. Over 2.5 has landed in about ${pct}% of matches.`
      : `Low-scoring league. Over 2.5 has landed in about ${pct}% of matches.`;
    const label = climate.label === "high"
      ? `HIGH SCORING · O2.5 ${pct}%`
      : `LOW SCORING · O2.5 ${pct}%`;
    const trend = rising ? " rising" : falling ? " falling" : "";
    return `<span class="league-climate-chip ${escapeHtml(climate.label)}${trend}" title="${escapeHtml(title)}">${escapeHtml(label)}</span>`;
  }

  function riskFlagMarkup(item, pick = null, extraClass = "") {
    const flags = [
      ...(item?.redFlags || []),
      item?.earlySeason,
      item?.topFiveClash,
      item?.leagueGoalsFlag,
      pick?.leagueGoalsFlag,
      ...(pick?.redFlags || [])
    ].filter(Boolean);
    const unique = [];
    for (const flag of flags) {
      if (!unique.some((entry) => entry.code === flag.code)) unique.push(flag);
    }
    unique.sort((left, right) => Number(left.number || 99) - Number(right.number || 99));
    return unique.map((flag) =>
      `<span class="early-season-flag ${escapeHtml(extraClass)}" title="${escapeHtml(flag.reason || flag.label || "Risk flag")}">⚑ ${escapeHtml(flag.label || "RED FLAG")}</span>`
    ).join("");
  }

  function hasRedFlag(item, pick = null) {
    return Boolean(
      (item?.redFlags || []).length ||
      item?.earlySeason ||
      item?.topFiveClash ||
      item?.leagueGoalsFlag ||
      pick?.leagueGoalsFlag ||
      (pick?.redFlags || []).length
    );
  }

  function earlySeasonMarkup(item, extraClass = "") {
    return riskFlagMarkup(item, item?.pick, extraClass);
  }

  function engineCard(item) {
    const pick = item.pick;

    if (!pick) {
      const waiting = item.processingState && item.processingState !== "running";
      return `
        <article class="pick-card processing-card ${hasRedFlag(item) ? "early-season" : ""}" data-processing="true">
          <div class="pick-meta">
            <span>${escapeHtml(leagueText(item.league))}</span>
            <span>${escapeHtml(formatKickoff(item.kickoff))}</span>
          </div>
          ${earlySeasonMarkup(item)}
          ${leagueClimateMarkup(item)}
          ${matchStatusMarkup(item, engineKey)}
          <div class="pick-teams">
            <div class="pick-team">${logoMarkup(item.home)}<span>${escapeHtml(item.home?.name || "Home")}</span></div>
            <div class="pick-team">${logoMarkup(item.away)}<span>${escapeHtml(item.away?.name || "Away")}</span></div>
          </div>
          <span class="pick-badge processing">${waiting ? "Waiting for history" : "Processing"}</span>
          <strong class="pick-selection">${waiting ? "Papa needs more team history" : "Papa is preparing this pick"}</strong>
          <div class="pick-bottom">
            <span>${escapeHtml(item.processingMessage || "Current-engine analysis in progress")}</span>
            <b>${waiting ? "Pending" : "Please wait"}</b>
          </div>
        </article>`;
    }

    if (pick.available === false || pick.key === "no-pick") {
      return `
        <article class="pick-card no-pick-card ${hasRedFlag(item, pick) ? "early-season" : ""}" data-fixture-id="${escapeHtml(item.fixtureId)}">
          <div class="pick-meta">
            <span>${escapeHtml(leagueText(item.league))}</span>
            <span>${escapeHtml(formatKickoff(item.kickoff))}</span>
          </div>
          ${earlySeasonMarkup(item)}
          ${leagueClimateMarkup(item)}
          ${matchStatusMarkup(item, item.activeEngine || engineKey)}
          <div class="pick-teams">
            <div class="pick-team">${logoMarkup(item.home)}<span>${escapeHtml(item.home?.name || "Home")}</span></div>
            <div class="pick-team">${logoMarkup(item.away)}<span>${escapeHtml(item.away?.name || "Away")}</span></div>
          </div>
          <span class="pick-badge no-pick">NO PICK</span>
          <strong class="pick-selection">No market passed this engine's rules</strong>
          <p class="no-pick-reason">${escapeHtml(pick.explanationParagraph || pick.description || pick.reasons?.[0] || "The evidence was not strong enough.")}</p>
          <div class="pick-bottom"><span>Protected decision</span><b>Withheld</b></div>
        </article>`;
    }

    return `
      <button class="pick-card ${hasRedFlag(item, pick) ? "early-season" : ""}" data-fixture-id="${escapeHtml(item.fixtureId)}">
        <div class="pick-meta">
          <span>${escapeHtml(leagueText(item.league))}</span>
          <span>${escapeHtml(formatKickoff(item.kickoff))}</span>
        </div>
        ${earlySeasonMarkup(item)}
        ${leagueClimateMarkup(item)}
        ${matchStatusMarkup(item, item.activeEngine || engineKey)}
        <div class="pick-teams">
          <div class="pick-team">${logoMarkup(item.home)}<span>${escapeHtml(item.home?.name || "Home")}</span></div>
          <div class="pick-team">${logoMarkup(item.away)}<span>${escapeHtml(item.away?.name || "Away")}</span></div>
        </div>
        <span class="pick-badge">${escapeHtml(pick.qualified ? "Qualified" : "Directional")}</span>
        ${riskFlagMarkup(item, pick)}
        <strong class="pick-selection">${escapeHtml(pick.selection || pick.market)}</strong>
        <div class="pick-bottom">
          <span>${escapeHtml(pick.market || "Market")}</span>
          <b>${escapeHtml(confidence(pick.confidence ?? pick.score))}</b>
        </div>
      </button>`;
  }

  function renderEngineMetrics(items) {
    const completed = items.filter((item) => Boolean(item.pick));
    const readyItems = completed.filter((item) => item.pick?.available !== false && item.pick?.key !== "no-pick");
    const noPicks = completed.length - readyItems.length;
    const preparing = items.length - completed.length;
    const qualified = readyItems.filter((item) => item.pick?.qualified).length;
    const avg = readyItems.length
      ? readyItems.reduce((sum, item) => {
          const number = Number(item.pick?.confidence ?? item.pick?.score ?? 0);
          return sum + (number <= 1 ? number * 100 : number);
        }, 0) / readyItems.length
      : 0;
    const markets = new Set(readyItems.map((item) => item.pick?.market).filter(Boolean)).size;

    $("#portalMetrics").innerHTML = `
      <div class="metric"><span>Picks ready</span><strong>${readyItems.length}</strong><small>Selections that passed this engine's rules</small></div>
      <div class="metric"><span>Strong picks</span><strong>${qualified}</strong><small>Passed story, sample and market gates</small></div>
      <div class="metric"><span>NO PICK</span><strong>${noPicks}</strong><small>Withheld instead of forcing a weak market</small></div>
      <div class="metric"><span>Preparing</span><strong>${preparing}</strong><small>${preparing ? "Papa is analysing imported fixtures" : `Average strength ${avg ? `${avg.toFixed(1)}%` : "—"}`}</small></div>`;
    $("#marketCount")?.replaceChildren(document.createTextNode(String(markets)));
  }

  function setupEngineFilters() {
    const league = $("#leagueFilter");
    const market = $("#marketFilter");
    const strength = $("#strengthFilter");
    const matchState = $("#matchStateFilter");
    const search = $("#searchFilter");

    const leagues = [...new Set(engineItems.map((item) =>
      leagueText(item.league)
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
        const leagueValue = leagueText(item.league);
        if (league.value && leagueValue !== league.value) return false;
        if (market.value && item.pick?.market !== market.value) return false;
        const noPick = item.pick?.available === false || item.pick?.key === "no-pick";
        if (strength.value === "qualified" && (!item.pick?.qualified || noPick)) return false;
        if (strength.value === "directional" && (!item.pick || item.pick?.qualified || noPick)) return false;
        if (strength.value === "no-pick" && !noPick) return false;
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
        : `<div class="empty-card">No fixtures match these filters.</div>`;

      $$(".pick-card").forEach((card) => {
        card.addEventListener("click", () => {
          const item = filtered.find((row) => String(row.fixtureId) === card.dataset.fixtureId);
          if (item?.pick) openDialog(explanationDialog(item, item.pick));
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

  const HUB_ENGINE_ORDER = ["primary", "safer", "aggressive", "venue", "form", "athena"];

  function hubEnginePick(item, key) {
    return item?.engines?.[key] || null;
  }

  function hubPickUnavailable(pick) {
    return Boolean(pick) && (pick.available === false || pick.key === "no-pick");
  }

  function hubPickReady(pick) {
    return Boolean(pick) && !hubPickUnavailable(pick);
  }

  function hubPickConfidence(pick) {
    const value = Number(pick?.confidence ?? pick?.score ?? 0);
    return value <= 1 ? value * 100 : value;
  }

  function hubEngineStatus(item, key, pick) {
    if (!pick) return { label: "PREPARING", className: "preparing" };
    if (hubPickUnavailable(pick)) return { label: "NO PICK", className: "withheld" };
    const outcome = item?.engineOutcomes?.[key] || pick?.outcome || null;
    if (outcome) return { label: String(outcome).toUpperCase(), className: "settled" };
    if (key === "athena" && pick.grade === "PRIME") return { label: "PRIME", className: "prime" };
    return { label: pick.qualified === false ? "DIRECTIONAL" : "QUALIFIED", className: pick.qualified === false ? "directional" : "qualified" };
  }

  function hubAgreement(item) {
    const counts = new Map();
    for (const key of HUB_ENGINE_ORDER) {
      const pick = hubEnginePick(item, key);
      if (!hubPickReady(pick)) continue;
      const selection = String(pick.selection || pick.market || "").trim().toLowerCase();
      if (!selection) continue;
      counts.set(selection, (counts.get(selection) || 0) + 1);
    }
    const strongest = [...counts.values()].sort((a, b) => b - a)[0] || 0;
    return strongest >= 2 ? strongest : 0;
  }

  function hubEngineRow(item, key) {
    const meta = ENGINE_META[key] || { name: key, short: key };
    const pick = hubEnginePick(item, key);
    const state = hubEngineStatus(item, key, pick);
    const selection = !pick
      ? "Preparing this fixture"
      : hubPickUnavailable(pick)
        ? "No market passed"
        : pick.selection || pick.market || "Selection ready";
    const market = !pick
      ? item?.processing?.[key]?.message || "Waiting for prepared analysis"
      : hubPickUnavailable(pick)
        ? pick.explanationParagraph || pick.description || pick.reasons?.[0] || "Evidence was not strong enough."
        : pick.market || (key === "athena" ? "Athena market" : "Market");
    const score = hubPickReady(pick) ? `${hubPickConfidence(pick).toFixed(1)}%` : "";
    const disabled = !pick ? "disabled" : "";
    const flags = riskFlagMarkup(item, pick, "chip");
    return `<button class="hub-engine-row engine-${escapeHtml(key)} ${escapeHtml(state.className)} ${hasRedFlag(item, pick) ? "flagged" : ""}" data-hub-engine="${escapeHtml(key)}" data-fixture-id="${escapeHtml(item.fixtureId)}" type="button" ${disabled}>
      <span class="hub-engine-name"><i></i><b>${escapeHtml(meta.name)}</b><small>${escapeHtml(state.label)}</small></span>
      <span class="hub-engine-pick"><strong>${escapeHtml(selection)}</strong><small>${escapeHtml(market)}</small>${flags}</span>
      <span class="hub-engine-score">${escapeHtml(score || (pick ? "WITHHELD" : "…"))}</span>
    </button>`;
  }

  function hubCard(item, visibleKeys = HUB_ENGINE_ORDER) {
    const readyKeys = visibleKeys.filter((key) => hubPickReady(hubEnginePick(item, key)));
    const totalReady = HUB_ENGINE_ORDER.filter((key) => hubPickReady(hubEnginePick(item, key))).length;
    const agreement = hubAgreement(item);
    const early = hasRedFlag(item);
    if (!readyKeys.length && !early) return "";
    const rowKeys = readyKeys.length ? readyKeys : visibleKeys;
    return `<article class="papa-hub-card ${early ? "early-season" : ""}" data-hub-fixture="${escapeHtml(item.fixtureId)}">
      <header class="hub-match-head">
        <div class="pick-meta"><span>${escapeHtml(leagueText(item.league))}</span><span>${escapeHtml(formatKickoff(item.kickoff))}</span></div>
        ${earlySeasonMarkup(item)}
        ${leagueClimateMarkup(item)}
        ${matchStatusMarkup(item)}
        <div class="hub-match-teams">
          <div class="pick-team">${logoMarkup(item.home)}<span>${escapeHtml(item.home?.name || "Home")}</span></div>
          <span class="hub-versus">VS</span>
          <div class="pick-team away">${logoMarkup(item.away)}<span>${escapeHtml(item.away?.name || "Away")}</span></div>
        </div>
        <div class="hub-summary-chips">
          <span>${totalReady}/${HUB_ENGINE_ORDER.length} engines picked</span>
          ${agreement ? `<span class="agreement">${agreement} engines agree</span>` : ""}
          ${early ? earlySeasonMarkup(item, "chip") : ""}
          ${leagueClimateMarkup(item)}
        </div>
      </header>
      <div class="hub-engine-list">${rowKeys.map((key) => hubEngineRow(item, key)).join("")}</div>
    </article>`;
  }

  function visibleHubSummary() {
    const picks = hubItems.flatMap((item) => HUB_ENGINE_ORDER
      .map((key) => ({ key, pick: hubEnginePick(item, key) }))
      .filter(({ pick }) => hubPickReady(pick)));
    return {
      matches: hubItems.length,
      readySelections: picks.length,
      strongSelections: picks.filter(({ pick }) => pick.qualified !== false).length,
      activeEngines: new Set(picks.map(({ key }) => key)).size
    };
  }

  function renderPapaHubMetrics() {
    const summary = visibleHubSummary();
    const markets = new Set();
    for (const item of hubItems) {
      for (const key of HUB_ENGINE_ORDER) {
        const pick = hubEnginePick(item, key);
        if (hubPickReady(pick) && pick.market) markets.add(pick.market);
      }
    }
    $("#portalMetrics").innerHTML = `
      <div class="metric"><span>Matches with picks</span><strong>${summary.matches}</strong><small>Fixtures with no real selection are hidden</small></div>
      <div class="metric"><span>Engine picks</span><strong>${summary.readySelections}</strong><small>Qualified or directional selections ready now</small></div>
      <div class="metric"><span>Strong picks</span><strong>${summary.strongSelections}</strong><small>Qualified PapaSense or Athena selections</small></div>
      <div class="metric"><span>Active engines</span><strong>${summary.activeEngines}/${HUB_ENGINE_ORDER.length}</strong><small>Engines contributing at least one pick today</small></div>`;
    $("#marketCount")?.replaceChildren(document.createTextNode(String(markets.size)));
  }

  function setupPapaHubFilters() {
    const engine = $("#engineFilter");
    const league = $("#leagueFilter");
    const market = $("#marketFilter");
    const strength = $("#strengthFilter");
    const matchState = $("#matchStateFilter");
    const search = $("#searchFilter");
    const tabs = $$("[data-engine-tab]");

    const leagues = [...new Set(hubItems.map((item) => leagueText(item.league)).filter(Boolean))].sort();
    const markets = [...new Set(hubItems.flatMap((item) => HUB_ENGINE_ORDER
      .map((key) => hubEnginePick(item, key))
      .filter((pick) => hubPickReady(pick) && pick.market)
      .map((pick) => pick.market)))].sort();
    league.innerHTML = `<option value="">All leagues</option>${leagues.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
    market.innerHTML = `<option value="">All markets</option>${markets.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;

    const selectedKeys = () => engine.value ? [engine.value] : HUB_ENGINE_ORDER;
    const updateTabs = () => tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.engineTab === engine.value));

    const render = () => {
      updateTabs();
      const keys = selectedKeys();
      const query = search.value.trim().toLowerCase();
      const filtered = hubItems.filter((item) => {
        const leagueValue = leagueText(item.league);
        if (league.value && leagueValue !== league.value) return false;
        if (matchState.value && stateClass(item) !== matchState.value) return false;
        const picks = keys.map((key) => ({ key, pick: hubEnginePick(item, key) }));
        const early = hasRedFlag(item);
        if (!picks.some(({ pick }) => hubPickReady(pick)) && !early) return false;
        if (market.value && !picks.some(({ pick }) => hubPickReady(pick) && pick?.market === market.value)) return false;
        if (strength.value === "qualified" && !picks.some(({ pick }) => hubPickReady(pick) && pick.qualified !== false)) return false;
        if (strength.value === "directional" && !picks.some(({ pick }) => hubPickReady(pick) && pick.qualified === false)) return false;
        if (query) {
          const text = [
            item.home?.name,
            item.away?.name,
            leagueValue,
            ...picks
              .filter(({ pick }) => hubPickReady(pick))
              .flatMap(({ key, pick }) => [ENGINE_META[key]?.name, pick?.market, pick?.selection])
          ].join(" ").toLowerCase();
          if (!text.includes(query)) return false;
        }
        return true;
      });

      const cards = filtered.map((item) => hubCard(item, keys)).filter(Boolean);
      $("#portalContent").innerHTML = cards.length
        ? cards.join("")
        : `<div class="empty-card">No picks passed for this date and filter combination.</div>`;

      $$(".hub-engine-row:not(:disabled)").forEach((row) => {
        row.addEventListener("click", () => {
          const item = filtered.find((entry) => String(entry.fixtureId) === row.dataset.fixtureId);
          const key = row.dataset.hubEngine;
          const pick = hubEnginePick(item, key);
          if (!item || !pick) return;
          if (key === "athena" && item.athena) {
            openDialog(athenaDialog(item.athena));
            return;
          }
          openDialog(explanationDialog({ ...item, activeEngine: key }, {
            ...pick,
            engineName: pick.engineName || ENGINE_META[key]?.name
          }));
        });
      });
    };

    tabs.forEach((tab) => tab.addEventListener("click", () => {
      engine.value = tab.dataset.engineTab || "";
      render();
    }));
    [engine, league, market, strength, matchState].forEach((input) => input.onchange = render);
    search.oninput = render;
    $("#clearFilters").onclick = () => {
      engine.value = "";
      league.value = "";
      market.value = "";
      strength.value = "";
      matchState.value = "";
      search.value = "";
      render();
    };
    render();
  }

  async function loadPapaHubPage() {
    const dateInput = $("#dateFilter");
    dateInput.value = dateInput.value || localIsoDate();

    const renderPayload = (payload, { cached = false } = {}) => {
      hubItems = (payload.items || []).filter((item) =>
        HUB_ENGINE_ORDER.some((key) => hubPickReady(hubEnginePick(item, key))) ||
        hasRedFlag(item)
      );
      renderPapaHubMetrics();
      setupPapaHubFilters();
      const states = payload.matchStates || {};
      const summary = visibleHubSummary();
      setStatus(
        cached
          ? `${summary.readySelections} picks shown instantly`
          : `${summary.readySelections} selections across ${summary.activeEngines} active engines`,
        cached
          ? "Saved picks-only board · checking quietly for updates"
          : `Matches with picks ${hubItems.length} · Live ${states.live || 0} · Settled ${states.settled || 0}`
      );
      scheduleLiveReload(load, hubItems);
    };

    const load = async ({ silent = false, force = false } = {}) => {
      const date = dateInput.value;
      const cached = !force ? readCachedPapaHub(date) : null;
      if (cached && !silent) renderPayload(cached.payload, { cached: true });
      else if (!silent) setStatus("Loading all five engines…", "Papa is opening the prepared main board.");
      try {
        const payload = await fetchApi(`/api/main-board/today?date=${encodeURIComponent(date)}${force ? "&force=1" : ""}`, {
          timeoutMs: cached ? 18000 : 35000,
          cacheMode: force ? "reload" : "default"
        });
        saveCachedPapaHub(date, payload);
        renderPayload(payload);
      } catch (error) {
        if (!cached) throw error;
        setStatus("Showing saved all-engine board", `Live refresh failed: ${error.message}`);
      }
    };

    dateInput.onchange = () => load();
    $("#refreshButton")?.addEventListener("click", () => load({ force: true }));
    await load();
  }

  async function loadEnginePage() {
    const meta = ENGINE_META[engineKey] || ENGINE_META.primary;
    $("#portalTitle").textContent = meta.name;
    $("#portalDescription").textContent = meta.description;
    const dateInput = $("#dateFilter");
    dateInput.value = dateInput.value || localIsoDate();

    const renderPayload = (payload, { cached = false, allowScheduling = true } = {}) => {
      engineItems = payload.items || [];
      renderEngineMetrics(engineItems);
      setupEngineFilters();

      const states = payload.matchStates || {};
      const ready = Number(payload.ready ?? payload.count ?? 0);
      const pending = Number(payload.pending ?? 0);
      const processing = payload.processing || {};

      if (cached) {
        setStatus(
          `${ready} ${meta.name} selections shown instantly`,
          `Prepared board from this device · checking quietly for updates`
        );
        return;
      }

      if (pending) {
        setStatus(
          `${ready} ${meta.name} selections ready · ${pending} awaiting preparation`,
          processing.message || "Papa's scheduled board workflow will prepare the remaining fixtures."
        );
        if (allowScheduling) {
          if (livePollTimer) clearTimeout(livePollTimer);
          livePollTimer = setTimeout(() => load({ silent: true }), 60000);
        }
        return;
      }

      setStatus(
        `${ready} ${meta.name} selections loaded`,
        `Prepared board · Pending ${states.pending || 0} · Live ${states.live || 0} · Settled ${states.settled || 0}`
      );
      if (allowScheduling) scheduleLiveReload(load, engineItems);
    };

    const load = async ({ silent = false, force = false } = {}) => {
      const date = dateInput.value;
      const cached = !force ? readCachedEngineBoard(engineKey, date) : null;

      if (cached && !silent) {
        renderPayload(cached.payload, { cached: true, allowScheduling: false });
      } else if (!silent) {
        setStatus(`Loading prepared ${meta.name} board…`);
      }

      try {
        const forceQuery = force ? "&force=1" : "";
        const payload = await fetchApi(
          `/api/boards/${engineKey}?date=${encodeURIComponent(date)}${forceQuery}`,
          {
            timeoutMs: cached ? 15000 : 30000,
            cacheMode: force ? "reload" : "default"
          }
        );
        saveCachedEngineBoard(engineKey, date, payload);
        renderPayload(payload, { cached: false, allowScheduling: true });
      } catch (error) {
        if (cached) {
          setStatus(
            `${Number(cached.payload.ready ?? cached.payload.count ?? 0)} ${meta.name} selections available`,
            `Showing the last prepared board because the live check failed: ${error?.message || error}`
          );
          return;
        }
        throw error;
      }
    };

    dateInput.addEventListener("change", () => load());
    $("#refreshButton")?.addEventListener("click", () => load({ force: true }));
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
    const grade = String(item.papaLockGrade || item.tier || "").toLowerCase();
    if (grade.includes("elite")) return "papalock-elite";
    if (grade.includes("prime")) return "papalock-prime";
    return "papalock-qualified";
  }

  function bankerEngineChips(item) {
    return (item.agreeingEngines || []).map((engine) => `
      <span class="engine-vote" title="${escapeHtml(`${engine.engineName}: ${confidence(engine.confidence)}`)}">
        <b>${escapeHtml(engine.engineName)}</b><small>${escapeHtml(confidence(engine.confidence))}</small>
      </span>`).join("");
  }

  function consensusBankerCard(item) {
    const voteText = `${item.confirmationFamilies || item.consensusCount || 0}/3 confirmation families`;
    return `
      <button class="pick-card consensus-banker-card ${bankerTierClass(item)}" data-fixture="${escapeHtml(item.fixtureId)}">
        <div class="pick-meta">
          <span>${escapeHtml(leagueText(item.league))}</span>
          <span>${escapeHtml(formatKickoff(item.kickoff))}</span>
        </div>
        ${matchStatusMarkup(item)}
        <div class="pick-teams">
          <div class="pick-team">${logoMarkup(item.home)}<span>${escapeHtml(item.home?.name || "Home")}</span></div>
          <div class="pick-team">${logoMarkup(item.away)}<span>${escapeHtml(item.away?.name || "Away")}</span></div>
        </div>
        <div class="consensus-grade-row">
          <span class="pick-badge consensus-grade">${escapeHtml(item.tier || "PAPALOCK PRIME")}</span>
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
        <span class="eyebrow">TODAY'S BANKER · ${escapeHtml(item.tier || "PAPALOCK PRIME")}</span>
        <h2>${escapeHtml(item.home?.name || "Home")} vs ${escapeHtml(item.away?.name || "Away")}</h2>
        <p>${`${escapeHtml(leagueText(item.league))} · ${escapeHtml(formatKickoff(item.kickoff))}`}</p>
        ${matchStatusMarkup(item)}
      </div>
      <div class="explanation-box consensus-verdict">
        <span class="eyebrow">PAPALOCK FINAL PICK</span>
        <h3>${escapeHtml(item.selection)} · ${Number(item.bankerScore || 0).toFixed(1)}/100</h3>
        <p>${escapeHtml(item.publicExplanation || item.explanation || "PapaLock independently rechecked the safest market shared by the engine evidence.")}</p>
      </div>
      <section class="consensus-dialog-section">
        <h3>Independent families backing this pick</h3>
        <div class="dialog-engine-votes">${bankerEngineChips(item)}</div>
      </section>
      <div class="reason-columns">
        <section><h3>Why it qualified</h3><ul>${(item.reasons || []).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("") || "<li>Passed every banker gate.</li>"}</ul></section>
        <section><h3>Safety checks</h3><ul>
          <li>One final banker per fixture.</li>
          <li>At least 12 same-league matches per team.</li>
          <li>At least 8 relevant home/away matches per team.</li>
          <li>Recent-six evidence must be complete.</li>
          <li>No critical caution or incomplete profile.</li>
        </ul></section>
      </div>
      <div class="consensus-sample-grid">
        <div><span>${escapeHtml(item.home?.name || "Home")}</span><strong>${Number(evidence.homeOverall || 0)} overall</strong><small>${Number(evidence.homeVenue || 0)} home</small></div>
        <div><span>${escapeHtml(item.away?.name || "Away")}</span><strong>${Number(evidence.awayOverall || 0)} overall</strong><small>${Number(evidence.awayVenue || 0)} away</small></div>
        <div><span>Agreement</span><strong>${item.confirmationFamilies || item.consensusCount || 0}/3 families</strong><small>Independent story confirmation</small></div>
      </div>
      ${otherViews.length ? `<section class="consensus-dialog-section"><h3>Other engine views</h3><div class="other-engine-views">${otherViews.map((view) => `<div><span>${escapeHtml(view.engineName)}</span><strong>${escapeHtml(view.selection || view.market || "No pick")}</strong><small>${escapeHtml(confidence(view.confidence))}${view.qualified ? " · qualified" : " · directional"}</small></div>`).join("")}</div></section>` : ""}`;
  }

  function renderConsensusBankers(payload) {
    const picks = payload.picks || [];
    const average = picks.length
      ? picks.reduce((sum, item) => sum + Number(item.bankerScore || 0), 0) / picks.length
      : 0;

    $("#portalMetrics").innerHTML = `
      <div class="metric"><span>Matches checked</span><strong>${payload.predictionsReviewed || 0}</strong><small>League fixtures reviewed by PapaLock</small></div>
      <div class="metric"><span>Bankers ready</span><strong>${payload.totalSelections || 0}</strong><small>Only one strongest banker per fixture</small></div>
      <div class="metric"><span>Elite Bankers</span><strong>${payload.eliteCount || 0}</strong><small>All three independent families confirmed the story</small></div>
      <div class="metric"><span>Average banker score</span><strong>${average ? `${average.toFixed(1)}` : "—"}</strong><small>Family confirmation, market evidence and sample-quality score</small></div>`;

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
           <section class="banker-method-panel"><div><strong>PapaLock rule</strong><p>Papa, Safer and Aggressive count as one PapaSense family. Venue Pattern and Athena are separate families. At least two independent families must support the same match story before PapaLock performs its own market audit.</p></div><div><strong>No forced bankers</strong><p>PapaLock chooses the safest common expression, rejects close conflicts and publishes no more than three bankers per day.</p></div></section>
           ${summary.length ? `<section class="boss-rejection-panel"><h2>Why other matches stayed off the Banker page</h2>${summary.map((row) => `<div><span>${escapeHtml(row.reason)}</span><strong>${row.count}</strong></div>`).join("")}</section>` : ""}`
        : `<div class="empty-card banker-empty"><strong>NO BANKER QUALIFIED</strong><span>No match passed the selected filters and PapaLock’s independent market and sample gates.</span><small>PapaLock will not force a banker when independent families disagree or the evidence is thin.</small></div>
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
      setStatus("Running PapaLock’s final banker audit…");
    }

    try {
      const payload = await fetchApi(`/api/bankers/today?date=${encodeURIComponent(date)}&limit=3`);
      saveCachedBankers(date, payload);
      renderConsensusBankers(payload);
      const states = payload.matchStates || {};
      setStatus(
        `${payload.totalSelections || 0} PapaLock Bankers ready`,
        `Elite ${payload.eliteCount || 0} · Prime ${payload.primeCount || 0} · Pending ${states.pending || 0} · Live ${states.live || 0}`
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

  function goalsBankerCard(item) {
    const climate = item.leagueScoring || {};
    const pct = (value) => Number.isFinite(Number(value)) ? `${Math.round(Number(value) * 100)}%` : "—";
    return `<article class="consensus-banker-card goals-banker-card" data-fixture="${escapeHtml(item.fixtureId)}">
      <div class="pick-meta">
        <span>${escapeHtml(leagueText(item.league))}</span>
        <span>${escapeHtml(formatKickoff(item.kickoff))}</span>
      </div>
      <div class="hub-match-teams">
        <div class="pick-team">${logoMarkup(item.home)}<span>${escapeHtml(item.home?.name || "Home")}</span></div>
        <span class="hub-versus">VS</span>
        <div class="pick-team away">${logoMarkup(item.away)}<span>${escapeHtml(item.away?.name || "Away")}</span></div>
      </div>
      <span class="pick-badge consensus-grade">${escapeHtml(item.selection)}</span>
      <strong class="pick-selection">${escapeHtml(item.selection)}</strong>
      <div class="goals-banker-odds">SportyBet ${escapeHtml(String(item.odds || "—"))}${item.sportyBetUrl ? ` · <a href="${escapeHtml(item.sportyBetUrl)}" target="_blank" rel="noopener">open</a>` : ""}</div>
      <ul class="goals-banker-reasons">${(item.reasons || []).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>
      <div class="goals-align-row">
        <span>League ${pct(item.leagueRate)}</span>
        <span>Home 5 ${pct(item.homeRecentRate)}</span>
        <span>Away 5 ${pct(item.awayRecentRate)}</span>
      </div>
      ${climate.label ? `<span class="league-climate-chip ${escapeHtml(climate.label)}">${escapeHtml(climate.label === "high" ? "HIGH SCORING" : climate.label === "low" ? "LOW SCORING" : "NEUTRAL")}</span>` : ""}
    </article>`;
  }

  function renderGoalsBankers(payload) {
    const picks = payload.picks || [];
    const leagueMap = payload.leagueMap || [];
    const leagueFilter = $("#goalsLeagueFilter");
    const marketFilter = $("#goalsMarketFilter");
    const searchFilter = $("#goalsSearchFilter");

    if (leagueFilter && !leagueFilter.dataset.ready) {
      const leagues = [...new Set(picks.map((pick) => leagueText(pick.league)).filter(Boolean))];
      leagueFilter.innerHTML = `<option value="">All leagues</option>${leagues.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}`;
      leagueFilter.dataset.ready = "1";
    }
    if (marketFilter && !marketFilter.dataset.ready) {
      const markets = [...new Set(picks.map((pick) => pick.selection).filter(Boolean))];
      marketFilter.innerHTML = `<option value="">All totals</option>${markets.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}`;
      marketFilter.dataset.ready = "1";
    }

    $("#portalMetrics").innerHTML = [
      `<div class="diagnostic-card"><span>Leagues mapped</span><strong>${leagueMap.length}</strong></div>`,
      `<div class="diagnostic-card"><span>Goals bankers</span><strong>${picks.length}</strong></div>`,
      `<div class="diagnostic-card"><span>Odds band</span><strong>1.20–1.55</strong></div>`,
      `<div class="diagnostic-card"><span>Rejected</span><strong>${payload.rejectedCount || 0}</strong></div>`
    ].join("");

    $("#goalsLeagueMap").innerHTML = leagueMap.length
      ? leagueMap.map((row) => `<article class="goals-league-chip">
          <strong>${escapeHtml(leagueText(row))}</strong>
          <span>${escapeHtml(row.selection)}</span>
          <small>${row.picks} match${row.picks === 1 ? "" : "es"} · ${row.climate ? escapeHtml(String(row.climate).toUpperCase()) : "pattern"}</small>
        </article>`).join("")
      : `<div class="empty-card">No league totals pattern cleared the 1.20–1.55 band today.</div>`;

    const draw = () => {
      const leagueValue = leagueFilter?.value || "";
      const marketValue = marketFilter?.value || "";
      const query = (searchFilter?.value || "").trim().toLowerCase();
      const filtered = picks.filter((item) => {
        if (leagueValue && leagueText(item.league) !== leagueValue) return false;
        if (marketValue && item.selection !== marketValue) return false;
        if (query) {
          const text = [item.home?.name, item.away?.name, leagueText(item.league), item.selection].join(" ").toLowerCase();
          if (!text.includes(query)) return false;
        }
        return true;
      });
      $("#portalContent").innerHTML = filtered.length
        ? `<div class="portal-grid consensus-banker-grid">${filtered.map(goalsBankerCard).join("")}</div>`
        : `<div class="empty-card">No totals banker matches these filters.</div>`;
    };

    [leagueFilter, marketFilter].filter(Boolean).forEach((input) => { input.onchange = draw; });
    if (searchFilter) searchFilter.oninput = draw;
    draw();
  }

  async function loadGoalsBankers({ silent = false } = {}) {
    const dateInput = $("#dateFilter");
    const date = dateInput.value || utcIsoDate();
    dateInput.value = date;
    if (!silent) setStatus("Scanning league goal patterns…");
    let payload = await fetchApi(`/api/goals-bankers/today?date=${encodeURIComponent(date)}`);
    if (!(payload.pickCount || 0) && payload.rolledForward && payload.date && payload.date !== date) {
      dateInput.value = payload.date;
    }
    if (!(payload.pickCount || 0) && !(payload.reviewedFixtures || 0)) {
      const utc = utcIsoDate();
      if (utc !== date) {
        const alt = await fetchApi(`/api/goals-bankers/today?date=${encodeURIComponent(utc)}`);
        if (alt.pickCount || alt.reviewedFixtures) {
          dateInput.value = alt.date || utc;
          payload = alt;
        }
      }
    }
    renderGoalsBankers(payload);
    setStatus(
      `${payload.pickCount || 0} total-goals bankers`,
      `${(payload.leagueMap || []).length} leagues mapped · odds 1.20–1.55${payload.rolledForward ? " · next UTC date" : ""}`
    );
  }

  async function loadGoalsBankersPage() {
    const dateInput = $("#dateFilter");
    dateInput.value = dateInput.value || utcIsoDate();
    dateInput.onchange = () => loadGoalsBankers();
    $("#refreshButton")?.addEventListener("click", () => loadGoalsBankers());
    await loadGoalsBankers();
  }

  function winsBankerCard(item) {
    return `<article class="consensus-banker-card wins-banker-card" data-fixture="${escapeHtml(item.fixtureId)}">
      <div class="pick-meta">
        <span>${escapeHtml(leagueText(item.league))}</span>
        <span>${escapeHtml(formatKickoff(item.kickoff))}</span>
      </div>
      <div class="hub-match-teams">
        <div class="pick-team">${logoMarkup(item.home)}<span>${escapeHtml(item.home?.name || "Home")}</span></div>
        <span class="hub-versus">VS</span>
        <div class="pick-team away">${logoMarkup(item.away)}<span>${escapeHtml(item.away?.name || "Away")}</span></div>
      </div>
      <span class="pick-badge consensus-grade">${escapeHtml(item.selection)}</span>
      <strong class="pick-selection">${escapeHtml(item.selection)}</strong>
      <div class="goals-banker-odds">SportyBet ${escapeHtml(String(item.odds || "—"))}${item.sportyBetUrl ? ` · <a href="${escapeHtml(item.sportyBetUrl)}" target="_blank" rel="noopener">open</a>` : ""}</div>
      <ul class="goals-banker-reasons">${(item.reasons || []).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>
      <div class="goals-align-row">
        <span>P${item.favoriteRank || "—"} · ${escapeHtml(String(item.favoritePpg || "—"))} PPG</span>
        <span>${escapeHtml(String(item.favoriteGpg || "—"))} GPG</span>
        <span>Opp ${escapeHtml(item.opponentForm || "—")}</span>
      </div>
      <div class="wins-price-row">
        <span>Opp ${escapeHtml(String(item.opponentOdds || "—"))}</span>
        <span>O1.5 ${escapeHtml(String(item.over15Odds || "—"))}</span>
        <span>2+ ${escapeHtml(String(item.favoriteTwoPlusOdds || "—"))}</span>
        <span>Opp score ${escapeHtml(String(item.opponentScoreOdds || "—"))}</span>
      </div>
    </article>`;
  }

  function renderWinsBankers(payload) {
    const picks = payload.picks || [];
    const leagueFilter = $("#winsLeagueFilter");
    const searchFilter = $("#winsSearchFilter");
    if (leagueFilter && !leagueFilter.dataset.ready) {
      const leagues = [...new Set(picks.map((pick) => leagueText(pick.league)).filter(Boolean))];
      leagueFilter.innerHTML = `<option value="">All leagues</option>${leagues.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}`;
      leagueFilter.dataset.ready = "1";
    }
    $("#portalMetrics").innerHTML = [
      `<div class="diagnostic-card"><span>Wins bankers</span><strong>${picks.length}</strong></div>`,
      `<div class="diagnostic-card"><span>Favourite band</span><strong>1.19–1.55</strong></div>`,
      `<div class="diagnostic-card"><span>Opponent</span><strong>> 4.50</strong></div>`,
      `<div class="diagnostic-card"><span>Rejected</span><strong>${payload.rejectedCount || 0}</strong></div>`
    ].join("");
    const draw = () => {
      const leagueValue = leagueFilter?.value || "";
      const query = (searchFilter?.value || "").trim().toLowerCase();
      const filtered = picks.filter((item) => {
        if (leagueValue && leagueText(item.league) !== leagueValue) return false;
        if (query) {
          const text = [item.home?.name, item.away?.name, leagueText(item.league), item.selection].join(" ").toLowerCase();
          if (!text.includes(query)) return false;
        }
        return true;
      });
      $("#portalContent").innerHTML = filtered.length
        ? `<div class="portal-grid consensus-banker-grid">${filtered.map(winsBankerCard).join("")}</div>`
        : `<div class="empty-card">No favourite cleared every Wins Banker filter today.</div>`;
    };
    if (leagueFilter) leagueFilter.onchange = draw;
    if (searchFilter) searchFilter.oninput = draw;
    draw();
  }

  async function loadWinsBankers({ silent = false } = {}) {
    const dateInput = $("#dateFilter");
    const date = dateInput.value || utcIsoDate();
    dateInput.value = date;
    if (!silent) setStatus("Scanning favourite wins…");
    let payload = await fetchApi(`/api/wins-bankers/today?date=${encodeURIComponent(date)}`);
    if (!(payload.pickCount || 0) && payload.rolledForward && payload.date && payload.date !== date) {
      dateInput.value = payload.date;
    }
    if (!(payload.pickCount || 0) && !(payload.reviewedFixtures || 0)) {
      const utc = utcIsoDate();
      if (utc !== date) {
        const alt = await fetchApi(`/api/wins-bankers/today?date=${encodeURIComponent(utc)}`);
        if (alt.pickCount || alt.reviewedFixtures) {
          dateInput.value = alt.date || utc;
          payload = alt;
        }
      }
    }
    renderWinsBankers(payload);
    setStatus(
      `${payload.pickCount || 0} wins bankers`,
      `Favourite 1.19–1.55 · opponent > 4.50${payload.rolledForward ? " · next UTC date" : ""}`
    );
  }

  async function loadWinsBankersPage() {
    const dateInput = $("#dateFilter");
    dateInput.value = dateInput.value || utcIsoDate();
    dateInput.onchange = () => loadWinsBankers();
    $("#refreshButton")?.addEventListener("click", () => loadWinsBankers());
    await loadWinsBankers();
  }


  function athenaCacheKey(date) {
    return `${ATHENA_CACHE_PREFIX}${date}`;
  }

  function readCachedAthena(date) {
    try {
      const raw = storageGet(athenaCacheKey(date));
      if (!raw) return null;
      const record = JSON.parse(raw);
      if (!record?.payload || !record.savedAt) return null;
      if (Date.now() - Number(record.savedAt) > ATHENA_CACHE_MAX_AGE_MS) return null;
      if (record.payload.date !== date) return null;
      return record;
    } catch {
      return null;
    }
  }

  function saveCachedAthena(date, payload) {
    storageSet(athenaCacheKey(date), JSON.stringify({
      savedAt: Date.now(),
      payload
    }));
  }

  function athenaMarketLabel(market, item) {
    const labels = {
      HOME_WIN_EITHER_HALF: `${item.home?.name || "Home"} to Win Either Half`,
      AWAY_WIN_EITHER_HALF: `${item.away?.name || "Away"} to Win Either Half`,
      HOME_DNB: `${item.home?.name || "Home"} Draw No Bet`,
      AWAY_DNB: `${item.away?.name || "Away"} Draw No Bet`,
      HOME_OR_DRAW: `${item.home?.name || "Home"} or Draw`,
      AWAY_OR_DRAW: `${item.away?.name || "Away"} or Draw`,
      HOME_TEAM_OVER_0_5: `${item.home?.name || "Home"} Over 0.5 Team Goals`,
      AWAY_TEAM_OVER_0_5: `${item.away?.name || "Away"} Over 0.5 Team Goals`,
      HOME_SECOND_HALF_OVER_0_5: `${item.home?.name || "Home"} to Score in the Second Half`,
      AWAY_SECOND_HALF_OVER_0_5: `${item.away?.name || "Away"} to Score in the Second Half`,
      HOME_SECOND_HALF_DNB: `${item.home?.name || "Home"} Second-Half Draw No Bet`,
      AWAY_SECOND_HALF_DNB: `${item.away?.name || "Away"} Second-Half Draw No Bet`,
      SECOND_HALF_OVER_0_5: "Second Half Over 0.5 Goals",
      SECOND_HALF_OVER_1_5: "Second Half Over 1.5 Goals",
      GOALS_BOTH_HALVES: "Goals in Both Halves",
      OVER_1_5: "Over 1.5 Match Goals",
      OVER_2_5: "Over 2.5 Match Goals",
      UNDER_2_5: "Under 2.5 Match Goals",
      UNDER_3_5: "Under 3.5 Match Goals",
      FIRST_HALF_UNDER_1_5: "First Half Under 1.5 Goals",
      FIRST_HALF_OVER_0_5: "First Half Over 0.5 Goals",
      HALF_TIME_DRAW: "Half-Time Draw",
      FULL_TIME_DRAW: "Full-Time Draw",
      BTTS_YES: "Both Teams to Score — Yes"
    };
    return labels[market] || String(market || "Not available").replaceAll("_", " ");
  }

  function dataPercent(value) {
    return Number.isFinite(Number(value)) ? `${Number(value)}%` : "—";
  }

  function athenaHalfPicture(item) {
    const picture = item.explanation?.dataPicture || {};
    const rows = [picture.home, picture.away].filter(Boolean);
    if (!rows.length) return "";
    return `<section class="athena-half-picture">
      <h3>Goals by half</h3>
      <div class="athena-half-grid">${rows.map((team) => `
        <div>
          <strong>${escapeHtml(team.name || "Team")}</strong>
          <span>Scores 1st half <b>${dataPercent(team.firstHalfScoring)}</b></span>
          <span>Scores 2nd half <b>${dataPercent(team.secondHalfScoring)}</b></span>
          <span>Concedes 2nd half <b>${dataPercent(team.secondHalfConceding)}</b></span>
          <span>2nd half has a goal <b>${dataPercent(team.secondHalfOver05)}</b></span>
          <span>2+ goals after HT <b>${dataPercent(team.secondHalfOver15)}</b></span>
          <span>Goals in both halves <b>${dataPercent(team.goalsBothHalves)}</b></span>
        </div>`).join("")}</div>
    </section>`;
  }

  function athenaCard(item) {
    const classification = String(item.classification?.type || "UNCLASSIFIED")
      .replaceAll("_", " ")
      .toLowerCase();
    return `
      <button class="pick-card boss-card athena-card ${item.grade === "PRIME" ? "prime" : "qualified"}" data-fixture="${escapeHtml(item.fixtureId)}">
        <div class="pick-meta">
          <span>${escapeHtml(leagueText(item.league))}</span>
          <span>${escapeHtml(formatKickoff(item.kickoff))}</span>
        </div>
        ${matchStatusMarkup(item)}
        <div class="pick-teams">
          <div class="pick-team">${logoMarkup(item.home)}<span>${escapeHtml(item.home?.name || "Home")}</span></div>
          <div class="pick-team">${logoMarkup(item.away)}<span>${escapeHtml(item.away?.name || "Away")}</span></div>
        </div>
        <div class="boss-grade-row">
          <span class="pick-badge boss-grade">${escapeHtml(item.grade || "QUALIFIED")}</span>
          <span class="boss-total-score">ATHENA v3 · ${Number(item.score || 0).toFixed(0)}/100</span>
        </div>
        <strong class="pick-selection">${escapeHtml(item.selection)}</strong>
        <p class="athena-card-story">${escapeHtml(item.explanation?.summary || item.story || "Athena found a supported match pattern.")}</p>
        <div class="pick-bottom"><span>${escapeHtml(classification)}</span><b>${escapeHtml(item.market)}</b></div>
      </button>`;
  }

  function athenaDialog(item) {
    const explanation = item.explanation || {};
    const samples = explanation.samples || item.samples || {};
    const reasons = explanation.whyPick || explanation.reasons || [];
    const cautions = explanation.cautions || [];
    const coverage = explanation.coverage || {};
    const classification = String(item.classification?.type || "UNCLASSIFIED")
      .replaceAll("_", " ")
      .toLowerCase();

    return `
      <div class="dialog-title">
        <span class="eyebrow">ATHENA v3 · ${escapeHtml(item.grade || "QUALIFIED")}</span>
        <h2>${escapeHtml(item.home?.name || "Home")} vs ${escapeHtml(item.away?.name || "Away")}</h2>
        <p>${escapeHtml(leagueText(item.league))} · ${escapeHtml(formatKickoff(item.kickoff))}</p>
        ${matchStatusMarkup(item)}
      </div>
      <div class="explanation-box boss-verdict">
        <span class="eyebrow">ATHENA'S PICK</span>
        <h3>${escapeHtml(item.selection)} · ${Number(item.score || 0).toFixed(0)}/100</h3>
        <p>${escapeHtml(explanation.summary || item.story || "Athena found a supported match pattern.")}</p>
      </div>
      <section class="athena-classification-panel">
        <span>Match type</span><strong>${escapeHtml(classification)}</strong>
        <small>${escapeHtml(explanation.matchType ? `Athena read this as ${explanation.matchType}.` : "HT/FT and half-goal records agree.")}</small>
      </section>
      <div class="reason-columns athena-plain-reasons">
        <section><h3>Why Athena picked this</h3><ul>${reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("") || "<li>The HT/FT route and goals-by-half records pointed to the same market.</li>"}</ul></section>
        <section><h3>What Athena was careful about</h3><ul>${cautions.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("") || "<li>No major conflict survived the safety checks.</li>"}</ul></section>
      </div>
      ${athenaHalfPicture(item)}
      <div class="boss-sample-grid">
        <div><span>${escapeHtml(item.home?.name || "Home")}</span><strong>${samples.homeOverall || 0} overall</strong><small>${samples.homeVenue || 0} home</small></div>
        <div><span>${escapeHtml(item.away?.name || "Away")}</span><strong>${samples.awayOverall || 0} overall</strong><small>${samples.awayVenue || 0} away</small></div>
        <div><span>Data coverage</span><strong>Half scores: ${escapeHtml(coverage.halfTimeScores || "complete")}</strong><small>Goal events: ${escapeHtml(coverage.eventDetail || "not available")} · ${Number(coverage.eventCoveragePercent || 0)}%</small></div>
      </div>`;
  }

  function athenaConfidenceMatches(item, filterValue) {
    const score = Number(item?.score || 0);
    if (!filterValue) return true;
    if (filterValue === "90-plus") return score >= 90;
    if (filterValue === "prime") return score >= 88;
    if (filterValue === "qualified") return score >= 80 && score < 88;
    return true;
  }

  function renderAthena(payload) {
    const picks = payload.picks || [];
    const rejectionRows = payload.rejections || [];
    const coverage = payload.dataCoverage || {};
    $("#portalMetrics").innerHTML = `
      <div class="metric"><span>Matches checked</span><strong>${payload.reviewedFixtures || 0}</strong><small>Fixtures evaluated for the selected date</small></div>
      <div class="metric"><span>Athena Picks</span><strong>${payload.qualifiedCount || 0}</strong><small>One v3 selection after swing and half-goal checks</small></div>
      <div class="metric"><span>Prime</span><strong>${payload.primeCount || 0}</strong><small>Engine strength of 88/100 or higher</small></div>
      <div class="metric"><span>Event detail</span><strong>${coverage.eventTablesAvailable ? "ON" : "LIMITED"}</strong><small>${escapeHtml(coverage.eventCoverageNote || "Half-time and full-time scores remain required.")}</small></div>`;

    const marketFilter = $("#athenaMarketFilter");
    const confidenceFilter = $("#athenaConfidenceFilter");
    const previousMarket = marketFilter?.value || "";
    const markets = [...new Set(picks.map((item) => item.market).filter(Boolean))].sort();

    if (marketFilter) {
      marketFilter.innerHTML = `<option value="">All markets</option>${markets.map((market) => `<option value="${escapeHtml(market)}">${escapeHtml(market)}</option>`).join("")}`;
      marketFilter.value = markets.includes(previousMarket) ? previousMarket : "";
    }

    const draw = () => {
      const selectedMarket = marketFilter?.value || "";
      const selectedConfidence = confidenceFilter?.value || "";
      const filtered = picks
        .filter((item) => !selectedMarket || item.market === selectedMarket)
        .filter((item) => athenaConfidenceMatches(item, selectedConfidence))
        .sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || new Date(a.kickoff) - new Date(b.kickoff));

      const filtersActive = Boolean(selectedMarket || selectedConfidence);
      const summary = $("#athenaFilterSummary");
      if (summary) {
        summary.textContent = filtersActive
          ? `Showing ${filtered.length} of ${picks.length} Athena selections. Clear the filters to restore the full board.`
          : `Showing all ${picks.length} Athena selections. Qualified begins at 80/100 and Prime at 88/100.`;
      }

      if (filtered.length) {
        $("#portalContent").innerHTML = `<div class="portal-grid boss-grid athena-grid">${filtered.map(athenaCard).join("")}</div>
          <section class="boss-rejection-panel"><h2>Why other matches received NO PICK</h2>${rejectionRows.map((row) => `<div><span>${escapeHtml(row.reason)}</span><strong>${row.count}</strong></div>`).join("") || "<p>No rejection summary was returned.</p>"}</section>`;
      } else if (picks.length && filtersActive) {
        $("#portalContent").innerHTML = `<div class="empty-card boss-empty"><strong>NO PICKS MATCH THESE FILTERS</strong><span>Try another market or confidence level.</span><small>Athena still has ${picks.length} qualified selection${picks.length === 1 ? "" : "s"} on the full board.</small></div>`;
      } else {
        $("#portalContent").innerHTML = `<div class="empty-card boss-empty"><strong>NO ATHENA PICK</strong><span>${escapeHtml(payload.status || "No fixture cleared Athena v3's swing, half-goal and safety checks.")}</span><small>Athena does not invent missing goal timing or force a direction when both teams have credible routes.</small></div>
          <section class="boss-rejection-panel"><h2>Why the board is empty</h2>${rejectionRows.map((row) => `<div><span>${escapeHtml(row.reason)}</span><strong>${row.count}</strong></div>`).join("") || "<p>No fixture had enough complete history.</p>"}</section>`;
      }

      $$(".athena-card").forEach((card) => {
        card.addEventListener("click", () => {
          const item = filtered.find((row) => String(row.fixtureId) === card.dataset.fixture);
          if (item) openDialog(athenaDialog(item));
        });
      });
    };

    if (marketFilter) marketFilter.onchange = draw;
    if (confidenceFilter) confidenceFilter.onchange = draw;
    draw();
    scheduleLiveReload(() => loadAthena({ silent: true }), picks);
  }

  async function loadAthena({ silent = false, force = false } = {}) {
    const dateInput = $("#dateFilter");
    const date = dateInput.value || localIsoDate();
    dateInput.value = date;
    const cached = readCachedAthena(date);
    let cacheShown = false;

    if (cached?.payload && !force) {
      renderAthena(cached.payload);
      cacheShown = true;
      const ageMinutes = Math.max(0, Math.round((Date.now() - Number(cached.savedAt)) / 60000));
      setStatus("Saved Athena board displayed instantly", `Refreshing quietly · saved ${ageMinutes} min ago`);
    } else if (!silent) {
      setStatus("Athena is reading HT/FT transitions and goals by half…");
    }

    try {
      const payload = await fetchApi(
        `/api/athena/today?date=${encodeURIComponent(date)}${force ? "&force=1" : ""}`
      );
      saveCachedAthena(date, payload);
      renderAthena(payload);
      const states = payload.matchStates || {};
      setStatus(
        payload.status || `${payload.qualifiedCount || 0} Athena picks ready`,
        `Pending ${states.pending || 0} · Live ${states.live || 0} · Settled ${states.settled || 0} · ${payload.engine}`
      );
    } catch (error) {
      if (!cacheShown) throw error;
      setStatus("Showing saved Athena board", `Live refresh failed: ${error.message}`);
    }
  }

  async function loadAthenaPage() {
    const dateInput = $("#dateFilter");
    dateInput.value = dateInput.value || localIsoDate();
    dateInput.onchange = () => loadAthena();
    $("#refreshButton")?.addEventListener("click", () => loadAthena({ force: true }));
    await loadAthena();
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
              <td data-label="Strength">${escapeHtml(confidence(row.confidence))}</td>
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
      if (page === "papa-hub") await loadPapaHubPage();
      if (page === "engine") await loadEnginePage();
      if (page === "bankers") await loadBankersPage();
      if (page === "goals-bankers") await loadGoalsBankersPage();
      if (page === "wins-bankers") await loadWinsBankersPage();
      if (page === "athena-picks") await loadAthenaPage();
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