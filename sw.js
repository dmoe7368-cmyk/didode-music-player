// =====================================================
// Didode Music Player - sw.js (Service Worker)
// =====================================================

const CACHE_NAME = "didode-cache-v1";

// App-shell files to pre-cache (NOT audio files, which stream from Drive)
const APP_SHELL = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./js/config.js",
  "./manifest.json",
  "./assets/cover-a.png",
  "./assets/cover-b.png",
  "./assets/cover-c.png",
  "./assets/cover-fav.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png"
];

// Install: pre-cache the app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL).catch((err) => {
        // Don't fail install if one optional asset (e.g. a cover not yet uploaded) is missing
        console.warn("Some app-shell assets failed to cache:", err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean up old cache versions
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch strategy:
// - Google Drive API calls (song list + audio streams) -> always network (never cache, they're dynamic/large)
// - Everything else (app shell) -> cache-first, falling back to network
self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  const isDriveRequest =
    url.includes("googleapis.com/drive") || url.includes("drive.google.com");

  if (isDriveRequest) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request)
          .then((response) => {
            // Cache a copy of newly fetched app-shell files for next time
            if (event.request.method === "GET" && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() => cached)
      );
    })

  );
});
