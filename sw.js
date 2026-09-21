// ==========================================================================
// DIDODE - Resilient Offline PWA Service Worker
// ==========================================================================

const CACHE_NAME = 'didode-music-v2';
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

// 1. Install & Cache Core Assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 2. Activate & Clear Old Caches
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

// 3. Fetch Handler with Immediate Offline Fallback
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests (like Google Drive API streams)
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request)
        .then((response) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, response.clone());
            return response;
          });
        })
        .catch(() => {
          // If offline and request is navigation/HTML, return cached index.html immediately
          if (event.request.mode === 'navigate' || event.request.destination === 'document') {
            return caches.match('./index.html');
          }
          return new Response('Network error happened', {
            status: 404,
            statusText: 'Offline'
          });
        });
    })
  );
});
