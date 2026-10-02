import { createHash, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer, PreviewServer } from 'vite';
import type { GalleryCatalog, UploadGrant } from '../src/cloud/contracts.ts';
import { isDevOrigin, isDevOriginPattern, matchesDevOrigin } from '../cloudflare/devOrigins.ts';

interface Options { origins: string[]; appOrigin: string; photoOrigin: string; fetcher?: typeof fetch }
interface Pending { origin: string; verifier: string; state: string; returnPath: string; expiresAt: number }
interface Session { origin: string; token: string; expiresAt: number }
interface Upload { session: string; expiresAt: number; target: UploadGrant['uploads']['viewing']; limit: number }
class BridgeError extends Error { constructor(public status: number, message: string) { super(message); } }
const random = () => randomBytes(32).toString('base64url');
const cookies = (request: IncomingMessage) => Object.fromEntries((request.headers.cookie ?? '').split(';').map(value => value.trim().split('=')));
const cookie = (name: string, value: string, origin: string, seconds: number) => `${name}=${value}; Path=/api/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${origin.startsWith('https:') ? '; Secure' : ''}`;
async function body(request: IncomingMessage, limit: number) {
  const chunks: Buffer[] = []; let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > limit) throw new BridgeError(413, 'Request exceeds the upload limit.');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
function sameOrigin(request: IncomingMessage, origin: string) {
  if (request.headers['sec-fetch-site'] === 'cross-site'
    || request.headers.origin && request.headers.origin !== origin
    || !['GET', 'HEAD'].includes(request.method ?? '') && request.headers.origin !== origin) {
    throw new BridgeError(403, 'Management requests must originate from this development app.');
  }
}

/** Local development backend. Credentials stay in server memory. */
export function devAdminBridge(options: Options): Plugin {
  const fetcher = options.fetcher ?? fetch;
  const pending = new Map<string, Pending>(), sessions = new Map<string, Session>(), uploads = new Map<string, Upload>();
  const origins = options.origins.map(value => {
    if (!isDevOriginPattern(value)) throw new Error('Invalid dev admin origin');
    return value;
  });
  const sweep = () => {
    for (const records of [pending, sessions, uploads]) for (const [id, record] of records) if (record.expiresAt <= Date.now()) records.delete(id);
  };
  const originFor = (request: IncomingMessage, publicRead: boolean) => {
    // Keep explicitly configured HTTPS reverse-proxy origins ahead of port patterns.
    const exact = origins.filter(origin => !origin.endsWith(':*') && new URL(origin).host === request.headers.host);
    const matches = exact.length ? exact : [...new Set(origins.map(pattern => {
      const protocol = pattern.slice(0, pattern.indexOf(':'));
      const origin = `${protocol}://${request.headers.host}`;
      return matchesDevOrigin(origin, pattern) ? origin : undefined;
    }).filter((origin): origin is string => !!origin))];
    if (!matches.length && publicRead) {
      const origin = `http://${request.headers.host}`;
      if (isDevOrigin(origin)) return origin;
    }
    if (matches.length !== 1) throw new BridgeError(403, 'This development host is not configured for admin login.');
    return matches[0];
  };
  const send = async (response: ServerResponse, upstream: Response) => {
    response.statusCode = upstream.status;
    for (const name of ['content-type', 'content-length']) if (upstream.headers.has(name)) response.setHeader(name, upstream.headers.get(name)!);
    response.end(Buffer.from(await upstream.arrayBuffer()));
  };
  async function handle(request: IncomingMessage, response: ServerResponse) {
    sweep();
    const path = new URL(request.url!, 'http://development.invalid').pathname;
    const publicRead = request.method === 'GET' && (path === '/api/gallery' || path.startsWith('/api/dev-images/rolls/'));
    const origin = originFor(request, publicRead), url = new URL(request.url!, origin);
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const redirect = (location: string) => { response.statusCode = 303; response.setHeader('Location', location); response.end(); };
    const json = (value: unknown) => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(value)); };
    const navigation = request.headers['sec-fetch-mode'] === 'navigate' && request.headers['sec-fetch-dest'] === 'document'
      || !request.headers['sec-fetch-mode'] && request.headers.accept?.includes('text/html');
    if (request.method === 'GET' && (path === '/api/dev-auth/login' || path === '/api/owner/session' && navigation)) {
      if (request.headers['sec-fetch-dest'] === 'iframe' || request.headers['sec-fetch-site'] === 'cross-site') throw new BridgeError(403, 'Open Admin Login from the development app.');
      const id = random(), state = random(), verifier = random();
      const returnUrl = new URL(url.searchParams.get('returnTo') ?? '/', origin);
      if (returnUrl.origin !== origin || returnUrl.pathname.startsWith('/api/')) throw new BridgeError(400, 'Invalid development return URL.');
      pending.set(id, { origin, state, verifier, returnPath: `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`, expiresAt: Date.now() + 10 * 60_000 });
      response.setHeader('Set-Cookie', cookie('film_dev_pending', id, origin, 600));
      const destination = new URL('/api/owner/dev-login', options.appOrigin);
      destination.searchParams.set('redirect_uri', `${origin}/api/dev-auth/callback`);
      destination.searchParams.set('state', state);
      destination.searchParams.set('challenge', createHash('sha256').update(verifier).digest('base64url'));
      return redirect(destination.href);
    }
    if (path === '/api/dev-auth/callback' && request.method === 'GET') {
      const id = cookies(request).film_dev_pending, login = pending.get(id);
      if (!login || login.origin !== origin || login.state !== url.searchParams.get('state')) throw new BridgeError(401, 'Development login expired. Open Admin Login again.');
      pending.delete(id);
      const upstream = await fetcher(`${options.appOrigin}/api/dev-auth/exchange`, {
        method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: url.searchParams.get('code'), verifier: login.verifier, redirectUri: `${origin}/api/dev-auth/callback` }),
      });
      if (!upstream.ok) throw new BridgeError(401, 'Development login could not be completed. Open Admin Login again.');
      const grant = await upstream.json() as { token: string; expiresAt: number; email: string };
      if (typeof grant.token !== 'string' || !grant.token || !Number.isSafeInteger(grant.expiresAt) || grant.expiresAt <= Date.now()) throw new BridgeError(401, 'Development login expired.');
      const sessionId = random();
      sessions.set(sessionId, { origin, token: grant.token, expiresAt: grant.expiresAt });
      response.setHeader('Set-Cookie', [cookie('film_dev_session', sessionId, origin, Math.floor((grant.expiresAt - Date.now()) / 1000)), cookie('film_dev_pending', '', origin, 0)]);
      return redirect(`${origin}${login.returnPath}`);
    }
    if (path === '/api/gallery' && request.method === 'GET') {
      const upstream = await fetcher(`${options.appOrigin}/api/gallery`, { redirect: 'error' });
      if (!upstream.ok) return send(response, upstream);
      const catalog = await upstream.json() as GalleryCatalog;
      for (const roll of catalog.rolls) for (const frame of roll.frames) for (const kind of ['viewing', 'thumbnail'] as const) {
        const image = new URL(frame[kind].url);
        if (image.origin !== options.photoOrigin || !image.pathname.startsWith('/rolls/') || image.search || image.hash) throw new BridgeError(502, 'Unexpected published image location.');
        frame[kind].url = `${origin}/api/dev-images${image.pathname}`;
      }
      return json(catalog);
    }
    if (path.startsWith('/api/dev-images/rolls/') && request.method === 'GET') {
      const destination = new URL(path.slice('/api/dev-images'.length), options.photoOrigin);
      if (destination.origin !== options.photoOrigin || !destination.pathname.startsWith('/rolls/') || url.search) throw new BridgeError(400, 'Invalid public image location.');
      return send(response, await fetcher(destination.href, { redirect: 'error' }));
    }
    const sessionId = cookies(request).film_dev_session, session = sessions.get(sessionId);
    if (!session || session.origin !== origin) throw new BridgeError(401, 'Admin login required. Your unsaved draft is retained.');
    sameOrigin(request, origin);
    if (path.startsWith('/api/dev-auth/upload/') && request.method === 'PUT') {
      const uploadId = path.slice('/api/dev-auth/upload/'.length), upload = uploads.get(uploadId);
      if (!upload || upload.session !== sessionId) throw new BridgeError(401, 'Upload authorization expired. Save again.');
      const bytes = await body(request, upload.limit);
      return send(response, await fetcher(upload.target.url, { method: 'PUT', headers: { ...upload.target.headers, 'Content-Length': String(bytes.length) }, body: new Uint8Array(bytes), redirect: 'error' }));
    }
    if (!path.startsWith('/api/owner/')) throw new BridgeError(404, 'Development API route was not found.');
    // Never forward browser cookies, arbitrary headers or browser Fetch metadata.
    const headers: Record<string, string> = { Cookie: `CF_Authorization=${session.token}`, Origin: options.appOrigin, Accept: request.headers.accept ?? 'application/json' };
    if (request.headers['content-type']) headers['Content-Type'] = request.headers['content-type'];
    const bytes = ['GET', 'HEAD'].includes(request.method!) ? undefined : new Uint8Array(await body(request, 1024 * 1024));
    const upstream = await fetcher(`${options.appOrigin}${path}${url.search}`, { method: request.method, headers, body: bytes, redirect: 'manual' });
    if (upstream.status === 401 || upstream.status === 403 || upstream.status >= 300 && upstream.status < 400) {
      sessions.delete(sessionId);
      response.setHeader('Set-Cookie', cookie('film_dev_session', '', origin, 0));
      throw new BridgeError(401, 'Admin session expired. Log in again; your unsaved draft is retained.');
    }
    if (path === '/api/owner/uploads' && request.method === 'POST' && upstream.ok) {
      const grant = await upstream.json() as UploadGrant;
      for (const kind of ['viewing', 'thumbnail'] as const) {
        const target = grant.uploads[kind], destination = new URL(target.url);
        if (destination.protocol !== 'https:' || !destination.hostname.endsWith('.r2.cloudflarestorage.com') || destination.username || destination.password) throw new BridgeError(502, 'Invalid storage upload destination.');
        const id = random();
        uploads.set(id, { session: sessionId, target, expiresAt: grant.expiresAt, limit: kind === 'viewing' ? 5 * 1024 * 1024 : 512 * 1024 });
        grant.uploads[kind] = { url: `/api/dev-auth/upload/${id}`, headers: { 'Content-Type': 'image/jpeg' } };
      }
      return json(grant);
    }
    return send(response, upstream);
  }
  const configure = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use((request, response, next) => {
      if (!request.url?.startsWith('/api/')) return next();
      void handle(request, response).catch(error => {
        if (response.headersSent) return response.destroy();
        response.statusCode = error instanceof BridgeError ? error.status : 502;
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ error: error instanceof BridgeError ? error.message : 'Cloud gallery is unavailable. Your saved work is retained.' }));
      });
    });
    server.httpServer?.once('close', () => { pending.clear(); sessions.clear(); uploads.clear(); });
  };
  return {
    name: 'film-photo-dev-admin', apply: 'serve',
    configureServer: configure,
    configurePreviewServer: configure,
  };
}
