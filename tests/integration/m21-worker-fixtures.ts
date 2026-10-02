import type { R2Bucket } from '@cloudflare/workers-types';
import jpeg from 'jpeg-js';
import { webcrypto } from 'node:crypto';
import type { CloudDraft, UploadRequest } from '../../src/cloud/contracts';
import type { Env } from '../../cloudflare/types';
import { hash, kinds } from '../../cloudflare/types';
import { completeUpload, grantUpload, saveDraft } from '../../cloudflare/storage';

interface Entry { bytes: Uint8Array; etag: string; httpMetadata: { contentType?: string; cacheControl?: string } }
interface PutOptions { httpMetadata?: Entry['httpMetadata']; onlyIf?: { etagMatches?: string; etagDoesNotMatch?: string }; sha256?: string }
export class MemoryBucket {
  objects = new Map<string, Entry>();
  calls = 0;
  beforePut?: (key: string) => Promise<void>;
  beforeDelete?: (keys: string[]) => Promise<void>;
  beforeList?: (prefix: string) => Promise<void>;
  private metadata(key: string, entry: Entry) { return { key, etag: entry.etag, size: entry.bytes.length, httpMetadata: entry.httpMetadata }; }
  async head(key: string) { this.calls++; const entry = this.objects.get(key); return entry ? this.metadata(key, entry) : null; }
  async get(key: string) {
    this.calls++;
    const entry = this.objects.get(key);
    if (!entry) return null;
    const bytes = entry.bytes.slice();
    const inspect = () => {
      if (key.startsWith('sealed/') || key.startsWith('staging/')) throw new Error('Worker inspected image body');
      return bytes;
    };
    return { ...this.metadata(key, entry), body: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close(); } }),
      arrayBuffer: async () => inspect().buffer, json: async () => JSON.parse(new TextDecoder().decode(inspect())),
      text: async () => new TextDecoder().decode(inspect()) };
  }
  async put(key: string, value: string | Uint8Array | ArrayBuffer | ReadableStream<Uint8Array>, options: PutOptions = {}) {
    this.calls++;
    await this.beforePut?.(key);
    const current = this.objects.get(key), condition = options.onlyIf;
    if (condition?.etagMatches && current?.etag !== condition.etagMatches || condition?.etagDoesNotMatch === '*' && current) return null;
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value)
      : value instanceof ReadableStream ? new Uint8Array(await new Response(value).arrayBuffer()) : new Uint8Array(value).slice();
    if (options.sha256 && await hash(bytes) !== options.sha256) throw new Error('R2 SHA-256 checksum mismatch');
    const entry = { bytes, etag: webcrypto.randomUUID(), httpMetadata: options.httpMetadata ?? {} };
    this.objects.set(key, entry);
    return this.metadata(key, entry);
  }
  async delete(value: string | string[]) {
    this.calls++;
    const keys = typeof value === 'string' ? [value] : value;
    await this.beforeDelete?.(keys);
    keys.forEach(key => this.objects.delete(key));
  }
  async list({ prefix = '', cursor, limit = 1000 }: { prefix?: string; cursor?: string; limit?: number } = {}) {
    this.calls++;
    await this.beforeList?.(prefix);
    const keys = [...this.objects.keys()].filter(key => key.startsWith(prefix) && (!cursor || key > cursor)).sort();
    const selected = keys.slice(0, limit);
    return { objects: selected.map(key => ({ key })), truncated: keys.length > limit, cursor: selected.at(-1) };
  }
}
export function environment() {
  const privateBucket = new MemoryBucket(), publicBucket = new MemoryBucket();
  const env: Env = { PRIVATE_BUCKET: privateBucket as unknown as R2Bucket, PUBLIC_BUCKET: publicBucket as unknown as R2Bucket,
    APP_ORIGIN: 'https://filmreverie.app', PHOTO_ORIGIN: 'https://photos.filmreverie.app',
    ACCESS_ISSUER: `https://test-${webcrypto.randomUUID()}.cloudflareaccess.com`, ACCESS_AUDIENCE: 'owner-application', OWNER_EMAIL: 'owner@example.com',
    R2_ACCOUNT_ID: 'a'.repeat(32), PRIVATE_BUCKET_NAME: 'filmreverie-private', R2_ACCESS_KEY_ID: 'test-access-key', R2_SECRET_ACCESS_KEY: 'local-test-secret' };
  return { env, privateBucket, publicBucket };
}
export function photograph(): Uint8Array {
  const pixels = new Uint8Array(8 * 4 * 4);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) {
    const index = (y * 8 + x) * 4;
    pixels[index] = x < 4 ? 240 : 10; pixels[index + 1] = y < 2 ? 30 : 200; pixels[index + 2] = 50; pixels[index + 3] = 255;
  }
  return new Uint8Array(jpeg.encode({ width: 8, height: 4, data: pixels }, 95).data);
}
export async function uploadFixture(env: Env, privateBucket: MemoryBucket) {
  const bytes = photograph(), request = {} as UploadRequest;
  for (const kind of kinds) request[kind] = { bytes: bytes.length, sha256: await hash(bytes), mime: 'image/jpeg' };
  const grant = await grantUpload(env, request);
  for (const kind of kinds) await privateBucket.put(`staging/${grant.id}/${kind}`, bytes, { httpMetadata: { contentType: 'image/jpeg' } });
  await completeUpload(env, grant.id);
  return { grant, bytes, request };
}
export async function draftFixture(env: Env, privateBucket: MemoryBucket) {
  const upload = await uploadFixture(env, privateBucket), id = webcrypto.randomUUID(), frameId = webcrypto.randomUUID();
  const input: CloudDraft = { roll: { id, name: 'Published title', stockId: 'portra-400', format: '135', filmStrength: 50, frameIds: [frameId], coverId: frameId, createdAt: 1000, updatedAt: 1000, trashedAt: null },
    frames: [{ id: frameId, rollId: id, filename: 'private-source-gps.jpg', viewingSha256: upload.request.viewing.sha256, width: 8, height: 4, rotation: 0,
      viewingKey: 'browser-viewing', thumbnailKey: 'browser-thumbnail', uploadId: upload.grant.id }] };
  const draft = await saveDraft(env, id, input);
  return { ...upload, draft };
}
export function barrier() {
  let release!: () => void, reached!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const entered = new Promise<void>(resolve => { reached = resolve; });
  return { release, entered, block: async () => { reached(); await wait; } };
}
