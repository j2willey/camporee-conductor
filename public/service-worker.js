const CACHE_NAME = 'camporee-conductor-v3';
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
  '/js/judge.js',
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
  // Always skip cache for API calls
  if (event.request.url.includes('/api/')) {
    return;
  }

  // Network First for config file to ensure we see updates
  if (event.request.url.endsWith('/games.json')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clonedResponse = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clonedResponse);
          });
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache First for other static assets
  event.respondWith(
    caches.match(event.request).then((response) => {
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
