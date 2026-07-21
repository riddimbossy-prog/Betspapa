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
  "/bankers.html",
  "/results-intelligence.html",
  "/account.html",
  "/watchlist.html",
  "/settings.html",
  "/privacy.html",
  "/terms.html",
  "/responsible.html",
  "/assets/css/styles.v1101.css",
  "/assets/css/portal.v112.css",
  "/assets/css/mobile-nav.v111.css",
  "/assets/css/content.v111.css",
  "/assets/css/pwa.v1110.css",
  "/assets/css/account.v1110.css",
  "/assets/js/app.v1101.js",
  "/assets/js/portal.v111.js",
  "/assets/js/mobile-nav.v111.js",
  "/assets/js/pwa.v1110.js",
  "/assets/js/auth.v1110.js",
  "/assets/js/account-pages.v1110.js",
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


self.addEventListener("push", (event) => {
  let payload = {
    title: "BetsPapa update",
    body: "Open BetsPapa for the latest football intelligence.",
    url: "/",
    tag: "betspapa-update"
  };

  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    payload.body = event.data?.text() || payload.body;
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || "/assets/images/icon-maskable-192.png",
      badge: payload.badge || "/assets/images/favicon-64.png",
      tag: payload.tag,
      data: {
        url: payload.url || "/"
      },
      timestamp: payload.timestamp || Date.now(),
      renotify: false
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    event.notification.data?.url || "/",
    self.location.origin
  ).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        const existing = windows.find((client) => client.url === target);
        if (existing) return existing.focus();
        return clients.openWindow(target);
      })
  );
});
