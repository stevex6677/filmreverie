import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ViteDevServer } from 'vite';
import { devAdminBridge } from '../../scripts/dev-admin-bridge';

const appOrigin = 'https://filmreverie.app', photoOrigin = 'https://photos.filmreverie.app';
const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const server of servers.splice(0)) await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); });
async function fixture(hostname = '127.0.0.1', preview = false, loginEnabled = true) {
  let middleware!: (request: IncomingMessage, response: ServerResponse, next: () => void) => void;
  const server = createServer((request, response) => middleware(request, response, () => { response.statusCode = 404; response.end(); }));
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const origin = `http://${hostname}:${port}`;
  const request = async (path: string, init?: RequestInit): Promise<Response> => {
    const bytes = init?.body ? Buffer.from(await new Response(init.body).arrayBuffer()) : undefined;
    return new Promise((resolve, reject) => {
      const req = httpRequest(`http://127.0.0.1:${port}${path}`, {
        method: init?.method, headers: { ...Object.fromEntries(new Headers(init?.headers)), Host: `${hostname}:${port}` },
      }, res => {
        const chunks: Buffer[] = [], headers = new Headers();
        for (let i = 0; i < res.rawHeaders.length; i += 2) headers.append(res.rawHeaders[i], res.rawHeaders[i + 1]);
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode, headers })));
        res.on('error', reject);
      });
      req.on('error', reject); req.end(bytes);
    });
  };
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/api/dev-auth/exchange')) return Response.json({ token: 'secret-access-application-token', email: 'owner@example.com', expiresAt: Date.now() + 300_000 });
    if (url.endsWith('/api/owner/uploads')) return Response.json({ id: 'grant', expiresAt: Date.now() + 60_000, uploads: {
      viewing: { url: 'https://account.r2.cloudflarestorage.com/private/staging/grant/viewing?signature=secret', headers: { 'Content-Type': 'image/jpeg', 'x-amz-content-sha256': 'test-hash' } },
      thumbnail: { url: 'https://account.r2.cloudflarestorage.com/private/staging/grant/thumbnail?signature=secret', headers: { 'Content-Type': 'image/jpeg' } },
    } });
    if (url.includes('.r2.cloudflarestorage.com/')) return new Response(null);
    if (url.endsWith('/api/gallery')) return Response.json({ version: 1, rolls: [{ frames: [{ viewing: { url: `${photoOrigin}/rolls/test/viewing.jpg` }, thumbnail: { url: `${photoOrigin}/rolls/test/thumbnail.jpg` } }] }] });
    if (url.startsWith(photoOrigin)) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/jpeg' } });
    if (init?.method === 'DELETE') return Response.json({ withdrawn: true });
    return Response.json({ email: 'owner@example.com' });
  });
  const plugin = devAdminBridge({ origins: loginEnabled ? [hostname === '127.0.0.1' ? origin : `http://${hostname}:*`] : [], appOrigin, photoOrigin, fetcher });
  ((preview ? plugin.configurePreviewServer : plugin.configureServer) as (server: ViteDevServer) => unknown)({ httpServer: server, middlewares: { use: (value: typeof middleware) => { middleware = value; } } } as unknown as ViteDevServer);
  async function start(returnTo = '/') {
    const response = await request(`/api/dev-auth/login?returnTo=${encodeURIComponent(returnTo)}`, { redirect: 'manual' });
    const destination = new URL(response.headers.get('location')!);
    return { pendingCookie: response.headers.get('set-cookie')!.split(';')[0], state: destination.searchParams.get('state')!, destination };
  }
  async function complete(login: Awaited<ReturnType<typeof start>>) {
    const response = await request(`/api/dev-auth/callback?code=one-time-code&state=${login.state}`, { headers: { Cookie: login.pendingCookie }, redirect: 'manual' });
    return { response, sessionCookie: response.headers.getSetCookie().find(value => value.startsWith('film_dev_session='))!.split(';')[0] };
  }
  return { origin, fetcher, start, complete, request };
}

describe('real-gallery development bridge', () => {
  it('does not require an admin callback allowlist to read public data on macbook', async () => {
    const { request } = await fixture('macbook', false, false);
    expect((await request('/api/gallery')).status).toBe(200);
    expect((await request('/api/dev-images/rolls/test/viewing.jpg')).status).toBe(200);
    expect((await request('/api/dev-auth/login')).status).toBe(403);
  });
  it.each([['macbook', false], ['macbook.tail2b1388.ts.net', true]] as const)('serves anonymous photos and authenticated mutations over HTTP on %s (preview: %s)', async (hostname, preview) => {
    const { origin, request, start, complete, fetcher } = await fixture(hostname, preview);
    const gallery = await (await request('/api/gallery')).json();
    const photo = new URL(gallery.rolls[0].frames[0].viewing.url);
    expect(photo.origin).toBe(origin);
    expect((await request(photo.pathname)).headers.get('content-type')).toBe('image/jpeg');
    expect((await request('/api/owner/session')).status).toBe(401);
    expect((await request('/api/owner/uploads', { method: 'POST', headers: { Origin: origin } })).status).toBe(401);
    expect((await request('/api/owner/publications/id', { method: 'DELETE', headers: { Origin: origin } })).status).toBe(401);
    // Non-secure HTTP navigation lacks Sec-Fetch-* headers, including in static previews.
    const navigation = await request('/api/owner/session', { headers: { Accept: 'text/html' }, redirect: 'manual' });
    expect(navigation.status).toBe(303);
    expect(new URL(navigation.headers.get('location')!).searchParams.get('redirect_uri')).toBe(`${origin}/api/dev-auth/callback`);
    const { response, sessionCookie } = await complete(await start('/?mode=room#shelf'));
    expect(response.headers.get('location')).toBe(`${origin}/?mode=room#shelf`);
    expect(response.headers.getSetCookie()[0]).not.toContain('; Secure');
    const headers = { Cookie: sessionCookie, Origin: origin };
    expect((await request('/api/owner/uploads', { method: 'POST', headers, body: '{}' })).status).toBe(200);
    expect((await request('/api/owner/publications/id', { method: 'DELETE', headers })).status).toBe(200);
    expect(fetcher.mock.calls.at(-1)![1]!.headers).toMatchObject({ Cookie: 'CF_Authorization=secret-access-application-token' });
    expect((await request('/api/owner/publications/id', { method: 'DELETE', headers: { ...headers, Origin: 'http://evil.test' } })).status).toBe(403);
  });
  it('returns to the initiating dev URL, keeps Access tokens server-side, and binds login to state and a pending cookie', async () => {
    const { origin, fetcher, start, complete } = await fixture();
    expect((await fetch(`${origin}/api/owner/session`)).status).toBe(401);
    const login = await start('/?mode=room#shelf');
    expect(login.destination.origin).toBe(appOrigin);
    expect(login.destination.searchParams.get('redirect_uri')).toBe(`${origin}/api/dev-auth/callback`);
    expect(login.destination.searchParams.get('challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await fetch(`${origin}/api/dev-auth/callback?state=wrong`, { headers: { Cookie: login.pendingCookie } })).status).toBe(401);
    expect((await fetch(`${origin}/api/dev-auth/callback?state=${login.state}`)).status).toBe(401);
    const { response, sessionCookie } = await complete(login);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`${origin}/?mode=room#shelf`);
    expect(response.headers.getSetCookie()[0]).toContain('HttpOnly; SameSite=Lax');
    expect(sessionCookie).not.toContain('secret-access');
    expect((await fetch(`${origin}/api/dev-auth/callback?state=${login.state}`, { headers: { Cookie: login.pendingCookie } })).status).toBe(401);
    const session = await fetch(`${origin}/api/owner/session`, { headers: { Cookie: sessionCookie } });
    expect(await session.json()).toEqual({ email: 'owner@example.com' });
    const exchange = fetcher.mock.calls.find(([url]) => String(url).endsWith('/exchange'))!;
    expect(JSON.parse(exchange[1]!.body as string).verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(exchange[1]!.headers).not.toHaveProperty('Origin');
    const upstream = fetcher.mock.calls.at(-1)![1]!;
    expect(upstream.headers).toMatchObject({ Cookie: 'CF_Authorization=secret-access-application-token', Origin: appOrigin });
  });
  it('rejects hostile origins and return URLs, and forwards authorized delete to production', async () => {
    const { origin, fetcher, start, complete } = await fixture();
    expect((await fetch(`${origin}/api/dev-auth/login?returnTo=https://attacker.invalid`, { redirect: 'manual' })).status).toBe(400);
    const { sessionCookie } = await complete(await start());
    for (const Origin of [undefined, 'https://attacker.invalid']) {
      expect((await fetch(`${origin}/api/owner/publications/id`, { method: 'DELETE', headers: { Cookie: sessionCookie, ...(Origin ? { Origin } : {}) } })).status).toBe(403);
    }
    const result = await fetch(`${origin}/api/owner/publications/id`, { method: 'DELETE', headers: { Cookie: sessionCookie, Origin: origin, Authorization: 'untrusted', 'Cf-Access-Jwt-Assertion': 'untrusted' } });
    expect(result.status).toBe(200);
    expect(fetcher.mock.calls.at(-1)![0]).toBe(`${appOrigin}/api/owner/publications/id`);
    expect(fetcher.mock.calls.at(-1)![1]!.headers).not.toHaveProperty('Authorization');
    expect((await fetch(`${origin}/api/owner/session`, { headers: { Cookie: sessionCookie, 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403);
  });
  it('proxies signed uploads within session and size limits and public photos on the dev origin', async () => {
    const { origin, fetcher, start, complete } = await fixture();
    const { sessionCookie } = await complete(await start());
    const response = await fetch(`${origin}/api/owner/uploads`, { method: 'POST', headers: { Cookie: sessionCookie, Origin: origin, 'Content-Type': 'application/json' }, body: '{}' });
    const grant = await response.json();
    expect(JSON.stringify(grant)).not.toContain('signature=secret');
    expect((await fetch(`${origin}${grant.uploads.viewing.url}`, { method: 'PUT', headers: { Origin: origin }, body: new Uint8Array([1]) })).status).toBe(401);
    const upload = await fetch(`${origin}${grant.uploads.viewing.url}`, { method: 'PUT', headers: { Cookie: sessionCookie, Origin: origin }, body: new Uint8Array([1, 2, 3]) });
    expect(upload.status).toBe(200);
    expect(fetcher.mock.calls.at(-1)![1]!.headers).toMatchObject({ 'Content-Length': '3', 'x-amz-content-sha256': 'test-hash' });
    expect((await fetch(`${origin}${grant.uploads.thumbnail.url}`, { method: 'PUT', headers: { Cookie: sessionCookie, Origin: origin }, body: new Uint8Array(512 * 1024 + 1) })).status).toBe(413);
    const gallery = await (await fetch(`${origin}/api/gallery`)).json();
    expect(gallery.rolls[0].frames[0].viewing.url).toBe(`${origin}/api/dev-images/rolls/test/viewing.jpg`);
    expect((await fetch(gallery.rolls[0].frames[0].viewing.url)).headers.get('content-type')).toBe('image/jpeg');
    expect((await fetch(`${origin}/api/dev-images/rolls/test/viewing.jpg?url=https://attacker.invalid`)).status).toBe(400);
  });
  it('clears expired sessions and translates Access redirects into a usable login-required response', async () => {
    const { origin, fetcher, start, complete } = await fixture();
    const { sessionCookie } = await complete(await start());
    fetcher.mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: 'https://access.invalid/login' } }));
    const expired = await fetch(`${origin}/api/owner/session`, { headers: { Cookie: sessionCookie } });
    expect(expired.status).toBe(401);
    expect(expired.headers.get('location')).toBeNull();
    expect(expired.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await expired.json()).error).toContain('unsaved draft is retained');
    expect((await fetch(`${origin}/api/owner/session`, { headers: { Cookie: sessionCookie } })).status).toBe(401);
  });
});
