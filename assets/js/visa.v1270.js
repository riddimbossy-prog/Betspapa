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
  const leagueText = (league) => window.BetsPapaFlags?.leagueText(league) ||
    [league?.country, league?.name].filter(Boolean).join(" · ") || "Competition";

  function percent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return `${Math.round(number <= 1 ? number * 100 : number)}%`;
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
      <div class="visa-team-identity">${logoMarkup(team)}<span><small>${escapeHtml(venue)} split</small><strong>${escapeHtml(team?.name || venue)}</strong></span></div>
      <div class="visa-grade-numbers">
        <span><small>Loss</small><b>${percent(side?.lossRate)}</b></span>
        <span><small>Win</small><b>${percent(side?.winRate)}</b></span>
        <span><small>W-D-L</small><b>${escapeHtml(`${side?.wins || 0}-${side?.draws || 0}-${side?.losses || 0}`)}</b></span>
      </div>
      <div class="visa-team-form"><b>${escapeHtml(side?.lossBand || "UNAVAILABLE")}</b>${formMarkup(side?.form)}</div>
    </div>`;
  }

  function routeIcon(route) {
    if (route === "loss-denial") return "✕";
    if (route === "protected-loss-denial") return "◇";
    if (route === "dual-win-gg") return "⇄";
    if (route === "dual-loss-goals") return "2+";
    return "✓";
  }

  function cardMarkup(item, index) {
    const home = item.homeVisa || {};
    const away = item.awayVisa || {};
    return `<button type="button" class="visa-card" data-fixture="${escapeHtml(item.fixtureId ?? item.internalFixtureId)}" style="animation-delay:${Math.min(index, 8) * 55}ms">
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
      <div class="visa-sheet-team">${logoMarkup(team)}<span><small>${escapeHtml(venue)} · last five</small><strong>${escapeHtml(team?.name || venue)}</strong></span></div>
      <div class="visa-sheet-grade"><b>${escapeHtml(side?.lossBand || "NO GRADE")}</b><span>${escapeHtml(side?.winBand || "")}</span></div>
      ${formMarkup(side?.form)}
      <div class="visa-sheet-stats">
        ${statCell("W-D-L", `${side?.wins || 0}-${side?.draws || 0}-${side?.losses || 0}`)}
        ${statCell("Goals", `${side?.gf || 0}-${side?.ga || 0}`, side?.scoreline || "")}
        ${statCell("O1.5", percent(side?.over15Rate), `${side?.over15 || 0}/5`)}
        ${statCell("GG", percent(side?.bttsRate), `${side?.btts || 0}/5`)}
        ${statCell("Scored", percent(side?.scoredRate), `${side?.scoredIn || 0}/5`)}
        ${statCell("Conceded", percent(side?.concededRate), `${side?.concededIn || 0}/5`)}
      </div>
    </section>`;
  }

  function dialogMarkup(item) {
    const home = item.homeVisa || {};
    const away = item.awayVisa || {};
    const gates = Array.isArray(item.filters) ? item.filters : [];
    return `<article class="visa-sheet">
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
        ${item.approvedTeam ? `<small>Approved: ${escapeHtml(item.approvedTeam)}${item.deniedTeam ? ` · Denied: ${escapeHtml(item.deniedTeam)}` : ""}</small>` : ""}
      </section>
      <section class="visa-audit">
        <header><span>Required gates</span><b>${gates.filter((row) => row.passed).length}/${gates.length} passed</b></header>
        <div>${gates.map((row) => `<div class="${row.passed ? "pass" : "fail"}"><i>${row.passed ? "✓" : "×"}</i><span><strong>${escapeHtml(row.label || row.key)}</strong><small>${escapeHtml(row.rule || "")}</small></span><b>${escapeHtml(row.value ?? "—")}</b></div>`).join("")}</div>
      </section>
      <section class="visa-xg"><span>Goal cross-check</span><strong>${escapeHtml(Number(item.expectedGoals?.total || 0).toFixed(2))}</strong><small>Home ${escapeHtml(Number(item.expectedGoals?.home || 0).toFixed(2))} · Away ${escapeHtml(Number(item.expectedGoals?.away || 0).toFixed(2))}</small></section>
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

  async function fetchBoard(date, force = false) {
    let lastError = null;
    for (const base of API_BASES) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      try {
        const response = await fetch(`${base}/api/visa/today?date=${encodeURIComponent(date)}${force ? "&force=1" : ""}`, {
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
        return !query || [item.home?.name, item.away?.name, leagueText(item.league), item.selection, item.routeLabel]
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

  async function load(force = false) {
    const dateInput = $("#dateFilter");
    const date = dateInput?.value || utcIsoDate();
    if (dateInput) dateInput.value = date;
    setStatus("Checking strict home and away split applications…", "Five completed venue matches are mandatory");
    try {
      const payload = await fetchBoard(date, force);
      render(payload);
      setStatus(
        `${payload.pickCount || 0} Visa approval${Number(payload.pickCount) === 1 ? "" : "s"}`,
        `${payload.reviewedFixtures || 0} fixtures · ${payload.historyQualifiedFixtures || 0} split-ready · ${payload.oddsMatchedFixtures || 0} SportyBet matches`
      );
    } catch (error) {
      setStatus("Could not load Visa", error?.message || String(error));
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
  const dateInput = $("#dateFilter");
  if (dateInput) {
    dateInput.value = utcIsoDate();
    dateInput.addEventListener("change", () => load());
  }
  load();
})();
