const CACHE = 'gym-tracker-v33';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './coach-logic-v2.js', './latest-weight-v1.js', './record-recommendation-v1.js', './auto-rest-v1.js', './daily-plan-v1.js'];
const COACH_SCRIPT = '<script src="./coach-logic-v2.js"></script>';
const WEIGHT_SCRIPT = '<script src="./latest-weight-v1.js"></script>';
const RECORD_RECOMMENDATION_SCRIPT = '<script src="./record-recommendation-v1.js"></script>';
const AUTO_REST_SCRIPT = '<script src="./auto-rest-v1.js"></script>';
const DAILY_PLAN_SCRIPT = '<script src="./daily-plan-v1.js"></script>';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

async function injectAppLogic(response) {
  if (!response) return response;
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;

  const html = await response.text();
  let patched = html;
  if (!patched.includes('coach-logic-v2.js')) {
    patched = patched.replace('</body>', `${COACH_SCRIPT}\n</body>`);
  }
  if (!patched.includes('latest-weight-v1.js')) {
    patched = patched.replace('</body>', `${WEIGHT_SCRIPT}\n</body>`);
  }
  if (!patched.includes('record-recommendation-v1.js')) {
    patched = patched.replace('</body>', `${RECORD_RECOMMENDATION_SCRIPT}\n</body>`);
  }
  if (!patched.includes('auto-rest-v1.js')) {
    patched = patched.replace('</body>', `${AUTO_REST_SCRIPT}\n</body>`);
  }
  if (!patched.includes('daily-plan-v1.js')) {
    patched = patched.replace('</body>', `${DAILY_PLAN_SCRIPT}\n</body>`);
  }

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(patched, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Network-first for navigation/HTML so UI updates roll out immediately.
// HTML/CSS stay unchanged; the service worker injects logic-only overrides.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Never intercept API calls (GitHub sync etc.)
  if (url.origin !== self.location.origin) return;

  const isHTML = e.request.mode === 'navigate'
    || e.request.destination === 'document'
    || url.pathname.endsWith('.html')
    || url.pathname === '/' || url.pathname.endsWith('/');

  if (isHTML) {
    e.respondWith((async () => {
      try {
        const res = await fetch(e.request, { cache: 'no-store' });
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return injectAppLogic(res);
      } catch {
        const cached = await caches.match(e.request) || await caches.match('./index.html');
        return injectAppLogic(cached);
      }
    })());
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
