import type { UploadGrant, UploadRequest } from '../src/cloud/contracts';
import { Env, hash, kinds } from './types';

const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
async function hmac(key: Uint8Array, value: string): Promise<Uint8Array> {
  const imported = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', imported, new TextEncoder().encode(value)));
}
export const stagingKey = (id: string, kind: string) => `staging/${id}/${kind}`;
export const UPLOAD_LIFETIME_MS = 5 * 60_000;

export async function signUpload(env: Env, id: string, request: UploadRequest, now = Date.now()): Promise<UploadGrant> {
  const dateTime = new Date(now).toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = dateTime.slice(0, 8), scope = `${date}/auto/s3/aws4_request`;
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const signingKey = await hmac(await hmac(await hmac(await hmac(new TextEncoder().encode(`AWS4${env.R2_SECRET_ACCESS_KEY}`), date), 'auto'), 's3'), 'aws4_request');
  const grant: UploadGrant = { id, expiresAt: now + UPLOAD_LIFETIME_MS, uploads: {} as UploadGrant['uploads'] };
  for (const kind of kinds) {
    const image = request[kind];
    const path = `/${env.PRIVATE_BUCKET_NAME}/${stagingKey(id, kind)}`;
    const signedHeaders = 'content-length;content-type;host;x-amz-content-sha256';
    const query = Object.entries({
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${env.R2_ACCESS_KEY_ID}/${scope}`,
      'X-Amz-Date': dateTime, 'X-Amz-Expires': String(UPLOAD_LIFETIME_MS / 1000), 'X-Amz-SignedHeaders': signedHeaders,
    }).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${encode(key)}=${encode(value)}`).join('&');
    // Content-Length is a forbidden browser header: Fetch supplies it from the exact Blob.
    // All three constraints are in the signature, not merely checked after transfer.
    const headers = `content-length:${image.bytes}\ncontent-type:${image.mime}\nhost:${host}\nx-amz-content-sha256:${image.sha256}\n`;
    const canonical = `PUT\n${path}\n${query}\n${headers}\n${signedHeaders}\n${image.sha256}`;
    const signature = hex((await hmac(signingKey, `AWS4-HMAC-SHA256\n${dateTime}\n${scope}\n${await hash(new TextEncoder().encode(canonical))}`)).buffer as ArrayBuffer);
    grant.uploads[kind] = { url: `https://${host}${path}?${query}&X-Amz-Signature=${signature}`, headers: { 'Content-Type': image.mime, 'x-amz-content-sha256': image.sha256 } };
  }
  return grant;
}
