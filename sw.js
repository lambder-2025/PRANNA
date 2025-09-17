const CACHE_NAME = 'loyalty-app-cache-v1';
const ASSETS_TO_CACHE = [ './', './index.html' ];

self.addEventListener('install', event => {
  event.waitUntil( caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE)) );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil( caches.keys().then(keyList => Promise.all(keyList.map(key => { if (key !== CACHE_NAME) return caches.delete(key); }))) );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith( fetch(event.request).catch(() => caches.match(event.request)) );
});
