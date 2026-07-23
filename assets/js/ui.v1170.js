(() => {
  "use strict";
  const path = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  document.documentElement.dataset.betspapaUi = "1.18.1";

  const header = document.querySelector(".topbar, .portal-header, .content-header-v150");
  if (header && !document.querySelector(".responsible-strip-v150") && !document.body.classList.contains("no-responsible-strip")) {
    const wrap = document.createElement("div");
    wrap.className = "responsible-strip-v150";
    wrap.innerHTML = `<div><b>18+</b><span>Sports analytics, not guarantees · Use responsibly</span></div>`;
    header.insertAdjacentElement("afterend", wrap);
  }

  const enginePages = ["papas-pick.html", "aggressive.html", "safer.html", "venue-pattern.html"];
  if (enginePages.includes(path) && !document.querySelector(".engine-subnav-v150")) {
    const hero = document.querySelector(".portal-hero");
    if (hero) {
      const nav = document.createElement("nav");
      nav.className = "engine-subnav-v150";
      nav.setAttribute("aria-label", "Papa analysis modes");
      const tabs = [
        ["papas-pick.html", "Papa’s Pick"],
        ["aggressive.html", "Aggressive"],
        ["safer.html", "Safer"],
        ["venue-pattern.html", "Venue Pattern"]
      ];
      nav.innerHTML = tabs.map(([href,label]) => `<a href="${href}" class="${path===href ? "active" : ""}">${label}</a>`).join("");
      hero.insertAdjacentElement("afterend", nav);
    }
  }

  const toolbar = document.querySelector(".portal-toolbar");
  if (toolbar && !document.querySelector(".mobile-filter-bar-v150")) {
    const date = toolbar.querySelector("#dateFilter");
    const state = toolbar.querySelector("#matchStateFilter") || toolbar.querySelector("#bankerTierFilter");
    const bar = document.createElement("div");
    bar.className = "mobile-filter-bar-v150";
    const dateClone = date ? date.cloneNode(true) : document.createElement("input");
    dateClone.id = "mobileDateFilterV150";
    dateClone.setAttribute("aria-label", "Date");
    const stateClone = state ? state.cloneNode(true) : document.createElement("select");
    stateClone.id = "mobileMatchStateV150";
    stateClone.setAttribute("aria-label", "Match state");
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.innerHTML = `Filters <span id="filterCountV150">0</span>`;
    bar.append(dateClone, stateClone, toggle);
    toolbar.insertAdjacentElement("beforebegin", bar);

    const closeRow = document.createElement("div");
    closeRow.className = "filter-sheet-close-v150";
    closeRow.innerHTML = `<strong>Filters</strong><button type="button" aria-label="Close filters">×</button>`;
    toolbar.insertAdjacentElement("afterbegin", closeRow);

    const countEl = bar.querySelector("#filterCountV150");
    const filterControls = [...toolbar.querySelectorAll("select,input")].filter(el => el.id !== "dateFilter");
    const updateCount = () => {
      const count = filterControls.filter(el => String(el.value || "").trim()).length;
      countEl.textContent = count;
    };
    toggle.addEventListener("click", () => document.body.classList.add("filters-open-v150"));
    closeRow.querySelector("button").addEventListener("click", () => document.body.classList.remove("filters-open-v150"));
    document.addEventListener("keydown", e => { if (e.key === "Escape") document.body.classList.remove("filters-open-v150"); });

    if (date) {
      dateClone.value = date.value;
      dateClone.addEventListener("change", () => {
        date.value = dateClone.value;
        date.dispatchEvent(new Event("change", { bubbles: true }));
      });
      date.addEventListener("change", () => { dateClone.value = date.value; });
    }
    if (state) {
      stateClone.value = state.value;
      stateClone.addEventListener("change", () => {
        state.value = stateClone.value;
        state.dispatchEvent(new Event("change", { bubbles: true }));
      });
      state.addEventListener("change", () => { stateClone.value = state.value; updateCount(); });
    }
    filterControls.forEach(el => {
      el.addEventListener("change", updateCount);
      el.addEventListener("input", updateCount);
    });
    updateCount();
  }

  // Make active top-level navigation consistent.
  document.querySelectorAll(".desktop-nav a, .portal-nav a").forEach(link => {
    const href = (link.getAttribute("href") || "").split("#")[0].toLowerCase();
    link.classList.toggle("active", href === path || (path === "" && href === "index.html"));
  });
})();
