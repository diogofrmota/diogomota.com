// The service worker of the apps (registered by components/common/OfflineSupport
// in production): Shared and Shows open without a connection, with what they
// last showed (their data is kept by components/common/QueryProvider, and their
// changes wait there for the connection).
//
// - Home and the apps' pages (/, /shared, /shows and their views): from the
//   network, and the copy from the last time they loaded when it can't be
//   reached, so the installed app (which starts on home) opens offline.
// - Next.js's built files (/_next/static, whose names change with their
//   content), the icons and the logos: from this cache once fetched.
// - Everything else, the APIs too, goes to the network as usual.
// Logging out deletes the cache (clearOfflineData).

const cacheName = "diogomota-offline-v1";
const appPages = /^\/((shared|shows)(\/|$)|$)/;
const staticFiles = /^\/(_next\/static|icons|logos)\//;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== cacheName).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate" && appPages.test(url.pathname)) {
    // One copy per view, whatever panels its URL had open.
    const key = new Request(url.origin + url.pathname);
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && !response.redirected) {
            const copy = response.clone();
            void caches.open(cacheName).then((cache) => cache.put(key, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(key)) ?? Response.error()),
    );
    return;
  }

  if (staticFiles.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(cacheName).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
