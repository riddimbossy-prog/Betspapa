const CACHE_NAME = "betspapa-pwa-v1130";
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
  "/bankers.html",
  "/results-intelligence.html",
  "/privacy.html",
  "/terms.html",
  "/responsible.html",
  "/assets/css/styles.v1101.css",
  "/assets/css/portal.v120.css",
  "/assets/css/mobile-nav.v111.css",
  "/assets/css/content.v111.css",
  "/assets/css/pwa.v1103.css",
  "/assets/js/app.v1101.js",
  "/assets/js/portal.v130.js",
  "/assets/js/mobile-nav.v120.js",
  "/assets/js/pwa.v1103.js",
  "/assets/images/icon-192.png",
  "/assets/images/icon-512.png",
  "/assets/images/icon-maskable-192.png",
  "/assets/images/icon-maskable-512.png",
  "/assets/images/apple-touch-icon-180.png",
  "/assets/images/betspapa-papa-mark.png",
  "/assets/images/betspapa-logo.webp",
  "/assets/images/pwa-splash-portrait.jpg",
  "/assets/images/pwa-splash-landscape.jpg"
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
