import { test, expect, type Page } from '@playwright/test';
import { webcrypto } from 'node:crypto';
import { createServer, request as httpRequest, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import worker from '../../cloudflare/worker';
import { environment, photograph, type MemoryBucket } from '../integration/m21-worker-fixtures';
import type { Env } from '../../cloudflare/types';
import { focusShelf, ready } from './helpers/shelf';

async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
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


function routeR2(page: Page, env: Env, privateBucket: MemoryBucket, publicBucket: MemoryBucket, puts: string[]) {
  void page.route(`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/**`, async route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'PUT, OPTIONS', 'Access-Control-Allow-Headers': 'content-type,x-amz-content-sha256', 'Access-Control-Max-Age': '300' } });
      return;
    }
    expect(request.method()).toBe('PUT');
    expect(url.pathname).toMatch(new RegExp(`^/${env.PRIVATE_BUCKET_NAME}/staging/[0-9a-f-]+/(viewing|thumbnail)$`));
    const key = url.pathname.slice(env.PRIVATE_BUCKET_NAME.length + 2);
    puts.push(key);
    await privateBucket.put(key, new Uint8Array(request.postDataBuffer()!), { httpMetadata: { contentType: request.headers()['content-type'] } });
    await route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  void page.route(`${env.PHOTO_ORIGIN}/rolls/**`, async route => {
    const key = new URL(route.request().url()).pathname.slice(1), object = publicBucket.objects.get(key);
    if (!object) { await route.fulfill({ status: 404 }); return; }
    await route.fulfill({ status: 200, body: Buffer.from(object.bytes), headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' } });
  });
}

test('Admin publishes browser-derived JPEGs; a new gallery session sees only public images, while guest stays local', async ({ page, browser, baseURL }) => {
  const { env, privateBucket, publicBucket } = environment();
  const { token, jwk } = await ownerToken(env);
  const nativeFetch = globalThis.fetch, uploads: string[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => String(input) === `${env.ACCESS_ISSUER}/cdn-cgi/access/certs`
    ? Promise.resolve(Response.json({ keys: [jwk] })) : nativeFetch(input, init)) as typeof fetch;
  const app = createServer((request, response) => {
    if (!request.url?.startsWith('/api/')) { proxy(request, response, baseURL!); return; }
    void (async () => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) if (value) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      // Simulate the Access/TLS edge; the browser itself remains on localhost.
      headers.delete('host'); headers.delete('sec-fetch-site');
      if (request.url!.startsWith('/api/owner/')) headers.set('Cf-Access-Jwt-Assertion', token);
      if (!['GET', 'HEAD'].includes(request.method!)) headers.set('Origin', env.APP_ORIGIN);
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const result = await worker.fetch(new Request(new URL(request.url!, env.APP_ORIGIN), { method: request.method, headers, body }), env);
      response.writeHead(result.status, Object.fromEntries(result.headers.entries()));
      response.end(Buffer.from(await result.arrayBuffer()));
    })().catch(error => { response.writeHead(500); response.end(String(error)); });
  });
  try {
    const origin = await listen(app);
    routeR2(page, env, privateBucket, publicBucket, uploads);
    await page.goto(`${origin}/?mode=room&reduced_motion=true`); await ready(page);
    await page.getByRole('button', { name: 'Admin', exact: true }).click();
    const admin = page.getByRole('dialog', { name: 'Owner publishing' });
    await expect(admin.getByText(`Authenticated owner: ${env.OWNER_EMAIL}`)).toBeVisible();
    await admin.getByRole('button', { name: 'New photo draft' }).click();
    await admin.getByLabel('Owner roll name').fill('Browser-published photograph');
    const original = metadataBearingPhotograph();
    expect(original.toString('latin1')).toContain('GPS PRIVATE LOCATION');
    await admin.getByLabel('Choose owner photographs').setInputFiles({ name: 'private-location.jpg', mimeType: 'image/jpeg', buffer: original });
    await expect(admin.locator('.owner-progress')).toContainText('prepared locally');
    await admin.getByRole('button', { name: 'Save private draft' }).click();
    await expect(admin.locator('.owner-progress')).toContainText('Private draft saved');
    expect(uploads).toHaveLength(2);
    expect(uploads.map(key => key.split('/').at(-1))).toEqual(['viewing', 'thumbnail']);
    for (const object of privateBucket.objects.values()) if (object.httpMetadata.contentType === 'image/jpeg') {
      expect(Buffer.from(object.bytes).toString('latin1')).not.toContain('GPS PRIVATE LOCATION');
    }
    await admin.getByRole('button', { name: 'Preview saved draft' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Private admin preview' })).toBeVisible();
    await page.getByRole('button', { name: /Return to owner/ }).click();
    await admin.getByRole('checkbox', { name: /reviewed this saved preview/ }).check();
    await admin.getByRole('button', { name: 'Publish revision' }).click();
    await expect(admin.locator('.owner-progress')).toContainText('Published “Browser-published photograph”');
    await admin.getByRole('button', { name: 'Close' }).click();

    const fresh = await browser.newContext();
    try {
      const visitor = await fresh.newPage();
      routeR2(visitor, env, privateBucket, publicBucket, uploads);
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
  } finally { globalThis.fetch = nativeFetch; await close(app); }
});
