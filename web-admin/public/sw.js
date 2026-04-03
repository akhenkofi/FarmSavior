const CACHE_NAME = 'farmsavior-pwa-v9';
const URLS_TO_CACHE = ['/', '/manifest.webmanifest', '/assets/farmsavior-logo.jpg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(URLS_TO_CACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/')))
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text?.() || '' }; }
  const title = data.title || 'FarmSavior Call';
  const body = data.body || 'Incoming call';
  const callUrl = data.url || '/?go=community';
  const mode = data.mode || 'audio';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: `farmsavior-call-${data.callId || Date.now()}`,
      renotify: true,
      requireInteraction: true,
      data: { url: callUrl, callId: data.callId || '', mode },
      icon: '/assets/farmsavior-logo.jpg',
      badge: '/assets/farmsavior-logo.jpg'
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/?go=community';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.navigate?.(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
      return null;
    })
  );
});
