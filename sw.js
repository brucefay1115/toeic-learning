const CACHE_NAME = 'toeic-tutor-v1.1.0';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/styles.css',
  './assets/js/main.js',
  './assets/js/state.js',
  './assets/js/utils.js',
  './assets/js/db.js',
  './assets/js/apiGemini.js',
  './assets/js/render.js',
  './assets/js/vocab.js',
  './assets/js/srs.js',
  './assets/js/audioPlayer.js',
  './assets/js/history.js',
  './assets/js/driveSync.js',
  './assets/js/updater.js',
  './assets/js/installPrompt.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Never cache: API calls, version.json, Google sign-in
  if (
    url.includes('generativelanguage.googleapis.com') ||
    url.includes('version.json') ||
    url.includes('accounts.google.com') ||
    url.includes('googleapis.com/drive') ||
    url.includes('googleapis.com/oauth')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
