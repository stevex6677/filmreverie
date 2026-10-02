import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { sha256Hex } from '../../src/storage/crypto';
import { RollRepository } from '../../src/storage/rollRepository';
import { createGalleryRuntime, downloadGalleryImage, fetchGallery, galleryBytes, openLiveGalleryRoll, parseGalleryCatalog } from '../../src/cloud/galleryClient';
import { GalleryRepository } from '../../src/cloud/galleryStorage';
import type { GalleryRoll } from '../../src/cloud/contracts';

async function fixture(revision = 'revision-1') {
  const viewing = new Uint8Array([1, 2, 3, revision.length]), thumbnail = new Uint8Array([4, 5]);
  const roll: GalleryRoll = {
    id: 'published', revision, name: 'Public photographs', stockId: 'ektachrome-e100', filmStrength: 50, format: '135', coverId: 'frame-1', publishedAt: 100,
    frames: [{ id: 'frame-1', width: 300, height: 200, rotation: 90, cropPosition: { x: .1, y: -.2 },
      viewing: { url: `https://photos.example/rolls/${revision}/view.jpg`, bytes: viewing.byteLength, sha256: await sha256Hex(viewing) },
      thumbnail: { url: `https://photos.example/rolls/${revision}/thumb.jpg`, bytes: thumbnail.byteLength, sha256: await sha256Hex(thumbnail) } }],
  };
  const fetcher = vi.fn<typeof fetch>(async input => {
    const bytes = String(input).endsWith('/view.jpg') ? viewing : thumbnail;
    return new Response(bytes, { headers: { 'content-type': 'image/jpeg' } });
  });
  return { roll, viewing, thumbnail, fetcher };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('M21 account-free gallery boundaries', () => {
  it('opens same-origin macbook HTTP proxy images without allowing unrelated insecure image URLs', async () => {
    const { roll, fetcher } = await fixture();
    vi.stubGlobal('location', new URL('http://macbook:5236/'));
    roll.frames[0].viewing.url = 'http://macbook:5236/api/dev-images/rolls/revision-1/view.jpg';
    roll.frames[0].thumbnail.url = 'http://macbook:5236/api/dev-images/rolls/revision-1/thumb.jpg';
    const runtime = await openLiveGalleryRoll(roll, { fetcher });
    expect(runtime.definition.frames).toHaveLength(1);
    runtime.dispose();
    for (const url of ['http://macbook:5211/api/dev-images/rolls/view.jpg', 'http://macbook:5236/api/owner/private', 'http://macbook:5236/photo.jpg', 'http://macbook.evil.test:5236/api/dev-images/rolls/view.jpg']) {
      roll.frames[0].viewing.url = url;
      expect(() => parseGalleryCatalog({ version: 1, rolls: [roll] })).toThrow(/image metadata/);
    }
  });
  it('loads metadata without image requests and opens only selected roll display derivatives', async () => {
    const { roll, fetcher } = await fixture();
    const catalogFetcher = vi.fn<typeof fetch>(async () => Response.json({ version: 1, rolls: [roll] }));
    const catalog = await fetchGallery(undefined, catalogFetcher);
    expect(catalog.rolls).toEqual([roll]);
    expect(catalogFetcher.mock.calls.map(call => call[0])).toEqual(['/api/gallery']);
    expect(catalogFetcher.mock.calls[0][1]).toMatchObject({ credentials: 'omit', cache: 'no-store', redirect: 'error' });
    const runtime = await openLiveGalleryRoll(catalog.rolls[0], { fetcher });
    expect(fetcher.mock.calls.map(call => call[0])).toEqual([roll.frames[0].viewing.url]);
    expect(runtime.definition.imported).toBe(false);
    expect(runtime.filmStrength).toBe(50);
    expect(runtime.definition.frames[0]).not.toHaveProperty('loadOriginal');
    expect(runtime.definition.frames[0]).not.toHaveProperty('originalSrc');
    expect(runtime.definition.frames[0].rotation).toBe(90);
    expect(runtime.definition.frames[0].cropPosition).toEqual({ x: .1, y: -.2 });
    runtime.dispose();
  });
  it('rejects duplicate membership, invalid layouts and private or insecure image references', async () => {
    const { roll } = await fixture();
    expect(() => parseGalleryCatalog({ version: 1, rolls: [roll, roll] })).toThrow(/duplicate/);
    for (const url of ['https://app.example/api/owner/uploads/private/viewing', 'http://photos.example/view.jpg', 'https://user:secret@photos.example/view.jpg', 'javascript:alert(1)']) {
      const invalid = structuredClone(roll); invalid.frames[0].viewing.url = url;
      expect(() => parseGalleryCatalog({ version: 1, rolls: [invalid] })).toThrow(/image metadata/);
    }
    const duplicate = structuredClone(roll); duplicate.frames.push(duplicate.frames[0]);
    expect(() => parseGalleryCatalog({ version: 1, rolls: [duplicate] })).toThrow(/image metadata/);
    const badCover = { ...roll, coverId: 'missing' };
    expect(() => parseGalleryCatalog({ version: 1, rolls: [badCover] })).toThrow(/layout/);
    expect(() => parseGalleryCatalog({ version: 1, rolls: [{ ...roll, filmStrength: 101 }] })).toThrow(/metadata/);
  });
  it('rejects undersize, oversize, wrong checksum and non-image responses', async () => {
    const { roll } = await fixture(), image = roll.frames[0].viewing;
    for (const [bytes, mime, error] of [
      [new Uint8Array([1]), 'image/jpeg', /size/],
      [new Uint8Array(5), 'image/jpeg', /size/],
      [new Uint8Array(4), 'image/jpeg', /checksum/],
      [new Uint8Array(4), 'text/html', /display image/],
    ] as const) {
      await expect(downloadGalleryImage(image, { fetcher: async () => new Response(bytes, { headers: { 'content-type': mime } }) })).rejects.toThrow(error);
    }
  });
  it('cancels a stalled stream without waiting for another network chunk', async () => {
    const { roll } = await fixture(), abort = new AbortController();
    const cancelled = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1])); }, cancel: cancelled });
    await expect(downloadGalleryImage(roll.frames[0].viewing, {
      signal: abort.signal, fetcher: async () => new Response(stream, { headers: { 'content-type': 'image/jpeg' } }), onBytes: () => abort.abort(),
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancelled).toHaveBeenCalledOnce();
  });
  it('retains image resources until the viewer releases its final lease', async () => {
    const { roll, viewing } = await fixture();
    const runtime = createGalleryRuntime(roll, [{ frameId: 'frame-1', kind: 'viewing', bytes: viewing.buffer, mime: 'image/jpeg' }]);
    const release = runtime.definition.retainResources!(), src = runtime.definition.frames[0].src;
    runtime.dispose(); runtime.dispose();
    expect(new Uint8Array(await (await fetch(src)).arrayBuffer())).toEqual(viewing);
    release(); release();
    await expect(fetch(src)).rejects.toThrow();
  });
});

describe('M21 atomic offline gallery revisions', () => {
  it('saves a full revision, reopens without network and removes only the gallery copy', async () => {
    const factory = new IDBFactory(), repo = new GalleryRepository(factory), visitor = new RollRepository(factory);
    const { roll, viewing, fetcher } = await fixture();
    const frame = { id: 'visitor-frame', rollId: 'visitor', filename: 'private.jpg', mime: 'image/jpeg', width: 300, height: 200, rotation: 0, hash: 'private', originalKey: 'original', viewingKey: 'viewing', thumbnailKey: 'thumbnail' };
    await visitor.save({ roll: { id: 'visitor', name: 'Never uploaded', stockId: 'ektachrome-e100', format: '135', frameIds: [frame.id], coverId: frame.id, createdAt: 1, updatedAt: 1, trashedAt: null }, frames: [frame], blobs: ['original', 'viewing', 'thumbnail'].map(key => ({ key, blob: new Blob(['private']) })) });
    const updates: number[] = [];
    await repo.save(roll, { fetcher, onProgress: progress => updates.push(progress.receivedBytes) });
    expect(updates[0]).toBe(0); expect(updates.at(-1)).toBe(galleryBytes(roll));
    expect(updates.every((value, index) => index === 0 || value >= updates[index - 1])).toBe(true);
    expect((await repo.list()).map(row => [row.roll.revision, row.bytes])).toEqual([[roll.revision, galleryBytes(roll)]]);
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network is offline'); }));
    try {
      const offline = await repo.openSaved(roll.id);
      expect(offline.definition.rollId).toBe(`gallery:${roll.id}:${roll.revision}`);
      expect((await repo.read(roll.id)).images.find(image => image.kind === 'viewing')!.bytes).toEqual(viewing.buffer);
      offline.dispose();
      await repo.remove(roll.id);
      expect(await repo.list()).toEqual([]);
      await expect(repo.openSaved(roll.id)).rejects.toThrow(/removed/);
      expect(await (await visitor.original(frame.id)).text()).toBe('private');
      expect((await visitor.list()).map(row => row.id)).toEqual(['visitor']);
    } finally { vi.unstubAllGlobals(); }
  });
  it('preserves the old complete revision after interruption and corrupt replacement, then atomically replaces it', async () => {
    const repo = new GalleryRepository(new IDBFactory()), first = await fixture(), second = await fixture('revision-2');
    await repo.save(first.roll, { fetcher: first.fetcher });
    const abort = new AbortController();
    await expect(repo.save(second.roll, { fetcher: second.fetcher, signal: abort.signal, onProgress: progress => { if (progress.completedImages === 1) abort.abort(); } })).rejects.toMatchObject({ name: 'AbortError' });
    expect((await repo.read(first.roll.id)).saved.roll.revision).toBe(first.roll.revision);
    await expect(repo.save(second.roll, { fetcher: async () => new Response(new Uint8Array(4), { headers: { 'content-type': 'image/jpeg' } }) })).rejects.toThrow(/checksum/);
    expect((await repo.read(first.roll.id)).saved.roll.revision).toBe(first.roll.revision);
    await repo.save(second.roll, { fetcher: second.fetcher });
    const replacement = await repo.read(first.roll.id);
    expect(replacement.saved.roll.revision).toBe(second.roll.revision);
    expect(replacement.images.map(image => image.kind).sort()).toEqual(['thumbnail', 'viewing']);
  });
  it('rolls back image deletion and replacement when a late quota failure prevents metadata commit', async () => {
    const repo = new GalleryRepository(new IDBFactory()), first = await fixture(), second = await fixture('revision-2');
    await repo.save(first.roll, { fetcher: first.fetcher });
    const put = IDBObjectStore.prototype.put;
    const fail = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === 'rolls') throw new DOMException('Storage full', 'QuotaExceededError');
      return put.call(this, value, key);
    });
    await expect(repo.save(second.roll, { fetcher: second.fetcher })).rejects.toMatchObject({ name: 'QuotaExceededError' });
    fail.mockRestore();
    const preserved = await repo.read(first.roll.id);
    expect(preserved.saved.roll.revision).toBe(first.roll.revision);
    expect(preserved.images.find(image => image.kind === 'viewing')!.bytes).toEqual(first.viewing.buffer);
  });
  it('aborts during the commit transaction and preserves the previous metadata and images', async () => {
    const repo = new GalleryRepository(new IDBFactory()), first = await fixture(), second = await fixture('revision-2');
    await repo.save(first.roll, { fetcher: first.fetcher });
    const abort = new AbortController(), put = IDBObjectStore.prototype.put;
    const interrupt = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      const request = put.call(this, value, key);
      if (this.name === 'rolls') abort.abort();
      return request;
    });
    await expect(repo.save(second.roll, { fetcher: second.fetcher, signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' });
    interrupt.mockRestore();
    expect((await repo.read(first.roll.id)).saved.roll.revision).toBe(first.roll.revision);
  });
});
