// Service worker: permite instalar la app y usarla sin internet.
// Estrategia: primero la red (para recibir siempre la última versión) y, sin conexión, la copia guardada.
// Al cambiar archivos, subir la VERSION para limpiar la caché vieja.
const VERSION = 'cobros-v18';
const ARCHIVOS = [
  './',
  './index.html',
  './manifest.json',
  './version.json',
  './css/app.css',
  './js/app.js',
  './js/version.js',
  './js/update.js',
  './js/utils.js',
  './js/icons.js',
  './js/idb.js',
  './js/crypto.js',
  './js/store.js',
  './js/logic.js',
  './js/ui.js',
  './js/charts.js',
  './js/card.js',
  './js/backup.js',
  './js/views/auth.js',
  './js/views/inicio.js',
  './js/views/clientes.js',
  './js/views/prestamos.js',
  './js/views/prestamo.js',
  './js/views/estadisticas.js',
  './js/views/capital.js',
  './js/views/ajustes.js',
  './js/views/gastos.js',
  './js/views/cierre.js',
  './js/views/totales.js',
  './js/views/adicionales.js',
  './js/views/informe.js',
  './js/views/reporte.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // "no-cache": siempre pregunta al servidor si hay versión nueva (si no cambió, la respuesta es mínima).
  const fresco = req.mode === 'navigate'
    ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
    : fetch(req, { cache: req.cache === 'no-store' ? 'no-store' : 'no-cache' });
  e.respondWith(
    fresco
      .then((res) => {
        if (res.ok && !new URL(req.url).search) {
          const copia = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copia));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});
