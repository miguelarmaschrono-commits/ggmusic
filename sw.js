const CACHE_NAME = 'ggmusic-cache-v0.1';

// Recursos estáticos iniciales a guardar en caché
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/registro.html',
  '/login.html',
  '/css/main.css',
  '/assets/favicon/favicon.ico'
];

// 1. Instalación del Service Worker
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 2. Activación y limpieza de cachés antiguas
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

// 3. Estrategia: Red primero, respaldo en caché si falla (Network First)
self.addEventListener('fetch', (e) => {
  // Ignorar peticiones que no sean GET o externas a Firebase Auth/Firestore directas
  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // Guardar copia actualizada en caché si la respuesta es válida
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, responseClone));
        }
        return response;
      })
      .catch(() => caches.match(e.request)) // Si no hay internet, sirve desde la caché
  );
});