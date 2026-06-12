/* =================================================================
   JLPT Master — Service Worker (PWA)
   Makes the app installable and usable offline. Strategy:
   • Same-origin requests (app shell, hashed Vite assets, data scripts):
     cache-first, then populate the cache at runtime as files are hit.
   • Cross-origin requests (Jotoba, Google Translate, kanjiapi.dev,
     KanjiVG, Firebase, fonts): left to the network — these are live
     data / auth and must not be served stale from an opaque cache.
   Bump CACHE when shipping a release to evict the old shell.
   ================================================================= */
var CACHE = 'jlpt-master-v1';
var APP_SHELL = [
    './',
    './index.html',
    './data.js',
    './features.js',
    './n2test_data.js',
    './manifest.json',
    './icon.svg'
];

self.addEventListener('install', function (event) {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE).then(function (cache) {
            // addAll fails atomically if any file 404s; add individually so
            // one missing asset can't block the whole precache.
            return Promise.all(APP_SHELL.map(function (url) {
                return cache.add(url).catch(function () {});
            }));
        })
    );
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (k) {
                if (k !== CACHE) return caches.delete(k);
            }));
        }).then(function () { return self.clients.claim(); })
    );
});

self.addEventListener('fetch', function (event) {
    var req = event.request;
    if (req.method !== 'GET') return;

    var url = new URL(req.url);
    // Don't touch cross-origin (APIs, fonts, Firebase) — go straight to network.
    if (url.origin !== self.location.origin) return;

    event.respondWith(
        caches.match(req).then(function (cached) {
            if (cached) return cached;
            return fetch(req).then(function (res) {
                // Runtime-cache successful same-origin responses (covers the
                // hashed assets/index-*.js|css that Vite emits per build).
                if (res && res.status === 200 && res.type === 'basic') {
                    var copy = res.clone();
                    caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
                }
                return res;
            }).catch(function () {
                // Offline fallback: serve the app shell for navigations.
                if (req.mode === 'navigate') return caches.match('./index.html');
            });
        })
    );
});
