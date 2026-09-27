import { authorize } from './auth';
import { Env, HttpError, hash, requireValue } from './types';

interface Grant { challenge: string; redirectUri: string; expiresAt: number; encrypted: string; iv: string }
const encoded = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const decoded = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const secretPattern = /^[A-Za-z0-9_-]{43}$/;
async function encryptionKey(code: string) {
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
function callback(env: Env, value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new HttpError(400, 'Invalid development callback.'); }
  const origins = env.DEV_LOGIN_ORIGINS?.split(',').map(origin => origin.trim()) ?? [];
  requireValue(origins.includes(url.origin) && !url.username && !url.password
    && (url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
    && url.pathname === '/api/dev-auth/callback' && !url.search && !url.hash, 'Development callback is not allowed.');
  return url;
}
/** Only called after Access and the Worker have verified the owner. */
export async function startDevLogin(request: Request, env: Env) {
  const params = new URL(request.url).searchParams;
  const redirectUri = params.get('redirect_uri') ?? '', state = params.get('state') ?? '', challenge = params.get('challenge') ?? '';
  const destination = callback(env, redirectUri);
  requireValue(secretPattern.test(state) && secretPattern.test(challenge), 'Invalid development login proof.');
  const code = encoded(crypto.getRandomValues(new Uint8Array(32))), iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(code), new TextEncoder().encode(request.headers.get('Cf-Access-Jwt-Assertion')!));
  const grant: Grant = { challenge, redirectUri, expiresAt: Date.now() + 60_000, encrypted: encoded(new Uint8Array(encrypted)), iv: encoded(iv) };
  // Encrypt the application token using the random code, which is never stored.
  await env.PRIVATE_BUCKET.put(`dev-auth/${await hash(new TextEncoder().encode(code))}`, JSON.stringify(grant));
  destination.searchParams.set('code', code); destination.searchParams.set('state', state);
  return new Response(null, { status: 303, headers: { Location: destination.href, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
export async function exchangeDevLogin(request: Request, env: Env, input: { code?: string; verifier?: string; redirectUri?: string }) {
  // This endpoint is exclusively server-to-server; browsers receive no CORS access.
  requireValue(!request.headers.has('Origin') && !request.headers.has('Sec-Fetch-Site'), 'Exchange development login on the local server.');
  requireValue(secretPattern.test(input.code ?? '') && secretPattern.test(input.verifier ?? ''), 'Invalid development login proof.');
  callback(env, input.redirectUri ?? '');
  const key = `dev-auth/${await hash(new TextEncoder().encode(input.code!))}`, object = await env.PRIVATE_BUCKET.get(key);
  if (!object) throw new HttpError(401, 'Development login expired or was already used.');
  const grant = await object.json<Grant>();
  if (grant.expiresAt <= Date.now()) { await env.PRIVATE_BUCKET.delete(key); throw new HttpError(401, 'Development login expired.'); }
  const challenge = encoded(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input.verifier!))));
  requireValue(grant.challenge === challenge && grant.redirectUri === input.redirectUri, 'Invalid development login proof.');
  // Conditional replacement prevents concurrent redemption of the same code.
  const consumed = await env.PRIVATE_BUCKET.put(key, '{}', { onlyIf: { etagMatches: object.etag } });
  if (!consumed) throw new HttpError(401, 'Development login was already used.');
  await env.PRIVATE_BUCKET.delete(key);
  const token = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decoded(grant.iv) as BufferSource }, await encryptionKey(input.code!), decoded(grant.encrypted) as BufferSource));
  const email = await authorize(new Request(env.APP_ORIGIN, { headers: { 'Cf-Access-Jwt-Assertion': token } }), env);
  const claims = JSON.parse(new TextDecoder().decode(decoded(token.split('.')[1])));
  return { token, email, expiresAt: claims.exp * 1000 };
}
