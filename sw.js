// Minimal service worker for PeterMasimu UG.
// Its main job here is simply to exist and be registered — Chrome, Edge,
// and Android's WebView require an active service worker with a fetch
// handler before they'll consider a site "installable" and fire the real
// beforeinstallprompt event. Without this file, tapping "Install" always
// falls back to manual "Add to Home Screen" instructions instead of
// installing directly.
//
// It also does a small amount of genuinely useful offline caching for the
// app shell (the HTML page itself), so the storefront can still open if the
// visitor is briefly offline. It does NOT cache Firestore data — product
// data always comes fresh from the live database when the connection is up.

const CACHE_NAME = 'petermasimu-shell-v1';
const APP_SHELL_URL = './';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(APP_SHELL_URL).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

// Network-first for navigation requests (so visitors always get the latest
// version of the site when online), falling back to the cached shell only
// if the network request fails (i.e. the visitor is offline).
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return; // let all other requests (Firestore, images, etc.) pass through untouched
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(APP_SHELL_URL).then((cached) => cached || Response.error())
    )
  );
});
