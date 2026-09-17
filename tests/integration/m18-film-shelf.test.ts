import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { RollBundle, RollRepository, openRollDatabase } from '../../src/storage/rollRepository';
import { FILM_PACKAGING, getPackaging } from '../../src/data/filmPackaging';
import { FILM_STOCKS } from '../../src/data/filmStocks';
import { FILM_FORMATS } from '../../src/data/filmFormats';
import { placeholderPackaging, reconcileShelfSlots, shelfPageCount } from '../../src/utils/shelfLayout';
import { panelProjection } from '../../src/utils/packagingMaterial';
import { Vector3 } from 'three';

function bundle(id: string, createdAt = 1): RollBundle {
  const f = `${id}-photo`;
  return { roll: { id, name: id, stockId: 'portra-400', format: '135', frameIds: [f], coverId: f, createdAt, updatedAt: createdAt, trashedAt: null }, frames: [{ id: f, rollId: id, filename: 'harbor.jpg', mime: 'image/jpeg', width: 600, height: 400, rotation: 0, hash: f, originalKey: `${f}:original`, viewingKey: `${f}:view`, thumbnailKey: `${f}:thumb` }], blobs: ['original', 'view', 'thumb'].map(suffix => ({ key: `${f}:${suffix}`, blob: new Blob([id], { type: 'image/jpeg' }) })) };
}
describe('M18 shelf persistence with real IndexedDB transactions', () => {
  it('assigns unique stable slots to duplicate-stock rolls, retains edits, and frees/reuses trash slots', async () => {
    const repo = new RollRepository(new IDBFactory());
    await Promise.all([repo.save(bundle('a')), repo.save(bundle('b', 2))]);
    const initial = await repo.shelf(); expect(new Set(initial.map(r => r.shelfSlot)).size).toBe(2);
    const slot = initial.find(r => r.id === 'a')!.shelfSlot;
    const edit = await repo.read('a'); edit.roll.name = 'Renamed'; edit.roll.stockId = 'ektachrome-e100'; edit.roll.format = '67'; delete edit.roll.shelfSlot;
    await repo.save({ ...edit, blobs: [] }); expect((await repo.read('a')).roll.shelfSlot).toBe(slot);
    await repo.trash('a'); expect((await repo.shelf()).map(r => r.id)).toEqual(['b']);
    await repo.save(bundle('c', 3)); expect((await repo.read('c')).roll.shelfSlot).toBe(slot);
    await repo.trash('a', false); expect((await repo.shelf()).map(r => r.id)).toHaveLength(3);
    expect(new Set((await repo.shelf()).map(r => r.shelfSlot)).size).toBe(3);
    expect(await (await repo.original('a-photo')).text()).toBe('a');
    expect((await repo.read('a')).roll.stockId).toBe('ektachrome-e100');
  });
  it('persists legacy placement without changing timestamps or requiring reimport, then reopens it', async () => {
    const factory = new IDBFactory(), repo = new RollRepository(factory);
    await repo.save(bundle('older')); await repo.save(bundle('newer', 2));
    const db = await openRollDatabase(factory);
    await new Promise<void>(resolve => { const tx = db.transaction('rolls', 'readwrite'); for (const id of ['older', 'newer']) { const req = tx.objectStore('rolls').get(id); req.onsuccess = () => { const { shelfSlot: _, ...legacy } = req.result; tx.objectStore('rolls').put(legacy); }; } tx.oncomplete = () => resolve(); }); db.close();
    const before = (await repo.read('older')).roll;
    expect((await repo.shelf()).map(r => [r.id, r.shelfSlot])).toEqual([['older', 0], ['newer', 1]]);
    const reopened = new RollRepository(factory);
    expect((await reopened.shelf()).map(r => r.shelfSlot)).toEqual([0, 1]);
    expect((await reopened.read('older')).roll.updatedAt).toBe(before.updatedAt);
  });
  it('does not allocate or notify for an aborted save and exposes all 17 rolls over two pages', async () => {
    const repo = new RollRepository(new IDBFactory()); let changes = 0;
    const stop = repo.subscribe(() => changes++);
    const controller = new AbortController(); controller.abort();
    await expect(repo.save(bundle('cancelled'), controller.signal)).rejects.toThrow(); expect(changes).toBe(0);
    for (let i = 0; i < 17; i++) await repo.save(bundle(`roll-${i}`, i));
    const rolls = await repo.shelf(); expect(rolls).toHaveLength(17); expect(changes).toBe(17);
    expect(rolls.map(r => r.shelfSlot)).toEqual(Array.from({ length: 17 }, (_, i) => i));
    expect(shelfPageCount(rolls)).toBe(2);
    stop(); await repo.trash('roll-16'); expect(changes).toBe(17); expect(shelfPageCount(await repo.shelf())).toBe(1);
  });
  it('repairs duplicate and invalid legacy slots while preserving valid occupied positions', () => {
    const rolls = [bundle('a').roll, bundle('b').roll, bundle('c').roll, bundle('d').roll];
    rolls[0].shelfSlot = 7; rolls[1].shelfSlot = 7; rolls[2].shelfSlot = -1; rolls[3].shelfSlot = 3;
    const fixed = reconcileShelfSlots(rolls);
    expect(fixed.map(r => r.shelfSlot)).toEqual([7, 0, 1, 3]); expect(rolls[2].shelfSlot).toBe(-1);
  });
});
describe('M18 packaging coverage and texture projection', () => {
  it('covers every stock and format, with stock-correct cartridge images only for 35mm', () => {
    expect(FILM_PACKAGING).toHaveLength(FILM_STOCKS.length * 2);
    for (const stock of FILM_STOCKS) for (const format of Object.keys(FILM_FORMATS) as (keyof typeof FILM_FORMATS)[]) {
      const entry = getPackaging(stock.id, format);
      expect(entry.stockId).toBe(stock.id); expect(entry.format).toBe(format === '135' ? '135' : '120');
      expect(!!entry.cartridge).toBe(format === '135'); expect(entry.box.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.box.asset).toMatch(/^\/assets\/film-packaging\//);
    }
    expect(new Set(Array.from({ length: 16 }, (_, slot) => placeholderPackaging(slot).id)).size).toBe(10);
    expect(placeholderPackaging(12)).toBe(placeholderPackaging(12));
  });
  it('maps every face corner into the measured photograph without diagonal texture seams', () => {
    for (const entry of FILM_PACKAGING) for (const corners of [entry.front, entry.top, ...(entry.cartridgePanel ? [entry.cartridgePanel] : [])]) {
      const matrix = panelProjection(corners);
      [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([x, y], i) => {
        const p = new Vector3(x, y, 1).applyMatrix3(matrix);
        expect(p.x / p.z).toBeCloseTo(corners[i][0], 6); expect(p.y / p.z).toBeCloseTo(corners[i][1], 6);
      });
    }
  });
});


describe('M18 shelf camera journey', () => {
  it('preserves room heading, locks look-around, reverses approach, and leaves shelf focus when opening the table', async () => {
    const { createInitialViewerState, viewerReducer } = await import('../../src/state/viewerState');
    const room = viewerReducer(createInitialViewerState('room'), { type: 'LOOK_ROOM', yaw: .3, pitch: -.1 });
    const shelf = viewerReducer(room, { type: 'APPROACH_SHELF' });
    expect(shelf.shelfFocused).toBe(true); expect(shelf.isTransitioning).toBe(true);
    const settled = viewerReducer(shelf, { type: 'SET_TRANSITIONING', isTransitioning: false });
    expect(viewerReducer(settled, { type: 'LOOK_ROOM', yaw: 1, pitch: 1 }).savedRoomPose).toEqual(room.savedRoomPose);
    const reversed = viewerReducer(shelf, { type: 'RETURN_TO_ROOM' });
    expect(reversed.shelfFocused).toBe(false); expect(reversed.savedRoomPose).toEqual(room.savedRoomPose);
    const table = viewerReducer(settled, { type: 'APPROACH_TABLE' });
    expect(table.roomMode).toBe('inspect'); expect(table.shelfFocused).toBe(false);
    const returned = viewerReducer(table, { type: 'APPROACH_SHELF' });
    expect(returned.roomMode).toBe('room'); expect(returned.shelfFocused).toBe(true);
    expect(returned.focusMode).toBe(false); expect(returned.savedRoomPose).toEqual(room.savedRoomPose);
  });
  it('accepts table navigation and room look while a shelf flight is running', async () => {
    const { createInitialViewerState, viewerReducer } = await import('../../src/state/viewerState');
    const room = createInitialViewerState('room');
    const shelf = viewerReducer(room, { type: 'APPROACH_SHELF' });
    expect(shelf.transitionKind).toBe('shelf');
    expect(viewerReducer(shelf, { type: 'APPROACH_SHELF' })).toBe(shelf);
    expect(viewerReducer(shelf, { type: 'APPROACH_TABLE' }).roomMode).toBe('inspect');
    const exiting = viewerReducer(shelf, { type: 'RETURN_TO_ROOM' });
    expect(exiting.isTransitioning).toBe(true);
    const dragged = viewerReducer(exiting, { type: 'LOOK_ROOM', yaw: .1, pitch: .05 });
    expect(dragged.savedRoomPose.yaw).toBeCloseTo(room.savedRoomPose.yaw + .1);
    expect(dragged.savedRoomPose.pitch).toBeCloseTo(room.savedRoomPose.pitch + .05);
    expect(dragged.isTransitioning).toBe(true);
    expect(viewerReducer(exiting, { type: 'APPROACH_TABLE' }).roomMode).toBe('inspect');
    expect(viewerReducer(exiting, { type: 'APPROACH_SHELF' }).shelfFocused).toBe(true);
  });
});
