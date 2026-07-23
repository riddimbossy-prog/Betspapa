const CACHE_NAME = "betspapa-pwa-v1181";
const OFFLINE_URL = "/offline.html";

const CORE_ASSETS = [
  "/",
  "/index.html",
  "/offline.html",
  "/manifest.webmanifest",
  "/papas-pick.html",
  "/aggressive.html",
  "/safer.html",
  "/venue-pattern.html",
  "/boss-picks.html",
  "/live-fixtures.html",
  "/bankers.html",
  "/results-intelligence.html",
  "/privacy.html",
  "/terms.html",
  "/responsible.html",
  "/assets/css/styles.v140.css",
  "/assets/css/country-flags.v1175.css",
  "/assets/css/portal.v1181.css",
  "/assets/css/mobile-nav.v111.css",
  "/assets/css/content.v111.css",
  "/assets/css/pwa.v1160.css",
  "/assets/css/ui.v151.css",
  "/assets/css/today.v153.css",
  "/assets/css/live-fixtures.v151.css",
  "/assets/css/bankers.v1170.css",
  "/assets/js/country-flags.v1175.js",
  "/assets/js/app.v1162.js",
  "/assets/js/today.v152.js",
  "/assets/js/portal.v1181.js",
  "/assets/js/mobile-nav.v1170.js",
  "/assets/js/pwa.v1160.js",
  "/assets/js/ui.v1170.js",
  "/assets/js/live-fixtures.v152.js",
  "/assets/images/pwa-brand-icon-192.png",
  "/assets/images/pwa-brand-icon-512.png",
  "/assets/images/pwa-brand-maskable-192.png",
  "/assets/images/pwa-brand-maskable-512.png",
  "/assets/images/pwa-brand-apple-180.png",
  "/assets/images/betspapa-papa-mark.png",
  "/assets/images/betspapa-logo.webp",
  "/assets/images/pwa-brand-splash-portrait.jpg",
  "/assets/images/pwa-brand-splash-landscape.jpg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request, { ignoreSearch: true });
    return cached || caches.match(OFFLINE_URL);
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  const fetchPromise = fetch(request)
    .then(async (response) => {
      if (response && response.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => null);

  return cached || fetchPromise || Response.error();
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/admin/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  if (/\.(?:css|js|png|jpg|jpeg|webp|svg|woff2?|webmanifest)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
