import { FilmStockId, isFilmStockId } from '../data/filmStocks';
import { FilmFormat, FrameSizing, filmLengthUsage, isFilmFormat } from '../data/filmFormats';
import { reconcileShelfSlots } from '../utils/shelfLayout';
export interface SavedView {
  filmScale?: number;
  frameId: string; level: 'roll' | 'strip' | 'frame'; mode: 'negative' | 'positive'; brightness: number; magnification: number;
  zoom: number; pan: { x: number; z: number }; overview: { zoom: number; pan: { x: number; z: number }; frameIndex: number } | null;
}
export interface StoredFrame {
  cropPosition?: import('../utils/photoFraming').CropPosition;
  /** Per-frame film effect strength; when any frame has one, the roll is adjusted frame by frame. */
  filmStrength?: number;
  id: string; rollId: string; filename: string; mime: string; width: number; height: number; rotation: number; hash: string;
  originalKey: string; viewingKey: string; thumbnailKey: string;
}
export interface StoredRoll {
  shelfSlot?: number;
  sizing?: FrameSizing;
  filmStrength?: number;
  id: string; name: string; stockId: FilmStockId; format: FilmFormat; frameIds: string[]; coverId: string;
  createdAt: number; updatedAt: number; trashedAt: number | null; view?: SavedView;
}
export interface BlobRecord { key: string; blob: Blob }
type StoredImageRecord = BlobRecord | { key: string; bytes: ArrayBuffer; mime: string };
function imageRecord(record:StoredImageRecord):BlobRecord {
  return 'blob' in record ? record : {key:record.key,blob:new Blob([record.bytes],{type:record.mime})};
}
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
const complete = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => {
  let failure:DOMException|null=null;
  tx.oncomplete=()=>resolve();
  tx.onabort=()=>reject(failure??tx.error??new DOMException('Save cancelled','AbortError'));
  tx.onerror=event=>{failure=(event.target as IDBRequest)?.error??tx.error;try{tx.abort();}catch{reject(failure??new Error('Storage transaction failed.'));}};
});
export function validateBundle(bundle: { roll: StoredRoll; frames: Pick<StoredFrame, 'id' | 'rollId' | 'rotation' | 'width' | 'height' | 'cropPosition' | 'filmStrength'>[]; blobs?: BlobRecord[] }) {
  const { roll, frames } = bundle;
  if (!roll.name.trim() || roll.name.length > 120 || !isFilmStockId(roll.stockId) || !isFilmFormat(roll.format)) throw new Error('Enter a name, stock and valid film format.');
  if (!frames.length || new Set(roll.frameIds).size !== frames.length || roll.frameIds.length !== frames.length || !roll.frameIds.includes(roll.coverId)) throw new Error('Invalid frame membership or cover.');
  for (const frame of frames) if (frame.rollId !== roll.id || !roll.frameIds.includes(frame.id) || ![0,90,180,270].includes(frame.rotation)) throw new Error('Invalid frame metadata.');
  if (roll.sizing !== undefined && !['fixed','free'].includes(roll.sizing)) throw new Error('Invalid frame sizing.');
  for (const frame of frames) if (![frame.width, frame.height].every(n => Number.isFinite(n) && n > 0)) throw new Error('Invalid image dimensions.');
  const length = filmLengthUsage(roll.format, roll.sizing ?? 'fixed', frames);
  if (length.exceeded) throw new Error(`Roll exceeds its film length by ${Math.ceil(length.used - length.capacity)} mm. Remove photographs or change the frame size before saving.`);
  for (const frame of frames) if (frame.cropPosition && [frame.cropPosition.x, frame.cropPosition.y].some(n => !Number.isFinite(n) || Math.abs(n) > 1)) throw new Error('Invalid crop position.');
  for (const strength of [roll.filmStrength, ...frames.map(frame => frame.filmStrength)]) if (strength !== undefined && (typeof strength !== 'number' || !Number.isFinite(strength) || strength < 0 || strength > 100)) throw new Error('Invalid film effect strength.');
}
export class RollRepository {
  private listeners = new Set<() => void>();
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private changed() { this.listeners.forEach(listener => listener()); }
  constructor(private factory?: IDBFactory, private name = DB_NAME) {}
  async shelf(): Promise<StoredRoll[]> {
    const db = await openRollDatabase(this.factory, this.name);
    try {
      const tx = db.transaction('rolls', 'readwrite'), done = complete(tx), store = tx.objectStore('rolls');
      const existing = await result<StoredRoll[]>(store.getAll());
      const assigned = reconcileShelfSlots(existing);
      for (const roll of assigned) if (existing.find(r => r.id === roll.id)?.shelfSlot !== roll.shelfSlot) store.put(roll);
      await done;
      return assigned.filter(roll => roll.trashedAt === null);
    } finally { db.close(); }
  }
  async list(): Promise<StoredRoll[]> { const db = await openRollDatabase(this.factory, this.name); try { return await result(db.transaction('rolls').objectStore('rolls').getAll()); } finally { db.close(); } }
  async read(id: string, includeOriginals = false): Promise<RollBundle> {
    const db = await openRollDatabase(this.factory, this.name);
    try {
      const tx = db.transaction([...STORES]);
      const roll = await result<StoredRoll | undefined>(tx.objectStore('rolls').get(id));
      if (!roll) throw new Error('This roll is no longer available. Refresh the library.');
      const frames = await Promise.all(roll.frameIds.map(frameId => result<StoredFrame | undefined>(tx.objectStore('frames').get(frameId))));
      if (frames.some(f => !f)) throw new Error('Some stored frames are missing. The current roll has been kept open.');
      const keys = [...new Set(frames.flatMap(f => [f!.viewingKey, f!.thumbnailKey, ...(includeOriginals ? [f!.originalKey] : [])]))];
      const blobs = await Promise.all(keys.map(key => result<StoredImageRecord | undefined>(tx.objectStore('blobs').get(key))));
      if (blobs.some(b => !b)) throw new Error('Some stored images are missing. The current roll has been kept open.');
      return { roll, frames: frames as StoredFrame[], blobs: (blobs as StoredImageRecord[]).map(imageRecord) };
    } finally { db.close(); }
  }
  async original(frameId: string): Promise<Blob> {
    const db=await openRollDatabase(this.factory,this.name);
    try { const tx=db.transaction(['frames','blobs']);const frame=await result<StoredFrame|undefined>(tx.objectStore('frames').get(frameId));if(!frame)throw new Error('Original unavailable.');const record=await result<StoredImageRecord|undefined>(tx.objectStore('blobs').get(frame.originalKey));if(!record)throw new Error('Original unavailable.');return imageRecord(record).blob; } finally { db.close(); }
  }
  async thumbnail(id: string, frameId: string): Promise<{ blob: Blob; rotation: number; frame: StoredFrame }> {
    const db = await openRollDatabase(this.factory, this.name);
    try {
      const tx = db.transaction(['frames','blobs']);
      const frame = await result<StoredFrame>(tx.objectStore('frames').get(frameId));
      if (!frame || frame.rollId !== id) throw new Error('Cover unavailable.');
      const record = await result<StoredImageRecord>(tx.objectStore('blobs').get(frame.thumbnailKey));
      if (!record) throw new Error('Cover unavailable.');
      return { blob: imageRecord(record).blob, rotation: frame.rotation, frame };
    } finally { db.close(); }
  }
  async save(bundle: RollBundle, signal?: AbortSignal, options: { insertFirstIfMissing?: boolean } = {}) {
    validateBundle(bundle); signal?.throwIfAborted();
    // WebKit's Blob serialization can fail and leave the transaction unsettled.
    // Plain binary records avoid that path in every browser. Existing Blob
    // records remain readable; object stores, keys and source bytes are unchanged.
    // Prepare serially before opening the atomic transaction (never await a file
    // read inside it). Peak temporary binary storage is bounded by draft bytes.
    const images:StoredImageRecord[]=[];
    for(const record of bundle.blobs){signal?.throwIfAborted();images.push({key:record.key,bytes:await record.blob.arrayBuffer(),mime:record.blob.type});}
    signal?.throwIfAborted();
    const db = await openRollDatabase(this.factory, this.name);
    try {
      signal?.throwIfAborted();
      const tx = db.transaction([...STORES], 'readwrite'), done = complete(tx);
      let writeFailure: unknown;
      const abort = () => { try { tx.abort(); } catch { /* Already committed. */ } };
      signal?.addEventListener('abort', abort, { once: true });
      try {
        const all = tx.objectStore('rolls').getAll();
        all.onsuccess = () => {
          try {
            const existing = all.result as StoredRoll[];
            const prior = existing.find(r => r.id === bundle.roll.id);
            // Seeding is atomic across tabs and never overwrites edits or Trash.
            if (options.insertFirstIfMissing && prior) return;
            const removed = prior?.frameIds.filter(id => !bundle.roll.frameIds.includes(id)) ?? [];
            for (const id of removed) {
              const old = tx.objectStore('frames').get(id);
              old.onsuccess = () => { const frame = old.result as StoredFrame | undefined; if (frame) { for (const key of [frame.originalKey, frame.viewingKey, frame.thumbnailKey]) tx.objectStore('blobs').delete(key); tx.objectStore('frames').delete(id); } };
            }
            const others = options.insertFirstIfMissing
              ? reconcileShelfSlots(existing).map(r => r.trashedAt === null ? { ...r, shelfSlot: r.shelfSlot! + 1 } : r)
              : existing.filter(r => r.id !== bundle.roll.id);
            const saved = { ...bundle.roll, shelfSlot: options.insertFirstIfMissing ? 0 : prior?.shelfSlot, name: bundle.roll.name.trim(), updatedAt: Date.now() };
            for (const roll of reconcileShelfSlots([...others, saved])) {
              if (roll.id === saved.id || existing.find(r => r.id === roll.id)?.shelfSlot !== roll.shelfSlot) tx.objectStore('rolls').put(roll);
            }
            for (const frame of bundle.frames) tx.objectStore('frames').put(frame);
            for (const record of images) tx.objectStore('blobs').put(record);
            // Validate retained originals and newly written derivatives atomically.
            for (const frame of bundle.frames) for (const key of [frame.originalKey, frame.viewingKey, frame.thumbnailKey]) {
              const check = tx.objectStore('blobs').count(key);
              check.onsuccess = () => { if (check.result !== 1) abort(); };
            }
          } catch (error) { writeFailure = error; abort(); }
        };
        await done;
        this.changed();
      } catch (error) { abort(); await done.catch(() => {}); throw writeFailure ?? error; } finally { signal?.removeEventListener('abort', abort); }
    } finally { db.close(); }
  }
  async update(id: string, change: (roll: StoredRoll) => StoredRoll) {
    const db = await openRollDatabase(this.factory, this.name);
    try {
      const tx = db.transaction('rolls', 'readwrite'), done = complete(tx), store = tx.objectStore('rolls');
      const request = store.getAll();
      request.onsuccess = () => {
        const existing = request.result as StoredRoll[], current = existing.find(r => r.id === id);
        if (!current) { tx.abort(); return; }
        const updated = change(current);
        for (const roll of reconcileShelfSlots(existing.map(r => r.id === id ? updated : r))) {
          if (roll.id === id || existing.find(r => r.id === roll.id)?.shelfSlot !== roll.shelfSlot) store.put(roll);
        }
      };
      await done;
      this.changed();
    } finally { db.close(); }
  }
  // Archive imports are one transaction and only add records. Even an ID
  // collision or a quota failure on the last image preserves the entire library.
  async importNew(bundles: RollBundle[]) {
    bundles.forEach(validateBundle);
    const prepared = [];
    for (const bundle of bundles) {
      const images = [];
      for (const record of bundle.blobs) images.push({ key: record.key, bytes: await record.blob.arrayBuffer(), mime: record.blob.type });
      prepared.push({ ...bundle, images });
    }
    const db = await openRollDatabase(this.factory, this.name);
    try {
      const tx = db.transaction([...STORES], 'readwrite'), done = complete(tx);
      try {
        for (const bundle of prepared) {
          tx.objectStore('rolls').add(bundle.roll);
          for (const frame of bundle.frames) tx.objectStore('frames').add(frame);
          for (const record of bundle.images) tx.objectStore('blobs').add(record);
          for (const frame of bundle.frames) for (const key of [frame.originalKey, frame.viewingKey, frame.thumbnailKey]) {
            const check = tx.objectStore('blobs').count(key);
            check.onsuccess = () => { if (check.result !== 1) tx.abort(); };
          }
        }
        await done;
        this.changed();
      } catch (error) { try { tx.abort(); } catch { /* Already aborted. */ } await done.catch(() => {}); throw error; }
    } finally { db.close(); }
  }
  trash(id: string, trashed = true) { return this.update(id, r => ({ ...r, trashedAt: trashed ? Date.now() : null, updatedAt: Date.now() })); }
}
export function storageMessage(error: unknown) {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return 'Browser storage is full. Free space in browser settings and retry; this roll was not saved.';
  return error instanceof Error ? error.message : 'Browser storage is unavailable. Enable site storage and retry.';
}

export const rollRepository = new RollRepository();
