import type { FilmStockId } from '../data/filmStocks';
import type { RollBundle, SavedView, StoredRoll } from '../storage/rollRepository';
import type { RollDefinition } from '../utils/rollLayout';
import type { CloudDraft } from './contracts';
import { generateUuid } from '../storage/crypto';
import { processPhotos, releaseDraft } from '../storage/importPhotos';
import { createRuntimeRoll } from '../storage/rollRuntime';
import { ownerClient, type OwnerPhoto } from './ownerClient';

export interface OwnerPreview {
  definition: RollDefinition;
  view?: SavedView;
  dispose: () => void;
  stockId: FilmStockId;
  filmStrength?: number;
}

/** An explicitly selected backup becomes an independent private cloud draft. */
export async function copyOwnerArchive(bundle: RollBundle, signal: AbortSignal, progress: (done: number, total: number) => void): Promise<{ roll: StoredRoll; photos: OwnerPhoto[] }> {
  const id = generateUuid();
  const frameIds = new Map(bundle.frames.map(frame => [frame.id, generateUuid()]));
  const blobs = new Map(bundle.blobs.map(record => [record.key, record.blob]));
  const photos: OwnerPhoto[] = [];
  try {
    for (const sourceId of bundle.roll.frameIds) {
      signal.throwIfAborted();
      const source = bundle.frames.find(frame => frame.id === sourceId)!;
      const frameId = frameIds.get(sourceId)!;
      const original = blobs.get(source.originalKey);
      if (!original) throw new Error('Backup original bytes are missing. Choose an intact backup.');
      // Archived derivatives are untrusted even if labelled JPEG. Decode the
      // archived original and paint both display images on fresh canvases.
      const generated = await processPhotos([new File([original], source.filename, { type: source.mime })], id, signal, () => {});
      try {
        const prepared = generated[0];
        if (!prepared.frame || prepared.error) throw new Error(`${source.filename}: ${prepared.error ?? 'Cannot prepare backup photograph.'}`);
        const frame = { ...source, id: frameId, rollId: id, width: prepared.frame.width, height: prepared.frame.height,
          originalKey: `${frameId}:original`, viewingKey: `${frameId}:view`, thumbnailKey: `${frameId}:thumb` };
        const photo: OwnerPhoto = { id: frameId, filename: frame.filename, frame, duplicate: false, keepDuplicate: true,
          blobs: [
            { key: frame.originalKey, blob: original },
            { key: frame.viewingKey, blob: prepared.blobs.find(record => record.key === prepared.frame!.viewingKey)!.blob },
            { key: frame.thumbnailKey, blob: prepared.blobs.find(record => record.key === prepared.frame!.thumbnailKey)!.blob },
          ] };
        photos.push(photo);
        signal.throwIfAborted();
        if (Math.max(frame.width, frame.height) > 16384) photo.error = 'The photograph exceeds the cloud limit of 16,384 pixels on one side. Remove this photograph before saving.';
        photo.preview = URL.createObjectURL(photo.blobs[2].blob);
        photo.reviewPreview = URL.createObjectURL(photo.blobs[1].blob);
        progress(photos.length, bundle.frames.length);
      } finally { releaseDraft(generated); }
    }
    return {
      roll: { ...bundle.roll, id, frameIds: bundle.roll.frameIds.map(frameId => frameIds.get(frameId)!), coverId: frameIds.get(bundle.roll.coverId)!,
        view: bundle.roll.view ? { ...bundle.roll.view, frameId: frameIds.get(bundle.roll.view.frameId) ?? bundle.roll.view.frameId } : undefined },
      photos,
    };
  } catch (error) { releaseDraft(photos); throw error; }
}

/** Private saved drafts contain display derivatives only; no original endpoint exists. */
export async function loadOwnerPhotos(draft: CloudDraft, signal: AbortSignal, progress: (done: number, total: number) => void): Promise<OwnerPhoto[]> {
  const photos: OwnerPhoto[] = [];
  try {
    for (const id of draft.roll.frameIds) {
      signal.throwIfAborted();
      const frame = draft.frames.find(candidate => candidate.id === id);
      if (!frame) throw new Error('Private draft has a missing frame. Reload the saved draft.');
      const thumbnail = await ownerClient.image(frame.uploadId, 'thumbnail', signal);
      const viewing = await ownerClient.image(frame.uploadId, 'viewing', signal);
      signal.throwIfAborted();
      const photo: OwnerPhoto = { id, filename: frame.filename, frame: storedFrame(frame), uploadId: frame.uploadId,
        viewingSha256: frame.viewingSha256, duplicate: false, keepDuplicate: true,
        blobs: [{ key: frame.thumbnailKey, blob: thumbnail }, { key: frame.viewingKey, blob: viewing }] };
      photos.push(photo);
      photo.preview = URL.createObjectURL(thumbnail);
      photo.reviewPreview = URL.createObjectURL(viewing);
      progress(photos.length, draft.frames.length);
    }
    return photos;
  } catch (error) { releaseDraft(photos); throw error; }
}

/** Adopt server-owned metadata without discarding already uploaded bytes or editor URL ownership. */
export function adoptOwnerDraft(draft: CloudDraft, photos: readonly OwnerPhoto[]): OwnerPhoto[] {
  const previous = new Map(photos.map(photo => [photo.id, photo]));
  return draft.roll.frameIds.map(id => {
    const frame = draft.frames.find(candidate => candidate.id === id)!;
    const photo = previous.get(id)!;
    const local = photo.frame!;
    return { ...photo, frame: { ...storedFrame(frame), width: local.width, height: local.height,
      originalKey: local.originalKey, hash: local.hash, mime: local.mime },
      uploadId: frame.uploadId, viewingSha256: frame.viewingSha256,
      blobs: photo.blobs.map(record => ({
        key: record.key === local.viewingKey ? frame.viewingKey : record.key === local.thumbnailKey ? frame.thumbnailKey : record.key,
        blob: record.blob,
      })) };
  });
}

function storedFrame(frame: CloudDraft['frames'][number]): NonNullable<OwnerPhoto['frame']> {
  return { id: frame.id, rollId: frame.rollId, filename: frame.filename, width: frame.width, height: frame.height,
    rotation: frame.rotation, ...(frame.cropPosition ? { cropPosition: frame.cropPosition } : {}),
    viewingKey: frame.viewingKey, thumbnailKey: frame.thumbnailKey, mime: 'image/jpeg', hash: '', originalKey: '' };
}

export function createOwnerPreview(draft: CloudDraft, photos: readonly OwnerPhoto[]): OwnerPreview {
  const runtime = createRuntimeRoll({ roll: draft.roll, frames: draft.frames.map(storedFrame),
    blobs: photos.flatMap(photo => photo.blobs.filter(record => record.key === photo.frame?.viewingKey || record.key === photo.frame?.thumbnailKey)) });
  runtime.definition.imported = false;
  for (const frame of runtime.definition.frames) {
    // The generic local-library runtime provides a guest original loader.
    // Private previews must offer only their saved viewing/thumbnail bytes.
    delete frame.original;
    delete frame.loadOriginal;
  }
  return { ...runtime, stockId: draft.roll.stockId, filmStrength: draft.roll.filmStrength };
}
