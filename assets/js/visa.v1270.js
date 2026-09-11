(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const API_BASES = [
    window.BETSPAPA_API_URL,
    "https://api.betspapa.com",
    "https://betspapa.onrender.com"
  ].filter((value, index, list) => value && list.indexOf(value) === index);
  const AMP = String.fromCharCode(38);
  const escapeHtml = (value) => String(value ?? "")
    .replaceAll(AMP, AMP + "amp;")
    .replaceAll("<", AMP + "lt;")
    .replaceAll(">", AMP + "gt;")
    .replaceAll('"', AMP + "quot;");
  const utcIsoDate = () => new Date().toISOString().slice(0, 10);
  const WEEK_LENGTH = 7;
  let currentWeek = null;
  let weekStartDate = utcIsoDate();
  let activeDate = weekStartDate;
  const leagueText = (league) => window.BetsPapaFlags?.leagueText(league) ||
    [league?.country, league?.name].filter(Boolean).join(" · ") || "Competition";

  function validIsoDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function addUtcDays(date, offset) {
    const value = new Date(`${date}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + offset);
    return value.toISOString().slice(0, 10);
  }

  function weekDates(startDate) {
    return Array.from({ length: WEEK_LENGTH }, (_, offset) => addUtcDays(startDate, offset));
  }

  function calendarLabel(date, options) {
    return new Intl.DateTimeFormat(undefined, { timeZone: "UTC", ...options })
      .format(new Date(`${date}T12:00:00.000Z`));
  }

  function longDateLabel(date) {
    return calendarLabel(date, { weekday: "long", day: "numeric", month: "long" });
  }

  function percent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return `${Math.round(number <= 1 ? number * 100 : number)}%`;
  }

  function decimal(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(2) : "—";
  }

  function standingLabel(side) {
    const standing = side?.splitStanding || {};
    const rank = Number(standing.rank);
    const tableSize = Number(standing.tableSize);
    return Number.isFinite(rank) && Number.isFinite(tableSize)
      ? `#${rank}/${tableSize}`
      : "Rank —";
  }

  function formatKickoff(value) {
    if (!value) return "Time pending";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
    }).format(date);
  }

  function logoMarkup(team) {
    if (team?.logo_url) return `<img src="${escapeHtml(team.logo_url)}" alt="" loading="lazy">`;
    const initials = String(team?.name || "?")
      .split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
    return `<span class="visa-team-fallback">${escapeHtml(initials)}</span>`;
  }

  function setStatus(message, detail = "") {
    const status = $("#portalStatus");
    if (status) status.innerHTML = `<span>${escapeHtml(message)}</span><small>${escapeHtml(detail)}</small>`;
  }

  function gradeClass(side) {
    const rate = Number(side?.lossRate || 0);
    if (rate >= 0.8) return "visa-grade-denied";
    if (rate >= 0.6) return "visa-grade-warning";
    if (rate < 0.4) return "visa-grade-clear";
    return "visa-grade-neutral";
  }

  function formMarkup(form) {
    const values = String(form || "").split("").filter((value) => /[WDL]/.test(value));
    return values.length
      ? `<span class="visa-form">${values.map((value) => `<i class="${value.toLowerCase()}">${value}</i>`).join("")}</span>`
      : `<span class="visa-form"><i>—</i></span>`;
  }

  function teamGradeMarkup(team, side, venue) {
    return `<div class="visa-team-grade ${gradeClass(side)}">
      <div class="visa-team-identity">${logoMarkup(team)}<span><small>${escapeHtml(venue)} split · ${escapeHtml(standingLabel(side))}</small><strong>${escapeHtml(team?.name || venue)}</strong></span></div>
      <div class="visa-grade-numbers">
        <span><small>GF avg</small><b>${escapeHtml(decimal(side?.gfAverage))}</b></span>
        <span><small>GA avg</small><b>${escapeHtml(decimal(side?.gaAverage))}</b></span>
        <span><small>Win</small><b>${percent(side?.winRate)}</b></span>
        <span><small>Loss</small><b>${percent(side?.lossRate)}</b></span>
      </div>
      <div class="visa-team-form"><b>${escapeHtml(`${side?.wins || 0}-${side?.draws || 0}-${side?.losses || 0} W-D-L`)}</b>${formMarkup(side?.form)}</div>
    </div>`;
  }

  function routeIcon(route) {
    if (route === "split-top-3-win") return "#3";
    if (route === "away-bottom-3-home-win") return "B3";
    if (route === "away-loss-home-win") return "L";
    if (route === "home-power-win") return "H";
    if (route === "high-goal-over-25") return "2.5";
    return "✓";
  }

  function cardMarkup(item, index) {
    const home = item.homeVisa || {};
    const away = item.awayVisa || {};
    return `<button type="button" class="visa-card${item.visaStatus === "SURE VISA" ? " visa-card-sure" : ""}" data-fixture="${escapeHtml(item.fixtureId ?? item.internalFixtureId)}" style="animation-delay:${Math.min(index, 8) * 55}ms">
      <div class="visa-card-head">
        <span class="visa-route-badge"><i>${escapeHtml(routeIcon(item.route))}</i>${escapeHtml(item.routeLabel || "APPROVED")}</span>
        <span class="visa-stamp">${escapeHtml(item.tier || "VISA APPROVED")}</span>
      </div>
      <div class="visa-card-meta"><span>${escapeHtml(leagueText(item.league))}</span><time>${escapeHtml(formatKickoff(item.kickoff))}</time></div>
      <div class="visa-grades">
        ${teamGradeMarkup(item.home, home, "Home")}
        ${teamGradeMarkup(item.away, away, "Away")}
      </div>
      <div class="visa-card-decision">
        <span><small>${escapeHtml(item.market || "Market")}</small><strong>${escapeHtml(item.selection || "—")}</strong></span>
        <b>${escapeHtml(item.odds ?? "—")}</b>
      </div>
      <p>${escapeHtml(item.publicExplanation || item.explanation || "Visa requirements cleared.")}</p>
      <span class="visa-open">View decision file <b>→</b></span>
    </button>`;
  }

  function statCell(label, value, detail = "") {
    return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</div>`;
  }

  function sideSheet(team, side, venue) {
    return `<section class="visa-sheet-side ${gradeClass(side)}">
      <div class="visa-sheet-team">${logoMarkup(team)}<span><small>${escapeHtml(venue)} · ${escapeHtml(standingLabel(side))} · last five</small><strong>${escapeHtml(team?.name || venue)}</strong></span></div>
      <div class="visa-sheet-grade"><b>${escapeHtml(side?.lossBand || "NO GRADE")}</b><span>${escapeHtml(side?.winBand || "")}</span></div>
      ${formMarkup(side?.form)}
      <div class="visa-sheet-stats">
        ${statCell("Split rank", standingLabel(side), `${side?.splitStanding?.played || 0} played`)}
        ${statCell("W-D-L", `${side?.wins || 0}-${side?.draws || 0}-${side?.losses || 0}`)}
        ${statCell("Win rate", percent(side?.winRate), `${side?.wins || 0}/5`)}
        ${statCell("Loss rate", percent(side?.lossRate), `${side?.losses || 0}/5`)}
        ${statCell("GF average", decimal(side?.gfAverage), `${side?.gf || 0} scored`)}
        ${statCell("GA average", decimal(side?.gaAverage), `${side?.ga || 0} conceded`)}
      </div>
    </section>`;
  }

  function dialogMarkup(item) {
    const home = item.homeVisa || {};
    const away = item.awayVisa || {};
    const gates = Array.isArray(item.filters) ? item.filters : [];
    return `<article class="visa-sheet${item.visaStatus === "SURE VISA" ? " visa-sheet-sure" : ""}">
      <header class="visa-sheet-head">
        <div><span>VISA DECISION FILE</span><h2>${escapeHtml(item.home?.name || "Home")} <i>vs</i> ${escapeHtml(item.away?.name || "Away")}</h2><p>${escapeHtml(leagueText(item.league))} · ${escapeHtml(formatKickoff(item.kickoff))}</p></div>
        <strong>${escapeHtml(item.tier || "APPROVED")}</strong>
      </header>
      <div class="visa-sheet-sides">
        ${sideSheet(item.home, home, "Home split")}
        ${sideSheet(item.away, away, "Away split")}
      </div>
      <section class="visa-sheet-verdict">
        <span>${escapeHtml(item.routeLabel || "VISA APPROVED")} · ${escapeHtml(item.market || "Market")}</span>
        <div><strong>${escapeHtml(item.selection || "—")}</strong><b>${escapeHtml(item.odds ?? "—")}</b></div>
        <p>${escapeHtml(item.publicExplanation || item.explanation || "")}</p>
        ${item.approvedTeam ? `<small>Approved: ${escapeHtml(item.approvedTeam)}${item.deniedTeam ? ` · Opponent: ${escapeHtml(item.deniedTeam)}` : ""}</small>` : ""}
      </section>
      <section class="visa-audit">
        <header><span>Required gates</span><b>${gates.filter((row) => row.passed).length}/${gates.length} passed</b></header>
        <div>${gates.map((row) => `<div class="${row.passed ? "pass" : "fail"}"><i>${row.passed ? "✓" : "×"}</i><span><strong>${escapeHtml(row.label || row.key)}</strong><small>${escapeHtml(row.rule || "")}</small></span><b>${escapeHtml(row.value ?? "—")}</b></div>`).join("")}</div>
      </section>
      <section class="visa-xg"><span>Venue average check</span><strong>GF ${escapeHtml(decimal(Math.max(Number(home.gfAverage || 0), Number(away.gfAverage || 0))))}</strong><small>Highest GA ${escapeHtml(decimal(Math.max(Number(home.gaAverage || 0), Number(away.gaAverage || 0))))} · exact last-five splits</small></section>
      ${item.sportyBetUrl ? `<a class="visa-sporty" href="${escapeHtml(item.sportyBetUrl)}" target="_blank" rel="noopener">Open exact event on SportyBet ↗</a>` : ""}
    </article>`;
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

  async function fetchWeek(startDate, force = false) {
    let lastError = null;
    for (const base of API_BASES) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60000);
      try {
        const response = await fetch(`${base}/api/visa/week?start=${encodeURIComponent(startDate)}&days=${WEEK_LENGTH}${force ? "&force=1" : ""}`, {
          headers: { Accept: "application/json" },
          cache: force ? "no-store" : "default",
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`Visa API returned ${response.status}`);
        return await response.json();
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError || new Error("Visa API is unavailable");
  }

  function render(payload) {
    const picks = Array.isArray(payload.picks) ? payload.picks : [];
    const routeSelect = $("#visaRouteFilter");
    const search = $("#visaSearchFilter");
    const routeMap = $("#visaRouteMap");
    let activeRoute = "";
    const boardTitle = $("#visaBoardTitle");
    if (boardTitle) {
      boardTitle.textContent = payload.date === utcIsoDate()
        ? "Today’s Visa decisions"
        : `${longDateLabel(payload.date)} decisions`;
    }

    $("#portalMetrics").innerHTML = [
      `<div class="diagnostic-card"><span>Approved</span><strong>${picks.length}</strong></div>`,
      `<div class="diagnostic-card"><span>Fixtures checked</span><strong>${payload.reviewedFixtures || 0}</strong></div>`,
      `<div class="diagnostic-card"><span>Split-ready</span><strong>${payload.historyQualifiedFixtures || 0}</strong></div>`,
      `<div class="diagnostic-card"><span>SportyBet matched</span><strong>${payload.oddsMatchedFixtures || 0}</strong></div>`
    ].join("");

    const routes = [...new Map(picks.map((item) => [item.route, item.routeLabel || item.route])).entries()];
    if (routeSelect) {
      routeSelect.innerHTML = `<option value="">All approved routes</option>${routes.map(([key, label]) => `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`).join("")}`;
    }
    if (routeMap) {
      routeMap.innerHTML = routes.length
        ? [`<button class="active" type="button" data-route="">All <b>${picks.length}</b></button>`]
          .concat(routes.map(([key, label]) => `<button type="button" data-route="${escapeHtml(key)}">${escapeHtml(label)} <b>${picks.filter((item) => item.route === key).length}</b></button>`)).join("")
        : "";
    }

    const draw = () => {
      const query = String(search?.value || "").trim().toLowerCase();
      const selectedRoute = routeSelect?.value || activeRoute;
      const filtered = picks.filter((item) => {
        if (selectedRoute && item.route !== selectedRoute) return false;
        return !query || [item.home?.name, item.away?.name, leagueText(item.league), item.selection, item.routeLabel, item.tier]
          .join(" ").toLowerCase().includes(query);
      });
      routeMap?.querySelectorAll("[data-route]").forEach((button) => {
        button.classList.toggle("active", button.dataset.route === selectedRoute);
      });
      const content = $("#portalContent");
      content.innerHTML = filtered.length
        ? `<div class="visa-grid">${filtered.map(cardMarkup).join("")}</div>`
        : `<div class="empty-card visa-empty"><strong>NO VISA</strong><span>No fixture clears every selected Visa gate.</span><small>The engine refuses unclear comparisons instead of forcing a pick.</small></div>`;
      content.querySelectorAll(".visa-card").forEach((card) => {
        card.addEventListener("click", () => {
          const item = filtered.find((row) => String(row.fixtureId ?? row.internalFixtureId) === card.dataset.fixture);
          if (item) openDialog(item);
        });
      });
    };

    routeMap?.querySelectorAll("[data-route]").forEach((button) => {
      button.addEventListener("click", () => {
        activeRoute = button.dataset.route === activeRoute ? "" : button.dataset.route;
        if (routeSelect) routeSelect.value = activeRoute;
        draw();
      });
    });
    if (routeSelect) routeSelect.onchange = () => {
      activeRoute = routeSelect.value;
      draw();
    };
    if (search) search.oninput = draw;
    draw();
  }

  function renderDateTabs(days, stateLabel = "") {
    const tabs = $("#visaDateTabs");
    if (!tabs) return;
    tabs.innerHTML = days.map((day) => {
      const date = day.date;
      const selected = date === activeDate;
      const dayName = date === utcIsoDate()
        ? "Today"
        : calendarLabel(date, { weekday: "short" });
      const dateName = calendarLabel(date, { day: "numeric", month: "short" });
      const pickCount = Number(day.pickCount || 0);
      const gameCount = Number(day.reviewedFixtures || 0);
      const status = stateLabel || `${pickCount} pick${pickCount === 1 ? "" : "s"} · ${gameCount} games`;
      return `<button aria-controls="portalContent" aria-selected="${selected}" class="visa-date-tab${selected ? " active" : ""}" data-date="${escapeHtml(date)}" id="visa-tab-${escapeHtml(date)}" role="tab" tabindex="${selected ? "0" : "-1"}" type="button">
        <span>${escapeHtml(dayName)}</span><strong>${escapeHtml(dateName)}</strong><small>${escapeHtml(status)}</small>
      </button>`;
    }).join("");

    const buttons = [...tabs.querySelectorAll("[data-date]")];
    buttons.forEach((button, index) => {
      button.addEventListener("click", () => selectDate(button.dataset.date));
      button.addEventListener("keydown", (event) => {
        let targetIndex = null;
        if (event.key === "ArrowRight") targetIndex = (index + 1) % buttons.length;
        if (event.key === "ArrowLeft") targetIndex = (index - 1 + buttons.length) % buttons.length;
        if (event.key === "Home") targetIndex = 0;
        if (event.key === "End") targetIndex = buttons.length - 1;
        if (targetIndex == null) return;
        event.preventDefault();
        selectDate(buttons[targetIndex].dataset.date, true);
      });
    });
  }

  function selectDate(date, focusTab = false) {
    const slate = currentWeek?.days?.find((day) => day.date === date);
    if (!slate) return;
    activeDate = date;
    renderDateTabs(currentWeek.days);
    $("#portalContent")?.setAttribute("aria-labelledby", `visa-tab-${date}`);
    render(slate);
    setStatus(
      `${slate.pickCount || 0} Visa approval${Number(slate.pickCount) === 1 ? "" : "s"} for ${longDateLabel(date)}`,
      `${slate.reviewedFixtures || 0} fixtures · ${slate.historyQualifiedFixtures || 0} split-ready · ${slate.oddsMatchedFixtures || 0} SportyBet matches`
    );
    const url = new URL(window.location.href);
    url.searchParams.set("start", currentWeek.startDate);
    url.searchParams.set("date", date);
    window.history.replaceState({}, "", url);
    if (focusTab) $(`#visa-tab-${date}`)?.focus();
  }

  async function load(force = false) {
    const startInput = $("#dateFilter");
    const startDate = validIsoDate(startInput?.value) ? startInput.value : weekStartDate;
    weekStartDate = startDate;
    currentWeek = null;
    if (startInput) startInput.value = startDate;
    const pendingDays = weekDates(startDate).map((date) => ({ date }));
    if (!pendingDays.some((day) => day.date === activeDate)) activeDate = startDate;
    renderDateTabs(pendingDays, "Running…");
    setStatus("Running every Visa fixture across seven dates…", "One weekly scan · split ranks, venue form and exact SportyBet prices");
    try {
      const payload = await fetchWeek(startDate, force);
      const days = Array.isArray(payload.days) ? payload.days : [];
      if (days.length !== WEEK_LENGTH) throw new Error("Visa did not return all seven dates");
      currentWeek = { ...payload, days };
      if (!days.some((day) => day.date === activeDate)) activeDate = days[0].date;
      const totals = payload.totals || {};
      const summary = $("#visaWeekSummary");
      if (summary) {
        summary.textContent = `${totals.pickCount || 0} approvals · ${totals.reviewedFixtures || 0} fixtures checked · ${calendarLabel(payload.startDate, { day: "numeric", month: "short" })}–${calendarLabel(payload.endDate, { day: "numeric", month: "short", year: "numeric" })}`;
      }
      selectDate(activeDate);
    } catch (error) {
      setStatus("Could not load Visa", error?.message || String(error));
      renderDateTabs(pendingDays, "Unavailable");
      const summary = $("#visaWeekSummary");
      if (summary) summary.textContent = "Weekly run unavailable";
      $("#portalMetrics").innerHTML = "";
      $("#portalContent").innerHTML = `<div class="empty-card visa-empty"><strong>CONNECTION HELD</strong><span>${escapeHtml(error?.message || error)}</span></div>`;
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
  const query = new URLSearchParams(window.location.search);
  const requestedStart = query.get("start");
  const requestedDate = query.get("date");
  weekStartDate = validIsoDate(requestedStart) ? requestedStart : utcIsoDate();
  activeDate = validIsoDate(requestedDate) ? requestedDate : weekStartDate;
  const startInput = $("#dateFilter");
  if (startInput) {
    startInput.value = weekStartDate;
    startInput.addEventListener("change", () => {
      if (!validIsoDate(startInput.value)) return;
      weekStartDate = startInput.value;
      activeDate = weekStartDate;
      load();
    });
  }
  load();
})();
