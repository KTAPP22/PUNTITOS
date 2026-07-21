const CACHE_NAME = 'pitguide-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './app.js'
];

// Instalar Service Worker y cachear recursos
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('SW: Cacheando recursos estáticos');
        return cache.addAll(ASSETS).catch(err => {
          console.warn('SW: Error al cachear algunos recursos', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// Activar y limpiar cachés antiguas
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('SW: Eliminando caché antigua', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Interceptar peticiones para servir desde caché (con fallback de red)
self.addEventListener('fetch', event => {
  if (!event.request.url.startsWith(self.location.origin) && !event.request.url.startsWith('https://fonts.') && !event.request.url.startsWith('https://cdn.') && !event.request.url.startsWith('https://unpkg.')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          fetch(event.request).then(networkResponse => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse));
            }
          }).catch(() => {});
          
          return cachedResponse;
        }

        return fetch(event.request).then(response => {
          if (response.status === 200 && (event.request.url.startsWith(self.location.origin) || event.request.url.includes('tailwindcss') || event.request.url.includes('fonts.googleapis') || event.request.url.includes('unpkg.com'))) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          }
          return response;
        });
      })
  );
});
