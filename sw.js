// StarFall service worker: keeps the game on the device so it opens instantly and works offline.
// When you upload a new version of index.html, change VERSION so players get the update.
const VERSION = 'starfall-1.1.1-d';
const APP = ['./', 'index.html', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(APP)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== 'starfall-fonts').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Google Fonts: use the stored copy, refresh it in the background when online
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open('starfall-fonts').then(async c => {
      const hit = await c.match(e.request);
      const net = fetch(e.request).then(r => { if (r.ok || r.type === 'opaque') c.put(e.request, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== location.origin) return; // leaderboard and other sites always go to the network
  // The game page: try the network first so updates arrive, fall back to the stored copy offline
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put('index.html', copy)); return r; }).catch(() => caches.match('index.html')));
    return;
  }
  // Icons and other files: stored copy first
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
