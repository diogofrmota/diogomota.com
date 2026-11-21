// The service worker of the apps (registered by components/common/OfflineSupport
// in production): Calendar, Tasks, Recipes, Shows, Books and Fitness open without a connection, with what
// they last showed (their data is kept by components/common/QueryProvider, and
// their changes wait there for the connection; recipes' photos are kept by the
// browser, which may keep them for good: /api/recipes/photos).
//
// - Home and the apps' pages (/, /calendar, /tasks, /couples, /recipes, /shows, /books, /fitness
//   and their views): from the network, and the copy from the last time they
//   loaded when it can't be reached, so the installed app (which starts on
//   home) opens offline.
// - Next.js's built files (/_next/static, whose names change with their
//   content), the icons and the logos: from this cache once fetched.
// - Everything else, the APIs too, goes to the network as usual.
// Logging out deletes the cache (clearOfflineData). v3: For Couples' apps
// moved (/shared to /calendar, /tasks and /couples), so the pages kept at
// their old addresses go with the old cache.

const cacheName = "diogomota-offline-v3";
// Only the owner's Books shelves, never another member's profile document.
const appPages = /^\/((calendar|tasks|couples|shows|recipes|fitness)(\/|$)|books(?:\/(?:library|discover|profile))?\/?$|$)/;
const staticFiles = /^\/(_next\/static|icons|logos)\//;
let generation = 0;
const writes = new Set();
const unavailable = () => new Response(
  '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>View unavailable offline</title><main><h1>This view is not available offline.</h1><p>Reconnect to open it, then it can be kept on this device.</p></main></html>',
  { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
);

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CLEAR_ACCOUNT") return;
  generation++;
  event.waitUntil((async () => {
    await Promise.allSettled([...writes]);
    await Promise.all((await caches.keys()).filter((key) => key.startsWith("diogomota-")).map((key) => caches.delete(key)));
    event.ports[0]?.postMessage({ cleared: true });
  })());
});

function keep(event, key, response, started) {
  const write = (async () => {
    if (started !== generation) return;
    const cache = await caches.open(cacheName);
    if (started === generation) await cache.put(key, response);
  })();
  writes.add(write);
  event.waitUntil(write.finally(() => writes.delete(write)));
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("diogomota-") && key !== cacheName).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const started = generation;
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate" && appPages.test(url.pathname)) {
    // One copy per view, whatever panels its URL had open.
    const key = new Request(url.origin + url.pathname);
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && !response.redirected) {
            const copy = response.clone();
            keep(event, key, copy, started);
          }
          return response;
        })
        .catch(async () => started === generation ? (await (await caches.open(cacheName)).match(key)) ?? unavailable() : unavailable()),
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
              keep(event, request, copy, started);
            }
            return response;
          }),
      ),
    );
  }
});
