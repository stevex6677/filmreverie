import { afterEach, describe, expect, it, vi } from 'vitest';
import { sha256Hex } from '../../src/storage/crypto';
import { processPhotos, releaseDraft } from '../../src/storage/importPhotos';
import type { RollBundle } from '../../src/storage/rollRepository';
import type { CloudDraft, GalleryRoll } from '../../src/cloud/contracts';
import { ownerClient, uploadOwnerPhoto } from '../../src/cloud/ownerClient';
import { adoptOwnerDraft, copyOwnerArchive, createOwnerPreview, loadOwnerPhotos } from '../../src/cloud/ownerDraft';

const secret = 'GPS=37.7749,-122.4194;PRIVATE_SOURCE_METADATA';
const signal = () => new AbortController().signal;
const json = (body: unknown) => Response.json(body);

// An image header with private metadata. The canvas fixture emits a different
// JPEG from pixels alone, so a copied source/archived JPEG is observable.
function sourceImage() {
  const header = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 11, 184, 0, 0, 5, 220]);
  return new File([header, secret], 'source.png', { type: 'image/png' });
}
function canvasEnvironment() {
  const sizes: Array<[number, number]> = [];
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 3000, height: 1500, close() {} })));
  vi.stubGlobal('document', { createElement: (name: string) => {
    expect(name).toBe('canvas');
    return { width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage() {}, set fillStyle(_value: string) {} }),
      toBlob(callback: (blob: Blob) => void, mime: string) {
        sizes.push([this.width, this.height]);
        expect(mime).toBe('image/jpeg');
        callback(new Blob([new Uint8Array([255, 216, 255, 217, this.width >> 8, this.width & 255, this.height >> 8, this.height & 255])], { type: mime }));
      } };
  } });
  return sizes;
}
function archive(original: File): RollBundle {
  const frame = { id: 'archived-frame', rollId: 'archived-roll', filename: 'source.png', mime: 'image/png', width: 3000, height: 1500,
    rotation: 90, cropPosition: { x: .25, y: -.4 }, hash: 'archived-local-hash', originalKey: 'old-original', viewingKey: 'old-view', thumbnailKey: 'old-thumb' };
  return { roll: { id: 'archived-roll', name: 'Archived', stockId: 'ektachrome-e100', format: '135', frameIds: [frame.id], coverId: frame.id,
    createdAt: 11, updatedAt: 12, trashedAt: null, view: { frameId: frame.id, level: 'frame', mode: 'positive', brightness: 1, magnification: 1,
      zoom: 1, pan: { x: 0, z: 0 }, overview: null } }, frames: [frame], blobs: [
      { key: 'old-original', blob: original },
      { key: 'old-view', blob: new Blob([secret, 'archived viewing'], { type: 'image/jpeg' }) },
      { key: 'old-thumb', blob: new Blob([secret, 'archived thumbnail'], { type: 'image/jpeg' }) },
    ] };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('owner browser derivative-only publishing', () => {
  it('repaints fresh and backup sources and uploads exactly two metadata-free JPEG bodies per photograph', async () => {
    const sizes = canvasEnvironment();
    const original = sourceImage();
    const fresh = (await processPhotos([original], 'new-roll', signal(), () => {}))[0];
    const copied = await copyOwnerArchive(archive(original), signal(), () => {});
    try {
      expect(sizes).toEqual([[2048, 1024], [256, 128], [2048, 1024], [256, 128]]);
      expect(copied.photos[0].frame).toMatchObject({ rotation: 90, cropPosition: { x: .25, y: -.4 }, width: 3000, height: 1500 });
      expect(copied.roll.view?.frameId).toBe(copied.photos[0].id);
      const puts: Array<{ url: string; body: Blob }> = [];
      const grants: unknown[] = [];
      const fetcher = vi.fn<typeof fetch>(async (input, init) => {
        const path = String(input);
        if (path === '/api/owner/uploads') {
          grants.push(JSON.parse(String(init?.body)));
          return json({ id: `upload-${grants.length}`, expiresAt: Date.now() + 60_000, uploads: {
            viewing: { url: `https://upload.example/${grants.length}/viewing`, headers: { 'content-type': 'image/jpeg' } },
            thumbnail: { url: `https://upload.example/${grants.length}/thumbnail`, headers: { 'content-type': 'image/jpeg' } },
          } });
        }
        if (path.startsWith('https://upload.example/')) { puts.push({ url: path, body: init!.body as Blob }); return new Response(null, { status: 200 }); }
        if (path.endsWith('/complete')) return json({ id: path.split('/').at(-2) });
        throw new Error(`Unexpected request: ${path}`);
      });
      vi.stubGlobal('fetch', fetcher);
      for (const photo of [fresh, copied.photos[0]]) {
        const cloud = await uploadOwnerPhoto(photo, signal(), () => {});
        expect(cloud).not.toHaveProperty('originalKey');
        expect(cloud).not.toHaveProperty('hash');
        expect(cloud).not.toHaveProperty('mime');
        expect(cloud).toMatchObject({ width: 2048, height: 1024 });
        expect(cloud.viewingSha256).toBe(await sha256Hex(new Uint8Array(await photo.blobs.find(b => b.key === photo.frame!.viewingKey)!.blob.arrayBuffer())));
      }
      expect(grants).toHaveLength(2);
      for (const grant of grants) {
        expect(Object.keys(grant as object).sort()).toEqual(['thumbnail', 'viewing']);
        expect(Object.values(grant as Record<string, { mime: string }>).map(item => item.mime)).toEqual(['image/jpeg', 'image/jpeg']);
        expect(JSON.stringify(grant)).not.toContain(secret);
      }
      expect(puts.map(put => put.url)).toEqual(['https://upload.example/1/viewing', 'https://upload.example/1/thumbnail', 'https://upload.example/2/viewing', 'https://upload.example/2/thumbnail']);
      for (const put of puts) { expect(put.body.type).toBe('image/jpeg'); expect(await put.body.text()).not.toContain(secret); }
      expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(4);
      expect(fetcher.mock.calls.map(([input]) => String(input)).join(' ')).not.toMatch(/original/);
    } finally { releaseDraft([fresh, ...copied.photos]); }
  });

  it('adopts remapped server keys, then reopens editable saved drafts without an original request or viewer loader', async () => {
    canvasEnvironment();
    const fresh = (await processPhotos([sourceImage()], 'new-roll', signal(), () => {}))[0];
    const local = fresh.frame!;
    const viewing = fresh.blobs.find(b => b.key === local.viewingKey)!.blob;
    const thumbnail = fresh.blobs.find(b => b.key === local.thumbnailKey)!.blob;
    const cloud: CloudDraft = { roll: { id: 'new-roll', name: 'Private', stockId: 'ektachrome-e100', format: '135', frameIds: [local.id], coverId: local.id,
      createdAt: 1, updatedAt: 2, trashedAt: null }, frames: [{ id: local.id, rollId: 'new-roll', filename: local.filename, width: 2048, height: 1024,
      rotation: 90, cropPosition: { x: .2, y: -.2 }, viewingKey: 'server-viewing', thumbnailKey: 'server-thumbnail', viewingSha256: await sha256Hex(new Uint8Array(await viewing.arrayBuffer())), uploadId: 'completed-upload' }] };
    const originalPreview = fresh.preview, originalReview = fresh.reviewPreview;
    try {
      const adopted = adoptOwnerDraft(cloud, [fresh]);
      expect(adopted[0]).toMatchObject({ preview: originalPreview, reviewPreview: originalReview, uploadId: 'completed-upload' });
      expect(adopted[0].frame).toMatchObject({ viewingKey: 'server-viewing', thumbnailKey: 'server-thumbnail', width: 3000, height: 1500, rotation: 90, cropPosition: { x: .2, y: -.2 } });
      expect(adopted[0].blobs.find(blob => blob.key === 'server-viewing')?.blob).toBe(viewing);
      const fetcher = vi.fn<typeof fetch>(async (input) => {
        if (String(input).endsWith('/thumbnail')) return new Response(thumbnail, { headers: { 'content-type': 'image/jpeg' } });
        if (String(input).endsWith('/viewing')) return new Response(viewing, { headers: { 'content-type': 'image/jpeg' } });
        throw new Error(`Unexpected request: ${input}`);
      });
      vi.stubGlobal('fetch', fetcher);
      const reused = await uploadOwnerPhoto(adopted[0], signal(), () => {});
      expect(reused).toMatchObject({ uploadId: 'completed-upload', viewingKey: 'server-viewing', width: 2048, height: 1024 });
      expect(fetcher).not.toHaveBeenCalled();
      const loaded = await loadOwnerPhotos(cloud, signal(), () => {});
      try {
        expect(loaded[0].frame).toMatchObject({ rotation: 90, cropPosition: { x: .2, y: -.2 }, width: 2048, height: 1024 });
        expect(loaded[0].blobs).toHaveLength(2);
        const runtime = createOwnerPreview(cloud, loaded);
        try {
          expect(runtime.definition.frames[0]).toMatchObject({ rotation: 90, cropPosition: { x: .2, y: -.2 } });
          expect(runtime.definition.frames[0]).not.toHaveProperty('original');
          expect(runtime.definition.frames[0]).not.toHaveProperty('loadOriginal');
          expect(runtime.definition.frames[0].src).toMatch(/^blob:/);
        } finally { runtime.dispose(); }
        expect(fetcher.mock.calls.map(([input]) => String(input))).toEqual(['/api/owner/uploads/completed-upload/thumbnail', '/api/owner/uploads/completed-upload/viewing']);
      } finally { releaseDraft(loaded); }
    } finally { releaseDraft([fresh]); }
  });

  it('resumes bounded publication and withdrawal batches, stopping on cancellation', async () => {
    const roll: GalleryRoll = { id: 'published', revision: 'rev', name: 'Published', stockId: 'ektachrome-e100', format: '135', coverId: 'frame', publishedAt: 123,
      frames: [{ id: 'frame', width: 2048, height: 1024, rotation: 0,
        viewing: { url: 'https://cdn.example/view.jpg', bytes: 10, sha256: '0'.repeat(64) }, thumbnail: { url: 'https://cdn.example/thumb.jpg', bytes: 5, sha256: '1'.repeat(64) } }] };
    const bodies: unknown[] = [], methods: string[] = [];
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (_input, init) => {
      methods.push(init!.method!);
      if (init!.method === 'DELETE') return json({ withdrawn: methods.filter(method => method === 'DELETE').length === 3 });
      bodies.push(JSON.parse(String(init!.body)));
      return json(bodies.length !== 3 ? { pending: true, continuation: `batch-${bodies.length}` } : roll);
    }));
    const publishedProgress = vi.fn(), withdrawnProgress = vi.fn();
    expect(await ownerClient.publish('published', 42, signal(), publishedProgress)).toEqual(roll);
    expect(bodies).toEqual([{ updatedAt: 42 }, { updatedAt: 42, continuation: 'batch-1' }, { updatedAt: 42, continuation: 'batch-2' }]);
    expect(publishedProgress).toHaveBeenCalledTimes(2);
    await ownerClient.withdraw('published', signal(), withdrawnProgress);
    expect(withdrawnProgress).toHaveBeenCalledTimes(2);
    expect(methods).toEqual(['POST', 'POST', 'POST', 'DELETE', 'DELETE', 'DELETE']);
    const abort = new AbortController();
    await expect(ownerClient.publish('published', 42, abort.signal, () => abort.abort())).rejects.toMatchObject({ name: 'AbortError' });
    expect(bodies).toHaveLength(4);
  });
});
