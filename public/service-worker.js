const CACHE_NAME = 'camporee-conductor-v5';
const FILES_TO_CACHE = [
  '/',
  '/admin.html',
  '/judge.html',
  '/official.html',
  '/utils.html',
  '/css/admin.css',
  '/css/bootstrap.min.css',
  '/css/conductor.css',
  '/css/spreadsheet.css',
  '/css/style.css',
  '/js/admin.js',
  '/js/composer_app.js',
  '/js/judge.js?v=4',
  '/js/official.js',
  '/js/qrcode.min.js',
  '/js/sync-manager.js',
  '/js/utils.js',
  '/js/core/data-store.js',
  '/js/core/leaderboard.js',
  '/js/core/schema.js',
  '/js/core/ui.js',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Caching offline resources');
      return cache.addAll(FILES_TO_CACHE);
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Always ignore cache for API POST/PUT/DELETE calls
  if (event.request.method !== 'GET' && url.pathname.includes('/api/')) {
    return;
  }

  // Network First for config files and entity lists to ensure we see updates
  if (url.pathname.endsWith('/games.json') || url.pathname.endsWith('/api/entities')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clonedResponse = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            // Store it under the clean pathname so t=... doesn't bloat cache
            cache.put(url.pathname, clonedResponse);
          });
          return response;
        })
        .catch(() => caches.match(url.pathname))
    );
    return;
  }

  // Cache First for other static assets
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((response) => {
      return response || fetch(event.request);
    })
  );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});
