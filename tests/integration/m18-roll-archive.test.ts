import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import { IDBFactory } from 'fake-indexeddb';
import { RollBundle, RollRepository } from '../../src/storage/rollRepository';
import { decodeArchive, exportRolls, importRolls } from '../../src/storage/rollArchive';
function bundle(id = 'roll'): RollBundle {
  const frame = id + '-frame';
  return {
    roll: { id, name: 'Preserved', stockId: 'ektachrome-e100', format: '67', sizing: 'free', frameIds: [frame], coverId: frame, createdAt: 12, updatedAt: 34, trashedAt: null,
      view: { frameId: frame, level: 'frame', mode: 'positive', brightness: .8, magnification: 4, zoom: 2, pan: { x: .2, z: .3 }, overview: { zoom: .5, pan: { x: .1, z: .2 }, frameIndex: 0 } } },
    frames: [{ id: frame, rollId: id, filename: 'original.png', mime: 'image/png', width: 300, height: 200, rotation: 90, hash: 'preserved-hash', cropPosition: { x: .2, y: -.4 }, originalKey: frame + ':original', viewingKey: frame + ':view', thumbnailKey: frame + ':thumb' }],
    blobs: ['original','view','thumb'].map((kind, i) => ({ key: frame + ':' + kind, blob: new Blob([new Uint8Array(PNG.sync.write(Object.assign(new PNG({ width: 3, height: 2 }), { data: Buffer.alloc(24, 80 + i) })))], { type: 'image/png' }) })),
  };
}
describe('M18 portable roll backups', () => {
  it('preserves all bytes, metadata, ordering, trash and saved views across independent databases', async () => {
    const a = new RollRepository(new IDBFactory()), b = new RollRepository(new IDBFactory());
    const one = bundle(), two = bundle('trash'); two.roll.trashedAt = 99; two.roll.view!.zoom = NaN;
    await a.save(one); await a.save(two);
    const archive = await exportRolls(a, ['roll','trash']), decoded = await decodeArchive(archive);
    expect(decoded[0].roll).toEqual((await a.read('roll')).roll);
    expect(decoded[0].frames).toEqual(one.frames);
    expect(Number.isNaN(decoded[1].roll.view!.zoom)).toBe(true);
    const ids = await importRolls(b, archive);
    const copy = await b.read(ids[0], true);
    expect(copy.roll.id).not.toBe(one.roll.id);
    expect(copy.roll.view!.frameId).toBe(copy.frames[0].id);
    expect(copy.roll.view!.overview).toEqual(one.roll.view!.overview);
    expect(copy.frames[0].cropPosition).toEqual(one.frames[0].cropPosition);
    expect(copy.frames[0].rotation).toBe(90);
    expect(copy.roll.sizing).toBe('free');
    for (const key of ['originalKey','viewingKey','thumbnailKey'] as const) {
      expect(await copy.blobs.find(x=>x.key===copy.frames[0][key])!.blob.arrayBuffer()).toEqual(await one.blobs.find(x=>x.key===one.frames[0][key])!.blob.arrayBuffer());
    }
    expect((await b.read(ids[1])).roll.trashedAt).toBe(99);
    await importRolls(b, archive); expect(await b.list()).toHaveLength(4);
    expect(await a.list()).toHaveLength(2);
  });
  it('rejects corruption, truncation, junk and unsupported archives without modifying existing rolls', async () => {
    const repo = new RollRepository(new IDBFactory()); await repo.save(bundle());
    const archive = await exportRolls(repo, ['roll']), bytes = new Uint8Array(await archive.arrayBuffer()); bytes[bytes.length-1] ^= 1;
    for (const bad of [new Blob([bytes]),archive.slice(0,archive.size-1),new Blob(['{"version":2}']),new Blob([archive,'extra'])]) await expect(importRolls(repo,bad)).rejects.toThrow();
    expect(await repo.list()).toHaveLength(1); expect((await repo.read('roll')).frames[0].rotation).toBe(90);
  });
  it('rejects malformed metadata even when image checksums are intact', async () => {
    const repo = new RollRepository(new IDBFactory()); await repo.save(bundle());
    const archive = await exportRolls(repo,['roll']), bytes = new Uint8Array(await archive.arrayBuffer());
    const offset = new TextEncoder().encode('DARKROOM-ROLLS-1\n').length;
    const length = new DataView(bytes.buffer).getUint32(offset);
    const header = JSON.parse(new TextDecoder().decode(bytes.slice(offset+4,offset+4+length)));
    for (const mutate of [(x:any)=>x.rolls[0].roll.frameIds.push('missing'),(x:any)=>x.rolls[0].frames[0].rotation=45,(x:any)=>x.rolls[0].roll.view.pan.x='bad',(x:any)=>x.rolls[0].blobs[0].size=-1]) {
      const copy=structuredClone(header);mutate(copy);const json=new TextEncoder().encode(JSON.stringify(copy)),len=new Uint8Array(4);new DataView(len.buffer).setUint32(0,json.length);
      await expect(importRolls(repo,new Blob([bytes.slice(0,offset),len,json,bytes.slice(offset+4+length)]))).rejects.toThrow();
    }
    expect(await repo.list()).toHaveLength(1);
  });
  it('rolls back the entire batch on a late collision and preserves original bytes', async () => {
    const repo=new RollRepository(new IDBFactory());await repo.save(bundle());
    await expect(repo.importNew([bundle('new'),bundle()])).rejects.toThrow();
    expect((await repo.list()).map(x=>x.id)).toEqual(['roll']);
    expect(await (await repo.original('roll-frame')).arrayBuffer()).toEqual(await bundle().blobs[0].blob.arrayBuffer());
  });
  it('refuses to export missing originals instead of producing an incomplete backup', async () => {
    const repo=new RollRepository(new IDBFactory());await repo.save(bundle());
    const incomplete=await repo.read('roll');expect(incomplete.blobs).toHaveLength(2);
    const invalid=bundle('bad');invalid.blobs.pop();await expect(repo.importNew([invalid])).rejects.toThrow();
    expect(await repo.list()).toHaveLength(1);
  });
});
