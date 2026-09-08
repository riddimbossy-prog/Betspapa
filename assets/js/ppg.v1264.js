(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const API = window.BETSPAPA_API_URL || "https://api.betspapa.com";
  const AMP = String.fromCharCode(38);
  const escapeHtml = (value) => String(value ?? "")
    .replaceAll(AMP, AMP + "amp;")
    .replaceAll("<", AMP + "lt;")
    .replaceAll(">", AMP + "gt;")
    .replaceAll('"', AMP + "quot;");
  const utcIsoDate = () => new Date().toISOString().slice(0, 10);
  const leagueText = (league) => window.BetsPapaFlags?.leagueText(league) ||
    [league?.country, league?.name].filter(Boolean).join(" · ") || "Competition";

  function formatKickoff(value) {
    if (!value) return "Time pending";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat(undefined, {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
    }).format(date);
  }

  function logoMarkup(team) {
    if (team?.logo_url) return `<img src="${escapeHtml(team.logo_url)}" alt="" loading="lazy">`;
    const initials = String(team?.name || "?")
      .split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
    return `<span class="team-fallback">${escapeHtml(initials)}</span>`;
  }

  function setStatus(message, detail = "") {
    const status = $("#portalStatus");
    if (status) status.innerHTML = `<span>${escapeHtml(message)}</span><small>${escapeHtml(detail)}</small>`;
  }

  function splitMarkup(label, team, standing) {
    const rank = standing?.rank || "—";
    const size = standing?.tableSize || "—";
    const ppg = Number.isFinite(Number(standing?.ppg)) ? Number(standing.ppg).toFixed(2) : "—";
    const zone = standing?.zone === "top-3" ? "Top 3" : standing?.zone === "bottom-3" ? "Bottom 3" : "Unqualified";
    return `<div class="ppg-split ${standing?.zone || "unqualified"}">
      <span>${escapeHtml(label)} split</span>
      <strong>${escapeHtml(team?.name || label)}</strong>
      <div><b>#${escapeHtml(rank)}/${escapeHtml(size)}</b><b>${escapeHtml(ppg)} PPG</b></div>
      <small>${escapeHtml(zone)} · ${escapeHtml(standing?.played || 0)} played</small>
    </div>`;
  }

  function rowMarkup(item, index) {
    return `<button type="button" class="ppg-row" data-fixture="${escapeHtml(item.fixtureId)}" style="animation-delay:${Math.min(index, 8) * 50}ms">
      <span class="ppg-route">${escapeHtml(item.route === "top-3-v-bottom-3" ? "WIN" : item.route === "bottom-3-pair" ? "U2.5" : "O1.5")}</span>
      <span class="ppg-crests">${logoMarkup(item.home)}${logoMarkup(item.away)}</span>
      <span class="ppg-copy"><strong>${escapeHtml(item.home?.name || "Home")} <i>vs</i> ${escapeHtml(item.away?.name || "Away")}</strong><small>${escapeHtml(leagueText(item.league))} · ${escapeHtml(formatKickoff(item.kickoff))}</small></span>
      <span class="ppg-pick"><small>${escapeHtml(item.selection)}</small><b>${escapeHtml(item.odds ?? "—")}</b></span>
      <span class="ppg-chevron" aria-hidden="true">›</span>
    </button>`;
  }

  function dialogMarkup(item) {
    const split = item.splitTable || {};
    return `<div class="ppg-sheet">
      <p class="ppg-kicker">PPG · ${escapeHtml(leagueText(item.league))}</p>
      <h2>${escapeHtml(item.selection)}</h2>
      <p>${escapeHtml(formatKickoff(item.kickoff))}</p>
      <div class="ppg-matchup">
        <div>${logoMarkup(item.home)}<strong>${escapeHtml(item.home?.name || "Home")}</strong></div>
        <span>VS</span>
        <div>${logoMarkup(item.away)}<strong>${escapeHtml(item.away?.name || "Away")}</strong></div>
      </div>
      <div class="ppg-split-grid">
        ${splitMarkup("Home", item.home, split.home)}
        ${splitMarkup("Away", item.away, split.away)}
      </div>
      <div class="ppg-decision"><span>${escapeHtml(item.market || "Market")}</span><strong>${escapeHtml(item.selection || "—")} @ ${escapeHtml(item.odds ?? "—")}</strong><p>${escapeHtml(item.explanation || "")}</p></div>
      ${item.sportyBetUrl ? `<a class="ppg-sporty" href="${escapeHtml(item.sportyBetUrl)}" target="_blank" rel="noopener">Open on SportyBet</a>` : ""}
    </div>`;
  }

  function closeDialog() {
    const dialog = $("#portalDialog");
    document.body.classList.remove("portal-dialog-open");
    if (dialog?.open) dialog.close();
  }

  function openDialog(item) {
    const dialog = $("#portalDialog");
    const content = $("#portalDialogContent");
    if (!dialog || !content) return;
    content.innerHTML = dialogMarkup(item);
    document.body.classList.add("portal-dialog-open");
    if (!dialog.open) dialog.showModal();
  }

  async function fetchBoard(date, force = false) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(`${API}/api/ppg/today?date=${encodeURIComponent(date)}${force ? "&force=1" : ""}`, {
        headers: { Accept: "application/json" },
        cache: force ? "no-store" : "default",
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Could not load PPG (${response.status})`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function render(payload) {
    const picks = payload.picks || [];
    const market = $("#ppgMarketFilter");
    const search = $("#ppgSearchFilter");
    const leagueMap = $("#ppgLeagueMap");
    let league = "";

    $("#portalMetrics").innerHTML = [
      `<div class="diagnostic-card"><span>PPG picks</span><strong>${picks.length}</strong></div>`,
      `<div class="diagnostic-card"><span>Fixtures read</span><strong>${payload.reviewedFixtures || 0}</strong></div>`,
      `<div class="diagnostic-card"><span>SportyBet matched</span><strong>${payload.oddsMatchedFixtures || 0}</strong></div>`,
      `<div class="diagnostic-card"><span>Rejected</span><strong>${payload.rejectedCount || 0}</strong></div>`
    ].join("");

    const markets = [...new Set(picks.map((item) => item.selection).filter(Boolean))];
    if (market) market.innerHTML = `<option value="">All PPG markets</option>${markets.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}`;

    const leagues = [...new Map(picks.map((item) => [leagueText(item.league), item.league])).entries()];
    if (leagueMap) {
      leagueMap.innerHTML = leagues.length
        ? [`<button type="button" class="active" data-league="">All <b>${picks.length}</b></button>`]
          .concat(leagues.map(([name]) => `<button type="button" data-league="${escapeHtml(name)}">${escapeHtml(name)} <b>${picks.filter((item) => leagueText(item.league) === name).length}</b></button>`)).join("")
        : "";
    }

    const draw = () => {
      const query = (search?.value || "").trim().toLowerCase();
      const marketValue = market?.value || "";
      const filtered = picks.filter((item) => {
        if (league && leagueText(item.league) !== league) return false;
        if (marketValue && item.selection !== marketValue) return false;
        return !query || [item.home?.name, item.away?.name, leagueText(item.league), item.selection]
          .join(" ").toLowerCase().includes(query);
      });
      leagueMap?.querySelectorAll("[data-league]").forEach((button) => {
        button.classList.toggle("active", button.dataset.league === league);
      });
      const content = $("#portalContent");
      content.innerHTML = filtered.length
        ? `<div class="ppg-list">${filtered.map(rowMarkup).join("")}</div>`
        : `<div class="empty-card">No match clears every PPG split-table and SportyBet gate for this board.</div>`;
      content.querySelectorAll(".ppg-row").forEach((button) => {
        button.addEventListener("click", () => {
          const item = filtered.find((row) => String(row.fixtureId) === button.dataset.fixture);
          if (item) openDialog(item);
        });
      });
    };

    leagueMap?.querySelectorAll("[data-league]").forEach((button) => {
      button.addEventListener("click", () => {
        league = button.dataset.league === league ? "" : button.dataset.league;
        draw();
      });
    });
    if (market) market.onchange = draw;
    if (search) search.oninput = draw;
    draw();
  }

  async function load(force = false) {
    const dateInput = $("#dateFilter");
    const date = dateInput.value || utcIsoDate();
    dateInput.value = date;
    setStatus("Scanning split home and away tables…");
    try {
      const payload = await fetchBoard(date, force);
      if (payload.date && payload.date !== date) dateInput.value = payload.date;
      render(payload);
      setStatus(
        `${payload.pickCount || 0} PPG pick${Number(payload.pickCount) === 1 ? "" : "s"}`,
        `${payload.reviewedFixtures || 0} fixtures · ${payload.oddsMatchedFixtures || 0} SportyBet matches${payload.rolledForward ? " · next UTC date" : ""}`
      );
    } catch (error) {
      setStatus("Could not load PPG", error.message);
      $("#portalContent").innerHTML = `<div class="empty-card">${escapeHtml(error.message)}</div>`;
    }
  }

  const menu = $("#portalMenu");
  const nav = $("#portalNav");
  menu?.addEventListener("click", (event) => {
    event.stopPropagation();
    nav?.classList.toggle("open");
    menu.setAttribute("aria-expanded", String(nav?.classList.contains("open")));
  });
  $("#portalDialogClose")?.addEventListener("click", closeDialog);
  $("#portalDialog")?.addEventListener("click", (event) => {
    if (event.target === $("#portalDialog")) closeDialog();
  });
  $("#portalDialog")?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDialog();
  });
  $("#refreshButton")?.addEventListener("click", () => load(true));
  const dateInput = $("#dateFilter");
  if (dateInput) {
    dateInput.value = utcIsoDate();
    dateInput.addEventListener("change", () => load());
  }
  load();
})();
