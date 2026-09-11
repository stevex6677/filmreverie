import { FilmStockId, isFilmStockId } from '../data/filmStocks';
import { FilmFormat, isFilmFormat } from '../data/filmFormats';
export interface SavedView {
  frameId: string; level: 'roll' | 'strip' | 'frame'; mode: 'negative' | 'positive'; brightness: number; magnification: number;
  zoom: number; pan: { x: number; z: number }; overview: { zoom: number; pan: { x: number; z: number }; frameIndex: number } | null;
}
export interface StoredFrame {
  id: string; rollId: string; filename: string; mime: string; width: number; height: number; rotation: number; hash: string;
  originalKey: string; viewingKey: string; thumbnailKey: string;
}
export interface StoredRoll {
  id: string; name: string; stockId: FilmStockId; format: FilmFormat; frameIds: string[]; coverId: string;
  createdAt: number; updatedAt: number; trashedAt: number | null; view?: SavedView;
}
export interface BlobRecord { key: string; blob: Blob }
export interface RollBundle { roll: StoredRoll; frames: StoredFrame[]; blobs: BlobRecord[] }
const STORES = ['rolls', 'frames', 'blobs'] as const;
export const DB_NAME = 'darkroom-rolls';
export const DB_VERSION = 2;
export function openRollDatabase(factory: IDBFactory = indexedDB, name = DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of STORES) if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: store === 'blobs' ? 'key' : 'id' });
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other darkroom tabs, then retry the storage upgrade.'));
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
  });
}
const result = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
const complete = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error ?? new DOMException('Save cancelled', 'AbortError')); tx.onerror = () => {}; });
export function validateBundle(bundle: RollBundle) {
  const { roll, frames } = bundle;
  if (!roll.name.trim() || roll.name.length > 120 || !isFilmStockId(roll.stockId) || !isFilmFormat(roll.format)) throw new Error('Enter a name, stock and valid film format.');
  if (!frames.length || frames.length > 72 || new Set(roll.frameIds).size !== frames.length || roll.frameIds.length !== frames.length || !roll.frameIds.includes(roll.coverId)) throw new Error('Invalid frame membership or cover.');
  for (const frame of frames) if (frame.rollId !== roll.id || !roll.frameIds.includes(frame.id) || ![0,90,180,270].includes(frame.rotation)) throw new Error('Invalid frame metadata.');
}
export class RollRepository {
  constructor(private factory?: IDBFactory, private name = DB_NAME) {}
  async list(): Promise<StoredRoll[]> { const db = await openRollDatabase(this.factory, this.name); try { return await result(db.transaction('rolls').objectStore('rolls').getAll()); } finally { db.close(); } }
  async read(id: string): Promise<RollBundle> {
    const db = await openRollDatabase(this.factory, this.name);
    try {
      const tx = db.transaction([...STORES]);
      const roll = await result<StoredRoll | undefined>(tx.objectStore('rolls').get(id));
      if (!roll) throw new Error('This roll is no longer available. Refresh the library.');
      const frames = await Promise.all(roll.frameIds.map(frameId => result<StoredFrame | undefined>(tx.objectStore('frames').get(frameId))));
      if (frames.some(f => !f)) throw new Error('Some stored frames are missing. The current roll has been kept open.');
      const originals = frames.map(f => result(tx.objectStore('blobs').count(f!.originalKey)));
      const keys = [...new Set(frames.flatMap(f => [f!.viewingKey, f!.thumbnailKey]))];
      const blobs = await Promise.all(keys.map(key => result<BlobRecord | undefined>(tx.objectStore('blobs').get(key))));
      if ((await Promise.all(originals)).some(count => count !== 1) || blobs.some(b => !b)) throw new Error('Some stored images are missing. The current roll has been kept open.');
      return { roll, frames: frames as StoredFrame[], blobs: blobs as BlobRecord[] };
    } finally { db.close(); }
  }
  async thumbnail(id: string, frameId: string): Promise<{ blob: Blob; rotation: number }> {
    const db = await openRollDatabase(this.factory, this.name);
    try {
      const tx = db.transaction(['frames','blobs']);
      const frame = await result<StoredFrame>(tx.objectStore('frames').get(frameId));
      if (!frame || frame.rollId !== id) throw new Error('Cover unavailable.');
      const record = await result<BlobRecord>(tx.objectStore('blobs').get(frame.thumbnailKey));
      if (!record) throw new Error('Cover unavailable.');
      return { blob: record.blob, rotation: frame.rotation };
    } finally { db.close(); }
  }
  async save(bundle: RollBundle, signal?: AbortSignal) {
    validateBundle(bundle); signal?.throwIfAborted();
    const db = await openRollDatabase(this.factory, this.name);
    try {
      signal?.throwIfAborted();
      const tx = db.transaction([...STORES], 'readwrite'), done = complete(tx);
      const abort = () => { try { tx.abort(); } catch { /* Already committed. */ } };
      signal?.addEventListener('abort', abort, { once: true });
      try {
        tx.objectStore('rolls').put({ ...bundle.roll, name: bundle.roll.name.trim(), updatedAt: Date.now() });
        for (const frame of bundle.frames) tx.objectStore('frames').put(frame);
        for (const blob of bundle.blobs) tx.objectStore('blobs').put(blob);
        // Verify every referenced asset within the same transaction, including retained originals during edits.
        for (const frame of bundle.frames) for (const key of [frame.originalKey, frame.viewingKey, frame.thumbnailKey]) {
          const check = tx.objectStore('blobs').count(key);
          check.onsuccess = () => { if (check.result !== 1) abort(); };
        }
        await done;
      } catch (error) { abort(); await done.catch(() => {}); throw error; } finally { signal?.removeEventListener('abort', abort); }
    } finally { db.close(); }
  }
  async update(id: string, change: (roll: StoredRoll) => StoredRoll) {
    const db = await openRollDatabase(this.factory, this.name);
    try {
      const tx = db.transaction('rolls', 'readwrite'), done = complete(tx), store = tx.objectStore('rolls');
      const request = store.get(id);
      request.onsuccess = () => { if (request.result) store.put(change(request.result)); else tx.abort(); };
      await done;
    } finally { db.close(); }
  }
  trash(id: string, trashed = true) { return this.update(id, r => ({ ...r, trashedAt: trashed ? Date.now() : null, updatedAt: Date.now() })); }
}
export function storageMessage(error: unknown) {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return 'Browser storage is full. Free space in browser settings and retry; this roll was not saved.';
  return error instanceof Error ? error.message : 'Browser storage is unavailable. Enable site storage and retry.';
}
