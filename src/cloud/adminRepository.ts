import { RollRepository, validateBundle, type DarkroomPreferences, type RollBundle, type StoredRoll } from '../storage/rollRepository';
import { reconcileShelfSlots, type ShelfArrangement } from '../utils/shelfLayout';
import { ownerClient, uploadOwnerPhoto } from './ownerClient';
import type { CloudDraft } from './contracts';
import { runPhotoUploads } from './uploadQueue';

/** The shared shelf/editor interface, backed by authenticated cloud derivatives. */
export class AdminRollRepository extends RollRepository {
  private observers = new Set<() => void>();
  private pendingPublication = new Map<string, { inputVersion: number; savedVersion: number }>();
  override subscribe(listener: () => void) { this.observers.add(listener); return () => { this.observers.delete(listener); }; }
  private notify() { this.observers.forEach(listener => listener()); }
  override async list() { return reconcileShelfSlots((await ownerClient.list()).map(draft => draft.roll)); }
  override async shelf() { return (await this.list()).filter(roll => roll.trashedAt === null); }
  override async read(id: string): Promise<RollBundle> {
    const draft = await ownerClient.load(id);
    const frames = draft.frames.map(frame => ({ ...frame, mime: 'image/jpeg', hash: '', originalKey: '' }));
    const blobs = (await Promise.all(draft.frames.map(async frame => [
      { key: frame.viewingKey, blob: await ownerClient.image(frame.uploadId, 'viewing') },
      { key: frame.thumbnailKey, blob: await ownerClient.image(frame.uploadId, 'thumbnail') },
    ]))).flat();
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
    const controller = new AbortController(), operationSignal = signal ?? controller.signal;
    // Existing frames retain their completed uploads; originals never leave the browser.
    const existing = (await ownerClient.list(operationSignal)).find(draft => draft.roll.id === bundle.roll.id);
    const frames: CloudDraft['frames'] = await runPhotoUploads(bundle.frames, operationSignal, async frame => {
      const prior = existing?.frames.find(candidate => candidate.id === frame.id);
      return prior ? { ...prior, rotation: frame.rotation, cropPosition: frame.cropPosition, filmStrength: frame.filmStrength } : await uploadOwnerPhoto({
        id: frame.id, filename: frame.filename, frame, blobs: bundle.blobs,
        duplicate: false, keepDuplicate: true,
      }, operationSignal, () => {});
    });
    const pending = this.pendingPublication.get(bundle.roll.id);
    const updatedAt = pending?.inputVersion === bundle.roll.updatedAt && pending.savedVersion === existing?.roll.updatedAt
      ? pending.savedVersion : bundle.roll.updatedAt;
    const saved = await ownerClient.save({ roll: { ...bundle.roll, updatedAt }, frames }, operationSignal);
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
