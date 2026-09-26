/* Generated into /sw.js with a content-addressed inventory by build-offline.mjs. */
const RELEASE = __DARKROOM_RELEASE__;
const ASSETS = __DARKROOM_ASSETS__;
const OPTIONAL = __DARKROOM_OPTIONAL__;
const MODEL_CACHE = 'darkroom-camera-models-v1';
const PREFIX = 'darkroom-app-';
const CACHE = PREFIX + RELEASE;
const urls = new Set(ASSETS.map(asset => asset.url));

async function verifiedResponse(asset) {
  const response = await fetch(asset.url, { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(30000) });
  if (!response.ok || response.redirected) throw new Error('Download incomplete: ' + asset.url);
  const bytes = await response.clone().arrayBuffer();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
  if (hash !== asset.hash) throw new Error('The release changed during download. Retry preparation.');
  return response;
}
async function download(cache, asset) {
  await cache.put(asset.url, await verifiedResponse(asset));
}
async function status() {
  const cache = await caches.open(CACHE);
  const present = await Promise.all(ASSETS.map(asset => cache.match(asset.url)));
  const models = await caches.open(MODEL_CACHE);
  const cameraReady = (await Promise.all(OPTIONAL.map(asset => models.match(asset.url)))).every(Boolean);
  return { ready: present.every(Boolean), cameraReady, version: RELEASE, count: present.filter(Boolean).length, total: ASSETS.length };
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try { for (const asset of ASSETS) await download(cache, asset); }
    catch (error) { await caches.delete(CACHE); throw error; }
    // No skipWaiting: incomplete or unsolicited updates never replace the app.
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    if (!(await status()).ready) throw new Error('Offline preparation is incomplete.');
    // Activation occurs with no old clients, or after an explicit single-tab
    // activation request. IndexedDB and unrelated caches are never touched.
    await Promise.all((await caches.keys()).filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  const port = event.ports[0];
  if (!port) return;
  event.waitUntil((async () => {
    try {
      if (event.data?.type === 'REPAIR') {
        const cache = await caches.open(CACHE);
        for (const asset of ASSETS) if (!await cache.match(asset.url)) await download(cache, asset);
      }
      if (event.data?.type === 'PREPARE_CAMERAS') {
        const cache = await caches.open(MODEL_CACHE);
        for (const asset of OPTIONAL) if (!await cache.match(asset.url)) await download(cache, asset);
      }
      if (event.data?.type === 'ACTIVATE') {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        if (clients.length > 1) throw new Error('Close other Darkroom tabs and windows before applying this update.');
        if (!(await status()).ready) throw new Error('The update download is incomplete. Retry preparation.');
        await self.skipWaiting();
      }
      port.postMessage(await status());
    } catch (error) { port.postMessage({ error: error.message || 'Offline preparation failed. Free browser storage and retry.' }); }
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Access login navigations and private APIs must reach the network, never the app shell/cache.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname === '/offline-health.json' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/cdn-cgi/')) return;
  const key = event.request.mode === 'navigate' ? '/index.html' : url.pathname;
  const optional = OPTIONAL.find(asset => asset.url === key);
  if (optional) {
    event.respondWith((async () => {
      const cache = await caches.open(MODEL_CACHE), cached = await cache.match(key);
      if (cached) return cached;
      try {
        const response = await verifiedResponse(optional);
        // Quota failure permits online viewing, but never reports preparation.
        try { await cache.put(key, response.clone()); } catch { /* Film cache is independent. */ }
        return response;
      } catch { return new Response("Camera model isn't available offline.", { status: 503 }); }
    })());
    return;
  }
  if (!urls.has(key)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE), cached = await cache.match(key);
    if (cached) return cached;
    // A missing entry never silently mixes this release with another version.
    try { await download(cache, ASSETS.find(asset => asset.url === key)); return await cache.match(key); }
    catch { return new Response('This content is not downloaded. Reconnect and retry offline preparation.', { status: 503, headers: { 'Content-Type': 'text/plain' } }); }
  })());
});
