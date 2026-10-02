// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { RollBundle, RollRepository } from '../../src/storage/rollRepository';
import { applyShelfArrangement, arrangeShelf, reconcileShelfSlots, validShelfArrangement } from '../../src/utils/shelfLayout';
import { listDrafts, publicCatalog, publishDraft, saveArrangement, saveDraft } from '../../cloudflare/storage';
import { parseGalleryCatalog } from '../../src/cloud/galleryClient';
import { AdminRollRepository } from '../../src/cloud/adminRepository';
import { ownerClient } from '../../src/cloud/ownerClient';
import type { GalleryRoll, PublishResult } from '../../src/cloud/contracts';
import type { Env } from '../../cloudflare/types';
import { draftFixture, environment } from './m21-worker-fixtures';

function bundle(id: string, createdAt = 1): RollBundle {
  const f = `${id}-photo`;
  return { roll: { id, name: id, stockId: 'portra-400', format: '135', frameIds: [f], coverId: f, createdAt, updatedAt: createdAt, trashedAt: null }, frames: [{ id: f, rollId: id, filename: 'harbor.jpg', mime: 'image/jpeg', width: 600, height: 400, rotation: 0, hash: f, originalKey: `${f}:original`, viewingKey: `${f}:view`, thumbnailKey: `${f}:thumb` }], blobs: ['original', 'view', 'thumb'].map(suffix => ({ key: `${f}:${suffix}`, blob: new Blob([id], { type: 'image/jpeg' }) })) };
}
const slotsOf = (rolls: { id: string; shelfSlot?: number }[]) => Object.fromEntries(rolls.map(r => [r.id, r.shelfSlot]));
async function finish(env: Env, id: string, updatedAt: number): Promise<GalleryRoll> {
  let result: PublishResult = await publishDraft(env, id, updatedAt);
  while ('pending' in result) result = await publishDraft(env, id, updatedAt, result.continuation);
  return result;
}
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Shelf arrangement', () => {
  it('moves a roll into an empty cubby, swaps with an occupied one and pins every saved roll', () => {
    const rolls = reconcileShelfSlots(['a', 'b', 'c'].map((id, i) => bundle(id, i).roll));
    expect(arrangeShelf(rolls, 'a', 9)).toEqual({ a: 9, b: 1, c: 2 });
    expect(arrangeShelf(rolls, 'a', 2)).toEqual({ a: 2, b: 1, c: 0 });
    const trashed = rolls.map(r => r.id === 'b' ? { ...r, trashedAt: 5 } : r);
    expect(arrangeShelf(trashed, 'c', 1)).toEqual({ a: 0, c: 1 });
    expect(() => arrangeShelf(trashed, 'b', 3)).toThrow(/no longer be moved/);
    expect(() => arrangeShelf(rolls, 'a', -1)).toThrow();
    expect([{ a: 1, b: 1 }, { a: -1 }, { a: 1.5 }, [], null].map(validShelfArrangement)).toEqual([false, false, false, false, false]);
    // An unlisted roll in an arranged cubby is placed afresh rather than doubling up.
    const placed = reconcileShelfSlots(applyShelfArrangement([...rolls, { ...bundle('d', 9).roll, shelfSlot: 0 }], { a: 3, b: 0, c: 2 }));
    expect(slotsOf(placed)).toEqual({ a: 3, b: 0, c: 2, d: 1 });
  });

  it('saves a swap in one IndexedDB transaction, leaves Trash alone and survives reopening', async () => {
    const factory = new IDBFactory(), repo = new RollRepository(factory);
    for (const [i, id] of ['a', 'b', 'c'].entries()) await repo.save(bundle(id, i));
    await repo.trash('c');
    let changes = 0; repo.subscribe(() => changes++);
    await repo.arrange(arrangeShelf(await repo.list(), 'a', 1));
    expect(changes).toBe(1);
    expect(slotsOf(await repo.shelf())).toEqual({ b: 0, a: 1 });
    await repo.arrange(arrangeShelf(await repo.list(), 'b', 20));
    expect(slotsOf(await new RollRepository(factory).shelf())).toEqual({ a: 1, b: 20 });
    expect((await repo.read('c')).roll.shelfSlot).toBeUndefined();
    await repo.trash('c', false);
    expect(slotsOf(await repo.shelf())).toEqual({ a: 1, b: 20, c: 0 });
    await expect(repo.arrange({ a: 1, b: 1 })).rejects.toThrow(/Invalid shelf arrangement/);
    expect(slotsOf(await repo.shelf())).toEqual({ a: 1, b: 20, c: 0 });
  });

  it('keeps owner cubbies in one private record and places published rolls in the same cubbies', async () => {
    const { env, privateBucket } = environment();
    const first = (await draftFixture(env, privateBucket)).draft, second = (await draftFixture(env, privateBucket)).draft;
    await finish(env, first.roll.id, first.roll.updatedAt); await finish(env, second.roll.id, second.roll.updatedAt);
    expect((await publicCatalog(env)).rolls.map(r => r.shelfSlot)).toEqual([undefined, undefined]);
    const slots = { [first.roll.id]: 5, [second.roll.id]: 0 };
    expect(await saveArrangement(env, { slots })).toEqual({ slots });
    const drafts = (await listDrafts(env)).drafts;
    expect(slotsOf(drafts.map(d => d.roll))).toEqual(slots);
    // Drafts themselves are untouched, so an open editor never conflicts with a move.
    expect(drafts.find(d => d.roll.id === first.roll.id)!.roll.updatedAt).toBe(first.roll.updatedAt);
    const catalog = parseGalleryCatalog(JSON.parse(JSON.stringify(await publicCatalog(env))));
    expect(slotsOf(catalog.rolls)).toEqual(slots);
    // Republishing an edit keeps the roll in its cubby.
    const edited = await saveDraft(env, first.roll.id, { ...first, roll: { ...first.roll, name: 'Edited' } });
    expect((await finish(env, edited.roll.id, edited.roll.updatedAt)).shelfSlot).toBe(5);
    expect(slotsOf((await publicCatalog(env)).rolls)).toEqual(slots);
    for (const invalid of [{ slots: { [first.roll.id]: 1, [second.roll.id]: 1 } }, { slots: { 'not-a-roll': 1 } }, { slots: [] }, null])
      await expect(saveArrangement(env, invalid)).rejects.toMatchObject({ status: 400 });
    expect(slotsOf((await publicCatalog(env)).rolls)).toEqual(slots);
  });

  it('rejects malformed published cubbies', () => {
    expect(() => parseGalleryCatalog({ version: 1, rolls: [{ shelfSlot: -1 }] })).toThrow();
  });

  it('sends the whole arrangement from the owner shelf and refreshes listeners', async () => {
    const arrange = vi.spyOn(ownerClient, 'arrange').mockResolvedValue();
    const repository = new AdminRollRepository(); let changes = 0; repository.subscribe(() => changes++);
    await repository.arrange({ a: 2, b: 0 });
    expect(arrange).toHaveBeenCalledWith({ a: 2, b: 0 });
    expect(changes).toBe(1);
  });
});
