const CACHE = 'gym-tracker-v40';

const LOGIC_ASSETS = [
  './training-engine-v1.js',
  './coach-logic-v2.js',
  './latest-weight-v1.js',
  './record-recommendation-v1.js',
  './auto-rest-v1.js',
  './daily-plan-v1.js',
  './familiar-recommendations-v1.js',
  './long-term-growth-v1.js',
  './workout-flow-v1.js',
  './native-bridge-v1.js',
  './app-version-v1.js',
];

const ASSETS = ['./', './index.html', './manifest.webmanifest', ...LOGIC_ASSETS];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

async function injectAppLogic(response) {
  if (!response) return response;
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;

  let html = await response.text();
  if (!html.includes('training-engine-v1.js')) {
    const scriptBlock = LOGIC_ASSETS.map((src) => `<script src="${src}"></script>`).join('\n');
    html = html.replace('</body>', `${scriptBlock}\n</body>`);
  }

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isHTML =
    event.request.mode === 'navigate' ||
    event.request.destination === 'document' ||
    url.pathname.endsWith('.html') ||
    url.pathname === '/' ||
    url.pathname.endsWith('/');

  if (isHTML) {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request, { cache: 'no-store' });
        caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
        return injectAppLogic(response);
      } catch {
        const cached = await caches.match(event.request) || await caches.match('./index.html');
        return injectAppLogic(cached);
      }
    })());
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});