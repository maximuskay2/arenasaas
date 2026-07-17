/* Arena Grid — minimal offline shell for PWA install / mobile check-in.
   Only registered in production (see src/main.jsx). Do not cache Vite dep chunks. */
const CACHE = "arena-grid-shell-v2";
const PRECACHE = ["/", "/index.html", "/manifest.json", "/favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => undefined)
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never cache API, sockets, or hashed JS bundles (prevents stale chunk 404s)
  if (url.pathname.startsWith("/api")) return;
  if (url.pathname.includes("/node_modules/.vite/")) return;
  if (url.pathname.match(/\/assets\/.+\.js$/)) return;
  if (url.pathname.match(/chunk-[A-Z0-9]+\.js$/i)) return;

  // Network-first for navigations; cache only shell static assets
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match(request).then((c) => c || caches.match("/index.html")))
    );
    return;
  }

  if (url.pathname.match(/\.(svg|png|woff2?|json)$/)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const copy = res.clone();
            if (res.ok) caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => undefined);
            return res;
          })
      )
    );
  }
});
