const CACHE_NAME = 'mws-shell-v2';

const APP_SHELL = [
  '/',
  '/index.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );

  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith('mws-shell-') && key !== CACHE_NAME
          )
          .map((key) => caches.delete(key))
      )
    )
  );

  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache external services such as maps, weather, or routing.
  if (url.origin !== self.location.origin) return;

  // Do not cache API responses.
  if (url.pathname.startsWith('/api/')) return;

  // Network-first strategy for page navigation.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();

            caches.open(CACHE_NAME).then((cache) => {
              cache.put('/index.html', copy);
            });
          }

          return response;
        })
        .catch(async () => {
          return (
            (await caches.match(request)) ||
            (await caches.match('/index.html')) ||
            Response.error()
          );
        })
    );

    return;
  }

  // Cache successful same-origin assets.
  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) return cached;

      try {
        const response = await fetch(request);

        if (response.ok && response.type === 'basic') {
          const copy = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, copy);
          });
        }

        return response;
      } catch {
        return Response.error();
      }
    })
  );
});