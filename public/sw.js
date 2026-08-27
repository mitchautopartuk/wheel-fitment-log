// Service worker — enables "Install this site as an app". Uses a
// network-first strategy (not cache-first) so a redeploy is always picked
// up on next load, with the cache only as an offline fallback. The cache
// name is versioned; bump it whenever this file's caching behaviour
// changes so old caches get cleaned out.
const CACHE_NAME = "wheel-fitment-shell-v5";
const SHELL_FILES = ["./", "./index.html", "./manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Never touch the live catalogue, manufacturer/country data, or API calls
  // — those must always be fresh, and are same-origin/cross-origin fetches
  // handled by the page itself.
  if (url.pathname.includes("/api/") || url.pathname.endsWith(".json") || url.hostname !== self.location.hostname) {
    return;
  }
  // Network-first: always try to get the latest file. Only fall back to
  // the cache if the network request fails (e.g. offline).
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
