const CACHE_NAME = "betspapa-pwa-v1261";
const OFFLINE_URL = "/offline.html";

const CORE_ASSETS = [
  "/offline.html",
  "/manifest.webmanifest",
  "/assets/css/daylight.v1260.css",
  "/assets/css/portal.v1220.css",
  "/assets/css/ui.v151.css",
  "/assets/css/mobile-nav.v1240.css",
  "/assets/css/bankers.v1250.css",
  "/assets/css/wins-board.v1260.css",
  "/assets/images/pwa-brand-icon-192.png",
  "/assets/images/pwa-brand-icon-512.png",
  "/assets/images/pwa-brand-maskable-192.png",
  "/assets/images/pwa-brand-maskable-512.png",
  "/assets/images/pwa-brand-apple-180.png",
  "/assets/images/betspapa-papa-mark.png"
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
      .then(() => self.clients.matchAll({ type: "window" }))
      .then((clients) => {
        clients.forEach((client) => {
          if (client.url && typeof client.navigate === "function") {
            client.navigate(client.url);
          }
        });
      })
  );
});

async function networkFirst(request) {
  try {
    const response = await fetch(request, { cache: "no-store" });
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

  if (request.mode === "navigate" || /\.(?:html?)$/i.test(url.pathname) || url.pathname === "/") {
    event.respondWith(networkFirst(request));
    return;
  }

  if (/\.(?:css|js|webmanifest)$/i.test(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (/\.(?:png|jpg|jpeg|webp|svg|woff2?)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
