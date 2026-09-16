import { ROLL_FRAMES } from '../data/rollManifest';
import { imageHeader } from './importPhotos';
import { RollBundle, RollRepository } from './rollRepository';

export const EXAMPLE_ROLL_ID = 'roll-01';
const pending = new WeakMap<RollRepository, Promise<void>>();
export function ensureExampleRoll(repository: RollRepository): Promise<void> {
  const previous = pending.get(repository);
  if (previous) return previous;
  const task = (async () => {
    if ((await repository.list()).some(r => r.id === EXAMPLE_ROLL_ID)) return;
    const bundle: RollBundle = {
      roll: { id: EXAMPLE_ROLL_ID, name: 'Roll 01', stockId: 'portra-400', format: '135', sizing: 'fixed', frameIds: [], coverId: '', createdAt: 0, updatedAt: 0, trashedAt: null },
      frames: [], blobs: [],
    };
    for (const photo of ROLL_FRAMES) {
      const get = async (url: string) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error('The first roll could not be prepared. Retry when its photographs are available.');
        return response.blob();
      };
      const original = await get(photo.src), thumbnail = await get(photo.thumbnailSrc ?? photo.src);
      const header = imageHeader(new Uint8Array(await original.arrayBuffer()));
      const id = `example-${photo.id}`, originalKey = `${id}:original`, viewingKey = `${id}:view`, thumbnailKey = `${id}:thumb`;
      bundle.frames.push({ id, rollId: EXAMPLE_ROLL_ID, filename: `${photo.title}.jpg`, ...header, rotation: 0, hash: `bundled:${photo.id}`, originalKey, viewingKey, thumbnailKey });
      bundle.blobs.push({ key: originalKey, blob: original }, { key: viewingKey, blob: original }, { key: thumbnailKey, blob: thumbnail });
      bundle.roll.frameIds.push(id);
    }
    bundle.roll.coverId = bundle.roll.frameIds[0];
    await repository.save(bundle, undefined, { insertFirstIfMissing: true });
  })();
  pending.set(repository, task);
  void task.catch(() => pending.delete(repository));
  return task;
}
