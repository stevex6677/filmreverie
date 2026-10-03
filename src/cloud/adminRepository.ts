import { RollRepository, validateBundle, type DarkroomPreferences, type RollBundle, type StoredRoll } from '../storage/rollRepository';
import { reconcileShelfSlots, type ShelfArrangement } from '../utils/shelfLayout';
import { ownerClient, uploadOwnerPhoto } from './ownerClient';
import type { CloudDraft, DraftFrame } from './contracts';
import { runPhotoUploads } from './uploadQueue';

/** The shared shelf/editor interface, backed by authenticated cloud derivatives. */
export class AdminRollRepository extends RollRepository {
  private imageRollId?: string;
  private useImagesFor(id: string) {
    if(this.imageRollId===id)return;
    this.images.clear(); this.editorDrafts.clear(); this.imageRollId=id;
  }
  private editorDrafts = new Map<string, CloudDraft>();
  private images = new Map<string, Promise<{ viewing: Blob; thumbnail: Blob }>>();
  private uploads = new Map<string, { rollId: string; promise: Promise<DraftFrame> }>();
  private uploadTail: Promise<unknown> = Promise.resolve();
  private image(uploadId: string) {
    let result = this.images.get(uploadId);
    if (!result) {
      result = Promise.all([ownerClient.image(uploadId, 'viewing'), ownerClient.image(uploadId, 'thumbnail')])
        .then(([viewing, thumbnail]) => ({ viewing, thumbnail }));
      this.images.set(uploadId, result);
      void result.catch(() => { if(this.images.get(uploadId)===result)this.images.delete(uploadId); });
    }
    return result;
  }
  private upload(frame: RollBundle['frames'][number], blobs: RollBundle['blobs'], signal: AbortSignal) {
    let entry = this.uploads.get(frame.id);
    if (!entry) {
      const promise = uploadOwnerPhoto({ id: frame.id, filename: frame.filename, frame, blobs, duplicate: false, keepDuplicate: true }, signal, () => {});
      entry = { rollId: frame.rollId, promise };
      this.uploads.set(frame.id, entry);
      void promise.then(uploaded => {
        if (this.uploads.get(frame.id)?.promise !== promise) return;
        const viewing = blobs.find(b => b.key === frame.viewingKey)?.blob, thumbnail = blobs.find(b => b.key === frame.thumbnailKey)?.blob;
        if (viewing && thumbnail) this.images.set(uploaded.uploadId, Promise.resolve({ viewing, thumbnail }));
      }).catch(() => { if(this.uploads.get(frame.id)?.promise===promise)this.uploads.delete(frame.id); });
    }
    return entry.promise;
  }
  override async prepareImages(bundle: Pick<RollBundle, 'frames' | 'blobs'>, signal: AbortSignal) {
    if(bundle.frames[0])this.useImagesFor(bundle.frames[0].rollId);
    // Serialize batches while retaining six concurrent uploads within a batch.
    const task = this.uploadTail.catch(() => {}).then(() => runPhotoUploads(bundle.frames, signal, frame => this.upload(frame, bundle.blobs, signal)));
    this.uploadTail = task;
    await task;
  }
  override releaseEditorResources(rollId?: string) {
    this.editorDrafts.clear();
    for (const [id, entry] of this.uploads) if (!rollId || entry.rollId === rollId) this.uploads.delete(id);
    this.images.clear(); this.imageRollId=undefined;
  }
  private observers = new Set<() => void>();
  private pendingPublication = new Map<string, { inputVersion: number; savedVersion: number }>();
  override subscribe(listener: () => void) { this.observers.add(listener); return () => { this.observers.delete(listener); }; }
  private notify() { this.observers.forEach(listener => listener()); }
  override async list() { return reconcileShelfSlots((await ownerClient.list()).map(draft => draft.roll)); }
  override async shelf() { return (await this.list()).filter(roll => roll.trashedAt === null); }
  override async read(id: string): Promise<RollBundle> {
    this.useImagesFor(id);
    const draft = await ownerClient.load(id);
    this.editorDrafts.set(id, draft);
    const frames = draft.frames.map(frame => ({ ...frame, mime: 'image/jpeg', hash: '', originalKey: '' }));
    const blobs = (await Promise.all(draft.frames.map(async frame => {
      const images = await this.image(frame.uploadId);
      return [{ key: frame.viewingKey, blob: images.viewing }, { key: frame.thumbnailKey, blob: images.thumbnail }];
    }))).flat();
    return { roll: draft.roll, frames, blobs };
  }
  override async thumbnail(id: string, frameId: string) {
    const draft = await ownerClient.load(id), frame = draft.frames.find(frame => frame.id === frameId);
    if (!frame) throw new Error('Cover unavailable.');
    return { blob: await ownerClient.image(frame.uploadId, 'thumbnail'), rotation: frame.rotation,
      frame: { ...frame, mime: 'image/jpeg', hash: '', originalKey: '' } };
  }
  override async save(bundle: RollBundle, signal?: AbortSignal) {
    validateBundle(bundle);
    this.useImagesFor(bundle.roll.id);
    const controller = new AbortController(), operationSignal = signal ?? controller.signal;
    // Existing frames retain their completed uploads; originals never leave the browser.
    await this.uploadTail.catch(() => {});
    operationSignal.throwIfAborted();
    const existing = this.pendingPublication.has(bundle.roll.id)
      ? await ownerClient.load(bundle.roll.id, operationSignal)
      : this.editorDrafts.get(bundle.roll.id) ?? (await ownerClient.list(operationSignal)).find(draft => draft.roll.id === bundle.roll.id);
    const frames: CloudDraft['frames'] = await runPhotoUploads(bundle.frames, operationSignal, async frame => {
      const prior = existing?.frames.find(candidate => candidate.id === frame.id);
      const uploaded = prior ?? await this.upload(frame, bundle.blobs, operationSignal);
      return { ...uploaded, rotation: frame.rotation, cropPosition: frame.cropPosition, filmStrength: frame.filmStrength };
    });
    const pending = this.pendingPublication.get(bundle.roll.id);
    const updatedAt = pending?.inputVersion === bundle.roll.updatedAt && pending.savedVersion === existing?.roll.updatedAt
      ? pending.savedVersion : bundle.roll.updatedAt;
    const saved = await ownerClient.save({ roll: { ...bundle.roll, updatedAt }, frames }, operationSignal);
    this.editorDrafts.set(bundle.roll.id, saved);
    this.pendingPublication.set(bundle.roll.id, { inputVersion: bundle.roll.updatedAt, savedVersion: saved.roll.updatedAt });
    this.notify();
    await ownerClient.publish(saved.roll.id, saved.roll.updatedAt, operationSignal);
    this.pendingPublication.delete(bundle.roll.id);
  }
  override async update(id: string, change: (roll: StoredRoll) => StoredRoll) {
    const draft = await ownerClient.load(id);
    await ownerClient.save({ ...draft, roll: change(draft.roll) });
    this.notify();
  }
  // One private record, so a swap is never half-saved; it also orders the public gallery.
  override async arrange(slots: ShelfArrangement) { await ownerClient.arrange(slots); this.notify(); }
  // Owner settings follow the account to every signed-in device.
  override async preferences() { return ownerClient.preferences(); }
  override async savePreferences(preferences: DarkroomPreferences) { await ownerClient.savePreferences(preferences); }
  override async trash(id: string, trashed = true) {
    const draft = await ownerClient.load(id);
    if (trashed) await ownerClient.withdraw(id);
    const saved = await ownerClient.save({ ...draft, roll: { ...draft.roll, trashedAt: trashed ? Date.now() : null } });
    this.notify();
    if (!trashed) await ownerClient.publish(id, saved.roll.updatedAt);
  }
}
export const adminRollRepository = new AdminRollRepository();
