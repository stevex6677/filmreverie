import { createGalleryRuntime, downloadGalleryRoll, galleryBytes, validateGalleryRoll, type GalleryDownloadOptions, type GalleryImageBytes, type GalleryRuntime } from './galleryClient';
import type { GalleryRoll } from './contracts';

export const GALLERY_DB_NAME = 'darkroom-gallery';
export interface SavedGalleryRoll { id: string; roll: GalleryRoll; savedAt: number; bytes: number }
interface StoredGalleryImage extends GalleryImageBytes { rollId: string }

function openDatabase(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('rolls', { keyPath: 'id' });
      db.createObjectStore('images', { keyPath: ['rollId', 'frameId', 'kind'] }).createIndex('rollId', 'rollId');
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new Error('Close other gallery tabs, then retry offline storage.')); };
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
const result = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
});
function complete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    let failure: DOMException | null = null;
    tx.oncomplete = () => resolve();
    tx.onerror = event => { failure = (event.target as IDBRequest).error ?? tx.error; };
    tx.onabort = () => reject(failure ?? tx.error ?? new DOMException('Download cancelled.', 'AbortError'));
  });
}

// This database never opens or modifies the visitor's darkroom-rolls library.
export class GalleryRepository {
  constructor(private factory?: IDBFactory, private name = GALLERY_DB_NAME) {}
  private open() { return openDatabase(this.factory ?? indexedDB, this.name); }
  async list(): Promise<SavedGalleryRoll[]> {
    const db = await this.open();
    try { return await result(db.transaction('rolls').objectStore('rolls').getAll()); }
    finally { db.close(); }
  }
  async read(id: string): Promise<{ saved: SavedGalleryRoll; images: GalleryImageBytes[] }> {
    const db = await this.open();
    try {
      const tx = db.transaction(['rolls', 'images']);
      const [saved, images] = await Promise.all([
        result<SavedGalleryRoll | undefined>(tx.objectStore('rolls').get(id)),
        result<StoredGalleryImage[]>(tx.objectStore('images').index('rollId').getAll(id)),
      ]);
      if (!saved) throw new Error('This offline gallery copy has been removed.');
      validateGalleryRoll(saved.roll);
      if (images.length !== saved.roll.frames.length * 2 || saved.roll.frames.some(frame =>
        (['viewing', 'thumbnail'] as const).some(kind => !images.some(image => image.frameId === frame.id && image.kind === kind && image.bytes.byteLength === frame[kind].bytes)))) {
        throw new Error('This offline gallery revision is incomplete. Download it again when online.');
      }
      return { saved, images };
    } finally { db.close(); }
  }
  async thumbnail(id: string, frameId: string): Promise<Blob> {
    const db = await this.open();
    try {
      const image = await result<StoredGalleryImage | undefined>(db.transaction('images').objectStore('images').get([id, frameId, 'thumbnail']));
      if (!image) throw new Error('Saved gallery thumbnail unavailable.');
      return new Blob([image.bytes], { type: image.mime });
    } finally { db.close(); }
  }
  async openSaved(id: string): Promise<GalleryRuntime> {
    const { saved, images } = await this.read(id);
    return createGalleryRuntime(saved.roll, images);
  }
  async save(roll: GalleryRoll, options: GalleryDownloadOptions = {}): Promise<SavedGalleryRoll> {
    // Hold one immutable revision throughout the download and commit.
    const snapshot = structuredClone(roll);
    validateGalleryRoll(snapshot);
    const images = await downloadGalleryRoll(snapshot, ['viewing', 'thumbnail'], options);
    options.signal?.throwIfAborted();
    const saved = { id: snapshot.id, roll: snapshot, savedAt: Date.now(), bytes: galleryBytes(snapshot) };
    options.onProgress?.({ receivedBytes: saved.bytes, totalBytes: saved.bytes, completedImages: images.length, totalImages: images.length, phase: 'saving' });
    await this.replace(saved.id, saved, images, options.signal);
    return saved;
  }
  async remove(id: string, signal?: AbortSignal): Promise<void> { await this.replace(id, undefined, [], signal); }
  private async replace(id: string, saved: SavedGalleryRoll | undefined, images: GalleryImageBytes[], signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    const db = await this.open();
    try {
      signal?.throwIfAborted();
      const tx = db.transaction(['rolls', 'images'], 'readwrite'), done = complete(tx);
      let failure: unknown;
      const abort = () => { try { tx.abort(); } catch { /* Transaction already settled. */ } };
      signal?.addEventListener('abort', abort, { once: true });
      try {
        const store = tx.objectStore('images');
        const keys = store.index('rollId').getAllKeys(id);
        keys.onsuccess = () => {
          try {
            for (const key of keys.result) store.delete(key);
            for (const image of images) store.put({ ...image, rollId: id });
            if (saved) tx.objectStore('rolls').put(saved);
            else tx.objectStore('rolls').delete(id);
          } catch (error) { failure = error; abort(); }
        };
        await done;
      } catch (error) { abort(); await done.catch(() => {}); throw failure ?? error; }
      finally { signal?.removeEventListener('abort', abort); }
    } finally { db.close(); }
  }
}
