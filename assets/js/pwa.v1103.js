(() => {
  "use strict";

  const INSTALL_DISMISSED_KEY = "betspapa-install-dismissed-at";
  const DISMISS_FOR_MS = 3 * 24 * 60 * 60 * 1000;
  let deferredPrompt = window.__BETSPAPA_INSTALL_PROMPT__ || null;

  const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  const isIos = () =>
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !window.MSStream;

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
    const value = Number(localStorage.getItem(INSTALL_DISMISSED_KEY) || 0);
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
      <img class="pwa-install-icon" src="/assets/images/icon-maskable-192.png" alt="">
      <div class="pwa-install-copy">
        <small>Install the full app</small>
        <strong>BetsPapa on your home screen</strong>
        <p>Open faster, use full-screen mode and get Papa’s custom launch screen.</p>
      </div>
      <div class="pwa-install-actions">
        <button class="pwa-install-button" id="pwaInstallButton" type="button">Install BetsPapa</button>
        <button class="pwa-install-dismiss" id="pwaInstallDismiss" type="button">Not now</button>
      </div>`;
    document.body.appendChild(card);

    document.getElementById("pwaInstallDismiss")?.addEventListener("click", () => {
      localStorage.setItem(INSTALL_DISMISSED_KEY, String(Date.now()));
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
          <div class="pwa-ios-step"><b>3</b><span>Tap <strong>Add</strong> to install BetsPapa.</span></div>
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
    if (isStandalone() || recentlyDismissed()) return;
    const card = buildInstallUi();
    card?.classList.add("is-visible");

    document.querySelectorAll("[data-pwa-install], #pwaInstallPrimary").forEach((button) => {
      button.hidden = false;
      button.addEventListener("click", promptInstall, { once: false });
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

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    window.__BETSPAPA_INSTALL_PROMPT__ = event;
    showInstallUi();
  });

  window.addEventListener("appinstalled", () => {
    localStorage.removeItem(INSTALL_DISMISSED_KEY);
    document.getElementById("pwaInstallCard")?.remove();
    document.querySelectorAll("[data-pwa-install], #pwaInstallPrimary").forEach((button) => {
      button.hidden = true;
    });
  });

  window.addEventListener("DOMContentLoaded", () => {
    if (isIos() && !isStandalone()) {
      window.setTimeout(showInstallUi, 900);
    } else if (deferredPrompt) {
      showInstallUi();
    }

    finishSplash();
  }, { once: true });

  window.addEventListener("load", finishSplash, { once: true });
  registerServiceWorker();
})();
