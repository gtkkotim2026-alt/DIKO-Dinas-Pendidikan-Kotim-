// Service Worker PWA DIKO
// SETIAP RILIS: ubah VERSION di bawah (samakan dengan APP_VER di index.html).
// Browser membandingkan isi sw.js; begitu berubah, versi baru langsung dipasang.
const VERSION = '1.92.25 - Versi 2';
const CACHE_NAME = 'diko-' + VERSION;
const CORE = ['./', './index.html', './config.js', './app.js', './manifest.json', './diko.jpg', './icon-192.png', './icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // Satu per satu: bila ada file yang tidak ada (mis. diko.jpg), pemasangan TIDAK ikut gagal.
      .then(cache => Promise.all(CORE.map(u => cache.add(new Request(u, { cache: 'reload' })).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first: selalu ambil yang terbaru dari server (lewati cache HTTP browser).
// Cache hanya dipakai sebagai cadangan saat offline / server tidak terjangkau.
// Permintaan ke API Google Apps Script (lintas domain) tidak disentuh sama sekali.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))
      )
  );
});
