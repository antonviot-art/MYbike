const cacheName = 'mybike-startup-v5';
const fallbackPath = '/mybike-startup.html';
const routes = new Set(['/', '/discussion', '/vehicules', '/map', '/parcours', '/medias']);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const response = await fetch(fallbackPath, { cache: 'reload' });
    if (!response.ok || !(await response.clone().text()).includes('id="mybike-startup-screen"')) {
      throw new Error('MYbike startup screen unavailable');
    }
    await (await caches.open(cacheName)).put(fallbackPath, response);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('mybike-startup-') && name !== cacheName).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.mode !== 'navigate' || event.request.method !== 'GET' ||
      url.origin !== self.location.origin || url.search || !(routes.has(url.pathname) || /^\/(?:pilotes|vehicules|parcours)\/[^/]+$/.test(url.pathname))) return;

  const network = fetch(event.request).catch(() => null);
  event.waitUntil(network.then(() => {}));
  event.respondWith((async () => {
    let deadline;
    const timeout = new Promise(resolve => { deadline = setTimeout(() => resolve(null), 950); });
    const response = await Promise.race([network, timeout]);
    clearTimeout(deadline);
    if (response && ![502, 503, 504].includes(response.status)) return response;

    const startup = await caches.match(fallbackPath, { cacheName });
    if (startup) return new Response(startup.body, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
    return (await network) ?? Response.error();
  })());
});
