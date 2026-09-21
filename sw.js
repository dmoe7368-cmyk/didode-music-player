// ==========================================================================
// DIDODE - Offline Service Worker (PWA Caching Engine)
// ==========================================================================

const CACHE_NAME = 'didode-music-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './js/storage.js',
  './js/config.js',
  './manifest.json',
  './assets/default-cover.png',
  './assets/cover-a.png',
  './assets/cover-fav.png',
  './assets/cover-local.png'
];

// Install Event: Cache essential app shell files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event: Serve from cache when offline, fetch from network when online
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests like Google Drive API streams
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((response) => {
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, response.clone());
          return response;
        });
      }).catch(() => {
        // Fallback to index.html if offline and asset not cached
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
