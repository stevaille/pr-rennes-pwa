const SHELL_CACHE = 'pr-rennes-shell-v16';
const DATA_CACHE = 'pr-rennes-data-v1';

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './favicon.ico'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== DATA_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isApiCall = url.hostname.includes('rennesmetropole.fr') || url.hostname.includes('explore.star.fr');
  const isPredictions = url.pathname.endsWith('predictions.json');

  // Données temps réel + prévisions : on tente le réseau en priorité, on retombe sur le dernier
  // relevé connu en cache si l'appareil est hors ligne ou si la source ne répond pas.
  if (isApiCall || isPredictions) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(DATA_CACHE).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // App shell (HTML/CSS/JS/icônes) : cache d'abord pour un chargement instantané,
  // réseau en secours si un fichier n'est pas encore en cache.
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
