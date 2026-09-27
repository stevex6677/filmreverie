import type { CloudDraft, UploadRequest } from '../src/cloud/contracts';
import { authorize, checkConfig, checkMutationOrigin } from './auth';
import { completeUpload, grantUpload, listDrafts, privateImage, publicCatalog, publishDraft, readDraft, saveDraft, withdrawPublication } from './storage';
import { Env, HttpError, Kind, requireValue, validId } from './types';
import { exchangeDevLogin, startDevLogin } from './devLogin';

const headers = {
  'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin',
};
async function readJson<T>(request: Request): Promise<T> {
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') throw new HttpError(415, 'Use application/json for this request.');
  if (!request.body) throw new HttpError(400, 'A JSON request body is required.');
  const reader = request.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '', bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > 1024 * 1024) { await reader.cancel(); throw new HttpError(413, 'Draft metadata exceeds the request limit.'); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'Invalid JSON request.');
  } finally { reader.releaseLock(); }
}
async function route(request: Request, env: Env): Promise<Response | object> {
  checkConfig(env);
  const path = new URL(request.url).pathname, method = request.method;
  if (path === '/api/gallery' && method === 'GET') return publicCatalog(env);
  if (path === '/api/dev-auth/exchange' && method === 'POST') return exchangeDevLogin(request, env, await readJson(request));
  if (!path.startsWith('/api/owner/')) throw new HttpError(404, 'API route was not found.');
  // A login link may arrive from another site. Only a top-level session
  // navigation can do so; it returns to the app rather than exposing JSON.
  const loginNavigation = ['/api/owner/session', '/api/owner/dev-login'].includes(path) && method === 'GET'
    && request.headers.get('Sec-Fetch-Mode') === 'navigate'
    && request.headers.get('Sec-Fetch-Dest') === 'document'
    && (!request.headers.has('Origin') || request.headers.get('Origin') === env.APP_ORIGIN);
  if (!loginNavigation) checkMutationOrigin(request, env);
  const email = await authorize(request, env);
  if (path === '/api/owner/dev-login' && loginNavigation) return startDevLogin(request, env);
  if (loginNavigation) return new Response(null, { status: 303, headers: { ...headers, Location: `${env.APP_ORIGIN}/` } });
  if (path === '/api/owner/session' && method === 'GET') return { email };
  if (path === '/api/owner/uploads' && method === 'POST') return grantUpload(env, await readJson<UploadRequest>(request));
  if (path === '/api/owner/drafts' && method === 'GET') return listDrafts(env);
  const match = /^\/api\/owner\/(uploads|drafts|publications)\/([^/]+)(?:\/(complete|viewing|thumbnail|publish))?$/.exec(path);
  if (!match || !validId(match[2])) throw new HttpError(404, 'API route was not found.');
  const [, collection, id, action] = match;
  if (collection === 'uploads') {
    if (action === 'complete' && method === 'POST') return completeUpload(env, id);
    if (['viewing', 'thumbnail'].includes(action) && method === 'GET') {
      const object = await privateImage(env, id, action as Kind);
      return new Response(object.body as unknown as ReadableStream, { headers: { ...headers, 'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream', 'Content-Length': String(object.size), 'Content-Disposition': 'inline' } });
    }
  }
  if (collection === 'drafts') {
    if (!action && method === 'GET') return readDraft(env, id);
    if (!action && method === 'PUT') return saveDraft(env, id, await readJson<CloudDraft>(request));
    if (action === 'publish' && method === 'POST') {
      const value = await readJson<{ updatedAt: number; continuation?: string }>(request);
      requireValue(value && Number.isSafeInteger(value.updatedAt) && value.updatedAt >= 0
        && (value.continuation === undefined || validId(value.continuation)), 'Publish the saved version that was previewed.');
      return publishDraft(env, id, value.updatedAt, value.continuation);
    }
  }
  if (collection === 'publications' && !action && method === 'DELETE') return withdrawPublication(env, id);
  throw new HttpError(405, 'This API route does not support that method.');
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const result = await route(request, env);
      return result instanceof Response ? result : Response.json(result, { headers });
    } catch (error) {
      // Do not echo storage errors, source names, private keys, credentials or token claims.
      return Response.json({ error: error instanceof HttpError ? error.message : 'Cloud storage is unavailable. Existing saved work is retained.' }, { status: error instanceof HttpError ? error.status : 503, headers });
    }
  },
};
