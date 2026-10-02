import { afterEach, expect, it, vi } from 'vitest';
import { AdminRollRepository } from '../../src/cloud/adminRepository';
import { ownerClient } from '../../src/cloud/ownerClient';
import type { CloudDraft } from '../../src/cloud/contracts';
import type { RollBundle } from '../../src/storage/rollRepository';

const draft = (): CloudDraft => ({ roll: { id: 'roll', name: 'Admin roll', stockId: 'portra-400', format: '135',
  frameIds: ['frame'], coverId: 'frame', createdAt: 1, updatedAt: 10, trashedAt: null },
frames: [{ id: 'frame', rollId: 'roll', filename: 'photo.jpg', width: 180, height: 120, rotation: 0,
  viewingKey: 'view', thumbnailKey: 'thumb', uploadId: 'upload', viewingSha256: 'a'.repeat(64) }] });
const bundle = (source: CloudDraft): RollBundle => ({ roll: source.roll,
  frames: source.frames.map(frame => ({ ...frame, originalKey: '', hash: '', mime: 'image/jpeg' })), blobs: [] });
afterEach(() => vi.restoreAllMocks());

it('retries failed publication of saved edits without uploading retained images or masking concurrent changes', async () => {
  let current = draft();
  const repository = new AdminRollRepository(), edited = bundle(current);
  vi.spyOn(ownerClient, 'list').mockImplementation(async () => [current]);
  const save = vi.spyOn(ownerClient, 'save').mockImplementation(async input => {
    if (input.roll.updatedAt !== current.roll.updatedAt) throw new Error('Conflict');
    current = { ...input, roll: { ...input.roll, updatedAt: current.roll.updatedAt + 1 } };
    return current;
  });
  const publish = vi.spyOn(ownerClient, 'publish').mockRejectedValueOnce(new Error('Publication unavailable')).mockResolvedValue({} as never);
  await expect(repository.save(edited)).rejects.toThrow('Publication unavailable');
  await repository.save(edited);
  expect(save.mock.calls.map(([input]) => input.roll.updatedAt)).toEqual([10, 11]);
  expect(publish).toHaveBeenCalledTimes(2);
  current.roll.updatedAt = 20;
  await expect(repository.save(edited)).rejects.toThrow('Conflict');
});

it('withdraws deleted rolls, retains cloud Trash, and republishes restoration', async () => {
  let current = draft();
  const repository = new AdminRollRepository();
  vi.spyOn(ownerClient, 'load').mockImplementation(async () => current);
  vi.spyOn(ownerClient, 'save').mockImplementation(async input => { current = { ...input, roll: { ...input.roll, updatedAt: input.roll.updatedAt + 1 } }; return current; });
  const withdraw = vi.spyOn(ownerClient, 'withdraw').mockResolvedValue({ withdrawn: true });
  const publish = vi.spyOn(ownerClient, 'publish').mockResolvedValue({} as never);
  await repository.trash('roll');
  expect(withdraw).toHaveBeenCalledWith('roll');
  expect(current.roll.trashedAt).toEqual(expect.any(Number));
  expect(publish).not.toHaveBeenCalled();
  await repository.trash('roll', false);
  expect(current.roll.trashedAt).toBeNull();
  expect(publish).toHaveBeenCalledWith('roll', current.roll.updatedAt);
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
