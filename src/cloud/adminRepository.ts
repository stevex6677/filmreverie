import type { ProgressReporter } from '../utils/operationProgress';
import { RollRepository, validateBundle, type DarkroomPreferences, type RollSaveOptions, type RollBundle, type StoredRoll } from '../storage/rollRepository';
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
  private uploads = new Map<string, { rollId: string; promise: Promise<DraftFrame>; complete: boolean }>();
  private uploadObservers = new Set<() => void>();
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
      entry = { rollId: frame.rollId, promise, complete: false };
      this.uploads.set(frame.id, entry);
      void promise.then(uploaded => {
        const current = this.uploads.get(frame.id);
        if (current?.promise !== promise) return;
        current.complete = true;
        this.uploadObservers.forEach(report => report());
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
  private rolls = new Map<string, StoredRoll>();
  private trashTimes = new Map<string, number>();
  override subscribe(listener: () => void) { this.observers.add(listener); return () => { this.observers.delete(listener); }; }
  private notify() { this.observers.forEach(listener => listener()); }
  override async list() {
    const rolls = reconcileShelfSlots((await ownerClient.list()).map(draft => draft.roll));
    this.rolls = new Map(rolls.map(roll => [roll.id, roll]));
    return rolls;
  }
  override async shelf() { return (await this.list()).filter(roll => roll.trashedAt === null); }
  override async read(id: string, _includeOriginals = false, onProgress?: ProgressReporter): Promise<RollBundle> {
    onProgress?.({ label: 'Loading roll details…' });
    this.useImagesFor(id);
    const draft = await ownerClient.load(id);
    this.editorDrafts.set(id, draft);
    this.rolls.set(id, draft.roll);
    const frames = draft.frames.map(frame => ({ ...frame, mime: 'image/jpeg', hash: '', originalKey: '' }));
    let completed = 0;
    const report = () => onProgress?.({ label: 'Opening photographs…', detail: `${completed} / ${draft.frames.length} photographs`, completed, total: draft.frames.length });
    report();
    const blobs = (await Promise.all(draft.frames.map(async frame => {
      const images = await this.image(frame.uploadId);
      completed++; report();
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
  override async save(bundle: RollBundle, signal?: AbortSignal, options: RollSaveOptions = {}) {
    validateBundle(bundle);
    this.useImagesFor(bundle.roll.id);
    const controller = new AbortController(), operationSignal = signal ?? controller.signal;
    // Existing frames retain their completed uploads; originals never leave the browser.
    const reportBackground = () => {
      if (operationSignal.aborted) return;
      const completed = bundle.frames.filter(frame => this.uploads.get(frame.id)?.complete).length;
      options.onProgress?.({ label: 'Finishing background uploads…', detail: `${completed} / ${bundle.frames.length} photographs`, completed, total: bundle.frames.length });
    };
    this.uploadObservers.add(reportBackground);
    reportBackground();
    try { await this.uploadTail.catch(() => {}); }
    finally { this.uploadObservers.delete(reportBackground); }
    operationSignal.throwIfAborted();
    options.onProgress?.({ label: 'Checking saved roll…' });
    const existing = this.editorDrafts.get(bundle.roll.id);
    let completed = 0;
    const reportUploads = () => options.onProgress?.({ label: 'Uploading photographs…', detail: `${completed} / ${bundle.frames.length} photographs`, completed, total: bundle.frames.length });
    reportUploads();
    const frames: CloudDraft['frames'] = await runPhotoUploads(bundle.frames, operationSignal, async frame => {
      const prior = existing?.frames.find(candidate => candidate.id === frame.id);
      const uploaded = prior ?? await this.upload(frame, bundle.blobs, operationSignal);
      if (!operationSignal.aborted) { completed++; reportUploads(); }
      return { ...uploaded, rotation: frame.rotation, uprightRotation: frame.uprightRotation, cropPosition: frame.cropPosition, filmStrength: frame.filmStrength };
    });
    options.onProgress?.({ label: 'Saving roll…' });
    const changes = existing ? Object.fromEntries(Object.entries(bundle.roll).filter(([key, value]) =>
      JSON.stringify(value) !== JSON.stringify(existing.roll[key as keyof StoredRoll]))) : {};
    const rollFields = ['name', 'camera', 'stockId', 'format', 'sizing', 'filmStrength', 'coverId', 'trashedAt', 'view'];
    const canPatch = existing && JSON.stringify(frames) === JSON.stringify(existing.frames)
      && Object.keys(changes).length > 0 && Object.entries(changes).every(([key, value]) => rollFields.includes(key) && value !== undefined);
    const saved = canPatch
      ? await ownerClient.patchRoll(bundle.roll.id, bundle.roll.updatedAt, changes, operationSignal)
      : await ownerClient.saveRoll({ roll: bundle.roll, frames }, operationSignal);
    this.editorDrafts.set(bundle.roll.id, saved);
    this.rolls.set(bundle.roll.id, saved.roll);
    this.notify();
  }
  override async update(id: string, change: (roll: StoredRoll) => StoredRoll) {
    const roll = this.rolls.get(id) ?? (await ownerClient.load(id)).roll;
    const next = change(roll);
    const changes = Object.fromEntries(Object.entries(next).filter(([key, value]) =>
      JSON.stringify(value) !== JSON.stringify(roll[key as keyof StoredRoll])));
    if (!Object.keys(changes).length) return;
    const saved = await ownerClient.patchRoll(id, roll.updatedAt, changes);
    this.rolls.set(id, saved.roll);
    this.notify();
  }
  // One private record, so a swap is never half-saved; it also orders the public gallery.
  override async arrange(slots: ShelfArrangement) { await ownerClient.arrange(slots); this.notify(); }
  // Owner settings follow the account to every signed-in device.
  override async preferences() { return ownerClient.preferences(); }
  override async savePreferences(preferences: DarkroomPreferences) { await ownerClient.savePreferences(preferences); }
  override async trash(id: string, trashed = true) {
    const roll = this.rolls.get(id) ?? (await ownerClient.load(id)).roll;
    if (trashed && !this.trashTimes.has(id)) this.trashTimes.set(id, roll.trashedAt ?? Date.now());
    const saved = await ownerClient.patchRoll(id, roll.updatedAt, { trashedAt: trashed ? this.trashTimes.get(id)! : null });
    this.trashTimes.delete(id);
    this.rolls.set(id, saved.roll);
    this.notify();
  }
}
export const adminRollRepository = new AdminRollRepository();
