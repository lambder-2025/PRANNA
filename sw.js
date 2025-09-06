// --- CONFIGURACIÓN DEL SERVICE WORKER ---
// Versión del caché. Cambia este número si haces cambios grandes en la app para forzar la actualización.
const CACHE_VERSION = 'v1.1';
const CACHE_NAME = `loyalty-app-cache-${CACHE_VERSION}`;

// Lista de archivos y recursos esenciales para que la app funcione sin conexión.
// La URL './' se refiere al archivo index.html principal.
const urlsToCache = [
  './',
  'manifest.json',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://rsms.me/inter/inter.css'
];

// Evento 'install': Se dispara cuando el service worker se instala por primera vez.
// Aquí guardamos los archivos esenciales en el caché del navegador.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Evento 'activate': Se dispara cuando el nuevo service worker se activa.
// Aquí limpiamos cachés antiguos para liberar espacio y asegurar que se usen los archivos nuevos.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Evento 'fetch': Se dispara cada vez que la aplicación intenta cargar un recurso (página, imagen, script).
// Estrategia "Cache First": Intenta servir el recurso desde el caché. Si no está, lo busca en la red.
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Si el recurso está en el caché, lo devuelve inmediatamente.
        if (response) {
          return response;
        }
        // Si no, lo busca en la red.
        return fetch(event.request);
      })
  );
});