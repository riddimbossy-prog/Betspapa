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

  const ENGINE_META = {
    primary: {
      name: "Papa's Pick",
      short: "Papa",
      description: "The default all-evidence direction: venue, overall and recent HT/FT, goals, data quality and contradiction checks."
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

  async function fetchApi(path, { headers = {} } = {}) {
    let lastError = null;

    for (const base of API_BASES) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      try {
        const separator = path.includes("?") ? "&" : "?";
        const response = await fetch(`${base}${path}${separator}_=${Date.now()}`, {
          headers: { Accept: "application/json", ...headers },
          cache: "no-store",
          signal: controller.signal
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `${response.status} ${response.statusText}`);
        }
        const payload = await response.json();
        activeBase = base;
        return payload;
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError || new Error("No BetsPapa API endpoint was reachable");
  }

  function setStatus(message, detail = "") {
    const status = $("#portalStatus");
    if (!status) return;
    status.innerHTML = `
      <span>${escapeHtml(message)}</span>
      <small>${escapeHtml(detail || (activeBase || ""))}</small>`;
  }

  function setupNavigation() {
    $("#portalMenu")?.addEventListener("click", () => {
      $("#portalNav")?.classList.toggle("open");
    });

    $$("#portalNav a").forEach((link) => {
      link.addEventListener("click", () => $("#portalNav")?.classList.remove("open"));
    });
  }

  function openDialog(html) {
    const dialog = $("#portalDialog");
    const content = $("#portalDialogContent");
    if (!dialog || !content) return;
    content.innerHTML = html;
    if (!dialog.open) dialog.showModal();
  }

  function setupDialog() {
    const dialog = $("#portalDialog");
    $("#portalDialogClose")?.addEventListener("click", () => dialog?.close());
    dialog?.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog?.addEventListener("cancel", (event) => {
      event.preventDefault();
      dialog.close();
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
      <div class="metric"><span>Available picks</span><strong>${items.length}</strong></div>
      <div class="metric"><span>Qualified</span><strong>${qualified}</strong></div>
      <div class="metric"><span>Directional</span><strong>${directional}</strong></div>
      <div class="metric"><span>Average confidence</span><strong>${avg ? `${avg.toFixed(1)}%` : "—"}</strong></div>`;
    $("#marketCount")?.replaceChildren(document.createTextNode(String(markets)));
  }

  function setupEngineFilters() {
    const league = $("#leagueFilter");
    const market = $("#marketFilter");
    const strength = $("#strengthFilter");
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

    [league, market, strength].forEach((input) => input.addEventListener("change", render));
    search.addEventListener("input", render);
    $("#clearFilters")?.addEventListener("click", () => {
      league.value = "";
      market.value = "";
      strength.value = "";
      search.value = "";
      render();
    });
    render();
  }

  async function loadEnginePage() {
    const meta = ENGINE_META[engineKey] || ENGINE_META.primary;
    $("#portalTitle").textContent = meta.name;
    $("#portalDescription").textContent = meta.description;
    const dateInput = $("#dateFilter");
    dateInput.value = dateInput.value || localIsoDate();

    const load = async () => {
      setStatus(`Loading ${meta.name}…`);
      const payload = await fetchApi(
        `/api/engines/${engineKey}?date=${encodeURIComponent(dateInput.value)}`
      );
      engineItems = payload.items || [];
      renderEngineMetrics(engineItems);
      setupEngineFilters();
      setStatus(`${engineItems.length} ${meta.name} selections loaded`, `Date ${payload.date}`);
    };

    dateInput.addEventListener("change", load);
    $("#refreshButton")?.addEventListener("click", load);
    await load();
  }

  function bankerCard(item) {
    const pick = item.pick;
    return `
      <button class="pick-card banker-card" data-engine="${escapeHtml(item.engineKey)}" data-fixture="${escapeHtml(item.fixtureId)}">
        <div class="pick-meta">
          <span>${escapeHtml([item.league?.country, item.league?.name].filter(Boolean).join(" · ") || "Competition")}</span>
          <span>${escapeHtml(formatKickoff(item.kickoff))}</span>
        </div>
        <div class="pick-teams">
          <div class="pick-team">${logoMarkup(item.home)}<span>${escapeHtml(item.home?.name || "Home")}</span></div>
          <div class="pick-team">${logoMarkup(item.away)}<span>${escapeHtml(item.away?.name || "Away")}</span></div>
        </div>
        <span class="pick-badge">Banker score ${escapeHtml(String(item.bankerScore || "—"))}</span>
        <strong class="pick-selection">${escapeHtml(pick.selection)}</strong>
        <div class="pick-bottom"><span>${escapeHtml(pick.market)}</span><b>${escapeHtml(confidence(item.confidence))}</b></div>
      </button>`;
  }

  async function loadBankersPage() {
    const dateInput = $("#dateFilter");
    dateInput.value = dateInput.value || localIsoDate();

    const load = async () => {
      setStatus("Building today's banker slate…");
      const payload = await fetchApi(
        `/api/bankers/today?date=${encodeURIComponent(dateInput.value)}&limit=3`
      );

      $("#portalMetrics").innerHTML = `
        <div class="metric"><span>Predictions reviewed</span><strong>${payload.predictionsReviewed || 0}</strong></div>
        <div class="metric"><span>Bankers published</span><strong>${payload.totalSelections || 0}</strong></div>
        <div class="metric"><span>Minimum overall sample</span><strong>${payload.criteria?.minimumOverallMatches || 6}</strong></div>
        <div class="metric"><span>Minimum venue sample</span><strong>${payload.criteria?.minimumVenueMatches || 3}</strong></div>`;

      $("#portalContent").innerHTML = Object.entries(payload.engines || {}).map(([key, engine]) => `
        <section class="engine-block">
          <div class="engine-block-head">
            <h2>${escapeHtml(engine.engineName)}</h2>
            <span>${engine.picks?.length || 0} of 3 selected</span>
          </div>
          <div class="portal-grid">
            ${engine.picks?.length
              ? engine.picks.map(bankerCard).join("")
              : `<div class="empty-card">${escapeHtml(engine.status || "No banker qualified")}</div>`}
          </div>
        </section>`).join("");

      const bankerItems = Object.values(payload.engines || {}).flatMap((engine) => engine.picks || []);
      $$(".banker-card").forEach((card) => {
        card.addEventListener("click", () => {
          const item = bankerItems.find((row) =>
            String(row.fixtureId) === card.dataset.fixture &&
            row.engineKey === card.dataset.engine
          );
          if (item) openDialog(explanationDialog(item, item.pick));
        });
      });

      setStatus(`${payload.totalSelections || 0} strict bankers ready`, `Date ${payload.date}`);
    };

    dateInput.addEventListener("change", load);
    $("#refreshButton")?.addEventListener("click", load);
    await load();
  }

  function renderResults(data, selectedEngine = "") {
    const engines = data.engines || {};
    $("#portalMetrics").innerHTML = Object.values(engines).map((engine) => `
      <div class="metric">
        <span>${escapeHtml(engine.engineName)}</span>
        <strong>${engine.winRate === null ? "—" : `${engine.winRate}%`}</strong>
        <small>${engine.wins}W · ${engine.losses}L · ${engine.voids}V</small>
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
              <td>${escapeHtml(formatKickoff(row.kickoff))}</td>
              <td>${escapeHtml(row.engineName)}</td>
              <td>${escapeHtml(`${row.home?.name || "Home"} vs ${row.away?.name || "Away"}`)}</td>
              <td>${escapeHtml(row.market)}</td>
              <td>${escapeHtml(row.selection)}</td>
              <td>${escapeHtml(confidence(row.confidence))}</td>
              <td>${escapeHtml(row.fulltimeScore || "—")}</td>
              <td><span class="outcome ${escapeHtml(row.outcome)}">${escapeHtml(row.outcome)}</span></td>
            </tr>`).join("") || `<tr><td colspan="8">No graded engine results in this period.</td></tr>`}</tbody>
        </table>
      </div>`;

    $("#marketBreakdown").innerHTML = `
      <div class="results-table-wrap">
        <table class="portal-table">
          <thead><tr><th>Engine</th><th>Market</th><th>Selection</th><th>Graded</th><th>Win rate</th></tr></thead>
          <tbody>${(data.marketBreakdown || []).slice(0, 20).map((row) => `
            <tr>
              <td>${escapeHtml(row.engineName)}</td>
              <td>${escapeHtml(row.market)}</td>
              <td>${escapeHtml(row.selection)}</td>
              <td>${row.graded}</td>
              <td>${row.winRate === null ? "—" : `${row.winRate}%`}</td>
            </tr>`).join("") || `<tr><td colspan="5">No market performance data yet.</td></tr>`}</tbody>
        </table>
      </div>`;
  }

  async function loadResultsPage() {
    const days = $("#daysFilter");
    const engine = $("#engineResultFilter");

    const load = async () => {
      setStatus("Loading engine performance…");
      resultData = await fetchApi(`/api/results/intelligence?days=${encodeURIComponent(days.value)}`);
      renderResults(resultData, engine.value);
      setStatus("Engine results loaded", `${resultData.days} day window`);
    };

    days.addEventListener("change", load);
    engine.addEventListener("change", () => renderResults(resultData, engine.value));
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