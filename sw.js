// Cram Arcade © 2026 Shashank J Reddy. All rights reserved.
// Service worker: lets Cram Arcade open and play without internet once it's been visited.
// - The app's own files are saved ("cached") each time they load, for use offline.
// - /api/ requests (AI sets, crews, classes, sign-in) and app downloads always go to the internet.
// - Fonts are cached after the first visit.
// Change VERSION whenever you want every phone to fetch fresh files right away.
const VERSION = "cram-v3";
const APP_FILES = [
  "/", "/index.html", "/style.css", "/app.js", "/manifest.webmanifest",
  "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png", "/icons/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin && (url.pathname.startsWith("/api/") || url.pathname.startsWith("/downloads/"))) return; // always online

  const isFont = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (url.origin !== location.origin && !isFont) return;

  // Online: always get the newest version (and save a copy). Offline: use the saved copy.
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const key = url.origin === location.origin && url.pathname === "/" ? "/" : req;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === "opaque") cache.put(key, res.clone());
        return res;
      } catch {
        const saved = await cache.match(key, { ignoreSearch: url.origin === location.origin });
        return saved || Response.error();
      }
    }),
  );
});
