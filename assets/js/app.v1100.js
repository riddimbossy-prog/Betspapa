(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const TRANSITIONS = ["1/1", "1/2", "1/X", "2/1", "2/2", "2/X", "X/1", "X/2", "X/X"];
  const FIXTURES_PER_PAGE = 12;
  const filterState = {
    date: "",
    league: "",
    market: "",
    strength: "",
    engine: "primary",
    query: "",
    page: 1
  };

  const API_BASES = [
    window.BETSPAPA_API_URL,
    "https://api.betspapa.com",
    "https://betspapa.onrender.com"
  ].filter((value, index, list) => value && list.indexOf(value) === index);

  let fixtures = [];
  let recentResults = [];
  let selectedId = null;
  let activeApiBase = null;
  let lastLoadedAt = 0;
  let processingState = { state: "idle", totalFixtures: 0, readyPredictions: 0, pending: 0, withheld: 0 };
  let processingPollTimer = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function cleanExplanationText(value) {
    return String(value ?? "")
      .replace(/\b\d+\.\d{4,}\b/g, (match) => {
        const number = Number(match);
        if (!Number.isFinite(number)) return match;
        const nearestWhole = Math.round(number);
        if (Math.abs(number - nearestWhole) < 0.15) return String(nearestWhole);
        return number.toFixed(1).replace(/\.0$/, "");
      })
      .replace(/had an unclear half-time state and finished without a clear result/gi,
        "followed the listed HT/FT pattern")
      .replace(/\s+/g, " ")
      .trim();
  }

  function explanationHtml(value) {
    return escapeHtml(cleanExplanationText(value));
  }

  function evidenceCard(label, value, detail = "") {
    if (!value) return "";
    return `
      <div class="plain-evidence-card">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        ${detail ? `<small>${escapeHtml(detail)}</small>` : ""}
      </div>`;
  }

  const MARKET_FILTER_OPTIONS = [
    {
      label: "Result markets",
      options: [
        ["family:result", "Any result market"],
        ["market:Full-Time Result", "Full-Time Result"],
        ["key:home-win", "Home Win"],
        ["key:away-win", "Away Win"],
        ["market:Draw No Bet", "Draw No Bet"],
        ["key:home-dnb", "Home DNB"],
        ["key:away-dnb", "Away DNB"],
        ["market:Double Chance", "Any Double Chance"],
        ["key:home-1x", "Double Chance 1X"],
        ["key:away-x2", "Double Chance X2"],
        ["key:no-draw", "Either Team to Win 12"]
      ]
    },
    {
      label: "Goal markets",
      options: [
        ["family:goals", "Any goal market"],
        ["market:Total Goals", "Any Total Goals"],
        ["key:over-15", "Over 1.5"],
        ["key:over-25", "Over 2.5"],
        ["key:under-35", "Under 3.5"],
        ["market:Team Goals", "Any Team Goals"],
        ["key:home-over-05", "Home Team Over 0.5"],
        ["key:away-over-05", "Away Team Over 0.5"],
        ["key:favourite-over-15", "Favourite Team Over 1.5"],
        ["market:Both Teams to Score", "Both Teams to Score"],
        ["key:gg-yes", "GG — Yes"],
        ["key:gg-no", "GG — No"]
      ]
    },
    {
      label: "First-half and HT/FT",
      options: [
        ["family:first-half", "Any First-Half Market"],
        ["market:Half-Time Result", "Half-Time Result"],
        ["key:ht-home", "Home at Half-Time"],
        ["key:ht-draw", "Draw at Half-Time"],
        ["key:ht-away", "Away at Half-Time"],
        ["market:Half-Time Double Chance", "Half-Time Double Chance"],
        ["key:ht-home-or-draw", "Half-Time 1X"],
        ["key:ht-away-or-draw", "Half-Time X2"],
        ["market:HT/FT", "Exact HT/FT"]
      ]
    }
  ];

  function marketFilterMatches(pick, filterValue) {
    if (!filterValue) return true;
    if (!pick) return false;

    const key = String(pick.key || "");
    const market = String(pick.market || "");

    if (filterValue.startsWith("key:")) {
      return key === filterValue.slice(4);
    }
    if (filterValue.startsWith("market:")) {
      return market === filterValue.slice(7);
    }
    if (filterValue === "family:result") {
      return ["Full-Time Result", "Draw No Bet", "Double Chance"].includes(market);
    }
    if (filterValue === "family:goals") {
      return ["Total Goals", "Team Goals", "Both Teams to Score"].includes(market);
    }
    if (filterValue === "family:first-half") {
      return ["Half-Time Result", "Half-Time Double Chance", "HT/FT"].includes(market);
    }
    return market === filterValue;
  }

  function shortName(name) {
    return String(name || "")
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word[0])
      .join("")
      .slice(0, 4)
      .toUpperCase() || "—";
  }

  function localIsoDate() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function formatKickoff(value) {
    if (!value) return "TBA";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(date);
  }

  function percent(value, digits = 0) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return `${number.toFixed(digits)}%`;
  }

  function scorePercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "0%";
    return `${Math.round(number * 100)}%`;
  }

  function tier(score) {
    if (score >= 0.85) return "Elite";
    if (score >= 0.8) return "Strong";
    if (score >= 0.74) return "Qualified";
    if (score >= 0.68) return "Lean";
    return "Rejected";
  }

  async function fetchFromApi(path) {
    let lastError = null;

    for (const base of API_BASES) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 35000);

      try {
        const separator = path.includes("?") ? "&" : "?";
        const response = await fetch(`${base}${path}${separator}_=${Date.now()}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        activeApiBase = base;
        return data;
      } catch (error) {
        lastError = error;
      } finally {
        window.clearTimeout(timeout);
      }
    }

    throw lastError || new Error("No BetsPapa API endpoint was reachable");
  }

  function setLiveState(state, title, detail = "") {
    const strip = $("#liveDataStrip");
    const status = $("#liveStatus");
    const updated = $("#liveUpdated");

    strip?.setAttribute("data-state", state);
    if (status) status.textContent = title;
    if (updated) updated.textContent = detail;
  }

  function predictionMapByFixture(predictions) {
    return new Map((predictions || []).map((prediction) => [
      String(prediction.fixtureId),
      prediction
    ]));
  }

  function modelFromFixture(fixture, prediction = null) {
    const home = fixture.home || prediction?.home || {};
    const away = fixture.away || prediction?.away || {};
    const league = fixture.league || prediction?.league || {};
    const externalId = fixture.fixtureId ?? prediction?.fixtureId ?? fixture.id ?? prediction?.id;

    return {
      id: `live-${externalId}`,
      externalId: String(externalId),
      league: [league.country, league.name].filter(Boolean).join(" · ") || "Competition",
      kickoff: formatKickoff(fixture.kickoff || prediction?.kickoff),
      rawKickoff: fixture.kickoff || prediction?.kickoff,
      status: fixture.status || prediction?.status || "NS",
      venue: fixture.venue || prediction?.venue || "",
      sample: Number(
        prediction?.engine?.dataQuality?.homeSamples?.overall ||
        prediction?.engine?.dataQuality?.awaySamples?.overall ||
        0
      ),
      home: {
        name: home.name || "Home",
        short: shortName(home.name),
        logo: home.logo_url || home.logo || ""
      },
      away: {
        name: away.name || "Away",
        short: shortName(away.name),
        logo: away.logo_url || away.logo || ""
      },
      livePrediction: prediction,
      enginePicks: prediction?.engines || {
        primary: prediction?.primary
          ? {
              engineKey: "primary",
              engineName: "Papa's Pick",
              market: prediction.primary.market,
              selection: prediction.primary.selection,
              confidence: prediction.primary.confidence,
              qualified: prediction.primary.qualified,
              mode: prediction.primary.mode,
              tier: prediction.primary.tier,
              reasons: prediction.reasons || [],
              cautions: prediction.warnings || []
            }
          : null
      },
      predictionMode: prediction?.primary?.mode || "directional",
      predictionQualified: Boolean(prediction?.primary?.qualified),
      profileAudit: prediction?.profileAudit || prediction?.engine?.profileAudit || null,
      analysisFingerprint:
        prediction?.analysisFingerprint ||
        prediction?.engine?.analysisFingerprint ||
        null,
      generationIssue: null
    };
  }

  function normalizeDashboard(payload) {
    const predictions = Array.isArray(payload.predictions) ? payload.predictions : [];
    const detailedFixtures = Array.isArray(payload.fixtures) ? payload.fixtures : [];
    const byFixture = predictionMapByFixture(predictions);
    const readyModels = detailedFixtures
      .map((fixture) => {
        const prediction = byFixture.get(String(fixture.fixtureId));
        return prediction ? modelFromFixture(fixture, prediction) : null;
      })
      .filter(Boolean);
    const represented = new Set(readyModels.map((fixture) => fixture.externalId));
    for (const prediction of predictions) {
      if (!represented.has(String(prediction.fixtureId))) {
        readyModels.push(modelFromFixture({}, prediction));
      }
    }
    readyModels.sort((x, y) => new Date(x.rawKickoff || 0) - new Date(y.rawKickoff || 0));
    return readyModels;
  }

  function emptyAnalysis() {
    return {
      primary: { label: "Best available direction" },
      confidence: 0,
      reason: "Papa has not qualified a market for this fixture yet.",
      matrix: TRANSITIONS.map((code) => ({ code, probability: 0 })),
      topTransition: { code: "—" },
      derived: {
        ggScore: 0,
        over15Score: 0,
        over25Score: 0,
        under35Score: 0,
        fullReversal: 0
      }
    };
  }

  const ENGINE_META = {
    primary: {
      name: "Papa's Pick",
      label: "★ PAPA'S PICK",
      marketLabel: "PAPA'S PICK",
      explanation: "Why Papa Chose This Pick"
    },
    aggressive: {
      name: "Aggressive",
      label: "⚡ AGGRESSIVE",
      marketLabel: "AGGRESSIVE MARKET",
      explanation: "Why the Aggressive Engine Chose This Pick"
    },
    safer: {
      name: "Safer",
      label: "🛡 SAFER",
      marketLabel: "SAFER MARKET",
      explanation: "Why the Safer Engine Chose This Pick"
    },
    venue: {
      name: "Venue Pattern",
      label: "⌂ VENUE PATTERN",
      marketLabel: "VENUE PATTERN MARKET",
      explanation: "Why the Venue Pattern Engine Chose This Pick"
    }
  };

  function enginePickForFixture(fixture, engineKey = filterState.engine) {
    const picks = fixture?.enginePicks || fixture?.livePrediction?.engines || {};
    return picks?.[engineKey] || picks?.primary || null;
  }

  function engineMeta(engineKey = filterState.engine) {
    return ENGINE_META[engineKey] || ENGINE_META.primary;
  }

  function analysisForFixture(fixture) {
    const live = fixture?.livePrediction;
    const enginePick = enginePickForFixture(fixture);
    if (!live || !enginePick) return emptyAnalysis();

    const matrix = Object.entries(live.transitionMatrix || {}).map(([code, value]) => ({
      code,
      probability: Number(value?.probability || value || 0)
    }));

    const byCode = new Map(matrix.map((entry) => [entry.code, entry]));
    const completeMatrix = TRANSITIONS.map((code) => byCode.get(code) || {
      code,
      probability: 0
    });

    const strongest = live.strongestTransition || {};
    const strongestFromMatrix = [...completeMatrix].sort((a, b) => b.probability - a.probability)[0];

    return {
      primary: {
        label: enginePick.selection || enginePick.market || "No Bet",
        market: enginePick.market || "Prediction",
        qualified: Boolean(enginePick.qualified),
        mode: enginePick.mode || "directional",
        tier: enginePick.tier || "Directional",
        reasons: enginePick.reasons || [],
        cautions: enginePick.cautions || [],
        description: enginePick.description || ""
      },
      confidence: Number(enginePick.confidence ?? ((enginePick.score || 0) * 100)),
      reason:
        (enginePick.reasons || [])[0] ||
        enginePick.description ||
        `${enginePick.market || "Prediction"} · ${enginePick.tier || ""}`,
      matrix: completeMatrix,
      topTransition: {
        code: strongest.code || strongestFromMatrix?.code || "—"
      },
      derived: {
        ggScore: Number(live.goalScores?.ggYes || 0),
        over15Score: Number(live.goalScores?.over15 || 0),
        over25Score: Number(live.goalScores?.over25 || 0),
        under35Score: Number(live.goalScores?.under35 || 0),
        fullReversal: Number(
          live.engine?.goalIntelligence?.metrics?.extremeReversalMass || 0
        )
      }
    };
  }

  function profileAuditLabel(fixture) {
    const audit = fixture?.profileAudit;
    if (!audit?.home || !audit?.away) return "";

    const home = audit.home.evidence || {};
    const away = audit.away.evidence || {};
    const fingerprint = fixture.analysisFingerprint
      ? fixture.analysisFingerprint.slice(0, 8)
      : "—";

    return (
      `Data H O${Math.round(home.overall || 0)}/V${Math.round(home.venue || 0)} ` +
      `· A O${Math.round(away.overall || 0)}/V${Math.round(away.venue || 0)} ` +
      `· #${fingerprint}`
    );
  }

  function badgeMarkup(team) {
    const initials = `<span>${escapeHtml(team.short)}</span>`;
    if (!team.logo) return initials;
    return `${initials}<img src="${escapeHtml(team.logo)}" alt="" loading="lazy" onerror="this.hidden=true">`;
  }

  function renderMetrics(stats = {}) {
    $("#winRate").textContent = stats.winRate == null ? "—" : percent(stats.winRate, 1);
    $("#qualifiedPicks").textContent = String(stats.matchDirections ?? stats.qualifiedPicks ?? 0);
    $("#ggSignals").textContent = String(stats.ggSignals ?? 0);
    $("#under35Signals").textContent = String(stats.under35Signals ?? 0);

    $("#winRateNote").textContent = stats.graded
      ? `${stats.wins || 0} wins from ${stats.graded} graded`
      : "Awaiting graded predictions";

    $("#qualifiedPicksNote").textContent =
      `${stats.qualifiedPicks || 0} qualified · ${stats.directionalPicks || 0} directional`;
    $("#ggSignalsNote").textContent = "Live published GG selections";
    $("#under35SignalsNote").textContent = "Live published U3.5 selections";
  }

  function filteredFixtures() {
    const leagueNeedle = filterState.league;
    const marketNeedle = filterState.market;
    const strengthNeedle = filterState.strength;
    const query = filterState.query.toLowerCase();

    return fixtures.filter((fixture) => {
      const analysis = analysisForFixture(fixture);
      const prediction = fixture.livePrediction;
      const activePick = enginePickForFixture(fixture);
      const leagueValue = fixture.league;
      const marketValue = activePick?.market || "";
      const tierValue = String(activePick?.tier || "");
      const qualified = Boolean(activePick?.qualified);

      if (leagueNeedle && leagueValue !== leagueNeedle) return false;
      if (!marketFilterMatches(activePick, marketNeedle)) return false;

      if (strengthNeedle === "qualified" && !qualified) return false;
      if (strengthNeedle === "directional" && qualified) return false;
      if (strengthNeedle === "elite" && !/(Elite|Strong)/i.test(tierValue)) return false;
      if (strengthNeedle === "lean" && !/(Lean|Cautious|Low)/i.test(tierValue)) return false;

      if (query) {
        const haystack = [
          fixture.home.name,
          fixture.away.name,
          fixture.league,
          analysis.primary.label,
          activePick?.market || ""
        ].join(" ").toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      return true;
    });
  }

  function updateFilterOptions() {
    const leagueSelect = $("#leagueFilter");
    const marketSelect = $("#marketFilter");
    if (!leagueSelect || !marketSelect) return;

    const leagues = [...new Set(fixtures.map((fixture) => fixture.league).filter(Boolean))].sort();

    const selectedLeague = filterState.league;
    const selectedMarket = filterState.market;

    leagueSelect.innerHTML =
      '<option value="">All leagues</option>' +
      leagues.map((league) => `<option value="${escapeHtml(league)}">${escapeHtml(league)}</option>`).join("");

    marketSelect.innerHTML =
      '<option value="">All markets</option>' +
      MARKET_FILTER_OPTIONS.map((group) => `
        <optgroup label="${escapeHtml(group.label)}">
          ${group.options.map(([value, label]) =>
            `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`
          ).join("")}
        </optgroup>`).join("");

    leagueSelect.value = selectedLeague;
    marketSelect.value = selectedMarket;
  }

  function processingBannerMarkup() {
    const pending = Number(processingState.pending || 0);
    const withheld = Number(processingState.withheld || 0);
    if (!pending && !withheld) return "";
    return `
      <div class="background-picks-banner">
        <div>
          <span class="background-picks-dot" aria-hidden="true"></span>
          <div>
            <strong>${pending ? `Papa is preparing ${pending} more pick${pending === 1 ? "" : "s"}` : "Preparation finished"}</strong>
            <small>Completed picks appear automatically after the scheduled pipeline finishes. Incomplete fixtures are never shown as fake cards.${withheld ? ` ${withheld} fixture${withheld === 1 ? "" : "s"} were withheld for insufficient history.` : ""}</small>
          </div>
        </div>
        <button type="button" id="refreshPreparedPicks">Check now</button>
      </div>`;
  }

  function renderFixtures() {
    const container = $("#fixtureList");
    const summary = $("#fixtureSummary");
    const prev = $("#fixturePrev");
    const next = $("#fixtureNext");
    const pageInfo = $("#fixturePageInfo");
    if (!container) return;

    const readyCount = fixtures.length;
    const importedCount = Number(processingState.totalFixtures || readyCount);
    const pendingCount = Number(processingState.pending || 0);
    const withheldCount = Number(processingState.withheld || 0);

    if (!fixtures.length) {
      if (summary) summary.textContent = importedCount ? `0 ready · ${pendingCount} preparing` : "0 fixtures";
      container.innerHTML = importedCount
        ? `<div class="picks-preparing-card">
            <span class="preparing-orbit" aria-hidden="true"></span>
            <strong>Papa’s automatic pipeline is preparing today’s picks</strong>
            <p>${pendingCount || importedCount} fixture${(pendingCount || importedCount) === 1 ? "" : "s"} are queued for automatic fixture sync and individual analysis. Only completed picks will appear here.</p>
            <button type="button" id="refreshPreparedPicks">Check for completed picks</button>
          </div>`
        : `<div class="data-empty"><strong>No fixtures imported for this date</strong><span>Choose another date or run the daily fixture sync.</span></div>`;
      if (pageInfo) pageInfo.textContent = "Page 0 of 0";
      if (prev) prev.disabled = true;
      if (next) next.disabled = true;
      $("#refreshPreparedPicks")?.addEventListener("click", () => loadDashboard());
      return;
    }

    const filtered = filteredFixtures();
    const totalPages = Math.max(1, Math.ceil(filtered.length / FIXTURES_PER_PAGE));
    filterState.page = Math.min(Math.max(1, filterState.page), totalPages);
    const offset = (filterState.page - 1) * FIXTURES_PER_PAGE;
    const visibleFixtures = filtered.slice(offset, offset + FIXTURES_PER_PAGE);
    const qualifiedCount = filtered.filter((fixture) => Boolean(enginePickForFixture(fixture)?.qualified)).length;
    const directionalCount = Math.max(0, filtered.length - qualifiedCount);

    if (summary) {
      summary.textContent = `${readyCount} ready · ${qualifiedCount} qualified · ${directionalCount} directional` +
        (pendingCount ? ` · ${pendingCount} preparing` : "") +
        (withheldCount ? ` · ${withheldCount} withheld` : "");
    }
    if (pageInfo) pageInfo.textContent = `Page ${filterState.page} of ${totalPages}`;
    if (prev) prev.disabled = filterState.page <= 1;
    if (next) next.disabled = filterState.page >= totalPages;

    if (!visibleFixtures.length) {
      container.innerHTML = processingBannerMarkup() + `<div class="data-empty"><strong>No completed picks match these filters</strong><span>Clear one or more filters or wait for the remaining picks.</span></div>`;
      $("#refreshPreparedPicks")?.addEventListener("click", () => loadDashboard());
      return;
    }

    const cards = visibleFixtures.map((fixture) => {
      const analysis = analysisForFixture(fixture);
      const activePick = enginePickForFixture(fixture);
      const qualified = Boolean(activePick?.qualified);
      const confidence = percent(analysis.confidence, 1);
      const mode = `${engineMeta().name} · ${qualified ? "Qualified" : "Directional"}`;
      const modeClass = qualified ? "qualified" : "directional";
      return `<button class="fixture-item ${fixture.id === selectedId ? "active" : ""}" data-id="${escapeHtml(fixture.id)}">
        <div class="fixture-top"><span>${escapeHtml(fixture.league)}</span><span>${escapeHtml(fixture.kickoff)}</span></div>
        <div class="fixture-teams">
          <div class="fixture-team"><span class="mini-badge">${badgeMarkup(fixture.home)}</span>${escapeHtml(fixture.home.name)}</div>
          <div class="fixture-team"><span class="mini-badge">${badgeMarkup(fixture.away)}</span>${escapeHtml(fixture.away.name)}</div>
        </div>
        <div class="fixture-decision"><span class="fixture-mode ${modeClass}">${escapeHtml(mode)}</span><strong>${escapeHtml(analysis.primary.label)}</strong></div>
        <div class="fixture-bottom"><span>${escapeHtml(activePick?.market || analysis.primary.market || "Prediction")}</span><b>${confidence}</b></div>
        ${profileAuditLabel(fixture) ? `<small class="fixture-audit">${escapeHtml(profileAuditLabel(fixture))}</small>` : ""}
        <small class="fixture-why">Tap to open Papa’s full reasoning →</small>
      </button>`;
    }).join("");

    container.innerHTML = processingBannerMarkup() + cards;
    $("#refreshPreparedPicks")?.addEventListener("click", () => loadDashboard());
    document.querySelectorAll(".fixture-item").forEach((button) => {
      button.addEventListener("click", () => {
        selectedId = button.dataset.id;
        renderFixtures();
        renderAnalysis();
        renderExplanation();
        openPickReasonDialog();
      });
    });
  }

  function renderMatrix(analysis) {
    const sorted = [...analysis.matrix].sort((a, b) => b.probability - a.probability);
    const topCode = sorted[0]?.probability > 0 ? sorted[0].code : null;

    $("#transitionMatrix").innerHTML = analysis.matrix.map((item) => `
      <div class="matrix-cell ${item.code === topCode ? "top" : ""}">
        <header>
          <strong>${escapeHtml(item.code)}</strong>
          <span>${scorePercent(item.probability)}</span>
        </header>
        <div class="matrix-bar">
          <i style="width:${Math.min(100, Math.max(item.probability ? 5 : 0, item.probability * 260))}%"></i>
        </div>
      </div>
    `).join("");
  }

  function renderInsights(analysis) {
    const picks = [
      ["GG — Yes", "Both scoring paths", analysis.derived.ggScore, "GG"],
      ["Over 1.5", "Minimum goal route", analysis.derived.over15Score, "O1.5"],
      ["Over 2.5", "Two-sided or dominant team", analysis.derived.over25Score, "O2.5"],
      ["Under 3.5", "Ceiling confirmation", analysis.derived.under35Score, "U3.5"]
    ];

    $("#marketInsights").innerHTML = picks.map(([label, sub, score, icon], index) => {
      const marketTier = tier(score);
      const status =
        ["Elite", "Strong", "Qualified"].includes(marketTier)
          ? "pass"
          : marketTier === "Lean"
            ? "lean"
            : "reject";

      return `<div class="insight-row">
        <span class="insight-icon ${index === 3 ? "gold" : ""}">${escapeHtml(icon)}</span>
        <div class="insight-copy">
          <strong>${escapeHtml(label)}</strong>
          <small>${escapeHtml(sub)}</small>
        </div>
        <span class="insight-percent">${scorePercent(score)}</span>
        <span class="insight-status ${status}">${marketTier}</span>
      </div>`;
    }).join("");
  }

  function clearAnalysis() {
    const meta = engineMeta();
    $("#activeEngineLabel").textContent = meta.label;
    $("#activeMarketLabel").textContent = meta.marketLabel;
    $("#explanationTitle").textContent = meta.explanation;
    $("#leagueLabel").textContent = "LIVE DATABASE";
    $("#kickoffLabel").textContent = "NO FIXTURES";
    $("#homeTeam").textContent = "Papa is";
    $("#awayTeam").textContent = "Preparing Picks";
    $("#homeBadge").innerHTML = "<span>—</span>";
    $("#awayBadge").innerHTML = "<span>—</span>";
    $("#primaryPick").textContent = "Completed picks will appear automatically";
    $("#primaryReason").textContent = "Unfinished analysis is hidden instead of filling the catalogue with processing cards.";
    $("#confidenceScore").textContent = "—";
    $("#confidenceBar").style.width = "0%";
    $("#confidenceTier").textContent = "Pending";
    $("#htStory").textContent = "—";
    $("#goalRoute").textContent = "—";
    $("#riskLabel").textContent = "Pending";
    renderMatrix(emptyAnalysis());
    renderInsights(emptyAnalysis());
  }

  function renderAnalysis() {
    const fixture = fixtures.find((item) => item.id === selectedId) || fixtures[0];
    if (!fixture) {
      clearAnalysis();
      return;
    }

    const analysis = analysisForFixture(fixture);

    const meta = engineMeta();
    $("#activeEngineLabel").textContent = meta.label;
    $("#activeMarketLabel").textContent = meta.marketLabel;
    $("#explanationTitle").textContent = meta.explanation;
    $("#leagueLabel").textContent = fixture.league.toUpperCase();
    $("#kickoffLabel").textContent = fixture.kickoff.toUpperCase();
    $("#homeTeam").textContent = fixture.home.name;
    $("#awayTeam").textContent = fixture.away.name;
    $("#homeBadge").innerHTML = badgeMarkup(fixture.home);
    $("#awayBadge").innerHTML = badgeMarkup(fixture.away);
    $("#primaryPick").textContent = analysis.primary.label;
    $("#primaryReason").textContent = analysis.reason;
    $("#confidenceScore").textContent = fixture.livePrediction
      ? percent(analysis.confidence, 1)
      : "—";
    $("#confidenceBar").style.width = `${Math.min(100, Math.max(0, analysis.confidence))}%`;
    $("#confidenceTier").textContent = fixture.livePrediction
      ? tier(analysis.confidence / 100)
      : "Pending";
    $("#htStory").textContent = analysis.topTransition.code;

    const goalScores = [
      ["GG", analysis.derived.ggScore],
      ["O1.5", analysis.derived.over15Score],
      ["O2.5", analysis.derived.over25Score],
      ["U3.5", analysis.derived.under35Score]
    ].sort((a, b) => b[1] - a[1]);

    $("#goalRoute").textContent = goalScores[0][1]
      ? `${goalScores[0][0]} ${scorePercent(goalScores[0][1])}`
      : "Pending";

    $("#riskLabel").textContent = !fixture.livePrediction
      ? "Pending"
      : fixture.sample && fixture.sample < 8
        ? "Small sample"
        : analysis.derived.fullReversal > 0.16
          ? "Volatile"
          : "Controlled";

    renderMatrix(analysis);
    renderInsights(analysis);
  }

  function renderExplanation() {
    const fixture = fixtures.find((item) => item.id === selectedId) || fixtures[0];
    const modeBadge = $("#decisionMode");
    const headline = $("#decisionHeadline");
    const summary = $("#decisionSummary");
    const reasons = $("#decisionReasons");
    const cautions = $("#decisionCautions");
    const alternatives = $("#decisionAlternatives");
    const table = $("#indicatorTable");
    const quality = $("#indicatorQuality");

    if (!fixture?.livePrediction) {
      if (modeBadge) {
        modeBadge.textContent = "Awaiting engine";
        modeBadge.dataset.mode = "pending";
      }
      if (headline) headline.textContent = "PapaSense is preparing this fixture’s direction.";
      if (summary) summary.textContent = "The live dashboard automatically generates missing predictions. Refresh once after a short wait if this card is still processing.";
      if (reasons) reasons.innerHTML = "<li>Fixture imported successfully.</li><li>PapaSense is calculating the market direction and explanation.</li>";
      if (cautions) cautions.innerHTML = "<li>Do not treat this fixture as a pick until the processing label is replaced by a market.</li>";
      if (alternatives) alternatives.innerHTML = '<div class="alternative-card">No alternatives available yet.</div>';
      if (table) table.innerHTML = '<tr><td colspan="5">Awaiting prediction generation.</td></tr>';
      if (quality) quality.textContent = "Data quality: pending";
      return;
    }

    const prediction = fixture.livePrediction;
    const enginePick = enginePickForFixture(fixture);
    const explanation = prediction.explanation || prediction.engine?.decisionTrace || {};
    const qualified = Boolean(enginePick?.qualified);

    if (modeBadge) {
      modeBadge.textContent = `${engineMeta().name} · ${qualified ? "Qualified" : "Directional"}`;
      modeBadge.dataset.mode = qualified ? "qualified" : "directional";
    }
    if (headline) headline.textContent = `${engineMeta().name}: ${enginePick?.selection || "Processing"}`;
    if (summary) {
      summary.textContent = cleanExplanationText(
        enginePick?.explanationParagraph ||
        enginePick?.description ||
        enginePick?.reasons?.[0] ||
        explanation.summary ||
        "Common-sense ranking selected this market."
      );
    }

    const reasonRows = enginePick?.reasons?.length
      ? enginePick.reasons
      : explanation.whyChosen?.length
        ? explanation.whyChosen
        : prediction.reasons || ["Highest-ranked market after all HT/FT and goal checks."];

    if (reasons) {
      reasons.innerHTML = reasonRows
        .map((reason) => `<li>${explanationHtml(reason)}</li>`)
        .join("");
    }

    const cautionRows = enginePick?.cautions?.length
      ? enginePick.cautions
      : explanation.cautions?.length
        ? explanation.cautions
        : prediction.warnings || [];

    if (cautions) {
      cautions.innerHTML = cautionRows.length
        ? cautionRows
            .map((warning) => `<li>${explanationHtml(warning)}</li>`)
            .join("")
        : "<li>No major contradiction passed the engine’s risk checks.</li>";
    }

    if (alternatives) {
      const rows = explanation.alternatives || [];
      alternatives.innerHTML = rows.length
        ? rows.slice(0, 4).map((alternative) => `
          <div class="alternative-card">
            <span>${escapeHtml(alternative.market || "Market")}</span>
            <strong>${escapeHtml(alternative.selection || "Alternative")}</strong>
            <small>${scorePercent(alternative.score || 0)} · ${escapeHtml(alternative.tier || "Directional")}</small>
          </div>`).join("")
        : '<div class="alternative-card">No alternative market outranked the primary direction.</div>';
    }

    const indicators =
      prediction.allHtftIndicators ||
      explanation.allHtftIndicators ||
      prediction.engine?.allHtftIndicators ||
      [];

    if (table) {
      table.innerHTML = indicators.length
        ? indicators.map((indicator) => `
          <tr>
            <td><strong>${escapeHtml(indicator.code || indicator.transition)}</strong><small>${escapeHtml(indicator.transition || "")}</small></td>
            <td>${scorePercent(indicator.homeRate || 0)}</td>
            <td>${scorePercent(indicator.awayOppositeRate || 0)}</td>
            <td><b>${scorePercent(indicator.combinedProbability || 0)}</b></td>
            <td>${escapeHtml(indicator.interpretation || "Reviewed")}</td>
          </tr>`).join("")
        : '<tr><td colspan="5">Detailed indicator review is unavailable for this older prediction row. Regenerate this date with v1.5.</td></tr>';
    }

    const qualityLabel =
      explanation.dataQuality?.label ||
      prediction.engine?.dataQuality?.label ||
      "Unknown";
    const qualityScore =
      explanation.dataQuality?.score ??
      prediction.engine?.dataQuality?.score;

    if (quality) {
      quality.textContent = `Data quality: ${qualityLabel}${Number.isFinite(Number(qualityScore)) ? ` · ${scorePercent(qualityScore)}` : ""}`;
    }
  }

  function renderResults() {
    const table = $("#resultsTable");
    if (!table) return;

    if (!recentResults.length) {
      table.innerHTML = `
        <tr class="empty-result-row">
          <td colspan="7">
            <div class="data-empty">
              <strong>No graded predictions yet</strong>
              <span>Completed results will appear here automatically.</span>
            </div>
          </td>
        </tr>`;
      return;
    }

    table.innerHTML = recentResults.map((row) => {
      const home = row.home?.name || "Home";
      const away = row.away?.name || "Away";
      const competition = [row.league?.country, row.league?.name].filter(Boolean).join(" · ") || "Competition";
      const outcomeClass = row.outcome === "WIN" ? "win" : row.outcome === "LOSS" ? "loss" : "void";

      return `<tr>
        <td data-label="Date">${escapeHtml(formatDate(row.kickoff || row.gradedAt))}</td>
        <td data-label="Match"><strong>${escapeHtml(`${home} vs ${away}`)}</strong></td>
        <td data-label="Competition">${escapeHtml(competition)}</td>
        <td data-label="Prediction">${escapeHtml(row.prediction || "Prediction")}</td>
        <td data-label="Result">${escapeHtml(row.fulltimeScore || "—")}</td>
        <td data-label="Outcome"><span class="outcome ${outcomeClass}">${escapeHtml(row.outcome || "—")}</span></td>
        <td data-label="Odd">${row.odd == null ? "—" : escapeHtml(row.odd)}</td>
      </tr>`;
    }).join("");
  }

  function scheduleProcessingPoll() {
    if (processingPollTimer) {
      window.clearTimeout(processingPollTimer);
      processingPollTimer = null;
    }
    if (Number(processingState.pending || 0) <= 0) return;
    processingPollTimer = window.setTimeout(() => loadDashboard({ silent: true }), 15000);
  }

  async function loadDashboard({ silent = false } = {}) {
    const date = filterState.date || localIsoDate();
    if (!silent) setLiveState("loading", "Connecting to live data…", `Date: ${date}`);

    try {
      const payload = await fetchFromApi(`/api/dashboard/today?date=${encodeURIComponent(date)}`);
      processingState = payload.processing || {
        state: "idle",
        totalFixtures: Array.isArray(payload.fixtures) ? payload.fixtures.length : 0,
        readyPredictions: Array.isArray(payload.predictions) ? payload.predictions.length : 0,
        pending: Math.max(0, (Array.isArray(payload.fixtures) ? payload.fixtures.length : 0) - (Array.isArray(payload.predictions) ? payload.predictions.length : 0)),
        withheld: 0
      };
      fixtures = normalizeDashboard(payload);
      recentResults = Array.isArray(payload.recentResults) ? payload.recentResults : [];
      selectedId = fixtures.find((fixture) => fixture.id === selectedId)?.id || fixtures[0]?.id || null;

      renderMetrics(payload.stats || {});
      updateFilterOptions();
      renderFixtures();
      renderAnalysis();
      renderExplanation();
      renderResults();

      const source = activeApiBase?.includes("onrender.com") ? "Render fallback" : "api.betspapa.com";
      const updated = payload.stats?.lastUpdated || payload.generatedAt || new Date().toISOString();
      const pending = Number(processingState.pending || 0);
      const withheld = Number(processingState.withheld || 0);
      const preparationNote = `${fixtures.length} pick${fixtures.length === 1 ? "" : "s"} ready` +
        (pending ? ` · ${pending} preparing in background` : "") +
        (withheld ? ` · ${withheld} withheld` : "");
      setLiveState(
        processingState.state === "failed" ? "error" : "live",
        fixtures.length ? "Papa’s completed picks are live" : pending ? "Papa’s automatic pipeline is preparing today’s picks" : "Live database connected",
        `${source} · ${preparationNote} · Updated ${formatKickoff(updated)}`
      );
      scheduleProcessingPoll();
      lastLoadedAt = Date.now();
    } catch (error) {
      fixtures = [];
      recentResults = [];
      renderMetrics({});
      renderFixtures();
      clearAnalysis();
      renderExplanation();
      renderResults();
      setLiveState(
        "error",
        "Live data connection failed",
        `${error.message}. Check Render deployment and API health.`
      );
    }
  }

  function marketComparisonRows(prediction) {
    return (
      prediction.marketComparison ||
      prediction.explanation?.marketComparison ||
      prediction.engine?.decisionTrace?.marketComparison ||
      []
    );
  }

  function openPickReasonDialog() {
    const fixture = fixtures.find((item) => item.id === selectedId) || fixtures[0];
    const dialog = $("#pickReasonDialog");
    const content = $("#pickReasonContent");
    if (!dialog || !content || !fixture) return;

    if (!fixture.livePrediction) {
      const issue = fixture.generationIssue;
      content.innerHTML = `
        <div class="reason-popup-heading">
          <span class="fixture-mode pending">
            ${issue ? "History unavailable" : "Preparing picks"}
          </span>
          <h2 id="pickReasonTitle">${escapeHtml(fixture.home.name)} vs ${escapeHtml(fixture.away.name)}</h2>
          <p>${escapeHtml(
            issue?.message ||
            "Papa is still preparing this fixture. It will appear when the analysis is complete."
          )}</p>
          <div class="anti-zombie-note">
            Unfinished analysis is hidden from the main catalogue. No placeholder pick is published.
          </div>
        </div>`;
      document.body.classList.add("pick-reason-open");
      if (!dialog.open) dialog.showModal();
      return;
    }

    const prediction = fixture.livePrediction;
    const enginePick = enginePickForFixture(fixture);
    const explanation = prediction.explanation || prediction.engine?.decisionTrace || {};
    const qualified = Boolean(enginePick?.qualified);
    const reasons =
      enginePick?.reasons ||
      explanation.whyChosen ||
      prediction.reasons ||
      [];
    const cautions =
      enginePick?.cautions ||
      explanation.cautions ||
      prediction.warnings ||
      [];
    const indicators =
      prediction.allHtftIndicators ||
      explanation.allHtftIndicators ||
      prediction.engine?.allHtftIndicators ||
      [];
    const comparisons = marketComparisonRows(prediction);

    content.innerHTML = `
      <div class="reason-popup-heading">
        <div class="popup-engine-tabs">
          ${Object.entries(ENGINE_META).map(([key, meta]) => `
            <button type="button" data-popup-engine="${key}" class="${key === filterState.engine ? "active" : ""}">
              ${escapeHtml(meta.name)}
            </button>`).join("")}
        </div>
        <span class="fixture-mode ${qualified ? "qualified" : "directional"}">
          ${escapeHtml(engineMeta().name)} · ${qualified ? "Qualified" : "Directional"}
        </span>
        <span class="reason-popup-league">${escapeHtml(fixture.league)} · ${escapeHtml(fixture.kickoff)}</span>
        <h2 id="pickReasonTitle">${escapeHtml(fixture.home.name)} vs ${escapeHtml(fixture.away.name)}</h2>
        <div class="reason-popup-pick">
          <small>${escapeHtml(enginePick?.market || "Market")}</small>
          <strong>${escapeHtml(enginePick?.selection || "Prediction")}</strong>
          <b>${percent(enginePick?.confidence ?? ((enginePick?.score || 0) * 100), 1)}</b>
        </div>
        <div class="papa-explanation-block">
          <span>${filterState.engine === "primary" ? "PAPA'S EXPLANATION" : `${escapeHtml(engineMeta().name.toUpperCase())} EXPLANATION`}</span>
          <p>${explanationHtml(
            enginePick?.explanationParagraph ||
            enginePick?.description ||
            enginePick?.reasons?.[0] ||
            explanation.summary ||
            "PapaSense selected the highest-ranked common-sense route."
          )}</p>

          ${enginePick?.explanationEvidence ? `
            <div class="plain-evidence-grid">
              ${evidenceCard(
                "Strongest HT/FT pattern",
                enginePick.explanationEvidence.strongestRoute,
                enginePick.explanationEvidence.strongestRouteMeaning
              )}
              ${evidenceCard(
                `${fixture.home.name} at home`,
                enginePick.explanationEvidence.homeSupport?.text,
                "How often the strongest home pattern appeared"
              )}
              ${evidenceCard(
                `${fixture.away.name} away`,
                enginePick.explanationEvidence.awaySupport?.text,
                "How often the matching opposite pattern appeared"
              )}
              ${evidenceCard(
                "Next supporting pattern",
                enginePick.explanationEvidence.secondRoute,
                enginePick.explanationEvidence.secondRouteMeaning
              )}
            </div>
            <div class="plain-decision-box">
              <span>WHY THIS MARKET</span>
              <p>${explanationHtml(enginePick.explanationEvidence.decision)}</p>
            </div>` : ""}
        </div>
      </div>

      <div class="reason-popup-grid">
        <section>
          <h3>Why this pick won</h3>
          <ul class="reason-list">
            ${reasons.length
              ? reasons.map((reason) => `<li>${explanationHtml(reason)}</li>`).join("")
              : "<li>Highest threshold-relative market score.</li>"}
          </ul>
        </section>
        <section>
          <h3>Cautions</h3>
          <ul class="caution-list">
            ${cautions.length
              ? cautions.map((warning) => `<li>${explanationHtml(warning)}</li>`).join("")
              : "<li>No major contradiction survived the safety checks.</li>"}
          </ul>
        </section>
      </div>

      <section class="reason-popup-section profile-audit-popup">
        <div class="reason-popup-section-head">
          <div>
            <span class="eyebrow">INDIVIDUAL DATA AUDIT</span>
            <h3>Profiles actually used for this fixture</h3>
          </div>
        </div>
        <div class="profile-audit-grid">
          <div>
            <span>${escapeHtml(fixture.home.name)}</span>
            <strong>Overall ${Math.round(fixture.profileAudit?.home?.evidence?.overall || 0)}</strong>
            <small>Venue ${Math.round(fixture.profileAudit?.home?.evidence?.venue || 0)} · Recent ${Math.round(fixture.profileAudit?.home?.evidence?.recent || 0)}</small>
          </div>
          <div>
            <span>${escapeHtml(fixture.away.name)}</span>
            <strong>Overall ${Math.round(fixture.profileAudit?.away?.evidence?.overall || 0)}</strong>
            <small>Venue ${Math.round(fixture.profileAudit?.away?.evidence?.venue || 0)} · Recent ${Math.round(fixture.profileAudit?.away?.evidence?.recent || 0)}</small>
          </div>
          <div>
            <span>Analysis fingerprint</span>
            <strong>#${escapeHtml((fixture.analysisFingerprint || "unavailable").slice(0, 12))}</strong>
            <small>Different profile inputs create a different audit fingerprint.</small>
          </div>
        </div>
      </section>

      <section class="reason-popup-section">
        <div class="reason-popup-section-head">
          <div>
            <span class="eyebrow">MARKET COMPARISON</span>
            <h3>Why it was not automatically Double Chance</h3>
          </div>
        </div>
        <p class="selection-method">
          ${escapeHtml(
            prediction.selectionMethod ||
            explanation.selectionMethod ||
            "Every market is compared against its own threshold. A broad two-outcome market cannot win merely because its raw probability is larger."
          )}
        </p>
        <div class="comparison-table-wrap">
          <table class="comparison-table">
            <thead>
              <tr>
                <th>Market</th>
                <th>Selection</th>
                <th>Score</th>
                <th>Threshold</th>
                <th>Relative rank</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              ${comparisons.length
                ? comparisons.slice(0, 10).map((market) => `
                  <tr class="${market.selected ? "selected-market-row" : ""}">
                    <td>${escapeHtml(market.market || market.family || "Market")}</td>
                    <td><strong>${escapeHtml(market.selection || "—")}</strong></td>
                    <td>${scorePercent(market.score || 0)}</td>
                    <td>${scorePercent(market.threshold || 0)}</td>
                    <td>${Number(market.comparisonScore || 0).toFixed(3)}</td>
                    <td>${market.selected ? "Selected" : market.qualified ? "Qualified alternative" : "Below threshold"}</td>
                  </tr>`).join("")
                : '<tr><td colspan="6">Regenerate this date with PapaSense v1.6 to see the calibrated market comparison.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>

      <section class="reason-popup-section">
        <div class="reason-popup-section-head">
          <div>
            <span class="eyebrow">ALL NINE HT/FT INDICATORS</span>
            <h3>Home profile vs away opposite profile</h3>
          </div>
        </div>
        <div class="comparison-table-wrap">
          <table class="comparison-table htft-popup-table">
            <thead>
              <tr>
                <th>HT/FT</th>
                <th>Home</th>
                <th>Away opposite</th>
                <th>Combined</th>
                <th>Reading</th>
              </tr>
            </thead>
            <tbody>
              ${indicators.length
                ? indicators.map((indicator) => `
                  <tr>
                    <td><strong>${escapeHtml(indicator.code || indicator.transition)}</strong><small>${escapeHtml(indicator.transition || "")}</small></td>
                    <td>${scorePercent(indicator.homeRate || 0)}</td>
                    <td>${scorePercent(indicator.awayOppositeRate || 0)}</td>
                    <td><b>${scorePercent(indicator.combinedProbability || 0)}</b></td>
                    <td>${escapeHtml(indicator.interpretation || "Reviewed")}</td>
                  </tr>`).join("")
                : '<tr><td colspan="5">Regenerate this date with PapaSense v1.6 to see all nine indicators.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>
    `;

    content.querySelectorAll("[data-popup-engine]").forEach((button) => {
      button.addEventListener("click", () => {
        filterState.engine = button.dataset.popupEngine;
        syncEngineControls();
        updateFilterOptions();
        filterState.page = 1;
        renderFixtures();
        renderAnalysis();
        renderExplanation();
        openPickReasonDialog();
      });
    });

    document.body.classList.add("pick-reason-open");
    if (!dialog.open) dialog.showModal();
  }

  function closePickReasonDialog() {
    const dialog = $("#pickReasonDialog");
    if (!dialog) return;

    document.body.classList.remove("pick-reason-open");
    if (dialog.open) dialog.close();
  }

  function setupPickReasonDialog() {
    const dialog = $("#pickReasonDialog");
    if (!dialog) return;

    document.addEventListener("click", (event) => {
      const closeControl = event.target.closest("[data-close-pick-reason]");
      if (!closeControl) return;
      event.preventDefault();
      event.stopPropagation();
      closePickReasonDialog();
    });

    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closePickReasonDialog();
    });

    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closePickReasonDialog();
    });

    dialog.addEventListener("close", () => {
      document.body.classList.remove("pick-reason-open");
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && dialog.open) {
        event.preventDefault();
        closePickReasonDialog();
      }
    });
  }

  function setupModal() {
    const modal = $("#methodModal");
    ["#howItWorks", "#matrixHelp"].forEach((id) => {
      $(id)?.addEventListener("click", () => modal?.showModal());
    });
    $("#modalClose")?.addEventListener("click", () => modal?.close());
  }

  function setupMobile() {
    const menu = $("#mobileMenu");
    const more = $("#mobileMore");
    const sidebar = $("#sidebar");
    const backdrop = $("#drawerBackdrop");
    const tabs = [...document.querySelectorAll("[data-mobile-tab]")];

    const setDrawer = (open) => {
      sidebar?.classList.toggle("open", open);
      menu?.setAttribute("aria-expanded", String(open));
      if (backdrop) backdrop.hidden = !open;
      document.body.classList.toggle("menu-open", open);
    };

    menu?.addEventListener("click", () => setDrawer(!sidebar?.classList.contains("open")));
    more?.addEventListener("click", () => setDrawer(true));
    backdrop?.addEventListener("click", () => setDrawer(false));

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && sidebar?.classList.contains("open")) setDrawer(false);
    });

    document.querySelectorAll(".side-link").forEach((link) => {
      link.addEventListener("click", () => setDrawer(false));
    });

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((item) => item.classList.remove("active"));
        tab.classList.add("active");
      });
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 1020) setDrawer(false);
    }, { passive: true });
  }

  function setupSearch() {
    const drawer = $("#searchDrawer");
    const searchButton = $("#searchButton");
    const searchClose = $("#searchClose");
    const searchInput = $("#globalSearch");
    const searchResults = $("#searchResults");

    const closeSearch = ({ restoreFocus = false } = {}) => {
      drawer?.classList.remove("is-open");
      if (drawer) {
        drawer.hidden = true;
        drawer.setAttribute("aria-hidden", "true");
      }
      document.body.classList.remove("search-open");
      if (searchInput) searchInput.value = "";
      if (searchResults) searchResults.innerHTML = "";
      searchButton?.setAttribute("aria-expanded", "false");
      if (restoreFocus) searchButton?.focus({ preventScroll: true });
    };

    const openSearch = () => {
      if (!drawer) return;
      drawer.hidden = false;
      drawer.setAttribute("aria-hidden", "false");
      window.requestAnimationFrame(() => drawer.classList.add("is-open"));
      document.body.classList.add("search-open");
      searchButton?.setAttribute("aria-expanded", "true");
      window.setTimeout(() => searchInput?.focus({ preventScroll: true }), 50);
    };

    closeSearch();
    window.addEventListener("pageshow", () => closeSearch());

    searchButton?.addEventListener("click", openSearch);
    searchClose?.addEventListener("click", () => closeSearch({ restoreFocus: true }));

    drawer?.addEventListener("click", (event) => {
      if (event.target === drawer) closeSearch({ restoreFocus: true });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && drawer?.classList.contains("is-open")) {
        closeSearch({ restoreFocus: true });
      }
    });

    searchInput?.addEventListener("input", (event) => {
      const query = event.target.value.trim().toLowerCase();
      if (query.length < 2) {
        searchResults.innerHTML = "";
        return;
      }

      const results = fixtures.filter((fixture) => {
        const prediction = analysisForFixture(fixture).primary.label;
        return `${fixture.home.name} ${fixture.away.name} ${fixture.league} ${prediction}`
          .toLowerCase()
          .includes(query);
      });

      searchResults.innerHTML = results.length
        ? results.map((fixture) => `
            <button class="search-result" data-search-id="${escapeHtml(fixture.id)}">
              ${escapeHtml(fixture.home.name)} vs ${escapeHtml(fixture.away.name)}
              · ${escapeHtml(fixture.league)}
            </button>`).join("")
        : '<p class="search-empty">No matching live team, league or market.</p>';

      document.querySelectorAll("[data-search-id]").forEach((button) => {
        button.addEventListener("click", () => {
          selectedId = button.dataset.searchId;
          closeSearch();
          renderFixtures();
          renderAnalysis();
          renderExplanation();
          openPickReasonDialog();
        });
      });
    });
  }

  function syncEngineControls() {
    document.querySelectorAll("[data-engine]").forEach((button) => {
      button.classList.toggle("active", button.dataset.engine === filterState.engine);
    });
    const select = $("#engineFilter");
    if (select) select.value = filterState.engine;

    const pageLinks = {
      primary: "papas-pick.html",
      aggressive: "aggressive.html",
      safer: "safer.html",
      venue: "venue-pattern.html"
    };
    const link = $("#enginePageLink");
    if (link) {
      link.href = pageLinks[filterState.engine] || pageLinks.primary;
      link.childNodes[0].textContent = `Open ${engineMeta().name} page `;
    }
  }

  function setActiveEngine(engineKey) {
    if (!ENGINE_META[engineKey]) return;
    filterState.engine = engineKey;
    filterState.page = 1;
    syncEngineControls();
    updateFilterOptions();
    renderFixtures();
    renderAnalysis();
    renderExplanation();
  }

  function setupEngineSwitcher() {
    document.querySelectorAll("[data-engine]").forEach((button) => {
      button.addEventListener("click", () => setActiveEngine(button.dataset.engine));
    });

    $("#engineFilter")?.addEventListener("change", (event) => {
      setActiveEngine(event.target.value);
    });

    syncEngineControls();
  }

  function setupFixtureFilters() {
    const dateInput = $("#dateFilter");
    const leagueSelect = $("#leagueFilter");
    const marketSelect = $("#marketFilter");
    const strengthSelect = $("#strengthFilter");
    const searchInput = $("#fixtureSearch");
    const clearButton = $("#clearFixtureFilters");
    const prev = $("#fixturePrev");
    const next = $("#fixtureNext");

    filterState.date = localIsoDate();
    if (dateInput) dateInput.value = filterState.date;

    dateInput?.addEventListener("change", () => {
      filterState.date = dateInput.value || localIsoDate();
      filterState.page = 1;
      loadDashboard();
    });

    leagueSelect?.addEventListener("change", () => {
      filterState.league = leagueSelect.value;
      filterState.page = 1;
      renderFixtures();
    });

    marketSelect?.addEventListener("change", () => {
      filterState.market = marketSelect.value;
      filterState.page = 1;
      renderFixtures();
    });

    strengthSelect?.addEventListener("change", () => {
      filterState.strength = strengthSelect.value;
      filterState.page = 1;
      renderFixtures();
    });

    searchInput?.addEventListener("input", () => {
      filterState.query = searchInput.value.trim();
      filterState.page = 1;
      renderFixtures();
    });

    clearButton?.addEventListener("click", () => {
      filterState.league = "";
      filterState.market = "";
      filterState.strength = "";
      filterState.engine = "primary";
      filterState.query = "";
      filterState.page = 1;
      if (leagueSelect) leagueSelect.value = "";
      if (marketSelect) marketSelect.value = "";
      if (strengthSelect) strengthSelect.value = "";
      if (searchInput) searchInput.value = "";
      syncEngineControls();
      updateFilterOptions();
      renderFixtures();
      renderAnalysis();
      renderExplanation();
    });

    prev?.addEventListener("click", () => {
      filterState.page = Math.max(1, filterState.page - 1);
      renderFixtures();
      $("#fixtures")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    next?.addEventListener("click", () => {
      filterState.page += 1;
      renderFixtures();
      $("#fixtures")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function setupLiveRefresh() {
    $("#refreshLiveData")?.addEventListener("click", () => loadDashboard());

    document.addEventListener("visibilitychange", () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastLoadedAt > 5 * 60 * 1000
      ) {
        loadDashboard({ silent: true });
      }
    });

    window.setInterval(() => loadDashboard({ silent: true }), 10 * 60 * 1000);
  }

  renderMetrics({});
  renderFixtures();
  clearAnalysis();
  renderResults();
  setupModal();
  setupPickReasonDialog();
  setupMobile();
  setupSearch();
  setupEngineSwitcher();
  setupFixtureFilters();
  setupLiveRefresh();
  loadDashboard();
})();
