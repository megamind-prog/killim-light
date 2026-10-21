// Killim Light offline helper: opens instantly on slow data, shows the last lights when there's no signal,
// and shows "kava ready" alerts for favourite nakamals.
const VERSION = 'kl-v4';
const SHELL = ['/', '/owner', '/assets/app.css', '/assets/i18n.js', '/assets/common.js', '/assets/route.js', '/assets/public.js', '/assets/owner.js',
  '/assets/auth.js', '/assets/auth-ui.js', '/assets/leaflet/leaflet.js', '/assets/leaflet/leaflet.css', '/assets/icon.svg',
  '/assets/icon-192.png', '/assets/osm/index.json', '/assets/osm/efate.json', '/assets/osm/route-efate.json', '/assets/vanuatu-land.json', '/assets/portvila-osm.jpg', '/manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // Logins and owner/team data must always be fresh: never cached.
  if (url.pathname.startsWith('/api/owner') || url.pathname.startsWith('/api/admin') || url.pathname.startsWith('/.netlify/') || url.pathname === '/admin') return;
  // Lights: try the network first, fall back to the last copy.
  if (url.pathname === '/api/nakamals') {
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return r; }).catch(() => caches.match(req)));
    return;
  }
  // Photos never change once uploaded: cache first.
  if (url.pathname.startsWith('/img/')) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return r; })));
    return;
  }
  // Pages and app files: network first so updates arrive, cached copy when offline.
  e.respondWith(fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return r; })
    .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('/'))));
});
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data.json(); } catch { d = { title: 'Killim Light', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Killim Light', { body: d.body || '', icon: '/assets/icon-192.png', badge: '/assets/icon-192.png', data: { url: d.url || '/' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => {
    for (const c of list) if ('focus' in c) { c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
