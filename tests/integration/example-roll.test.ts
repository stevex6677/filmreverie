import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { RollBundle, RollRepository } from '../../src/storage/rollRepository';
import { ensureExampleRoll, EXAMPLE_ROLL_ID } from '../../src/storage/exampleRoll';
import { ROLL_FRAMES } from '../../src/data/rollManifest';

// A PNG header is sufficient for the seeder's dimension inspection.
const png = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,2,88,0,0,1,144]);
function bundle(id: string): RollBundle {
  const frame = { id: `${id}-photo`, rollId: id, filename: 'photo.png', mime: 'image/png', width: 600, height: 400, rotation: 0, hash: id, originalKey: `${id}:original`, viewingKey: `${id}:view`, thumbnailKey: `${id}:thumb` };
  return { roll: { id, name: id, stockId: 'portra-800', format: '135', frameIds: [frame.id], coverId: frame.id, createdAt: 1, updatedAt: 1, trashedAt: null }, frames: [frame], blobs: ['original','view','thumb'].map(suffix => ({key:`${id}:${suffix}`, blob:new Blob([png], {type:'image/png'})})) };
}
afterEach(() => vi.unstubAllGlobals());
describe('First shelf roll', () => {
  it('inserts all five bundled photographs first, preserving existing rolls and original bytes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(png, { headers: {'Content-Type':'image/png'} })));
    const repo = new RollRepository(new IDBFactory());
    await repo.save(bundle('existing')); const before = (await repo.read('existing')).roll;
    await ensureExampleRoll(repo);
    const example = await repo.read(EXAMPLE_ROLL_ID);
    expect(example.roll.shelfSlot).toBe(0); expect(example.frames).toHaveLength(5);
    expect(example.frames.map(f => f.filename)).toEqual(ROLL_FRAMES.map(p => `${p.title}.jpg`));
    expect(example.roll.coverId).toBe(example.frames[0].id);
    expect(new Uint8Array(await (await repo.original(example.frames[0].id)).arrayBuffer())).toEqual(png);
    expect((await repo.read('existing')).roll).toEqual({...before,shelfSlot:1});
    expect(new Uint8Array(await (await repo.original('existing-photo')).arrayBuffer())).toEqual(png);
  });
  it('seeds once across repositories and never overwrites an edited or deleted example on reload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(png)));
    const factory = new IDBFactory(), a = new RollRepository(factory), b = new RollRepository(factory);
    await a.save(bundle('existing'));
    await Promise.all([ensureExampleRoll(a),ensureExampleRoll(b),ensureExampleRoll(a)]);
    expect((await a.shelf()).map(r => r.shelfSlot)).toEqual([0,1]);
    const edit = await a.read(EXAMPLE_ROLL_ID); edit.roll.name = 'My first roll'; edit.roll.stockId = 'ektar-100';
    await a.save({...edit,blobs:[]}); await a.trash(EXAMPLE_ROLL_ID);
    const before = await a.read(EXAMPLE_ROLL_ID);
    vi.stubGlobal('fetch', vi.fn(() => {throw new Error('must not fetch again');}));
    await ensureExampleRoll(new RollRepository(factory));
    expect(await a.read(EXAMPLE_ROLL_ID)).toEqual(before);
    expect((await a.shelf()).map(r => r.id)).toEqual(['existing']);
  });
  it('leaves the shelf intact after a fetch failure and supports retry', async () => {
    const repo = new RollRepository(new IDBFactory()); await repo.save(bundle('existing'));
    const before = await repo.list(); let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => ++calls === 4 ? new Response('',{status:503}) : new Response(png)));
    await expect(ensureExampleRoll(repo)).rejects.toThrow('first roll could not be prepared');
    expect(await repo.list()).toEqual(before);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(png)));
    await ensureExampleRoll(repo); expect(await repo.shelf()).toHaveLength(2);
  });
  it('rolls back slot shifts when the seed transaction lacks an image', async () => {
    const repo = new RollRepository(new IDBFactory()); await repo.save(bundle('existing'));
    const before = await repo.list(), invalid = bundle(EXAMPLE_ROLL_ID); invalid.blobs.pop();
    await expect(repo.save(invalid,undefined,{insertFirstIfMissing:true})).rejects.toThrow();
    expect(await repo.list()).toEqual(before);
    await expect(repo.read(EXAMPLE_ROLL_ID)).rejects.toThrow('no longer available');
  });
});
