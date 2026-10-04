import { shelfAction, expectShelfSummary, focusShelf, ready } from './helpers/shelf';
import { test, expect } from '@playwright/test';
import { webcrypto } from 'node:crypto';
import { createServer, request as httpRequest, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import worker from '../../cloudflare/worker';
import { environment, photograph } from '../integration/m21-worker-fixtures';
import type { Env } from '../../cloudflare/types';
import { devAdminBridge } from '../../scripts/dev-admin-bridge';
import type { ViteDevServer } from 'vite';

async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '0.0.0.0', resolve); });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
async function close(server: Server) {
  if (!server.listening) return;
  await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
}
function proxy(request: IncomingMessage, response: ServerResponse, baseURL: string) {
  const upstream = httpRequest(new URL(request.url!, baseURL), result => { response.writeHead(result.statusCode!, result.headers); result.pipe(response); });
  upstream.on('error', () => response.destroy()); upstream.end();
}
async function ownerToken(env: Env) {
  const pair = await webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const jwk = { ...await webcrypto.subtle.exportKey('jwk', pair.publicKey), kid: 'local-owner-key', alg: 'RS256', use: 'sig' };
  const now = Math.floor(Date.now() / 1000);
  const payload = [
    { alg: 'RS256', kid: jwk.kid },
    { iss: env.ACCESS_ISSUER, aud: [env.ACCESS_AUDIENCE], email: env.OWNER_EMAIL, sub: 'local-owner', iat: now - 10, exp: now + 300 },
  ].map(part => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.');
  const signature = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(payload));
  return { token: `${payload}.${Buffer.from(signature).toString('base64url')}`, jwk };
}
function metadataBearingPhotograph(): Buffer {
  const encoded = photograph();
  const tiff = new Uint8Array([0x49, 0x49, 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0]);
  const metadata = new Uint8Array([...new TextEncoder().encode('Exif\0\0'), ...tiff, ...new TextEncoder().encode('GPS PRIVATE LOCATION')]);
  const length = metadata.length + 2;
  return Buffer.from([255, 216, 255, 225, length >> 8, length & 255, ...metadata, ...encoded.subarray(2)]);
}


test('Admin publishes browser-derived JPEGs; a new gallery session sees only public images, while guest stays local', async ({ page, browser, baseURL }, info) => {
  // This fixture uses its own origin, outside the configured storageState origin.
  await page.addInitScript(() => localStorage.setItem('film-reverie-intro-tour', 'done'));
  const { env, privateBucket, publicBucket } = environment();
  const { token, jwk } = await ownerToken(env);
  const nativeFetch = globalThis.fetch, uploads: string[] = [];
  let saveGate: Promise<void> | undefined;
  const mutations: string[] = [];
  let finishSave = () => {};
  let finishCopies = () => {};
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => String(input) === `${env.ACCESS_ISSUER}/cdn-cgi/access/certs`
    ? Promise.resolve(Response.json({ keys: [jwk] })) : nativeFetch(input, init)) as typeof fetch;
  let middleware!: (request: IncomingMessage, response: ServerResponse, next: () => void) => void;
  const app = createServer((request, response) => {
    if (!request.url?.startsWith('/api/')) { proxy(request, response, baseURL!); return; }
    middleware(request, response, () => { response.writeHead(404); response.end(); });
  });
  const edgeLogin = async (url: string) => worker.fetch(new Request(new URL(new URL(url).pathname + new URL(url).search, env.APP_ORIGIN), { headers: { 'Cf-Access-Jwt-Assertion': token, 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' } }), env);
  const edge = createServer((request, response) => {
    void edgeLogin(`http://edge.invalid${request.url}`).then(async result => {
      response.writeHead(result.status, Object.fromEntries(result.headers.entries()));
      response.end(Buffer.from(await result.arrayBuffer()));
    }).catch(() => { response.writeHead(500); response.end(); });
  });
  try {
    const origin = (await listen(app)).replace('127.0.0.1', process.env.FILM_PHOTO_TEST_HOST ?? '127.0.0.1');
    const edgeOrigin = await listen(edge);
    env.DEV_LOGIN_ORIGINS = process.env.FILM_PHOTO_TEST_HOST === 'macbook' ? 'http://macbook:*' : origin;
    const bridge = devAdminBridge({ origins: [env.DEV_LOGIN_ORIGINS], appOrigin: edgeOrigin, photoOrigin: env.PHOTO_ORIGIN,
      fetcher: async (input, init) => {
        const url = new URL(String(input));
        if (url.origin === edgeOrigin) {
          if (['PUT', 'PATCH', 'POST', 'DELETE'].includes(init?.method ?? '') && /\/(rolls|drafts|publications)\//.test(url.pathname)) {
            mutations.push(`${init!.method} ${url.pathname}`);
            await saveGate;
          }
          const headers = new Headers(init?.headers);
          if (headers.get('Cookie') === `CF_Authorization=${token}`) headers.set('Cf-Access-Jwt-Assertion', token);
          if (headers.has('Origin')) headers.set('Origin', env.APP_ORIGIN);
          return worker.fetch(new Request(new URL(url.pathname + url.search, env.APP_ORIGIN), { ...init, headers }), env);
        }
        if (url.hostname.endsWith('.r2.cloudflarestorage.com')) {
          const key = url.pathname.slice(env.PRIVATE_BUCKET_NAME.length + 2);
          uploads.push(key);
          await privateBucket.put(key, new Uint8Array(await new Response(init?.body).arrayBuffer()), { httpMetadata: { contentType: 'image/jpeg' } });
          return new Response(null, { status: 200 });
        }
        if (url.origin === env.PHOTO_ORIGIN) {
          const object = publicBucket.objects.get(url.pathname.slice(1));
          return new Response(object ? new Uint8Array(object.bytes) : null, { status: object ? 200 : 404, headers: { 'Content-Type': 'image/jpeg' } });
        }
        throw new Error('Unexpected upstream');
      },
    });
    if (typeof bridge.configureServer !== 'function') throw new Error('Missing bridge middleware');
    (bridge.configureServer as (server: ViteDevServer) => unknown)({ httpServer: app, middlewares: { use: (handler: typeof middleware) => { middleware = handler; } } } as unknown as ViteDevServer);
    const renewLogin = async () => {
      const start = await page.context().request.get(`${origin}/api/dev-auth/login`, { maxRedirects: 0 });
      const verified = await edgeLogin(start.headers().location);
      const callback = await page.context().request.get(verified.headers.get('location')!, { maxRedirects: 0 });
      expect(callback.status()).toBe(303);
      expect(callback.headers().location).toBe(`${origin}/`);
    };
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${origin}/?mode=room&reduced_motion=true`); await ready(page);
    if (process.env.FILM_PHOTO_TEST_HOST === 'macbook') expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
    await page.getByRole('button', { name: 'More options' }).click();
    await expect(page.getByRole('menu')).toContainText('Admin Login');
    await page.getByRole('menuitem', { name: 'Admin Login' }).click();
    await expect(page).toHaveURL(`${origin}/`); await ready(page);
    const sessionCookie = (await page.context().cookies()).find(value => value.name === 'film_dev_session')!;
    expect(sessionCookie.httpOnly).toBe(true);
    expect(sessionCookie.value).not.toBe(token);
    expect(await page.evaluate(() => document.cookie)).not.toContain('film_dev_session');
    const csrf = await page.context().request.delete(`${origin}/api/owner/publications/${webcrypto.randomUUID()}`, { headers: { Origin: 'https://attacker.invalid' } });
    expect(csrf.status()).toBe(403);
    await page.getByRole('button', { name: 'More options' }).click();
    await expect(page.getByRole('menuitem', { name: 'Logged in' })).toBeVisible();
    await page.screenshot({ path: info.outputPath('logged-in-menu-phone.png') });
    await page.getByRole('menuitem', { name: 'Logged in' }).press('Escape');
    await expect(page.locator('.shelf-toolbar')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'New roll', exact: true })).toHaveCount(0);
    await focusShelf(page);
    await expect(page.getByRole('button',{name:'New roll',exact:true})).toBeVisible();
    await page.getByRole('button', { name: 'Room', exact: true }).click(); await ready(page);
    await expect(page.locator('.shelf-toolbar')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'New roll', exact: true })).toHaveCount(0);
    await focusShelf(page);
    await shelfAction(page, 'New roll');
    const editor = page.getByRole('dialog', { name: 'Review roll' });
    await expect(editor).toContainText('Saving publishes this roll');
    const original = metadataBearingPhotograph();
    expect(original.toString('latin1')).toContain('GPS PRIVATE LOCATION');
    await editor.getByLabel('Choose photographs', { exact: true }).setInputFiles({ name: 'private-location.jpg', mimeType: 'image/jpeg', buffer: original });
    await expect(editor.getByText('Processed 1 / 1', { exact: true })).toBeVisible();
    await editor.getByLabel('Roll name', { exact: true }).fill('Browser-published photograph');
    await expect(editor.getByText('Photographs uploaded. Ready to save.', { exact: true })).toBeVisible();
    expect(uploads).toHaveLength(2);
    expect((await (await nativeFetch(`${origin}/api/gallery`)).json()).rolls).toHaveLength(0);
    saveGate = new Promise<void>(resolve => { finishSave = resolve; });
    const copyGate = new Promise<void>(resolve => { finishCopies = resolve; });
    publicBucket.beforePut = async key => { if (key.endsWith('.jpg')) await copyGate; };
    await editor.getByRole('button', { name: 'Save and open' }).click();
    await expect(editor.getByRole('progressbar', { name: 'Saving roll…' })).toBeVisible();
    await expect(editor.getByRole('progressbar', { name: 'Saving roll…' })).not.toHaveAttribute('value');
    await expect(editor.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.screenshot({ path: info.outputPath('saving-roll-progress.png') });
    finishSave();
    const publishing = editor.getByRole('progressbar', { name: 'Publishing photographs…' });
    await expect(publishing).toHaveAttribute('value', '0');
    await expect(publishing).toHaveAttribute('max', '1');
    await expect(publishing).toBeInViewport();
    await expect(editor.getByRole('button', { name: 'Saving and opening…' })).toBeDisabled();
    await page.screenshot({ path: info.outputPath('publishing-roll-progress-phone.png') });
    finishCopies();
    await expect(editor).toHaveCount(0);
    expect(mutations.filter(path => path.startsWith('PUT '))).toHaveLength(1);
    expect(mutations.every(path => path.includes('/api/owner/rolls/'))).toBe(true);
    expect(uploads).toHaveLength(2);
    expect(uploads.map(key => key.split('/').at(-1))).toEqual(['viewing', 'thumbnail']);
    for (const object of privateBucket.objects.values()) if (object.httpMetadata.contentType === 'image/jpeg') {
      expect(Buffer.from(object.bytes).toString('latin1')).not.toContain('GPS PRIVATE LOCATION');
    }
    await focusShelf(page);
    await page.getByRole('button', { name: 'Show saved roll Browser-published photograph' }).click();
    await page.getByRole('button', { name: 'Edit Browser-published photograph', exact: true }).click();
    await editor.getByLabel('Roll name', { exact: true }).fill('Edited published photograph');
    // A session expiring while editing must preserve the draft and keep the dialog usable.
    await page.context().clearCookies();
    const expired = page.waitForResponse(response => response.url().endsWith('/api/owner/session') && response.status() === 401);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expired;
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await editor.getByRole('button', { name: 'Save and open' }).click();
    await expect(editor.getByRole('alert')).toBeVisible();
    await expect(editor.getByLabel('Roll name', { exact: true })).toHaveValue('Edited published photograph');
    await renewLogin();
    const authenticated = page.waitForResponse(response => response.url().endsWith('/api/owner/session') && response.status() === 200);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await authenticated;
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(editor).toHaveCount(0);
    expect(uploads).toHaveLength(2);
    await focusShelf(page);
    await page.getByRole('button', { name: 'Show saved roll Edited published photograph' }).click();
    await page.getByRole('button', { name: 'Delete Edited published photograph' }).click();
    await expect(editor).toHaveCount(0);
    await expectShelfSummary(page, '0 saved rolls');
    await expect.poll(async () => (await (await nativeFetch(`${origin}/api/gallery`)).json()).rolls.length).toBe(0);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expectShelfSummary(page, '1 saved roll');
    await expect.poll(async () => (await (await nativeFetch(`${origin}/api/gallery`)).json()).rolls.length).toBe(1);
    await page.getByRole('button', { name: 'Show saved roll Edited published photograph' }).click();
    await page.getByRole('button', { name: 'Delete Edited published photograph' }).click();
    await expect(editor).toHaveCount(0);
    await expectShelfSummary(page, '0 saved rolls');
    await expect.poll(async () => (await (await nativeFetch(`${origin}/api/gallery`)).json()).rolls.length).toBe(0);
    await page.reload(); await ready(page); await focusShelf(page);
    await shelfAction(page, 'Trash (1)');
    await page.getByRole('button', { name: 'Show saved roll Edited published photograph' }).click();
    await page.getByRole('button', { name: 'Restore Edited published photograph' }).click();
    await shelfAction(page, 'Saved rolls');
    await page.getByRole('button', { name: 'Show saved roll Edited published photograph' }).click();
    await page.getByRole('button', { name: 'Edit Edited published photograph', exact: true }).click();
    await editor.getByLabel('Roll name', { exact: true }).fill('Browser-published photograph');
    await editor.getByRole('button', { name: 'Save and open' }).click();
    await expect(editor).toHaveCount(0);

    const fresh = await browser.newContext();
    try {
      await fresh.addInitScript(() => localStorage.setItem('film-reverie-intro-tour', 'done'));
      const visitor = await fresh.newPage();
      await visitor.goto(`${origin}/?mode=room&reduced_motion=true`); await ready(visitor);
      await focusShelf(visitor);
      const card = visitor.getByRole('button', { name: 'Show published roll Browser-published photograph' });
      await expect(card).toBeVisible();
      await card.click();
      await visitor.getByRole('dialog', { name: /Browser-published photograph — roll details/ }).getByRole('button', { name: /Open on light table/ }).click();
      await expect(visitor.locator('main')).toHaveAttribute('data-roll-id', /^gallery:/);
      await visitor.goto(`${origin}/guest?mode=room&reduced_motion=true`);
      await visitor.getByRole('button', { name: 'Enter guest darkroom' }).click(); await ready(visitor);
      await focusShelf(visitor);
      await expect(visitor.getByRole('button', { name: 'Show saved roll Browser-published photograph' })).toHaveCount(0);
      await expect(visitor.getByRole('button', { name: 'Show saved roll Roll 01' })).toBeVisible();
    } finally { await fresh.close(); }
  } finally { finishSave(); finishCopies(); globalThis.fetch = nativeFetch; await close(app); await close(edge); }
});
