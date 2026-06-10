/* =================================================================
   JLPT Master — Service Worker (v34)
   - Resilient install: one failed asset no longer breaks offline mode
   - Network-first for navigations (always fresh HTML when online)
   - Cache-first for versioned app assets
   - Stale-while-revalidate runtime cache for fonts & CDN libraries
   ================================================================= */
const CACHE_NAME = 'jlpt-master-v36';
const RUNTIME_CACHE = 'jlpt-runtime-v36';

const ASSETS = [
  './',
  './index.html',
  './styles.css?v=36',
  './js/01-core.js?v=36',
  './js/02-dictionary.js?v=36',
  './js/03-quiz.js?v=36',
  './js/04-study.js?v=36',
  './js/05-exams.js?v=36',
  './js/06-multiplayer.js?v=36',
  './js/07-app.js?v=36',
  './data.js?v=36',
  './features.js?v=36',
  './n2test_data.js?v=36',
  './icon.svg',
  './manifest.json',
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.6/purify.min.js',
  'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js'
];

// Hosts we must never intercept (live APIs / auth)
const BYPASS_HOSTS = [
  'kanjiapi.dev',
  'kanjivg',
  'jisho.org',
  'firebaseio.com',
  'googleapis.com',
  'firebaseapp.com',
  'gstatic.com/firebasejs'
];

// Hosts that are safe to cache at runtime (static, versioned)
const RUNTIME_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'unpkg.com',
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com'
];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // Cache each asset individually so a single 404 / network hiccup
      // doesn't reject the whole install (cache.addAll is all-or-nothing).
      return Promise.all(
        ASSETS.map(function (url) {
          return cache.add(url).catch(function (err) {
            console.warn('[SW] Failed to pre-cache:', url, err);
          });
        })
      );
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key !== CACHE_NAME && key !== RUNTIME_CACHE) {
            return caches.delete(key);
          }
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;

  var url = e.request.url;

  // Never intercept live API / auth traffic
  for (var i = 0; i < BYPASS_HOSTS.length; i++) {
    if (url.indexOf(BYPASS_HOSTS[i]) > -1) return;
  }

  // Navigations: network-first, fall back to cached shell when offline
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(function (res) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put('./', copy); });
          return res;
        })
        .catch(function () {
          return caches.match('./').then(function (cached) {
            return cached || caches.match('./index.html');
          });
        })
    );
    return;
  }

  // Fonts & CDN libs: stale-while-revalidate
  var isRuntime = RUNTIME_HOSTS.some(function (h) { return url.indexOf(h) > -1; });
  if (isRuntime) {
    e.respondWith(
      caches.open(RUNTIME_CACHE).then(function (cache) {
        return cache.match(e.request).then(function (cached) {
          var network = fetch(e.request).then(function (res) {
            if (res && res.status === 200) cache.put(e.request, res.clone());
            return res;
          }).catch(function () { return cached; });
          return cached || network;
        });
      })
    );
    return;
  }

  // App assets: cache-first (they're version-busted via ?v=)
  e.respondWith(
    caches.match(e.request).then(function (cached) {
      return cached || fetch(e.request);
    })
  );
});
