(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const API_BASES = [
    window.BETSPAPA_API_URL,
    "https://api.betspapa.com",
    "https://betspapa.onrender.com"
  ].filter((value, index, list) => value && list.indexOf(value) === index);

  const CACHE_PREFIX = "betspapa-live-fixtures-v151:";
  const state = {
    date: "",
    category: "all",
    league: "",
    query: "",
    sort: "smart",
    fixtures: [],
    filtered: [],
    activeApiBase: null,
    lastUpdated: null,
    refreshTimer: null,
    loading: false
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function localIsoDate() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function shiftIsoDate(dateValue, days) {
    const date = new Date(`${dateValue}T12:00:00`);
    if (Number.isNaN(date.getTime())) return localIsoDate();
    date.setDate(date.getDate() + days);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function formatDateLabel(value) {
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric"
    }).format(date);
  }

  function formatTime(value) {
    if (!value) return "TBA";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "TBA";
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function formatUpdated(value) {
    if (!value) return "Waiting for update";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Updated recently";
    return `Updated ${new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(date)}`;
  }

  function shortName(name) {
    return String(name || "")
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 3)
      .toUpperCase() || "—";
  }

  function teamLogo(team) {
    const logo = team?.logo_url || team?.logo || "";
    const name = team?.name || "Team";
    return logo
      ? `<span class="lf-team-logo"><img src="${escapeHtml(logo)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`
      : `<span class="lf-team-logo">${escapeHtml(shortName(name))}</span>`;
  }

  function normalizedConfidence(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    const normalized = number <= 1 ? number * 100 : number;
    return Math.max(0, Math.min(100, normalized));
  }

  function predictionForFixture(fixture, predictionMap) {
    return predictionMap.get(String(fixture.fixtureId ?? fixture.id)) || null;
  }

  function mergeDashboard(payload) {
    const fixtures = Array.isArray(payload?.fixtures) ? payload.fixtures : [];
    const predictions = Array.isArray(payload?.predictions) ? payload.predictions : [];
    const predictionMap = new Map(
      predictions.map((prediction) => [String(prediction.fixtureId), prediction])
    );
    const represented = new Set();

    const merged = fixtures.map((fixture) => {
      const prediction = predictionForFixture(fixture, predictionMap);
      const fixtureId = String(fixture.fixtureId ?? fixture.id);
      represented.add(fixtureId);
      return normalizeFixture(fixture, prediction);
    });

    for (const prediction of predictions) {
      const fixtureId = String(prediction.fixtureId ?? prediction.id);
      if (!represented.has(fixtureId)) {
        merged.push(normalizeFixture({}, prediction));
      }
    }

    return merged.filter((fixture) => fixture.id);
  }

  function normalizeFixture(fixture, prediction) {
    const source = prediction || fixture || {};
    const home = fixture?.home || prediction?.home || {};
    const away = fixture?.away || prediction?.away || {};
    const league = fixture?.league || prediction?.league || {};
    const matchState = prediction?.matchState || fixture?.matchState || {};
    const settlement = prediction?.settlement || fixture?.settlement || null;
    const status = String(matchState.code || source.status || "TBD").toUpperCase();
    const category = matchState.category || inferCategory(status, settlement);
    const currentScore =
      matchState.score ||
      settlement?.fulltimeScore ||
      scoreFromObjects(
        prediction?.score?.current || fixture?.fulltime || null
      );
    const halftimeScore =
      matchState.halftimeScore ||
      settlement?.halftimeScore ||
      scoreFromObjects(
        prediction?.score?.halftime || fixture?.halftime || null
      );
    const primary = prediction?.engines?.primary || prediction?.primary || null;
    const outcome =
      prediction?.engineOutcomes?.primary ||
      prediction?.primary?.outcome ||
      settlement?.outcome ||
      matchState.outcome ||
      null;

    return {
      id: String(fixture.fixtureId ?? prediction?.fixtureId ?? fixture.id ?? prediction?.id ?? ""),
      internalId: fixture.id || prediction?.internalFixtureId || null,
      kickoff: fixture.kickoff || prediction?.kickoff || null,
      status,
      state: {
        ...matchState,
        category,
        label: matchState.label || statusLabel(status, category, outcome),
        score: currentScore,
        halftimeScore,
        outcome
      },
      settlement,
      outcome,
      engineOutcomes: prediction?.engineOutcomes || {},
      home: {
        name: home?.name || "Home Team",
        logo_url: home?.logo_url || home?.logo || ""
      },
      away: {
        name: away?.name || "Away Team",
        logo_url: away?.logo_url || away?.logo || ""
      },
      league: {
        name: league?.name || "Competition",
        country: league?.country || ""
      },
      venue: fixture?.venue || prediction?.venue || "",
      primary,
      engines: prediction?.engines || {},
      prediction,
      updatedAt:
        matchState.updatedAt ||
        settlement?.updatedAt ||
        fixture?.updatedAt ||
        prediction?.updatedAt ||
        payloadUpdatedFallback()
    };
  }

  function payloadUpdatedFallback() {
    return state.lastUpdated || new Date().toISOString();
  }

  function scoreFromObjects(score) {
    if (!score || typeof score !== "object") return null;
    const home = Number(score.home);
    const away = Number(score.away);
    if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
    return `${home}-${away}`;
  }

  function inferCategory(status, settlement) {
    if (settlement?.outcome) return "settled";
    if (["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"].includes(status)) return "live";
    if (["FT", "AET", "PEN"].includes(status)) return "finished";
    if (["PST", "SUSP", "INT"].includes(status)) return "delayed";
    if (["CANC", "ABD", "AWD", "WO"].includes(status)) return "cancelled";
    return "pending";
  }

  function statusLabel(status, category, outcome) {
    if (category === "settled" && outcome) return `Settled · ${outcome}`;
    const labels = {
      TBD: "Time to be defined",
      NS: "Not started",
      "1H": "First half",
      HT: "Half-time",
      "2H": "Second half",
      ET: "Extra time",
      BT: "Break",
      P: "Penalties",
      FT: "Full-time",
      AET: "After extra time",
      PEN: "After penalties",
      PST: "Postponed",
      SUSP: "Suspended",
      CANC: "Cancelled",
      ABD: "Abandoned",
      AWD: "Awarded",
      WO: "Walkover"
    };
    if (category === "finished") return "Settling";
    return labels[status] || status || "Pending";
  }

  function displayCategory(fixture) {
    const category = fixture?.state?.category || "pending";
    return category === "cancelled" ? "delayed" : category;
  }

  async function fetchFromApi(path) {
    let lastError = null;
    const ordered = state.activeApiBase
      ? [state.activeApiBase, ...API_BASES.filter((base) => base !== state.activeApiBase)]
      : API_BASES;

    for (const base of ordered) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 16000);
      try {
        const response = await fetch(`${base}${path}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
          cache: "no-store"
        });
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        const data = await response.json();
        state.activeApiBase = base;
        return data;
      } catch (error) {
        lastError = error;
      } finally {
        window.clearTimeout(timeout);
      }
    }

    throw lastError || new Error("No BetsPapa API endpoint was reachable");
  }

  function writeCache(payload) {
    try {
      localStorage.setItem(
        `${CACHE_PREFIX}${state.date}`,
        JSON.stringify({ savedAt: new Date().toISOString(), payload })
      );
    } catch (_) {}
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(`${CACHE_PREFIX}${state.date}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.payload ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function setConnection(status, title, detail) {
    const element = $("#livePageStatus");
    if (!element) return;
    element.dataset.state = status;
    element.innerHTML = `
      <span class="lf-connection-dot" aria-hidden="true"></span>
      <div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail || "")}</small></div>
    `;
  }

  function summaryCounts(fixtures) {
    const counts = {
      all: fixtures.length,
      live: 0,
      pending: 0,
      finished: 0,
      settled: 0,
      delayed: 0
    };
    for (const fixture of fixtures) {
      const category = displayCategory(fixture);
      if (Object.prototype.hasOwnProperty.call(counts, category)) {
        counts[category] += 1;
      }
    }
    return counts;
  }

  function updateSummary() {
    const counts = summaryCounts(state.fixtures);
    $("#summaryAll").textContent = counts.all;
    $("#summaryLive").textContent = counts.live;
    $("#summaryPending").textContent = counts.pending;
    $("#summaryFinished").textContent = counts.finished;
    $("#summarySettled").textContent = counts.settled;
    $("#summaryDelayed").textContent = counts.delayed;

    $$("#liveStateTabs button").forEach((button) => {
      const key = button.dataset.state;
      const count = counts[key] ?? 0;
      const countElement = button.querySelector("span");
      if (countElement) countElement.textContent = count;
    });

    $$("#liveSummary button").forEach((button) => {
      button.classList.toggle("active", button.dataset.summaryState === state.category);
    });
  }

  function updateLeagueOptions() {
    const leagues = [...new Set(
      state.fixtures
        .map((fixture) => leagueLabel(fixture))
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));

    for (const selector of ["#liveLeagueFilter", "#mobileLiveLeagueFilter"]) {
      const select = $(selector);
      if (!select) continue;
      const current = state.league;
      select.innerHTML = `<option value="">All leagues</option>` +
        leagues.map((league) => `<option value="${escapeHtml(league)}">${escapeHtml(league)}</option>`).join("");
      select.value = leagues.includes(current) ? current : "";
    }
  }

  function leagueLabel(fixture) {
    return [fixture?.league?.country, fixture?.league?.name]
      .filter(Boolean)
      .join(" · ") || "Competition";
  }

  function categoryMatches(fixture) {
    if (state.category === "all") return true;
    return displayCategory(fixture) === state.category;
  }

  function fixtureSearchText(fixture) {
    return [
      fixture.home?.name,
      fixture.away?.name,
      leagueLabel(fixture),
      fixture.primary?.selection,
      fixture.primary?.market,
      ...Object.values(fixture.engines || {}).flatMap((pick) => [
        pick?.selection,
        pick?.market
      ])
    ].filter(Boolean).join(" ").toLowerCase();
  }

  function smartPriority(fixture) {
    const category = displayCategory(fixture);
    return {
      live: 0,
      pending: 1,
      delayed: 2,
      finished: 3,
      settled: 4
    }[category] ?? 5;
  }

  function sortFixtures(fixtures) {
    return [...fixtures].sort((a, b) => {
      if (state.sort === "league") {
        const leagueCompare = leagueLabel(a).localeCompare(leagueLabel(b));
        if (leagueCompare) return leagueCompare;
      } else if (state.sort === "smart") {
        const priority = smartPriority(a) - smartPriority(b);
        if (priority) return priority;
      }

      const timeA = new Date(a.kickoff || 0).getTime();
      const timeB = new Date(b.kickoff || 0).getTime();

      if (state.category === "settled" || state.category === "finished") {
        return timeB - timeA;
      }
      return timeA - timeB;
    });
  }

  function applyFilters() {
    const query = state.query.trim().toLowerCase();
    const filtered = state.fixtures.filter((fixture) => {
      if (!categoryMatches(fixture)) return false;
      if (state.league && leagueLabel(fixture) !== state.league) return false;
      if (query && !fixtureSearchText(fixture).includes(query)) return false;
      return true;
    });

    state.filtered = sortFixtures(filtered);
    renderBoard();
    updateFilterCount();
  }

  function cardStateLabel(fixture) {
    const category = displayCategory(fixture);
    if (category === "settled" && fixture.outcome) return fixture.outcome;
    if (category === "finished") return "Settling";
    if (category === "live") return fixture.state?.label || "Live";
    if (category === "pending") return "Pending";
    if (category === "delayed") return fixture.state?.label || "Delayed";
    return fixture.state?.label || category;
  }

  function kickoffBlock(fixture) {
    const category = displayCategory(fixture);
    if (category === "live") {
      return `<strong>LIVE</strong><small>${escapeHtml(fixture.state?.label || "In progress")}</small>`;
    }
    if (category === "settled" || category === "finished") {
      return `<strong>${escapeHtml(formatTime(fixture.kickoff))}</strong><small>${category === "settled" ? "Final" : "Full-time"}</small>`;
    }
    if (category === "delayed") {
      return `<strong>—</strong><small>${escapeHtml(fixture.state?.label || "Delayed")}</small>`;
    }
    return `<strong>${escapeHtml(formatTime(fixture.kickoff))}</strong><small>${escapeHtml(formatDateLabel(state.date))}</small>`;
  }

  function scoreBlock(fixture) {
    const category = displayCategory(fixture);
    const score = fixture.state?.score;
    if (score && category !== "pending") {
      return `<strong>${escapeHtml(score)}</strong><small>${fixture.state?.halftimeScore ? `HT ${escapeHtml(fixture.state.halftimeScore)}` : "Current score"}</small>`;
    }
    return `<strong>—</strong><small>${category === "pending" ? "Not started" : "No score"}</small>`;
  }

  function outcomeMarkup(outcome) {
    const normalized = String(outcome || "").toUpperCase();
    if (!["WIN", "LOSS", "VOID"].includes(normalized)) return "";
    return `<span class="lf-outcome ${normalized.toLowerCase()}">${escapeHtml(normalized)}</span>`;
  }

  function analysisMarkup(fixture) {
    const pick = fixture.primary;
    if (!pick) {
      return `<div class="lf-analysis preparing">
        <div class="lf-analysis-copy">
          <span>PAPA’S ANALYSIS</span>
          <strong>Preparing this fixture</strong>
          <small>The match is listed now; the completed market direction will appear when ready.</small>
        </div>
      </div>`;
    }

    const confidence = normalizedConfidence(pick.confidence ?? pick.score);
    const tier = pick.tier || (pick.qualified ? "Qualified" : "Directional");
    return `<div class="lf-analysis">
      <div class="lf-analysis-copy">
        <span>PAPA’S PICK · ${escapeHtml(tier)}</span>
        <strong>${escapeHtml(pick.selection || pick.market || "Match direction")}</strong>
        <small>${escapeHtml(pick.market || "Prediction")}</small>
      </div>
      ${confidence === null ? "" : `<b class="lf-rule-score">${escapeHtml(confidence.toFixed(0))}/100</b>`}
    </div>`;
  }

  function renderCard(fixture) {
    const category = displayCategory(fixture);
    const league = leagueLabel(fixture);
    const country = fixture.league?.country || "";
    const outcome = fixture.outcome;
    return `<article class="lf-match-card" data-state="${escapeHtml(category)}">
      <div class="lf-card-head">
        <div class="lf-card-league">
          <strong title="${escapeHtml(league)}">${escapeHtml(fixture.league?.name || "Competition")}</strong>
          <small>${escapeHtml(country || fixture.venue || "Football fixture")}</small>
        </div>
        <span class="lf-state-badge ${escapeHtml(category)}">${escapeHtml(cardStateLabel(fixture))}</span>
      </div>

      <div class="lf-scoreboard">
        <div class="lf-kickoff">${kickoffBlock(fixture)}</div>
        <div class="lf-teams">
          <div class="lf-team">${teamLogo(fixture.home)}<strong title="${escapeHtml(fixture.home.name)}">${escapeHtml(fixture.home.name)}</strong></div>
          <div class="lf-team">${teamLogo(fixture.away)}<strong title="${escapeHtml(fixture.away.name)}">${escapeHtml(fixture.away.name)}</strong></div>
        </div>
        <div class="lf-score">${scoreBlock(fixture)}</div>
      </div>

      ${analysisMarkup(fixture)}

      <div class="lf-card-footer">
        <div class="lf-card-footer-meta">
          ${outcomeMarkup(outcome)}
          <span title="${escapeHtml(fixture.venue || "")}">${escapeHtml(fixture.venue || formatUpdated(fixture.updatedAt))}</span>
        </div>
        <button class="lf-details-button" type="button" data-fixture-id="${escapeHtml(fixture.id)}">Match details</button>
      </div>
    </article>`;
  }

  function renderSkeletons() {
    const grid = $("#liveFixtureGrid");
    if (!grid) return;
    grid.innerHTML = Array.from({ length: 6 }, () => `<div class="lf-skeleton" aria-hidden="true"></div>`).join("");
  }

  function renderBoard() {
    const grid = $("#liveFixtureGrid");
    const empty = $("#liveEmptyState");
    const feedback = $("#boardFeedback");
    if (!grid || !empty) return;

    const categoryNames = {
      all: "All fixtures",
      live: "Live matches",
      pending: "Pending fixtures",
      finished: "Awaiting settlement",
      settled: "Settled fixtures",
      delayed: "Delayed fixtures"
    };
    $("#boardTitle").textContent = categoryNames[state.category] || "Fixtures";
    $("#boardSubtitle").textContent =
      `${state.filtered.length} of ${state.fixtures.length} fixtures · ${formatDateLabel(state.date)}`;

    if (!state.filtered.length) {
      grid.innerHTML = "";
      empty.hidden = false;
    } else {
      empty.hidden = true;
      grid.innerHTML = state.filtered.map(renderCard).join("");
    }

    if (feedback) {
      const liveCount = state.fixtures.filter((fixture) => displayCategory(fixture) === "live").length;
      feedback.hidden = !liveCount;
      if (liveCount) {
        feedback.textContent = `${liveCount} match${liveCount === 1 ? "" : "es"} currently live. Scores refresh automatically while this page is open.`;
      }
    }

    $$(".lf-details-button").forEach((button) => {
      button.addEventListener("click", () => openMatchDialog(button.dataset.fixtureId));
    });
  }

  function renderAll() {
    updateSummary();
    updateLeagueOptions();
    applyFilters();
    updateAutoRefreshLabel();
  }

  function engineName(key, pick) {
    return pick?.engineName || {
      primary: "Papa’s Pick",
      aggressive: "Aggressive",
      safer: "Safer",
      venue: "Venue Pattern"
    }[key] || key;
  }

  function enginePickMarkup(fixture) {
    const entries = Object.entries(fixture.engines || {});
    if (!entries.length && fixture.primary) {
      entries.push(["primary", fixture.primary]);
    }
    if (!entries.length) {
      return `<p class="lf-dialog-empty">Papa’s analysis is still preparing for this fixture.</p>`;
    }

    return entries.map(([key, pick]) => {
      const outcome = fixture.engineOutcomes?.[key] || (key === "primary" ? fixture.outcome : null);
      const confidence = normalizedConfidence(pick?.confidence ?? pick?.score);
      return `<div class="lf-dialog-pick">
        <div>
          <span>${escapeHtml(engineName(key, pick))}${outcome ? ` · ${escapeHtml(outcome)}` : ""}</span>
          <strong>${escapeHtml(pick?.selection || pick?.market || "Match direction")}</strong>
          <small>${escapeHtml(pick?.market || pick?.tier || "Prediction")}</small>
        </div>
        ${confidence === null ? "" : `<b>${escapeHtml(confidence.toFixed(0))}/100</b>`}
      </div>`;
    }).join("");
  }

  function openMatchDialog(fixtureId) {
    const fixture = state.fixtures.find((item) => item.id === String(fixtureId));
    const dialog = $("#liveMatchDialog");
    const content = $("#liveMatchDialogContent");
    if (!fixture || !dialog || !content) return;

    const category = displayCategory(fixture);
    content.innerHTML = `
      <div class="lf-dialog-head">
        <span class="lf-state-badge ${escapeHtml(category)}">${escapeHtml(cardStateLabel(fixture))}</span>
        <h2>${escapeHtml(fixture.home.name)} vs ${escapeHtml(fixture.away.name)}</h2>
        <p>${escapeHtml(leagueLabel(fixture))} · ${escapeHtml(formatDateLabel(state.date))} · ${escapeHtml(formatTime(fixture.kickoff))}</p>
      </div>

      <div class="lf-dialog-score">
        <div class="lf-dialog-team">${teamLogo(fixture.home)}<strong>${escapeHtml(fixture.home.name)}</strong></div>
        <div class="lf-dialog-result">
          <strong>${escapeHtml(fixture.state?.score || "—")}</strong>
          <small>${fixture.state?.halftimeScore ? `Half-time ${escapeHtml(fixture.state.halftimeScore)}` : escapeHtml(fixture.state?.label || "Match state")}</small>
        </div>
        <div class="lf-dialog-team">${teamLogo(fixture.away)}<strong>${escapeHtml(fixture.away.name)}</strong></div>
      </div>

      <section class="lf-dialog-section">
        <h3>Published analysis</h3>
        ${enginePickMarkup(fixture)}
      </section>

      <section class="lf-dialog-section">
        <h3>Match information</h3>
        <div class="lf-dialog-meta">
          <div><span>Status</span><strong>${escapeHtml(fixture.state?.label || fixture.status)}</strong></div>
          <div><span>Venue</span><strong>${escapeHtml(fixture.venue || "Not listed")}</strong></div>
          <div><span>Last update</span><strong>${escapeHtml(formatUpdated(fixture.updatedAt))}</strong></div>
        </div>
      </section>
    `;

    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeMatchDialog() {
    const dialog = $("#liveMatchDialog");
    if (!dialog) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function setCategory(category) {
    state.category = category || "all";
    $$("#liveStateTabs button").forEach((button) => {
      const active = button.dataset.state === state.category;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    $$("#liveSummary button").forEach((button) => {
      button.classList.toggle("active", button.dataset.summaryState === state.category);
    });
    applyFilters();
  }

  function updateFilterCount() {
    const count = Number(Boolean(state.league)) + Number(Boolean(state.query.trim())) + Number(state.sort !== "smart");
    const target = $("#liveFilterCount");
    if (target) target.textContent = String(count);
  }

  function syncDesktopFilters() {
    $("#liveLeagueFilter").value = state.league;
    $("#liveSearchFilter").value = state.query;
    $("#liveSortFilter").value = state.sort;
  }

  function syncMobileFilters() {
    $("#mobileLiveLeagueFilter").value = state.league;
    $("#mobileLiveSearchFilter").value = state.query;
    $("#mobileLiveSortFilter").value = state.sort;
  }

  function openFilterSheet() {
    syncMobileFilters();
    const sheet = $("#liveFilterSheet");
    const backdrop = $("#liveFilterBackdrop");
    sheet?.classList.add("open");
    sheet?.setAttribute("aria-hidden", "false");
    $("#openLiveFilters")?.setAttribute("aria-expanded", "true");
    if (backdrop) backdrop.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeFilterSheet() {
    const sheet = $("#liveFilterSheet");
    const backdrop = $("#liveFilterBackdrop");
    sheet?.classList.remove("open");
    sheet?.setAttribute("aria-hidden", "true");
    $("#openLiveFilters")?.setAttribute("aria-expanded", "false");
    if (backdrop) backdrop.hidden = true;
    document.body.style.overflow = "";
  }

  function clearFilters({ keepCategory = false } = {}) {
    state.league = "";
    state.query = "";
    state.sort = "smart";
    if (!keepCategory) setCategory("all");
    syncDesktopFilters();
    syncMobileFilters();
    applyFilters();
  }

  function updateAutoRefreshLabel() {
    const liveCount = state.fixtures.filter((fixture) => displayCategory(fixture) === "live").length;
    const isToday = state.date === localIsoDate();
    $("#autoRefreshLabel").textContent = liveCount
      ? `Every 60 seconds · ${liveCount} live`
      : isToday
        ? "Every 3 minutes"
        : "Historical date";
    $("#lastUpdatedLabel").textContent = formatUpdated(state.lastUpdated);
  }

  function scheduleRefresh() {
    if (state.refreshTimer) window.clearTimeout(state.refreshTimer);
    const isToday = state.date === localIsoDate();
    if (!isToday) return;
    const hasLive = state.fixtures.some((fixture) => displayCategory(fixture) === "live");
    state.refreshTimer = window.setTimeout(
      () => loadFixtures({ silent: true }),
      hasLive ? 60000 : 180000
    );
  }

  async function loadFixtures({ silent = false } = {}) {
    if (state.loading) return;
    state.loading = true;
    if (!silent) {
      renderSkeletons();
      setConnection("loading", "Connecting to BetsPapa", `Loading ${formatDateLabel(state.date)} fixtures…`);
    }
    $("#liveRefreshButton").disabled = true;

    try {
      const payload = await fetchFromApi(`/api/dashboard/today?date=${encodeURIComponent(state.date)}`);
      state.lastUpdated = payload.generatedAt || payload.stats?.lastUpdated || new Date().toISOString();
      state.fixtures = mergeDashboard(payload);
      writeCache(payload);
      setConnection(
        "live",
        state.fixtures.length ? "Live match data connected" : "No fixtures imported",
        `${state.fixtures.length} fixtures · ${formatUpdated(state.lastUpdated)}`
      );
      renderAll();
    } catch (error) {
      const cached = readCache();
      if (cached) {
        state.lastUpdated = cached.savedAt;
        state.fixtures = mergeDashboard(cached.payload);
        setConnection(
          "cached",
          "Showing the last saved board",
          `${error.message || "Live connection unavailable"} · Saved ${formatUpdated(cached.savedAt).replace("Updated ", "")}`
        );
        renderAll();
      } else {
        state.fixtures = [];
        setConnection(
          "error",
          "Live data connection failed",
          `${error.message || "Unable to reach the BetsPapa API"}. Tap Refresh now to retry.`
        );
        renderAll();
      }
    } finally {
      state.loading = false;
      $("#liveRefreshButton").disabled = false;
      scheduleRefresh();
    }
  }

  function changeDate(nextDate) {
    state.date = nextDate || localIsoDate();
    $("#liveDateFilter").value = state.date;
    state.category = "all";
    state.league = "";
    state.query = "";
    state.sort = "smart";
    syncDesktopFilters();
    syncMobileFilters();
    setCategory("all");
    loadFixtures();
  }

  function bindEvents() {
    $("#previousDate")?.addEventListener("click", () => changeDate(shiftIsoDate(state.date, -1)));
    $("#nextDate")?.addEventListener("click", () => changeDate(shiftIsoDate(state.date, 1)));
    $("#todayDate")?.addEventListener("click", () => changeDate(localIsoDate()));
    $("#liveDateFilter")?.addEventListener("change", (event) => changeDate(event.target.value || localIsoDate()));
    $("#liveRefreshButton")?.addEventListener("click", () => loadFixtures());

    $$("#liveStateTabs button").forEach((button) => {
      button.addEventListener("click", () => setCategory(button.dataset.state));
    });
    $$("#liveSummary button").forEach((button) => {
      button.addEventListener("click", () => setCategory(button.dataset.summaryState));
    });

    $("#liveLeagueFilter")?.addEventListener("change", (event) => {
      state.league = event.target.value;
      syncMobileFilters();
      applyFilters();
    });
    $("#liveSearchFilter")?.addEventListener("input", (event) => {
      state.query = event.target.value;
      syncMobileFilters();
      applyFilters();
    });
    $("#liveSortFilter")?.addEventListener("change", (event) => {
      state.sort = event.target.value;
      syncMobileFilters();
      applyFilters();
    });

    $("#clearLiveFilters")?.addEventListener("click", () => clearFilters({ keepCategory: true }));
    $("#emptyClearFilters")?.addEventListener("click", () => clearFilters());
    $("#openLiveFilters")?.addEventListener("click", openFilterSheet);
    $("#closeLiveFilters")?.addEventListener("click", closeFilterSheet);
    $("#liveFilterBackdrop")?.addEventListener("click", closeFilterSheet);
    $("#mobileClearLiveFilters")?.addEventListener("click", () => {
      state.league = "";
      state.query = "";
      state.sort = "smart";
      syncMobileFilters();
    });
    $("#applyLiveFilters")?.addEventListener("click", () => {
      state.league = $("#mobileLiveLeagueFilter").value;
      state.query = $("#mobileLiveSearchFilter").value;
      state.sort = $("#mobileLiveSortFilter").value;
      syncDesktopFilters();
      applyFilters();
      closeFilterSheet();
    });

    $("#liveMatchDialogClose")?.addEventListener("click", closeMatchDialog);
    $("#liveMatchDialog")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) closeMatchDialog();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeFilterSheet();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && state.date === localIsoDate()) {
        const elapsed = Date.now() - new Date(state.lastUpdated || 0).getTime();
        if (elapsed > 60000) loadFixtures({ silent: true });
      }
    });
  }

  function init() {
    state.date = new URLSearchParams(location.search).get("date") || localIsoDate();
    $("#liveDateFilter").value = state.date;
    bindEvents();
    updateSummary();
    updateFilterCount();
    loadFixtures();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
