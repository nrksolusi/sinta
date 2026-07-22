// Minimal service worker for installability (D12: PWA, online-only - no offline
// data sync). It does no API caching: /v1 requests always hit the network so
// stock data is never stale. It only caches static asset GETs (JS/CSS/fonts/
// images) so a return visit paints faster; the network is still tried first.

const CACHE = "sinta-assets-v1";

self.addEventListener("install", () => {
  // Take over as soon as installed; no precache list to keep this simple.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from older versions.
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// Same-origin static assets we are willing to cache at runtime. Everything
// else (API, navigations, cross-origin) goes straight to the network.
function isCacheableAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/v1")) return false;
  return /\.(?:js|css|woff2?|ttf|svg|png|jpg|jpeg|webp|ico|webmanifest)$/.test(
    url.pathname,
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (!isCacheableAsset(url)) return;

  // Network-first: fresh when online, cached copy as a fast/last resort.
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE);
          cache.put(request, response.clone());
        }
        return response;
      } catch (err) {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw err;
      }
    })(),
  );
});
