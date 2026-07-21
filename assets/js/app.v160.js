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

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
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
      const timeout = window.setTimeout(() => controller.abort(), 75000);

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
      predictionMode: prediction?.primary?.mode || "directional",
      predictionQualified: Boolean(prediction?.primary?.qualified)
    };
  }

  function normalizeDashboard(payload) {
    const predictions = Array.isArray(payload.predictions) ? payload.predictions : [];
    const detailedFixtures = Array.isArray(payload.fixtures) ? payload.fixtures : [];
    const byFixture = predictionMapByFixture(predictions);
    const models = detailedFixtures.map((fixture) =>
      modelFromFixture(fixture, byFixture.get(String(fixture.fixtureId)))
    );

    const represented = new Set(models.map((fixture) => fixture.externalId));
    for (const prediction of predictions) {
      if (!represented.has(String(prediction.fixtureId))) {
        models.push(modelFromFixture({}, prediction));
      }
    }

    models.sort((a, b) => {
      const ap = a.livePrediction ? 0 : 1;
      const bp = b.livePrediction ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return new Date(a.rawKickoff || 0) - new Date(b.rawKickoff || 0);
    });

    return models;
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

  function analysisForFixture(fixture) {
    const live = fixture?.livePrediction;
    if (!live) return emptyAnalysis();

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
        label: live.primary?.selection || live.primary?.market || "No Bet"
      },
      confidence: Number(live.primary?.confidence || 0),
      reason:
        (live.reasons || [])[0] ||
        `${live.primary?.market || "Prediction"} · ${live.primary?.tier || ""}`,
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
      const leagueValue = fixture.league;
      const marketValue = prediction?.primary?.market || "";
      const tierValue = String(prediction?.primary?.tier || "");
      const qualified = Boolean(prediction?.primary?.qualified);

      if (leagueNeedle && leagueValue !== leagueNeedle) return false;
      if (marketNeedle && marketValue !== marketNeedle) return false;

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
          prediction?.primary?.market || ""
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
    const markets = [...new Set(
      fixtures.map((fixture) => fixture.livePrediction?.primary?.market).filter(Boolean)
    )].sort();

    const selectedLeague = filterState.league;
    const selectedMarket = filterState.market;

    leagueSelect.innerHTML =
      '<option value="">All leagues</option>' +
      leagues.map((league) => `<option value="${escapeHtml(league)}">${escapeHtml(league)}</option>`).join("");

    marketSelect.innerHTML =
      '<option value="">All markets</option>' +
      markets.map((market) => `<option value="${escapeHtml(market)}">${escapeHtml(market)}</option>`).join("");

    leagueSelect.value = selectedLeague;
    marketSelect.value = selectedMarket;
  }

  function renderFixtures() {
    const container = $("#fixtureList");
    const summary = $("#fixtureSummary");
    const prev = $("#fixturePrev");
    const next = $("#fixtureNext");
    const pageInfo = $("#fixturePageInfo");
    if (!container) return;

    if (!fixtures.length) {
      if (summary) summary.textContent = "0 imported";
      container.innerHTML = `
        <div class="data-empty">
          <strong>No fixtures imported for this date</strong>
          <span>Choose another date or run the daily sync for the selected date.</span>
        </div>`;
      if (pageInfo) pageInfo.textContent = "Page 0 of 0";
      if (prev) prev.disabled = true;
      if (next) next.disabled = true;
      return;
    }

    const filtered = filteredFixtures();
    const totalPages = Math.max(1, Math.ceil(filtered.length / FIXTURES_PER_PAGE));
    filterState.page = Math.min(Math.max(1, filterState.page), totalPages);
    const start = (filterState.page - 1) * FIXTURES_PER_PAGE;
    const visibleFixtures = filtered.slice(start, start + FIXTURES_PER_PAGE);
    const qualifiedCount = filtered.filter((fixture) => fixture.livePrediction?.primary?.qualified).length;
    const directionalCount = Math.max(0, filtered.length - qualifiedCount);

    if (summary) {
      summary.textContent = `${filtered.length} matches · ${qualifiedCount} qualified · ${directionalCount} directional`;
    }
    if (pageInfo) pageInfo.textContent = `Page ${filterState.page} of ${totalPages}`;
    if (prev) prev.disabled = filterState.page <= 1;
    if (next) next.disabled = filterState.page >= totalPages;

    if (!visibleFixtures.length) {
      container.innerHTML = `
        <div class="data-empty">
          <strong>No matches fit these filters</strong>
          <span>Clear one or more filters to reveal fixtures.</span>
        </div>`;
      return;
    }

    container.innerHTML = visibleFixtures.map((fixture) => {
      const analysis = analysisForFixture(fixture);
      const prediction = fixture.livePrediction;
      const qualified = Boolean(prediction?.primary?.qualified);
      const confidence = prediction ? percent(analysis.confidence, 1) : "Processing";
      const mode = !prediction ? "Processing" : qualified ? "Qualified" : "Directional";
      const modeClass = !prediction ? "pending" : qualified ? "qualified" : "directional";

      return `<button class="fixture-item ${fixture.id === selectedId ? "active" : ""}" data-id="${escapeHtml(fixture.id)}">
        <div class="fixture-top">
          <span>${escapeHtml(fixture.league)}</span>
          <span>${escapeHtml(fixture.kickoff)}</span>
        </div>
        <div class="fixture-teams">
          <div class="fixture-team">
            <span class="mini-badge">${badgeMarkup(fixture.home)}</span>
            ${escapeHtml(fixture.home.name)}
          </div>
          <div class="fixture-team">
            <span class="mini-badge">${badgeMarkup(fixture.away)}</span>
            ${escapeHtml(fixture.away.name)}
          </div>
        </div>
        <div class="fixture-decision">
          <span class="fixture-mode ${modeClass}">${mode}</span>
          <strong>${escapeHtml(prediction ? analysis.primary.label : "Preparing prediction")}</strong>
        </div>
        <div class="fixture-bottom">
          <span>${escapeHtml(prediction?.primary?.market || "PapaSense is calculating")}</span>
          <b>${confidence}</b>
        </div>
        <small class="fixture-why">Click for full HT/FT reasoning →</small>
      </button>`;
    }).join("");

    document.querySelectorAll(".fixture-item").forEach((button) => {
      button.addEventListener("click", () => {
        selectedId = button.dataset.id;
        renderFixtures();
        renderAnalysis();
        renderExplanation();

        if (window.innerWidth <= 900) {
          $("#why-this-pick")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
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
    $("#leagueLabel").textContent = "LIVE DATABASE";
    $("#kickoffLabel").textContent = "NO FIXTURES";
    $("#homeTeam").textContent = "Awaiting";
    $("#awayTeam").textContent = "Live Data";
    $("#homeBadge").innerHTML = "<span>—</span>";
    $("#awayBadge").innerHTML = "<span>—</span>";
    $("#primaryPick").textContent = "No live prediction available";
    $("#primaryReason").textContent = "Run the daily sync or refresh when fixtures are available.";
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
    const marketTable = $("#marketComparisonTable");
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
      if (marketTable) marketTable.innerHTML = '<tr><td colspan="5">Awaiting PapaSense v1.6 market comparison.</td></tr>';
      if (quality) quality.textContent = "Data quality: pending";
      return;
    }

    const prediction = fixture.livePrediction;
    const explanation = prediction.explanation || prediction.engine?.decisionTrace || {};
    const qualified = Boolean(prediction.primary?.qualified);

    if (modeBadge) {
      modeBadge.textContent = qualified ? "Qualified pick" : "Directional pick";
      modeBadge.dataset.mode = qualified ? "qualified" : "directional";
    }
    if (headline) headline.textContent = explanation.headline || prediction.primary.selection;
    if (summary) summary.textContent = explanation.summary || prediction.reasons?.[0] || "Common-sense ranking selected this market.";

    const reasonRows = explanation.whyChosen?.length
      ? explanation.whyChosen
      : prediction.reasons || ["Highest-ranked market after all HT/FT and goal checks."];

    if (reasons) {
      reasons.innerHTML = reasonRows.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("");
    }

    const cautionRows = explanation.cautions?.length
      ? explanation.cautions
      : prediction.warnings || [];

    if (cautions) {
      cautions.innerHTML = cautionRows.length
        ? cautionRows.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")
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
        : '<tr><td colspan="5">Detailed indicator review is unavailable for this older prediction row. Regenerate this date with PapaSense v1.6.</td></tr>';
    }

    const marketComparison =
      explanation.marketComparison ||
      prediction.engine?.decisionTrace?.marketComparison ||
      [];

    if (marketTable) {
      marketTable.innerHTML = marketComparison.length
        ? marketComparison.map((row) => {
            const blocker = row.blockers?.[0] || (row.qualified ? "Passed all checks" : "Below threshold");
            const statusClass = row.qualified ? "comparison-qualified" : "comparison-directional";
            return `
              <tr>
                <td><strong>${escapeHtml(row.family || row.market || "Market")}</strong><small>${escapeHtml(row.market || "")}</small></td>
                <td>${escapeHtml(row.selection || "—")}</td>
                <td><b>${scorePercent(row.score || 0)}</b></td>
                <td>${scorePercent(row.threshold || 0)}</td>
                <td><span class="comparison-status ${statusClass}">${row.qualified ? "Qualified" : "Directional"}</span><small>${escapeHtml(blocker)}</small></td>
              </tr>`;
          }).join("")
        : '<tr><td colspan="5">Market-family comparison is unavailable for this older prediction row. Regenerate with PapaSense v1.6.</td></tr>';
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

  async function loadDashboard({ silent = false } = {}) {
    const date = filterState.date || localIsoDate();
    if (!silent) setLiveState("loading", "Connecting to live data…", `Date: ${date}`);

    try {
      const payload = await fetchFromApi(`/api/dashboard/today?date=${encodeURIComponent(date)}`);
      fixtures = normalizeDashboard(payload);
      recentResults = Array.isArray(payload.recentResults) ? payload.recentResults : [];
      selectedId = fixtures.find((fixture) => fixture.livePrediction)?.id || fixtures[0]?.id || null;

      renderMetrics(payload.stats || {});
      updateFilterOptions();
      renderFixtures();
      renderAnalysis();
      renderExplanation();
      renderResults();

      const source = activeApiBase?.includes("onrender.com") ? "Render fallback" : "api.betspapa.com";
      const updated = payload.stats?.lastUpdated || payload.generatedAt || new Date().toISOString();
      const generation = payload.generation || {};
      const generationNote = generation.attempted
        ? ` · Auto-generated ${payload.predictions?.length || 0} match directions`
        : generation.cooldown && generation.missingBefore
          ? ` · ${generation.missingBefore} predictions still processing`
          : "";

      setLiveState(
        fixtures.length || recentResults.length ? "live" : "empty",
        fixtures.length || recentResults.length ? "Live database connected" : "Live database connected — no records today",
        `${source} · Updated ${formatKickoff(updated)}${generationNote}`
      );

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
          $("#prediction-board")?.scrollIntoView({ behavior: "smooth" });
        });
      });
    });
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
      filterState.query = "";
      filterState.page = 1;
      if (leagueSelect) leagueSelect.value = "";
      if (marketSelect) marketSelect.value = "";
      if (strengthSelect) strengthSelect.value = "";
      if (searchInput) searchInput.value = "";
      renderFixtures();
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
  setupMobile();
  setupSearch();
  setupFixtureFilters();
  setupLiveRefresh();
  loadDashboard();
})();
