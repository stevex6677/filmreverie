import { afterEach, expect, it, vi } from 'vitest';
import { AdminRollRepository } from '../../src/cloud/adminRepository';
import { ownerClient } from '../../src/cloud/ownerClient';
import * as ownerUploads from '../../src/cloud/ownerClient';
import type { CloudDraft } from '../../src/cloud/contracts';
import type { OperationProgress } from '../../src/utils/operationProgress';
import type { RollBundle } from '../../src/storage/rollRepository';

const draft = (): CloudDraft => ({ roll: { id: 'roll', name: 'Admin roll', stockId: 'portra-400', format: '135',
  frameIds: ['frame'], coverId: 'frame', createdAt: 1, updatedAt: 10, trashedAt: null },
frames: [{ id: 'frame', rollId: 'roll', filename: 'photo.jpg', width: 180, height: 120, rotation: 0,
  viewingKey: 'view', thumbnailKey: 'thumb', uploadId: 'upload', viewingSha256: 'a'.repeat(64) }] });
const bundle = (source: CloudDraft): RollBundle => ({ roll: source.roll,
  frames: source.frames.map(frame => ({ ...frame, originalKey: '', hash: '', mime: 'image/jpeg' })), blobs: [] });
afterEach(() => vi.restoreAllMocks());

it('uploads six new photographs at a time and saves in roll order only after all complete', async () => {
  const source = draft();
  source.frames = Array.from({ length: 8 }, (_, index) => ({ ...source.frames[0], id: `frame-${index}` }));
  source.roll.frameIds = source.frames.map(frame => frame.id);
  source.roll.coverId = source.frames[0].id;
  const release: Array<() => void> = [];
  vi.spyOn(ownerClient, 'list').mockResolvedValue([]);
  const upload = vi.spyOn(ownerUploads, 'uploadOwnerPhoto').mockImplementation(photo => new Promise(resolve => {
    release.push(() => resolve({ ...source.frames.find(frame => frame.id === photo.id)! }));
  }));
  const save = vi.spyOn(ownerClient, 'saveRoll').mockImplementation(async input => input);
  const publish = vi.spyOn(ownerClient, 'publish').mockResolvedValue({} as never);
  const progress: OperationProgress[] = [];
  const result = new AdminRollRepository().save(bundle(source), undefined, { onProgress: value => progress.push(value) });
  await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(6));
  expect(save).not.toHaveBeenCalled();
  expect(progress.at(-1)).toMatchObject({ label: 'Uploading photographs…', completed: 0, total: 8 });
  release[5](); release[4]();
  await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(8));
  expect(progress.at(-1)).toMatchObject({ completed: 2, total: 8 });
  expect(save).not.toHaveBeenCalled();
  for (const index of [7, 6, 3, 2, 1, 0]) release[index]();
  await result;
  expect(save.mock.calls[0][0].frames.map(frame => frame.id)).toEqual(source.roll.frameIds);
  expect(publish).not.toHaveBeenCalled();
  expect(progress.slice(-2)).toMatchObject([{ completed: 8, total: 8 }, { label: 'Saving roll…' }]);
});

it('never saves or publishes a partial roll when an upload fails', async () => {
  vi.spyOn(ownerClient, 'list').mockResolvedValue([]);
  vi.spyOn(ownerUploads, 'uploadOwnerPhoto').mockRejectedValue(new Error('Upload failed'));
  const save = vi.spyOn(ownerClient, 'saveRoll');
  const publish = vi.spyOn(ownerClient, 'publish');
  await expect(new AdminRollRepository().save(bundle(draft()))).rejects.toThrow('Upload failed');
  expect(save).not.toHaveBeenCalled();
  expect(publish).not.toHaveBeenCalled();
});

it('sends cover and title edits as one small patch, with no image uploads or draft/publish calls', async () => {
  const repository = new AdminRollRepository(), source = draft();
  source.frames.push({ ...source.frames[0], id: 'second' });
  source.roll.frameIds.push('second');
  vi.spyOn(ownerClient, 'load').mockResolvedValue(source);
  vi.spyOn(ownerClient, 'image').mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
  const edited = await repository.read('roll');
  const upload = vi.spyOn(ownerUploads, 'uploadOwnerPhoto');
  const patch = vi.spyOn(ownerClient, 'patchRoll').mockImplementation(async (_id, _version, changes) => ({ ...source, roll: { ...source.roll, ...changes } }));
  const save = vi.spyOn(ownerClient, 'saveRoll');
  const publish = vi.spyOn(ownerClient, 'publish');
  edited.roll = { ...edited.roll, coverId: 'second', name: 'New title' };
  await repository.save(edited);
  expect(patch).toHaveBeenCalledExactlyOnceWith('roll', 10, { coverId: 'second', name: 'New title' }, expect.any(AbortSignal), undefined);
  expect(upload).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled(); expect(publish).not.toHaveBeenCalled();
});

it('uses one patch for trash and restore from the loaded shelf', async () => {
  let current = draft();
  const repository = new AdminRollRepository();
  vi.spyOn(ownerClient, 'list').mockResolvedValue([current]);
  await repository.list();
  const load = vi.spyOn(ownerClient, 'load');
  const patch = vi.spyOn(ownerClient, 'patchRoll').mockImplementation(async (_id, version, changes) => {
    current = { ...current, roll: { ...current.roll, ...changes, updatedAt: version + 1 } }; return current;
  });
  const withdraw = vi.spyOn(ownerClient, 'withdraw');
  const publish = vi.spyOn(ownerClient, 'publish');
  await repository.trash('roll');
  expect(current.roll.trashedAt).toEqual(expect.any(Number));
  await repository.trash('roll', false);
  expect(current.roll.trashedAt).toBeNull();
  expect(patch).toHaveBeenCalledTimes(2);
  expect(patch.mock.calls.map(call => call[1])).toEqual([10, 11]);
  expect(load).not.toHaveBeenCalled(); expect(withdraw).not.toHaveBeenCalled(); expect(publish).not.toHaveBeenCalled();
});

it('keeps the owner film strength preference on the server rather than in this browser', async () => {
  const stored: Record<string, unknown> = {};
  const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'PUT') Object.assign(stored, JSON.parse(String(init.body)));
    return Response.json(stored);
  });
  vi.stubGlobal('fetch', fetch);
  const repository = new AdminRollRepository();
  expect(await repository.preferences()).toEqual({});
  await repository.savePreferences({ filmStrength: 30 });
  expect(await repository.preferences()).toEqual({ filmStrength: 30 });
  expect(fetch.mock.calls.map(([url, init]) => [String(url), init?.method ?? 'GET', init?.credentials])).toEqual([
    ['/api/owner/preferences', 'GET', 'same-origin'], ['/api/owner/preferences', 'PUT', 'same-origin'], ['/api/owner/preferences', 'GET', 'same-origin']]);
  await expect(repository.savePreferences({ filmStrength: 120 })).rejects.toThrow(/film effect strength/);
  vi.unstubAllGlobals();
});

it('prepares private images before saving, shares in-flight uploads and uses the latest crop', async () => {
  const repository = new AdminRollRepository(), source = draft(), input = bundle(source);
  let finish!: (frame: CloudDraft['frames'][number]) => void;
  const upload = vi.spyOn(ownerUploads, 'uploadOwnerPhoto').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  vi.spyOn(ownerClient, 'list').mockResolvedValue([]);
  const save = vi.spyOn(ownerClient, 'saveRoll').mockImplementation(async input => input);
  const publish = vi.spyOn(ownerClient, 'publish').mockResolvedValue({} as never);
  const preparation = repository.prepareImages(input, new AbortController().signal);
  await vi.waitFor(() => expect(upload).toHaveBeenCalledOnce());
  expect(save).not.toHaveBeenCalled(); expect(publish).not.toHaveBeenCalled();
  input.frames[0] = { ...input.frames[0], rotation: 90, cropPosition: { x: .4, y: 0 } };
  const progress: OperationProgress[] = [];
  const saving = repository.save(input, undefined, { onProgress: value => progress.push(value) });
  expect(progress.at(-1)).toMatchObject({ label: 'Finishing background uploads…', completed: 0, total: 1 });
  finish(source.frames[0]);
  await preparation; await saving;
  expect(progress).toContainEqual(expect.objectContaining({ label: 'Finishing background uploads…', completed: 1, total: 1 }));
  expect(upload).toHaveBeenCalledOnce();
  expect(save.mock.calls[0][0].frames[0]).toMatchObject({ rotation: 90, cropPosition: { x: .4, y: 0 } });
});

it('retains completed background uploads on failure and retries only failed photographs', async () => {
  const repository = new AdminRollRepository(), source = draft();
  source.frames.push({ ...source.frames[0], id: 'second' });
  source.roll.frameIds.push('second');
  const upload = vi.spyOn(ownerUploads, 'uploadOwnerPhoto').mockImplementation(async photo => {
    if(photo.id==='second')throw new Error('Offline');
    return source.frames[0];
  });
  const input = bundle(source);
  await expect(repository.prepareImages(input, new AbortController().signal)).rejects.toThrow('Offline');
  upload.mockImplementation(async photo => source.frames.find(frame => frame.id===photo.id)!);
  vi.spyOn(ownerClient, 'list').mockResolvedValue([]);
  vi.spyOn(ownerClient, 'saveRoll').mockImplementation(async input => input);
  vi.spyOn(ownerClient, 'publish').mockResolvedValue({} as never);
  await repository.save(input);
  expect(upload.mock.calls.map(([photo]) => photo.id)).toEqual(['frame', 'second', 'second']);
});

it('reopens saved edits without downloading the unchanged derivatives again and releases editor memory', async () => {
  const repository = new AdminRollRepository(), source = draft();
  vi.spyOn(ownerClient, 'load').mockResolvedValue(source);
  const image = vi.spyOn(ownerClient, 'image').mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
  const list = vi.spyOn(ownerClient, 'list');
  vi.spyOn(ownerClient, 'saveRoll').mockImplementation(async input => input);
  vi.spyOn(ownerClient, 'publish').mockResolvedValue({} as never);
  const input = await repository.read('roll');
  input.frames[0].rotation = 90;
  await repository.save({ ...input, blobs: [] });
  await repository.read('roll');
  expect(image).toHaveBeenCalledTimes(2);
  expect(list).not.toHaveBeenCalled();
  repository.releaseEditorResources('roll');
  await repository.read('roll');
  expect(image).toHaveBeenCalledTimes(4);
});
