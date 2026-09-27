// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac, createHash, webcrypto } from 'node:crypto';
import { authorize } from '../../cloudflare/auth';
import worker from '../../cloudflare/worker';
import { signUpload } from '../../cloudflare/signing';
import { environment } from './m21-worker-fixtures';
import type { Env } from '../../cloudflare/types';

let pair: CryptoKeyPair, jwk: JsonWebKey;
beforeAll(async () => {
  pair = await webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  jwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
});
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.unstubAllGlobals());
async function token(env: Env, claims: Record<string, unknown> = {}, header: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = [
    { alg: 'RS256', kid: 'trusted-key', ...header },
    { iss: env.ACCESS_ISSUER, aud: [env.ACCESS_AUDIENCE], email: env.OWNER_EMAIL, sub: 'owner-user', iat: now - 10, nbf: now - 10, exp: now + 300, ...claims },
  ].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  const signature = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(payload));
  return `${payload}.${Buffer.from(signature).toString('base64url')}`;
}
function trustedIssuer() {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ keys: [{ ...jwk, kid: 'trusted-key', use: 'sig', alg: 'RS256' }] }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
describe('M21 owner authorization boundary', () => {
  async function devGrant(env: Env, assertion: string, redirectUri = 'http://localhost:5180/api/dev-auth/callback') {
    const verifier = Buffer.alloc(32, 7).toString('base64url');
    const url = new URL('/api/owner/dev-login', env.APP_ORIGIN);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', Buffer.alloc(32, 8).toString('base64url'));
    url.searchParams.set('challenge', createHash('sha256').update(verifier).digest('base64url'));
    const response = await worker.fetch(new Request(url, { headers: { 'Cf-Access-Jwt-Assertion': assertion, 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' } }), env);
    return { response, verifier, redirectUri };
  }
  async function exchange(env: Env, input: object, headers = {}) {
    return worker.fetch(new Request(`${env.APP_ORIGIN}/api/dev-auth/exchange`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(input) }), env);
  }
  it('hands the verified Access session back to an allowlisted dev callback using a single-use PKCE code', async () => {
    const { env, privateBucket } = environment(); trustedIssuer();
    env.DEV_LOGIN_ORIGINS = 'http://localhost:5180';
    const assertion = await token(env), grant = await devGrant(env, assertion);
    expect(grant.response.status).toBe(303);
    const location = new URL(grant.response.headers.get('location')!);
    expect(location.origin).toBe('http://localhost:5180');
    expect(location.searchParams.get('state')).toBe(Buffer.alloc(32, 8).toString('base64url'));
    expect(location.href).not.toContain(assertion);
    expect([...privateBucket.objects.values()].some(value => Buffer.from(value.bytes).toString().includes(assertion))).toBe(false);
    const input = { code: location.searchParams.get('code'), verifier: grant.verifier, redirectUri: grant.redirectUri };
    expect((await exchange(env, { ...input, verifier: Buffer.alloc(32, 9).toString('base64url') })).status).toBe(400);
    expect((await exchange(env, input, { Origin: env.APP_ORIGIN })).status).toBe(400);
    const responses = await Promise.all([exchange(env, input), exchange(env, input)]);
    expect(responses.filter(value => value.status === 200)).toHaveLength(1);
    expect(await responses.find(value => value.status === 200)!.json()).toMatchObject({ token: assertion, email: env.OWNER_EMAIL });
    expect((await exchange(env, input)).status).toBe(401);
    expect(privateBucket.objects.size).toBe(0);
  });
  it('requires authentication and exact configured callback origin and path; expired codes fail closed', async () => {
    const { env } = environment(); trustedIssuer(); env.DEV_LOGIN_ORIGINS = 'http://localhost:5180';
    expect((await devGrant(env, '')).response.status).toBe(401);
    for (const uri of ['https://attacker.invalid/api/dev-auth/callback', 'http://localhost:5180/other', 'http://localhost:5180/api/dev-auth/callback?next=evil']) {
      expect((await devGrant(env, await token(env), uri)).response.status).toBe(400);
    }
    const grant = await devGrant(env, await token(env)), code = new URL(grant.response.headers.get('location')!).searchParams.get('code');
    const now = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(now + 61_000);
    try { expect((await exchange(env, { code, verifier: grant.verifier, redirectUri: grant.redirectUri })).status).toBe(401); }
    finally { vi.restoreAllMocks(); }
  });
  it('authenticates cross-site top-level login navigation and redirects to the hosted darkroom without exposing identity', async () => {
    const { env } = environment(); trustedIssuer();
    const navigation = { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' };
    const anonymous = await worker.fetch(new Request(`${env.APP_ORIGIN}/api/owner/session`, { headers: navigation }), env);
    expect(anonymous.status).toBe(401);
    const response = await worker.fetch(new Request(`${env.APP_ORIGIN}/api/owner/session`, {
      headers: { ...navigation, 'Cf-Access-Jwt-Assertion': await token(env) },
    }), env);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`${env.APP_ORIGIN}/`);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.text()).toBe('');
  });
  it('keeps cross-site API reads, embedded login requests and mutations forbidden', async () => {
    const { env } = environment(); trustedIssuer();
    const assertion = await token(env);
    const base = { 'Cf-Access-Jwt-Assertion': assertion, 'Sec-Fetch-Site': 'cross-site' };
    for (const request of [
      new Request(`${env.APP_ORIGIN}/api/owner/session`, { headers: { ...base, 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Dest': 'empty' } }),
      new Request(`${env.APP_ORIGIN}/api/owner/session`, { headers: { ...base, 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'iframe' } }),
      new Request(`${env.APP_ORIGIN}/api/owner/session`, { headers: { ...base, 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document', Origin: 'https://attacker.invalid' } }),
      new Request(`${env.APP_ORIGIN}/api/owner/drafts`, { headers: { ...base, 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' } }),
      new Request(`${env.APP_ORIGIN}/api/owner/uploads`, { method: 'POST', headers: { ...base, Origin: env.APP_ORIGIN, 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' } }),
    ]) expect((await worker.fetch(request, env)).status).toBe(403);
  });
  it('accepts only the configured signed owner identity and ignores token-selected key servers', async () => {
    const { env } = environment(), fetch = trustedIssuer();
    const assertion = await token(env, {}, { jku: 'https://attacker.invalid/jwks', x5u: 'https://attacker.invalid/cert' });
    const response = await worker.fetch(new Request(`${env.APP_ORIGIN}/api/owner/session`, { headers: { 'Cf-Access-Jwt-Assertion': assertion } }), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ email: env.OWNER_EMAIL });
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(fetch.mock.calls[0]?.[0]).toBe(`${env.ACCESS_ISSUER}/cdn-cgi/access/certs`);
  });
  it.each([
    ['wrong owner', { email: 'visitor@example.com' }, {}],
    ['wrong issuer', { iss: 'https://attacker.invalid' }, {}],
    ['wrong audience', { aud: ['another-app'] }, {}],
    ['expired', { exp: 1 }, {}],
    ['not yet valid', { nbf: 9_000_000_000 }, {}],
    ['future issue time', { iat: 9_000_000_000 }, {}],
    ['algorithm confusion', {}, { alg: 'HS256' }],
    ['unknown signing key', {}, { kid: 'attacker-key' }],
  ])('rejects %s', async (_label, claims, header) => {
    const { env } = environment(); trustedIssuer();
    await expect(authorize(new Request(env.APP_ORIGIN, { headers: { 'Cf-Access-Jwt-Assertion': await token(env, claims, header) } }), env)).rejects.toMatchObject({ status: 401 });
  });
  it('rejects a forged signature and fails closed when trusted JWKS is unavailable', async () => {
    const { env } = environment(); trustedIssuer();
    const signed = await token(env), parts = signed.split('.');
    parts[2] = Buffer.alloc(256).toString('base64url');
    await expect(authorize(new Request(env.APP_ORIGIN, { headers: { 'Cf-Access-Jwt-Assertion': parts.join('.') } }), env)).rejects.toMatchObject({ status: 401 });
    const other = environment().env;
    vi.stubGlobal('fetch', async () => { throw new Error('Network unavailable'); });
    await expect(authorize(new Request(other.APP_ORIGIN, { headers: { 'Cf-Access-Jwt-Assertion': await token(other) } }), other)).rejects.toMatchObject({ status: 401 });
  });
  it('denies anonymous private reads/writes and cross-origin authenticated mutations', async () => {
    const { env } = environment(); trustedIssuer();
    const id = webcrypto.randomUUID();
    for (const path of ['drafts', `drafts/${id}`, `uploads/${id}/viewing`, `uploads/${id}/original`]) {
      expect((await worker.fetch(new Request(`${env.APP_ORIGIN}/api/owner/${path}`), env)).status).toBe(401);
    }
    const body = JSON.stringify({});
    expect((await worker.fetch(new Request(`${env.APP_ORIGIN}/api/owner/uploads`, { method: 'POST', headers: { Origin: env.APP_ORIGIN, 'Content-Type': 'application/json' }, body }), env)).status).toBe(401);
    for (const origin of [undefined, 'https://attacker.invalid']) {
      const headers: Record<string, string> = { 'Cf-Access-Jwt-Assertion': await token(env), 'Content-Type': 'application/json' };
      if (origin) headers.Origin = origin;
      expect((await worker.fetch(new Request(`${env.APP_ORIGIN}/api/owner/uploads`, { method: 'POST', headers, body }), env)).status).toBe(403);
    }
    expect((await worker.fetch(new Request(`${env.APP_ORIGIN}/api/gallery`), { ...env, OWNER_EMAIL: '' })).status).toBe(503);
  });
});

describe('M21 direct upload grant scope', () => {
  it('cryptographically binds PUT destination, exact byte count, MIME, payload hash and expiry', async () => {
    const { env } = environment(), id = webcrypto.randomUUID();
    const image = { bytes: 12345, mime: 'image/jpeg' as const, sha256: 'a'.repeat(64) }, now = Date.UTC(2026, 8, 25);
    const grant = await signUpload(env, id, { viewing: image, thumbnail: image }, now);
    const target = grant.uploads.viewing, url = new URL(target.url), signature = url.searchParams.get('X-Amz-Signature');
    url.searchParams.delete('X-Amz-Signature');
    const signedHeaders = url.searchParams.get('X-Amz-SignedHeaders');
    const scope = url.searchParams.get('X-Amz-Credential')!.slice(env.R2_ACCESS_KEY_ID.length + 1);
    let key: Buffer = Buffer.from(`AWS4${env.R2_SECRET_ACCESS_KEY}`);
    for (const value of scope.split('/')) key = createHmac('sha256', key).update(value).digest();
    const calculate = (method: string, path: string, length: number, mime: string, digest: string) => {
      const canonicalHeaders = `content-length:${length}\ncontent-type:${mime}\nhost:${url.host}\nx-amz-content-sha256:${digest}\n`;
      const canonical = `${method}\n${path}\n${url.search.slice(1)}\n${canonicalHeaders}\n${signedHeaders}\n${digest}`;
      const stringToSign = `AWS4-HMAC-SHA256\n${url.searchParams.get('X-Amz-Date')}\n${scope}\n${createHash('sha256').update(canonical).digest('hex')}`;
      return createHmac('sha256', key).update(stringToSign).digest('hex');
    };
    expect(calculate('PUT', url.pathname, image.bytes, image.mime, image.sha256)).toBe(signature);
    expect(calculate('GET', url.pathname, image.bytes, image.mime, image.sha256)).not.toBe(signature);
    expect(calculate('PUT', `${url.pathname}-another`, image.bytes, image.mime, image.sha256)).not.toBe(signature);
    expect(calculate('PUT', url.pathname, image.bytes + 1, image.mime, image.sha256)).not.toBe(signature);
    expect(calculate('PUT', url.pathname, image.bytes, 'text/html', image.sha256)).not.toBe(signature);
    expect(calculate('PUT', url.pathname, image.bytes, image.mime, 'b'.repeat(64))).not.toBe(signature);
    expect(grant.expiresAt).toBe(now + 300_000);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.pathname).toBe(`/${env.PRIVATE_BUCKET_NAME}/staging/${id}/viewing`);
    expect(grant.uploads).not.toHaveProperty('original');
    expect(target.headers['Content-Length']).toBeUndefined();
    expect(JSON.stringify(grant)).not.toContain(env.R2_SECRET_ACCESS_KEY);
  });
});
