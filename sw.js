const CACHE_NAME = "betspapa-screens-20260912j";
const OFFLINE_URL = "/offline.html";

const CORE_ASSETS = [
  "/",
  "/offline.html",
  "/manifest.webmanifest",
  "/assets/css/screens-app.css",
  "/assets/js/screens-app.js",
  "/assets/images/logo-papa.png",
  "/assets/images/papa-square.png",
  "/assets/images/betspapa-papa-mark.png",
  "/assets/images/pwa-brand-icon-192.png",
  "/assets/images/pwa-brand-icon-512.png",
  "/assets/images/favicon-64.png"
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
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response && response.ok && request.method === "GET") {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request, { ignoreSearch: true });
    return cached || caches.match(OFFLINE_URL);
  }
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  if (url.origin !== location.origin) return;
  event.respondWith(networkFirst(event.request));
});
