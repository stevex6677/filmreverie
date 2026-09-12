import { FilmStockId, isFilmStockId } from '../data/filmStocks';
import { FilmFormat, isFilmFormat } from '../data/filmFormats';
export interface SavedView {
  frameId: string; level: 'roll' | 'strip' | 'frame'; mode: 'negative' | 'positive'; brightness: number; magnification: number;
  zoom: number; pan: { x: number; z: number }; overview: { zoom: number; pan: { x: number; z: number }; frameIndex: number } | null;
}
export interface StoredFrame {
  cropPosition?: import('../utils/photoFraming').CropPosition;
  id: string; rollId: string; filename: string; mime: string; width: number; height: number; rotation: number; hash: string;
  originalKey: string; viewingKey: string; thumbnailKey: string;
}
export interface StoredRoll {
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
export function validateBundle(bundle: RollBundle) {
  const { roll, frames } = bundle;
  if (!roll.name.trim() || roll.name.length > 120 || !isFilmStockId(roll.stockId) || !isFilmFormat(roll.format)) throw new Error('Enter a name, stock and valid film format.');
  if (!frames.length || frames.length > 72 || new Set(roll.frameIds).size !== frames.length || roll.frameIds.length !== frames.length || !roll.frameIds.includes(roll.coverId)) throw new Error('Invalid frame membership or cover.');
  for (const frame of frames) if (frame.rollId !== roll.id || !roll.frameIds.includes(frame.id) || ![0,90,180,270].includes(frame.rotation)) throw new Error('Invalid frame metadata.');
  for (const frame of frames) if (frame.cropPosition && [frame.cropPosition.x, frame.cropPosition.y].some(n => !Number.isFinite(n) || Math.abs(n) > 1)) throw new Error('Invalid crop position.');
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
      const keys = [...new Set(frames.flatMap(f => [f!.viewingKey, f!.thumbnailKey]))];
      const blobs = await Promise.all(keys.map(key => result<StoredImageRecord | undefined>(tx.objectStore('blobs').get(key))));
      if (blobs.some(b => !b)) throw new Error('Some stored images are missing. The current roll has been kept open.');
      return { roll, frames: frames as StoredFrame[], blobs: (blobs as StoredImageRecord[]).map(imageRecord) };
    } finally { db.close(); }
  }
  async original(frameId: string): Promise<Blob> {
    const db=await openRollDatabase(this.factory,this.name);
    try { const tx=db.transaction(['frames','blobs']);const frame=await result<StoredFrame|undefined>(tx.objectStore('frames').get(frameId));if(!frame)throw new Error('Original unavailable.');const record=await result<StoredImageRecord|undefined>(tx.objectStore('blobs').get(frame.originalKey));if(!record)throw new Error('Original unavailable.');return imageRecord(record).blob; } finally { db.close(); }
  }
  async thumbnail(id: string, frameId: string): Promise<{ blob: Blob; rotation: number }> {
    const db = await openRollDatabase(this.factory, this.name);
    try {
      const tx = db.transaction(['frames','blobs']);
      const frame = await result<StoredFrame>(tx.objectStore('frames').get(frameId));
      if (!frame || frame.rollId !== id) throw new Error('Cover unavailable.');
      const record = await result<StoredImageRecord>(tx.objectStore('blobs').get(frame.thumbnailKey));
      if (!record) throw new Error('Cover unavailable.');
      return { blob: imageRecord(record).blob, rotation: frame.rotation };
    } finally { db.close(); }
  }
  async save(bundle: RollBundle, signal?: AbortSignal) {
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
      const abort = () => { try { tx.abort(); } catch { /* Already committed. */ } };
      signal?.addEventListener('abort', abort, { once: true });
      try {
        const prior=tx.objectStore('rolls').get(bundle.roll.id);
        prior.onsuccess=()=>{
          const removed=(prior.result as StoredRoll|undefined)?.frameIds.filter(id=>!bundle.roll.frameIds.includes(id))??[];
          for(const id of removed){const old=tx.objectStore('frames').get(id);old.onsuccess=()=>{const frame=old.result as StoredFrame|undefined;if(frame){for(const key of [frame.originalKey,frame.viewingKey,frame.thumbnailKey])tx.objectStore('blobs').delete(key);tx.objectStore('frames').delete(id);}};}
        };
        tx.objectStore('rolls').put({ ...bundle.roll, name: bundle.roll.name.trim(), updatedAt: Date.now() });
        for (const frame of bundle.frames) tx.objectStore('frames').put(frame);
        for (const record of images) tx.objectStore('blobs').put(record);
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
