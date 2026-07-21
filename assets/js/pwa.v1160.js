(() => {
  "use strict";

  const INSTALL_DISMISSED_KEY = "betspapa-install-dismissed-at";
  const WALKTHROUGH_KEY = "betspapa-walkthrough-v1-complete";
  const DISMISS_FOR_MS = 3 * 24 * 60 * 60 * 1000;
  const TOUR_SLIDES = [
    {
      kicker: "WELCOME",
      title: "Meet Papa.",
      description:
        "BetsPapa turns football data into one clear match story, one practical direction and an honest strength label.",
      points: [
        "Football intelligence explained in plain language.",
        "No hidden subscription or account required.",
        "Analytics are not guarantees. Use responsibly. 18+."
      ],
      visual: `
        <div class="bp-tour-logo-stage">
          <img src="/assets/images/pwa-brand-icon-512.png" alt="BetsPapa official app logo">
        </div>`
    },
    {
      kicker: "TODAY",
      title: "Start with today’s match board.",
      description:
        "See the featured Papa analysis first, then scan every fixture by status, market, strength and kickoff time.",
      points: [
        "Qualified analyses are promoted clearly.",
        "Directional calls stay visually quieter.",
        "Open any card to see the full reasoning."
      ],
      visual: `
        <div class="bp-tour-dashboard" aria-hidden="true">
          <div class="bp-tour-window">
            <div class="bp-tour-window-bar"><i></i><i></i><i></i></div>
            <div class="bp-tour-window-body">
              <div class="bp-tour-status-row">
                <span>ALL 18</span><span>LIVE 2</span><span>PENDING 13</span><span>SETTLED 3</span>
              </div>
              <article class="bp-tour-mini-match">
                <header><small>PAPA’S PICK</small><small>82/100</small></header>
                <b>Home Team vs Away Team</b>
                <strong>Home Team to Win Either Half</strong>
                <footer><span>Qualified</span><span>Open reasoning →</span></footer>
              </article>
            </div>
          </div>
        </div>`
    },
    {
      kicker: "PICK LEVELS",
      title: "Know what each label means.",
      description:
        "Papa’s Pick gives the practical match direction. Boss Picks use the strict OMNI gate and publish nothing when the evidence fails.",
      points: [
        "Papa’s Pick: practical common-sense market.",
        "Boss Pick: strict 80/100 or higher rule score.",
        "No forced Boss Pick when the mandatory gates fail."
      ],
      visual: `
        <div class="bp-tour-boss" aria-hidden="true">
          <div class="bp-tour-boss-shield">B</div>
          <div class="bp-tour-engine-row">
            <span>BOSS<br>STRICT</span>
            <span>PAPA<br>PRACTICAL</span>
            <span>SAFER<br>PROTECTED</span>
          </div>
        </div>`
    },
    {
      kicker: "LIVE & FIXTURES",
      title: "Follow every match state.",
      description:
        "Pending, Live, Settling and Settled are shown clearly. Live scores refresh without moving your place on the page.",
      points: [
        "Current score and match minute when live.",
        "Automatic WIN, LOSS or VOID settlement.",
        "Postponed and review states are never guessed."
      ],
      visual: `
        <div class="bp-tour-live" aria-hidden="true">
          <div class="bp-tour-live-pill">LIVE 67′</div>
          <div class="bp-tour-live-score">
            <div><b>Home Team</b><small>Published direction</small></div>
            <strong>2–1</strong>
            <div><b>Away Team</b><small>Half-time 1–0</small></div>
          </div>
          <div class="bp-tour-timeline"><span></span><span></span><span></span><span></span></div>
        </div>`
    },
    {
      kicker: "RESULTS & TRUST",
      title: "Check the proof, not the hype.",
      description:
        "The Results page keeps the original analysis, rule score, final score and outcome together so performance remains transparent.",
      points: [
        "See the graded sample behind every percentage.",
        "Compare Papa, Boss, Aggressive, Safer and Venue.",
        "Reopen this tour anytime from the Today page footer."
      ],
      visual: `
        <div class="bp-tour-results" aria-hidden="true">
          <div class="bp-tour-result-row"><b>WIN</b><span>Home Team Win Either Half</span><small>2–1</small></div>
          <div class="bp-tour-result-row"><b>WIN</b><span>First Half Over 0.5</span><small>1–0 HT</small></div>
          <div class="bp-tour-result-row"><b>LOSS</b><span>Under 3.5</span><small>3–1</small></div>
        </div>`
    }
  ];

  let deferredPrompt = window.__BETSPAPA_INSTALL_PROMPT__ || null;
  let installWaitsForTour = false;
  let tourIndex = 0;
  let previousFocus = null;
  let touchStartX = null;

  const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  const isIos = () =>
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !window.MSStream;

  const safeStorageGet = (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const safeStorageSet = (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // A blocked localStorage must never break the public site.
    }
  };

  const safeStorageRemove = (key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore storage restrictions.
    }
  };

  function isTourOpen() {
    return document.documentElement.classList.contains("bp-walkthrough-open");
  }

  function finishSplash() {
    const splash = document.getElementById("pwaSplash");
    if (!document.documentElement.classList.contains("pwa-launching")) return;

    window.setTimeout(() => {
      splash?.classList.add("is-leaving");
      window.setTimeout(() => {
        document.documentElement.classList.remove("pwa-launching");
        splash?.remove();
      }, 460);
    }, 1250);
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || location.protocol !== "https:") return;

    window.addEventListener("load", async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none"
        });
        registration.update().catch(() => {});
      } catch (error) {
        console.warn("BetsPapa PWA registration failed:", error);
      }
    }, { once: true });
  }

  function recentlyDismissed() {
    const value = Number(safeStorageGet(INSTALL_DISMISSED_KEY) || 0);
    return value && Date.now() - value < DISMISS_FOR_MS;
  }

  function buildInstallUi() {
    if (isStandalone()) return null;

    let card = document.getElementById("pwaInstallCard");
    if (card) return card;

    card = document.createElement("aside");
    card.className = "pwa-install-card";
    card.id = "pwaInstallCard";
    card.setAttribute("aria-label", "Install BetsPapa app");
    card.innerHTML = `
      <img class="pwa-install-icon" src="/assets/images/pwa-brand-maskable-192.png" alt="">
      <div class="pwa-install-copy">
        <small>Install the branded app</small>
        <strong>BetsPapa on your home screen</strong>
        <p>Use the official BetsPapa logo, full-screen mode and custom launch screen.</p>
      </div>
      <div class="pwa-install-actions">
        <button class="pwa-install-button" id="pwaInstallButton" type="button">Install BetsPapa</button>
        <button class="pwa-install-dismiss" id="pwaInstallDismiss" type="button">Not now</button>
      </div>`;
    document.body.appendChild(card);

    document.getElementById("pwaInstallDismiss")?.addEventListener("click", () => {
      safeStorageSet(INSTALL_DISMISSED_KEY, String(Date.now()));
      card.classList.remove("is-visible");
    });

    document.getElementById("pwaInstallButton")?.addEventListener("click", promptInstall);
    return card;
  }

  function buildIosSheet() {
    if (document.getElementById("pwaIosSheet")) return;

    const sheet = document.createElement("div");
    sheet.className = "pwa-ios-sheet";
    sheet.id = "pwaIosSheet";
    sheet.innerHTML = `
      <section class="pwa-ios-panel" role="dialog" aria-modal="true" aria-labelledby="pwaIosTitle">
        <h2 id="pwaIosTitle">Install BetsPapa on iPhone or iPad</h2>
        <p>Safari uses Add to Home Screen instead of an automatic install popup.</p>
        <div class="pwa-ios-steps">
          <div class="pwa-ios-step"><b>1</b><span>Tap the Safari <strong>Share</strong> button.</span></div>
          <div class="pwa-ios-step"><b>2</b><span>Choose <strong>Add to Home Screen</strong>.</span></div>
          <div class="pwa-ios-step"><b>3</b><span>Confirm the official BetsPapa logo and tap <strong>Add</strong>.</span></div>
        </div>
        <button class="pwa-ios-close" id="pwaIosClose" type="button">Got it</button>
      </section>`;
    document.body.appendChild(sheet);

    const close = () => sheet.classList.remove("is-open");
    document.getElementById("pwaIosClose")?.addEventListener("click", close);
    sheet.addEventListener("click", (event) => {
      if (event.target === sheet) close();
    });
  }

  function showInstallUi() {
    if (isTourOpen()) {
      installWaitsForTour = true;
      return;
    }
    if (isStandalone() || recentlyDismissed()) return;

    const card = buildInstallUi();
    card?.classList.add("is-visible");

    document.querySelectorAll("[data-pwa-install], #pwaInstallPrimary").forEach((button) => {
      button.hidden = false;
      if (button.dataset.pwaBound === "true") return;
      button.dataset.pwaBound = "true";
      button.addEventListener("click", promptInstall);
    });
  }

  async function promptInstall() {
    if (isIos() && !isStandalone()) {
      buildIosSheet();
      document.getElementById("pwaIosSheet")?.classList.add("is-open");
      return;
    }

    if (!deferredPrompt) {
      const card = buildInstallUi();
      const copy = card?.querySelector(".pwa-install-copy p");
      if (copy) {
        copy.textContent = "Open your browser menu and choose Install app or Add to Home screen.";
      }
      return;
    }

    try {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice?.outcome === "accepted") {
        document.getElementById("pwaInstallCard")?.classList.remove("is-visible");
      }
    } catch (error) {
      console.warn("BetsPapa install prompt failed:", error);
    } finally {
      deferredPrompt = null;
      window.__BETSPAPA_INSTALL_PROMPT__ = null;
    }
  }

  function tourHtml() {
    const slides = TOUR_SLIDES.map((slide, index) => `
      <article
        class="bp-walkthrough-slide${index === 0 ? " is-active" : ""}"
        data-tour-slide="${index}"
        aria-hidden="${index === 0 ? "false" : "true"}">
        <div class="bp-walkthrough-visual">${slide.visual}</div>
        <div class="bp-walkthrough-copy">
          <span class="bp-walkthrough-kicker">${slide.kicker}</span>
          <h2>${slide.title}</h2>
          <p>${slide.description}</p>
          <ul class="bp-walkthrough-points">
            ${slide.points.map((point) => `<li>${point}</li>`).join("")}
          </ul>
        </div>
      </article>`).join("");

    const dots = TOUR_SLIDES.map((_, index) => `
      <span class="bp-walkthrough-dot${index === 0 ? " is-active" : ""}" data-tour-dot="${index}"></span>
    `).join("");

    return `
      <aside class="bp-walkthrough" id="bpWalkthrough" aria-hidden="true">
        <section
          class="bp-walkthrough-shell"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bpWalkthroughTitle">
          <header class="bp-walkthrough-topbar">
            <div class="bp-walkthrough-brand">
              <img src="/assets/images/pwa-brand-icon-192.png" alt="">
              <span>
                <strong id="bpWalkthroughTitle">BetsPapa App Tour</strong>
                <small>Papa Knows the Game</small>
              </span>
            </div>
            <button class="bp-walkthrough-skip" data-tour-skip type="button">Skip tour</button>
          </header>
          <div class="bp-walkthrough-content">${slides}</div>
          <footer class="bp-walkthrough-footer">
            <button class="bp-walkthrough-back" data-tour-back type="button" disabled>Back</button>
            <div class="bp-walkthrough-progress" aria-live="polite">
              <span class="bp-walkthrough-count" data-tour-count>1 of ${TOUR_SLIDES.length}</span>
              <div class="bp-walkthrough-dots" aria-hidden="true">${dots}</div>
            </div>
            <button class="bp-walkthrough-next" data-tour-next type="button">Next</button>
          </footer>
        </section>
      </aside>`;
  }

  function buildWalkthrough() {
    let tour = document.getElementById("bpWalkthrough");
    if (tour) return tour;

    document.body.insertAdjacentHTML("beforeend", tourHtml());
    tour = document.getElementById("bpWalkthrough");

    tour.querySelector("[data-tour-skip]")?.addEventListener("click", () => closeWalkthrough(true));
    tour.querySelector("[data-tour-back]")?.addEventListener("click", () => setTourIndex(tourIndex - 1));
    tour.querySelector("[data-tour-next]")?.addEventListener("click", () => {
      if (tourIndex >= TOUR_SLIDES.length - 1) {
        closeWalkthrough(true);
      } else {
        setTourIndex(tourIndex + 1);
      }
    });

    tour.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse") return;
      touchStartX = event.clientX;
    });
    tour.addEventListener("pointerup", (event) => {
      if (touchStartX === null) return;
      const delta = event.clientX - touchStartX;
      touchStartX = null;
      if (Math.abs(delta) < 48) return;
      if (delta < 0 && tourIndex < TOUR_SLIDES.length - 1) {
        setTourIndex(tourIndex + 1);
      } else if (delta > 0 && tourIndex > 0) {
        setTourIndex(tourIndex - 1);
      }
    });

    return tour;
  }

  function setTourIndex(nextIndex) {
    const tour = document.getElementById("bpWalkthrough");
    if (!tour) return;

    tourIndex = Math.max(0, Math.min(TOUR_SLIDES.length - 1, nextIndex));

    tour.querySelectorAll("[data-tour-slide]").forEach((slide, index) => {
      const active = index === tourIndex;
      slide.classList.toggle("is-active", active);
      slide.setAttribute("aria-hidden", String(!active));
    });

    tour.querySelectorAll("[data-tour-dot]").forEach((dot, index) => {
      dot.classList.toggle("is-active", index === tourIndex);
    });

    const back = tour.querySelector("[data-tour-back]");
    const next = tour.querySelector("[data-tour-next]");
    const count = tour.querySelector("[data-tour-count]");

    if (back) back.disabled = tourIndex === 0;
    if (next) next.textContent = tourIndex === TOUR_SLIDES.length - 1 ? "Start exploring" : "Next";
    if (count) count.textContent = `${tourIndex + 1} of ${TOUR_SLIDES.length}`;
  }

  function getFocusableTourElements() {
    const tour = document.getElementById("bpWalkthrough");
    return tour
      ? [...tour.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
      : [];
  }

  function handleTourKeydown(event) {
    if (!isTourOpen()) return;

    if (event.key === "ArrowRight") {
      event.preventDefault();
      if (tourIndex < TOUR_SLIDES.length - 1) setTourIndex(tourIndex + 1);
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (tourIndex > 0) setTourIndex(tourIndex - 1);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeWalkthrough(true);
      return;
    }

    if (event.key !== "Tab") return;
    const focusable = getFocusableTourElements();
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function openWalkthrough({ force = false } = {}) {
    const dashboard = document.body?.dataset.page === "dashboard";
    if (!dashboard && !force) return;

    previousFocus = document.activeElement;
    tourIndex = 0;
    const tour = buildWalkthrough();
    setTourIndex(0);

    document.documentElement.classList.add("bp-walkthrough-open");
    tour.setAttribute("aria-hidden", "false");
    window.requestAnimationFrame(() => {
      tour.classList.add("is-open");
      tour.querySelector("[data-tour-skip]")?.focus();
    });
  }

  function closeWalkthrough(markComplete = true) {
    const tour = document.getElementById("bpWalkthrough");
    if (!tour) return;

    if (markComplete) {
      safeStorageSet(WALKTHROUGH_KEY, "1");
    }

    tour.classList.remove("is-open");
    tour.setAttribute("aria-hidden", "true");
    document.documentElement.classList.remove("bp-walkthrough-open");
    previousFocus?.focus?.();

    window.setTimeout(() => {
      if (installWaitsForTour || deferredPrompt || (isIos() && !isStandalone())) {
        installWaitsForTour = false;
        showInstallUi();
      }
    }, 650);
  }

  function shouldAutoOpenWalkthrough() {
    const params = new URLSearchParams(location.search);
    const forced = params.get("tour") === "1";
    const skipped = params.get("skipTour") === "1";
    const dashboard = document.body?.dataset.page === "dashboard";

    if (skipped || !dashboard) return false;
    return forced || safeStorageGet(WALKTHROUGH_KEY) !== "1";
  }

  window.BetsPapaWalkthrough = {
    open: () => openWalkthrough({ force: true }),
    reset: () => {
      safeStorageRemove(WALKTHROUGH_KEY);
      openWalkthrough({ force: true });
    },
    isComplete: () => safeStorageGet(WALKTHROUGH_KEY) === "1"
  };

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    window.__BETSPAPA_INSTALL_PROMPT__ = event;
    showInstallUi();
  });

  window.addEventListener("appinstalled", () => {
    safeStorageRemove(INSTALL_DISMISSED_KEY);
    document.getElementById("pwaInstallCard")?.remove();
    document.querySelectorAll("[data-pwa-install], #pwaInstallPrimary").forEach((button) => {
      button.hidden = true;
    });
  });

  document.addEventListener("keydown", handleTourKeydown);

  window.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-start-walkthrough]").forEach((button) => {
      button.addEventListener("click", () => openWalkthrough({ force: true }));
    });

    const shouldTour = shouldAutoOpenWalkthrough();
    if (shouldTour) {
      installWaitsForTour = true;
      const delay = document.documentElement.classList.contains("pwa-launching") ? 1650 : 520;
      window.setTimeout(() => openWalkthrough({ force: true }), delay);
    } else if (isIos() && !isStandalone()) {
      window.setTimeout(showInstallUi, 900);
    } else if (deferredPrompt) {
      showInstallUi();
    }

    finishSplash();
  }, { once: true });

  window.addEventListener("load", finishSplash, { once: true });
  registerServiceWorker();
})();