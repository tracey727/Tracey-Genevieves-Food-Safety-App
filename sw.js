const CACHE = 'genevieve-food-v19-2-20260728';
const SHELL = [
  './',
  './index.html',
  './styles.css?v=19.2.0',
  './app.js?v=19.2.0',
  './manifest.webmanifest',
  './assets/genevieve-food-stock-icon.svg',
  './assets/vendor/zxing-browser.min.js?v=0.2.1',
  './privacy.html',
  './terms.html',
  './safety.html',
  './404.html',
  './robots.txt'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  const isCoreCode = /\/(?:app\.js|styles\.css|manifest\.webmanifest|sw\.js)$/.test(url.pathname);
  event.respondWith(
    (isCoreCode ? fetch(event.request).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
      return response;
    }).catch(() => caches.match(event.request)) : caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
      return response;
    })))
  );
});
