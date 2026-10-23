// KEM service worker – app shell caching.
// Pages: network first, cached copy if offline, else /offline.
// Static build assets and icons: cache first.
// API calls are never cached here; offline writes go through the IndexedDB outbox (M2).
const VERSION = "kem-v2";
// Drawings saved with "Save offline" live in their own cache and survive app updates.
const DRAWINGS = "kem-drawings";
const SHELL = ["/offline", "/logo.png", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== DRAWINGS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // photos / drawing PDFs: network first, then the copy saved on the phone
  if (url.pathname.startsWith("/api/files/")) {
    event.respondWith(fetch(req).catch(() => caches.open(DRAWINGS).then((c) => c.match(req)).then((hit) => hit || Response.error())));
    return;
  }
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/logo.png" || url.pathname === "/pdf.worker.min.mjs") {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/offline"))),
    );
  }
});
