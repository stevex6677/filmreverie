import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { sha256Hex } from '../../src/storage/crypto';
import { RollRepository } from '../../src/storage/rollRepository';
import { createGalleryRuntime, downloadGalleryRoll, type GalleryProgress, downloadGalleryImage, fetchGallery, galleryBytes, openLiveGalleryRoll, parseGalleryCatalog } from '../../src/cloud/galleryClient';
import { GalleryRepository } from '../../src/cloud/galleryStorage';
import { createRollLayout } from '../../src/utils/rollLayout';
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
  it.each(['fixed','free'] as const)('honors a saved strip count in the %s published gallery',async(sizing)=>{
    const {roll,fetcher}=await fixture();
    roll.sizing=sizing;roll.framesPerStrip=2;
    roll.frames=Array.from({length:5},(_,i)=>({...roll.frames[0],id:`frame-${i+1}`}));
    const runtime=await openLiveGalleryRoll(roll,{fetcher});
    try { expect(createRollLayout(runtime.definition).map(strip=>strip.frames.length)).toEqual([2,2,1]); }
    finally { runtime.dispose(); }
    for(const invalid of [0,-1,1.5,NaN,Infinity,'2',null]){
      expect(()=>parseGalleryCatalog({version:1,rolls:[{...roll,framesPerStrip:invalid}]})).toThrow('frames per strip');
    }
  });
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
    await expect(repo.save(second.roll, { fetcher: async input => new Response(new Uint8Array(String(input).endsWith('/view.jpg') ? 4 : 2), { headers: { 'content-type': 'image/jpeg' } }) })).rejects.toThrow(/checksum/);
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

async function parallelFixture() {
  const { roll, viewing } = await fixture();
  roll.frames = Array.from({ length: 8 }, (_, index) => ({ ...roll.frames[0], id: `frame-${index}`,
    viewing: { ...roll.frames[0].viewing, url: `https://photos.example/rolls/${index}/view.jpg` } }));
  roll.coverId = roll.frames[0].id;
  const streams: ReadableStreamDefaultController<Uint8Array>[] = [], cancelled = vi.fn();
  const fetcher = vi.fn<typeof fetch>(async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) { streams.push(controller); controller.enqueue(viewing.slice(0, 1)); },
    cancel: cancelled,
  }), { headers: { 'content-type': 'image/jpeg' } }));
  return { roll, viewing, streams, fetcher, cancelled };
}

it('downloads six images concurrently, aggregates interleaved bytes and preserves frame order', async () => {
  const { roll, viewing, streams, fetcher } = await parallelFixture();
  const progress: GalleryProgress[] = [];
  const result = downloadGalleryRoll(roll, ['viewing'], { fetcher, onProgress: value => progress.push(value) });
  await vi.waitFor(() => expect(progress.at(-1)?.receivedBytes).toBe(6));
  expect(fetcher).toHaveBeenCalledTimes(6);
  const finish = (index: number) => { streams[index].enqueue(viewing.slice(1)); streams[index].close(); };
  finish(5);
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(7));
  finish(4);
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(8));
  for (const index of [7, 6, 3, 2, 1, 0]) finish(index);
  const images = await result;
  expect(images.map(image => image.frameId)).toEqual(roll.frames.map(frame => frame.id));
  expect(images.every(image => new Uint8Array(image.bytes).toString() === viewing.toString())).toBe(true);
  expect(progress.at(-1)).toMatchObject({ receivedBytes: 32, totalBytes: 32, completedImages: 8, totalImages: 8, phase: 'verifying' });
  expect(progress.every((value, index) => value.receivedBytes <= 32 && (!index || value.receivedBytes >= progress[index - 1].receivedBytes))).toBe(true);
  const checking = progress.findIndex(value => value.phase === 'verifying');
  expect(progress.slice(checking).every(value => value.phase === 'verifying')).toBe(true);
});

it.each(['failure', 'cancel'] as const)('stops queued downloads and drains active streams after %s', async mode => {
  const { roll, streams, fetcher, cancelled } = await parallelFixture();
  const controller = new AbortController(), progress = vi.fn();
  const result = downloadGalleryRoll(roll, ['viewing'], { fetcher, signal: controller.signal, onProgress: progress });
  const rejected = mode === 'failure' ? expect(result).rejects.toThrow('Network failed') : expect(result).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(progress.mock.calls.at(-1)?.[0].receivedBytes).toBe(6));
  if (mode === 'failure') streams[0].error(new Error('Network failed'));
  else controller.abort();
  await rejected;
  expect(fetcher).toHaveBeenCalledTimes(6);
  expect(cancelled).toHaveBeenCalledTimes(mode === 'failure' ? 5 : 6);
  const reports = progress.mock.calls.length;
  await Promise.resolve();
  expect(progress).toHaveBeenCalledTimes(reports);
});

it('reuses verified public images on reopen without another download', async () => {
  const { GalleryImageCache } = await import('../../src/cloud/galleryImageCache');
  const imageCache = new GalleryImageCache(), { roll, fetcher } = await fixture();
  imageCache.retain([roll]);
  const first = await openLiveGalleryRoll(roll, { fetcher, imageCache }); first.dispose();
  const progress: GalleryProgress[] = [];
  const second = await openLiveGalleryRoll(roll, { fetcher, imageCache, onProgress: value => progress.push(value) });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(progress.at(-1)).toMatchObject({ receivedBytes: 4, totalBytes: 4, completedImages: 1, totalImages: 1 });
  expect(second.definition.frames).toHaveLength(1); second.dispose();
});

it('invalidates changed or withdrawn images and rejects late completions after clearing the cache', async () => {
  const { GalleryImageCache } = await import('../../src/cloud/galleryImageCache');
  const cache = new GalleryImageCache(), { roll, viewing } = await fixture(), image = roll.frames[0].viewing;
  const value = { bytes: viewing.buffer, mime: 'image/jpeg' };
  cache.retain([roll]); cache.put(image, value);
  expect(cache.get(image)).toBe(value);
  const changed = structuredClone(roll); changed.frames[0].viewing.sha256 = 'a'.repeat(64);
  cache.retain([changed]);
  expect(cache.get(image)).toBeUndefined();
  cache.put(image, value); expect(cache.get(image)).toBeUndefined();
  cache.retain([roll]); cache.put(image, value); cache.retain([]);
  expect(cache.get(image)).toBeUndefined();
  cache.retain([roll]); cache.put(image, value); cache.clear(); cache.put(image, value);
  expect(cache.get(image)).toBeUndefined();
});

it('bounds the image cache and evicts the least recently used verified image', async () => {
  const { GalleryImageCache } = await import('../../src/cloud/galleryImageCache');
  const cache = new GalleryImageCache(8), { roll, viewing } = await fixture();
  const images = ['one', 'two', 'three'].map(name => ({ ...roll.frames[0].viewing, url: `https://photos.example/${name}.jpg` }));
  const value = { bytes: viewing.buffer, mime: 'image/jpeg' };
  cache.put(images[0], value); cache.put(images[1], value);
  cache.get(images[0]); cache.put(images[2], value);
  expect(cache.get(images[0])).toBe(value); expect(cache.get(images[1])).toBeUndefined(); expect(cache.get(images[2])).toBe(value);
  cache.put({ ...images[0], bytes: 12 }, { bytes: new ArrayBuffer(12), mime: 'image/jpeg' });
  expect(cache.get(images[0])).toBe(value);
});

it('does not cache failed checksum verification', async () => {
  const { GalleryImageCache } = await import('../../src/cloud/galleryImageCache');
  const imageCache = new GalleryImageCache(), { roll, fetcher } = await fixture();
  const corrupt = vi.fn<typeof fetch>(async () => new Response(new Uint8Array(4), { headers: { 'content-type': 'image/jpeg' } }));
  await expect(openLiveGalleryRoll(roll, { fetcher: corrupt, imageCache })).rejects.toThrow(/checksum/);
  expect(imageCache.get(roll.frames[0].viewing)).toBeUndefined();
  const runtime = await openLiveGalleryRoll(roll, { fetcher, imageCache }); runtime.dispose();
  expect(fetcher).toHaveBeenCalledOnce();
});
