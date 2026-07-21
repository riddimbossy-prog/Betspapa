(() => {
  "use strict";

  if (location.pathname.startsWith("/admin")) return;

  function start() {
    if (document.getElementById("bpMobileNav")) return;

    const root = location.protocol === "file:" ? "" : "/";
    const file = location.pathname.replace(/\/+$/, "").split("/").pop() || "index.html";

    const active = (() => {
      if (!file || file === "index.html") return "home";
      if (file === "papas-pick.html") return "picks";
      if (file === "bankers.html") return "bankers";
      if (file === "results-intelligence.html") return "results";
      return "more";
    })();

    const link = (path) => `${root}${path}`;
    document.body.classList.add("has-bp-mobile-nav");

    document.body.insertAdjacentHTML("beforeend", `
      <nav class="bp-mobile-nav" id="bpMobileNav" aria-label="Mobile navigation">
        <a href="${link("index.html")}" data-bp-tab="home" aria-label="Home">
          <span aria-hidden="true">⌂</span><small>Home</small>
        </a>
        <a href="${link("papas-pick.html")}" data-bp-tab="picks" aria-label="Papa's Pick">
          <span aria-hidden="true">★</span><small>Papa's Pick</small>
        </a>
        <a href="${link("bankers.html")}" data-bp-tab="bankers" aria-label="Consensus Bankers">
          <span aria-hidden="true">◆</span><small>Bankers</small>
        </a>
        <a href="${link("results-intelligence.html")}" data-bp-tab="results" aria-label="Results">
          <span aria-hidden="true">✓</span><small>Results</small>
        </a>
        <button type="button" id="bpMobileMore" data-bp-tab="more" aria-label="More pages" aria-expanded="false">
          <span aria-hidden="true">☰</span><small>More</small>
        </button>
      </nav>

      <div class="bp-mobile-sheet-backdrop" id="bpMobileSheetBackdrop" hidden>
        <section class="bp-mobile-sheet" role="dialog" aria-modal="true" aria-labelledby="bpMobileSheetTitle">
          <header>
            <strong id="bpMobileSheetTitle">More BetsPapa pages</strong>
            <button class="bp-mobile-sheet-close" id="bpMobileSheetClose" type="button" aria-label="Close">×</button>
          </header>
          <div class="bp-mobile-sheet-grid">
            <a href="${link("boss-picks.html")}"><strong>Boss Picks</strong><small>Strict OMNI-gated selections</small></a>
            <a href="${link("live-fixtures.html")}"><strong>Live & Fixtures</strong><small>Pending matches, live scores and settlement</small></a>
            <a href="${link("aggressive.html")}"><strong>Aggressive</strong><small>Sharper, higher-variance picks</small></a>
            <a href="${link("safer.html")}"><strong>Safer</strong><small>Protected match directions</small></a>
            <a href="${link("venue-pattern.html")}"><strong>Venue Pattern</strong><small>Home venue vs away opposite</small></a>
            <a href="${link("responsible.html")}"><strong>Responsible Use</strong><small>Limits and safe-use guidance</small></a>
            <a href="${link("privacy.html")}"><strong>Privacy</strong><small>How site information is handled</small></a>
            <a href="${link("terms.html")}"><strong>Terms</strong><small>Use of BetsPapa content</small></a>
          </div>
        </section>
      </div>
    `);

    document.querySelector(`[data-bp-tab="${active}"]`)?.classList.add("active");
    document.querySelector(`[data-bp-tab="${active}"]`)?.setAttribute("aria-current", "page");

    const more = document.getElementById("bpMobileMore");
    const backdrop = document.getElementById("bpMobileSheetBackdrop");
    const close = document.getElementById("bpMobileSheetClose");
    const sheet = backdrop?.querySelector(".bp-mobile-sheet");

    const setOpen = (open) => {
      if (!backdrop || !more) return;
      backdrop.hidden = !open;
      more.setAttribute("aria-expanded", String(open));
      document.body.classList.toggle("bp-mobile-sheet-open", open);
      if (open) close?.focus({ preventScroll: true });
    };

    more?.addEventListener("click", () => setOpen(true));
    close?.addEventListener("click", () => setOpen(false));
    backdrop?.addEventListener("click", (event) => {
      if (event.target === backdrop) setOpen(false);
    });
    sheet?.addEventListener("click", (event) => event.stopPropagation());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !backdrop?.hidden) setOpen(false);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
