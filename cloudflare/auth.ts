import { Env, HttpError } from './types';

const keys = new Map<string, { expires: number; keys: JsonWebKey[] }>();
const secureOrigin = (value: string) => {
  try { const url = new URL(value); return url.origin === value && url.protocol === 'https:' && !url.username && !url.password; }
  catch { return false; }
};
export function checkConfig(env: Env) {
  if (!env.PRIVATE_BUCKET || !env.PUBLIC_BUCKET || env.PRIVATE_BUCKET === env.PUBLIC_BUCKET
    || !secureOrigin(env.APP_ORIGIN) || !secureOrigin(env.PHOTO_ORIGIN) || env.APP_ORIGIN === env.PHOTO_ORIGIN
    || !secureOrigin(env.ACCESS_ISSUER) || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_ISSUER)
    || !env.ACCESS_AUDIENCE?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.OWNER_EMAIL ?? '')
    || !/^[a-f0-9]{32}$/.test(env.R2_ACCOUNT_ID ?? '') || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(env.PRIVATE_BUCKET_NAME ?? '')
    || !env.R2_ACCESS_KEY_ID?.trim() || !env.R2_SECRET_ACCESS_KEY?.trim()) {
    throw new HttpError(503, 'Cloud publication is not configured.');
  }
}
function decodePart(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid JWT encoding');
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
}
export async function authorize(request: Request, env: Env): Promise<string> {
  // Access must protect /api/owner/*, but edge policy is not a substitute for verification here.
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || token.length > 16384) throw new HttpError(401, 'Owner login required.');
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid token');
    const header = JSON.parse(new TextDecoder().decode(decodePart(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decodePart(parts[1])));
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid || header.kid.length > 256 || header.crit
      || claims.iss !== env.ACCESS_ISSUER || !Array.isArray(claims.aud) || !claims.aud.every((audience: unknown) => typeof audience === 'string') || !claims.aud.includes(env.ACCESS_AUDIENCE)
      || !Number.isSafeInteger(claims.exp) || claims.exp <= now || !Number.isSafeInteger(claims.iat) || claims.iat > now || claims.iat >= claims.exp
      || (claims.nbf !== undefined && (!Number.isSafeInteger(claims.nbf) || claims.nbf > now || claims.nbf >= claims.exp))
      || typeof claims.email !== 'string' || claims.email.toLowerCase() !== env.OWNER_EMAIL.toLowerCase()
      || typeof claims.sub !== 'string' || !claims.sub) throw new Error('Invalid claims');
    let cached = keys.get(env.ACCESS_ISSUER);
    if (!cached || cached.expires <= Date.now()) {
      // Never follow token-supplied jku/x5u URLs or redirects away from the configured issuer.
      const response = await fetch(`${env.ACCESS_ISSUER}/cdn-cgi/access/certs`, { redirect: 'manual', cache: 'no-store' });
      if (!response.ok) throw new Error('Unavailable issuer');
      if (!response.body) throw new Error('Invalid JWKS');
      const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
      let text = '', size = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.length;
          if (size > 131072) { await reader.cancel(); throw new Error('Invalid JWKS'); }
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
      } finally { reader.releaseLock(); }
      const document = JSON.parse(text);
      if (!Array.isArray(document.keys) || document.keys.length > 32) throw new Error('Invalid JWKS');
      cached = { expires: Date.now() + 300_000, keys: document.keys };
      keys.set(env.ACCESS_ISSUER, cached);
    }
    const jwk = cached.keys.find(key => (key as JsonWebKey & { kid?: string }).kid === header.kid && key.kty === 'RSA' && (!key.alg || key.alg === 'RS256') && (!key.use || key.use === 'sig'));
    if (!jwk) throw new Error('Unknown signing key');
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if ((key.algorithm as RsaHashedKeyAlgorithm).modulusLength < 2048) throw new Error('Weak signing key');
    if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decodePart(parts[2]) as BufferSource, new TextEncoder().encode(`${parts[0]}.${parts[1]}`))) throw new Error('Invalid signature');
    return env.OWNER_EMAIL;
  } catch { throw new HttpError(401, 'Owner login required.'); }
}
export function checkMutationOrigin(request: Request, env: Env) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.headers.get('Origin') !== env.APP_ORIGIN) {
    throw new HttpError(403, 'Management requests must originate from this application.');
  }
  const site = request.headers.get('Sec-Fetch-Site');
  if (site === 'cross-site' || (request.headers.has('Origin') && request.headers.get('Origin') !== env.APP_ORIGIN)) {
    throw new HttpError(403, 'Cross-origin management access is forbidden.');
  }
}
