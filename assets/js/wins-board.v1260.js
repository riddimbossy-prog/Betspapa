(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const API = window.BETSPAPA_API_URL || "https://api.betspapa.com";

  const AMP = String.fromCharCode(38);
  const escapeHtml = (value) => String(value ?? "")
    .replaceAll(AMP, AMP + "amp;")
    .replaceAll("<", AMP + "lt;")
    .replaceAll(">", AMP + "gt;")
    .replaceAll('"', AMP + "quot;");


  const leagueText = (league) => window.BetsPapaFlags?.leagueText(league) ||
    [league?.country, league?.name].filter(Boolean).join(" · ") ||
    "Competition";

  const utcIsoDate = () => new Date().toISOString().slice(0, 10);

  const formatKickoff = (value) => {
    if (!value) return "Time pending";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat(undefined, {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
    }).format(date);
  };

  function logoMarkup(team) {
    if (team?.logo_url) return `<img src="${escapeHtml(team.logo_url)}" alt="" loading="lazy">`;
    const initials = String(team?.name || "?")
      .split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
    return `<span class="team-fallback">${escapeHtml(initials)}</span>`;
  }

  function formPips(form) {
    const letters = String(form || "").toUpperCase().split("").filter(Boolean);
    if (!letters.length) return `<span>—</span>`;
    return letters.map((letter, index) =>
      `<span class="wins-pip wins-pip-${/[WDL]/.test(letter) ? letter : "D"}" style="animation-delay:${index * 60}ms">${escapeHtml(letter)}</span>`
    ).join("");
  }

  function setStatus(message, detail = "") {
    const status = $("#portalStatus");
    if (!status) return;
    status.innerHTML = `<span>${escapeHtml(message)}</span><small>${escapeHtml(detail)}</small>`;
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

  function rowMarkup(item, index) {
    const home = item.home?.name || "Home";
    const away = item.away?.name || "Away";
    const pick = String(item.selection || "").replace(/ Win$/i, "");
    return `<button type="button" class="wins-row" data-match="" data-fixture="${escapeHtml(item.fixtureId)}" style="animation-delay:${Math.min(index, 8) * 50}ms">
      <span class="wins-rail"></span>
      <span class="wins-crests">${logoMarkup(item.home)}${logoMarkup(item.away)}</span>
      <span class="wins-copy">
        <strong>${escapeHtml(home)} <span style="font-weight:500;opacity:.55">vs</span> ${escapeHtml(away)}</strong>
        <small>${escapeHtml(leagueText(item.league))}</small>
      </span>
      <span class="wins-meta">${escapeHtml(formatKickoff(item.kickoff))}<br>PPG ${escapeHtml(String(item.favoritePpg ?? "—"))} · GPG ${escapeHtml(String(item.favoriteGpg ?? "—"))}</span>
      <span class="wins-odds"><b>${escapeHtml(String(item.odds ?? "—"))}</b><small>${escapeHtml(pick)}</small></span>
      <span class="wins-chevron" aria-hidden="true">›</span>
    </button>`;
  }

  function dialogMarkup(item) {
    const rows = item.filters?.length ? item.filters : [
      { label: "Match Over 1.5", rule: "1.20 or shorter", value: item.over15Odds ?? "—", passed: true, required: true }
    ];
    const filters = rows.map((row) => `<div class="wins-filter-row">
      <div><div>${escapeHtml(row.label)}</div><small>${escapeHtml(String(row.rule))}</small></div>
      <div><b>${escapeHtml(String(row.value ?? "—"))}</b>
      <span class="wins-tag ${row.required ? "required" : row.passed ? "pass" : "skip"}">${row.required ? "Required" : row.passed ? "Pass" : "—"}</span></div>
    </div>`).join("");
    const reasons = (item.reasons || []).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("");
    return `<div class="wins-sheet">
      <p class="wins-kicker">${escapeHtml(leagueText(item.league))}</p>
      <h2>${escapeHtml(item.selection)}</h2>
      <p class="wins-kick">${escapeHtml(formatKickoff(item.kickoff))}</p>
      <div class="wins-matchup">
        <div>${logoMarkup(item.home)}<small>Home</small><strong>${escapeHtml(item.home?.name || "Home")}</strong></div>
        <span class="wins-vs">VS</span>
        <div>${logoMarkup(item.away)}<small>Away</small><strong>${escapeHtml(item.away?.name || "Away")}</strong></div>
      </div>
      <div class="wins-stats">
        <div class="wins-stat"><span>Win odds</span><strong>${escapeHtml(String(item.odds ?? "—"))}</strong></div>
        <div class="wins-stat"><span>Venue PPG</span><strong>${escapeHtml(String(item.favoritePpg ?? "—"))}</strong></div>
        <div class="wins-stat"><span>Venue GPG</span><strong>${escapeHtml(String(item.favoriteGpg ?? "—"))}</strong></div>
        <div class="wins-stat"><span>Rank</span><strong>${item.favoriteRank ? `P${escapeHtml(String(item.favoriteRank))}` : "—"}</strong></div>
      </div>
      <div class="wins-forms">
        <div class="wins-form"><span>Favourite form</span><div class="wins-pips">${formPips(item.favoriteForm)}</div></div>
        <div class="wins-form"><span>Opponent form</span><div class="wins-pips">${formPips(item.opponentForm)}</div></div>
      </div>
      <p class="wins-note">${escapeHtml(item.formBasis ? `Calculations: ${item.formBasis}` : "Venue-split home/away form")} · ${escapeHtml(String(item.extraPassed ?? 0))} extra filters passed</p>
      <div class="wins-filters">${filters}</div>
      ${reasons ? `<ul class="wins-reasons">${reasons}</ul>` : ""}
      ${item.sportyBetUrl ? `<a class="wins-sporty" href="${escapeHtml(item.sportyBetUrl)}" target="_blank" rel="noopener">Open on SportyBet</a>` : ""}
    </div>`;
  }

  async function fetchBoard(date) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(`${API}/api/wins-bankers/today?date=${encodeURIComponent(date)}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Could not load Wins Banker (${response.status})`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function render(payload) {
    const picks = payload.picks || [];
    const leagueMap = payload.leagueMap || [];
    const search = $("#winsSearchFilter");
    const date = $("#dateFilter");
    let league = "";

    $("#portalMetrics").innerHTML = [
      `<div class="diagnostic-card"><span>Picks</span><strong>${picks.length}</strong></div>`,
      `<div class="diagnostic-card"><span>Reviewed</span><strong>${payload.reviewedFixtures ?? "—"}</strong></div>`,
      `<div class="diagnostic-card"><span>Leagues</span><strong>${leagueMap.length || "—"}</strong></div>`,
      `<div class="diagnostic-card"><span>Rejected</span><strong>${payload.rejectedCount || 0}</strong></div>`
    ].join("");

    const map = $("#winsLeagueMap");
    const chips = [`<button type="button" class="goals-league-chip active" data-league=""><strong>All</strong><small>${picks.length}</small></button>`]
      .concat(leagueMap.map((row) => {
        const key = leagueText(row);
        return `<button type="button" class="goals-league-chip" data-league="${escapeHtml(key)}"><strong>${escapeHtml(row.name || key)}</strong><small>${row.picks}</small></button>`;
      }));
    if (map) map.innerHTML = chips.join("");

    const draw = () => {
      const query = (search?.value || "").trim().toLowerCase();
      const filtered = picks.filter((item) => {
        const key = leagueText(item.league);
        if (league && key !== league) return false;
        if (!query) return true;
        return [item.home?.name, item.away?.name, key, item.selection].join(" ").toLowerCase().includes(query);
      });
      map?.querySelectorAll("[data-league]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.league === league);
      });
      $("#portalContent").innerHTML = filtered.length
        ? `<div class="wins-list">${filtered.map(rowMarkup).join("")}</div>`
        : `<div class="empty-card">No favourite passed Over 1.5 at 1.20 or shorter plus an extra filter.</div>`;
      $("#portalContent").querySelectorAll(".wins-row").forEach((card) => {
        card.addEventListener("click", () => {
          const item = filtered.find((row) => String(row.fixtureId) === card.dataset.fixture);
          if (item) openDialog(dialogMarkup(item));
        });
      });
    };

    map?.querySelectorAll("[data-league]").forEach((btn) => {
      btn.addEventListener("click", () => {
        league = btn.dataset.league === league ? "" : btn.dataset.league;
        draw();
      });
    });
    if (search) search.oninput = draw;
    if (date) date.onchange = () => load(date.value);
    draw();
  }

  async function load(nextDate) {
    const dateInput = $("#dateFilter");
    const date = nextDate || dateInput.value || utcIsoDate();
    dateInput.value = date;
    setStatus("Scanning favourite wins…");
    try {
      const payload = await fetchBoard(date);
      if (payload.date && payload.date !== date) dateInput.value = payload.date;
      render(payload);
      setStatus(`${payload.pickCount || 0} wins bankers`, payload.engineVersion || "wins-banker-v1.2.0");
    } catch (error) {
      setStatus("Could not load Wins Banker", error.message);
      $("#portalContent").innerHTML = `<div class="empty-card">${escapeHtml(error.message)}</div>`;
    }
  }

  function setupChrome() {
    const menu = $("#portalMenu");
    const nav = $("#portalNav");
    menu?.addEventListener("click", (event) => {
      event.stopPropagation();
      nav?.classList.toggle("open");
      menu.setAttribute("aria-expanded", String(nav?.classList.contains("open")));
    });
    const dialog = $("#portalDialog");
    $("#portalDialogClose")?.addEventListener("click", closeDialog);
    dialog?.addEventListener("click", (event) => {
      if (event.target === dialog) closeDialog();
    });
    dialog?.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeDialog();
    });
    $("#refreshButton")?.addEventListener("click", () => load($("#dateFilter").value));
  }

  setupChrome();
  const dateInput = $("#dateFilter");
  if (dateInput) dateInput.value = utcIsoDate();
  load();
})();
