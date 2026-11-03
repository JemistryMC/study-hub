// Exo Academic Platform Service Worker (PWA) — Phase 4.1
// Cache Version v5 — Strict Same-Origin Static Asset Allowlist
// Reference: W3C Service Workers Specification (https://www.w3.org/TR/service-workers/)
//            OWASP ASVS v4.0.3 — Client-Side Cache & Origin Isolation

const CACHE_NAME = 'exo-workspace-cache-v5';
const STATIC_ASSET_ALLOWLIST = new Set([
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png'
]);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(['./', './index.html', './manifest.json']);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          // Strict isolation: delete ONLY obsolete Exo-prefixed caches
          .filter((key) => key.startsWith('exo-workspace-cache-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only process GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // 1. Strict Origin Check: Never intercept or cache external origins
  // Excludes Supabase, Google APIs, CDNs, FontAwesome, etc.
  if (url.origin !== self.location.origin) {
    return;
  }

  // 2. Never cache API, auth, storage, dynamic, or Google Drive endpoints
  if (
    url.pathname.includes('/api/') ||
    url.pathname.includes('/auth/') ||
    url.pathname.includes('/rest/') ||
    url.pathname.includes('/storage/') ||
    url.pathname.includes('/drive/') ||
    url.searchParams.has('user_id') ||
    url.searchParams.has('token')
  ) {
    return;
  }

  // 3. Strict Static-Asset Allowlist Check
  const normalizedPath = url.pathname;
  const isAllowlisted = STATIC_ASSET_ALLOWLIST.has(normalizedPath) ||
                        normalizedPath.endsWith('/index.html') ||
                        normalizedPath.endsWith('/manifest.json') ||
                        normalizedPath.endsWith('/favicon.png');

  if (isAllowlisted) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          return new Response('Asset unavailable offline', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' })
          });
        })
    );
    return;
  }

  // 4. SPA Navigation requests ONLY get index.html fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const fallback = await caches.match('./index.html') || await caches.match('/index.html');
        if (fallback) return fallback;
        return new Response('Offline navigation unavailable', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' })
        });
      })
    );
    return;
  }

  // All other un-allowlisted same-origin requests pass through to network
});
