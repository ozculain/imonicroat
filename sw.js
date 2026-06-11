/* Service worker: full offline support once hosted.
   Strategy: stale-while-revalidate for same-origin requests — instant loads
   from cache, silent refresh in the background, new version on next open. */
'use strict';

const VERSION = 'imonicroat-v2';
const FILES = [
  './',
  'index.html',
  'css/app.css',
  'js/icons.js',
  'js/srs.js',
  'js/db.js',
  'js/vault.js',
  'js/sync.js',
  'js/audio.js',
  'js/content.js',
  'js/exercises.js',
  'js/app.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // GitHub API etc. pass through
  e.respondWith(
    caches.open(VERSION).then(cache =>
      cache.match(e.request).then(cached => {
        const fresh = fetch(e.request)
          .then(resp => { if (resp.ok) cache.put(e.request, resp.clone()); return resp; })
          .catch(() => cached);
        return cached || fresh;
      })
    )
  );
});
