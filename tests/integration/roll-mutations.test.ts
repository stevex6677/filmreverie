// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import worker from '../../cloudflare/worker';
import { mutateRoll, publicCatalog, readDraft } from '../../cloudflare/storage';
import { ownerClient } from '../../src/cloud/ownerClient';
import type { CloudDraft, SaveRollRequest } from '../../src/cloud/contracts';
import type { OperationProgress } from '../../src/utils/operationProgress';
import { draftFixture, environment } from './m21-worker-fixtures';

// Exercise the real HTTP routes and client. Authentication itself has a separate
// JWT/CSRF suite; these requests still run the real origin and body validation.
vi.mock('../../cloudflare/auth', async importOriginal => ({
  ...await importOriginal<typeof import('../../cloudflare/auth')>(),
  authorize: async () => 'owner@example.com',
}));
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function fixture(count = 2) {
  const setup = environment();
  const { draft } = await draftFixture(setup.env, setup.privateBucket);
  const frames = Array.from({ length: count }, () => ({ ...draft.frames[0], id: webcrypto.randomUUID(), width: 8, height: 400 }));
  const input: CloudDraft = { roll: { ...draft.roll, sizing: 'free', frameIds: frames.map(frame => frame.id), coverId: frames[0].id }, frames };
  const requests: Array<{ path: string; method: string; body: Record<string, unknown> }> = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
    requests.push({ path: String(url), method: init!.method!, body: JSON.parse(String(init!.body)) });
    return worker.fetch(new Request(new URL(String(url), setup.env.APP_ORIGIN), {
      ...init, headers: { ...init!.headers, Origin: setup.env.APP_ORIGIN },
    }), setup.env);
  });
  vi.stubGlobal('fetch', fetch);
  const saved = await ownerClient.saveRoll(input);
  const published = (await publicCatalog(setup.env)).rolls[0];
  requests.length = 0;
  setup.privateBucket.calls = setup.publicBucket.calls = 0;
  return { ...setup, input, saved, published, requests, fetch };
}

it('changes only the cover with one small PATCH and reuses every published image', async () => {
  const f = await fixture(13);
  const saved = await ownerClient.patchRoll(f.saved.roll.id, f.saved.roll.updatedAt, { coverId: f.saved.frames[1].id });
  const calls = f.privateBucket.calls + f.publicBucket.calls;
  expect(f.requests).toHaveLength(1);
  expect(f.requests[0]).toMatchObject({ method: 'PATCH', body: { changes: { coverId: f.saved.frames[1].id } } });
  expect(f.requests[0].body).not.toHaveProperty('frames');
  const next = (await publicCatalog(f.env)).rolls[0];
  expect(next.coverId).toBe(saved.roll.coverId);
  expect(next.frames).toEqual(f.published.frames);
  expect(calls).toBeLessThan(25);
});

it('saves crop, rotation, ordering, frame removal and roll metadata in one PUT without image copies', async () => {
  const f = await fixture(13), frames = f.saved.frames.slice(0, 12).reverse().map(frame => ({ ...frame, rotation: 90, cropPosition: { x: .2, y: .3 }, filmStrength: 25 }));
  // Keep the free-frame film length unchanged while testing rotation.
  frames.forEach(frame => { frame.width = 400; frame.height = 8; });
  const input = { roll: { ...f.saved.roll, name: 'Edited', camera: 'Nikon F3', filmStrength: 30, frameIds: frames.map(frame => frame.id), coverId: frames[0].id }, frames };
  const keys = [...f.publicBucket.objects.keys()].filter(key => key.startsWith('rolls/'));
  await ownerClient.saveRoll(input);
  expect(f.requests).toHaveLength(1);
  const next = (await publicCatalog(f.env)).rolls[0];
  expect(next).toMatchObject({ name: 'Edited', camera: 'Nikon F3', filmStrength: 30 });
  expect(next.frames.map(frame => frame.id)).toEqual(input.roll.frameIds);
  expect(next.frames[0]).toMatchObject({ rotation: 90, cropPosition: { x: .2, y: .3 }, filmStrength: 25 });
  expect([...f.publicBucket.objects.keys()].filter(key => key.startsWith('rolls/'))).toEqual(keys);
});

it('publishes a normal 36-frame roll in one request after uploads', async () => {
  const f = await fixture(36);
  expect(f.fetch).toHaveBeenCalledOnce();
  expect(f.published.frames).toHaveLength(36);
});

it('streams measured publication progress before completion and bounds concurrent copies to three photographs', async () => {
  const f = await fixture(6);
  const frames = f.saved.frames.map(frame => ({ ...frame, id: webcrypto.randomUUID() }));
  const input = { roll: { ...f.saved.roll, frameIds: frames.map(frame => frame.id), coverId: frames[0].id }, frames };
  const release: Array<() => void> = [];
  let active = 0, peak = 0;
  f.publicBucket.beforePut = async key => {
    if (!key.endsWith('/viewing.jpg')) return;
    active++; peak = Math.max(peak, active);
    await new Promise<void>(resolve => release.push(resolve));
    active--;
  };
  const progress: OperationProgress[] = [];
  const saving = ownerClient.saveRoll(input, undefined, value => progress.push(value));
  await vi.waitFor(() => expect(release).toHaveLength(3));
  expect(progress.at(-1)).toMatchObject({ label: 'Publishing photographs…', completed: 0, total: 6 });
  expect((await publicCatalog(f.env)).rolls[0]).toEqual(f.published);
  release[1]();
  await vi.waitFor(() => expect(progress.at(-1)).toMatchObject({ completed: 1, total: 6 }));
  release[0](); release[2]();
  await vi.waitFor(() => expect(release).toHaveLength(6));
  release.slice(3).forEach(resolve => resolve());
  const saved = await saving;
  expect(peak).toBe(3);
  expect(progress.filter(value => value.total === 6).map(value => value.completed)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  expect(progress.at(-1)?.label).toBe('Updating gallery…');
  expect((await publicCatalog(f.env)).rolls[0].frames.map(frame => frame.id)).toEqual(saved.roll.frameIds);
  expect(f.requests).toHaveLength(1);
});

it('drains in-flight copies before cleaning up a failed streamed publication and preserves the previous roll', async () => {
  const f = await fixture(3);
  const frames = f.saved.frames.map(frame => ({ ...frame, id: webcrypto.randomUUID() }));
  const input = { roll: { ...f.saved.roll, frameIds: frames.map(frame => frame.id), coverId: frames[0].id }, frames };
  const release: Array<() => void> = [];
  const originalKeys = [...f.publicBucket.objects.keys()].sort();
  f.publicBucket.beforePut = async key => {
    if (!key.endsWith('/viewing.jpg')) return;
    await new Promise<void>(resolve => release.push(resolve));
    if (key.includes(frames[0].id)) throw new Error('Private failure details');
  };
  const progress: OperationProgress[] = [];
  const saving = ownerClient.saveRoll(input, undefined, value => progress.push(value));
  const failed = expect(saving).rejects.toThrow('Cloud storage is unavailable');
  await vi.waitFor(() => expect(release).toHaveLength(3));
  release[0](); release[1](); release[2]();
  await failed;
  expect([...f.publicBucket.objects.keys()].sort()).toEqual(originalKeys);
  expect((await publicCatalog(f.env)).rolls[0]).toEqual(f.published);
  f.publicBucket.beforePut = undefined;
  await ownerClient.saveRoll(input, undefined, value => progress.push(value));
  expect((await publicCatalog(f.env)).rolls[0].frames.map(frame => frame.id)).toEqual(input.roll.frameIds);
});

it('bounds unusually large new image copies but edits the resulting roll in one request', async () => {
  const f = await fixture(70);
  expect(f.fetch).toHaveBeenCalledTimes(2);
  expect(f.published.frames).toHaveLength(70);
  await ownerClient.patchRoll(f.saved.roll.id, f.saved.roll.updatedAt, { name: 'Large edited roll' });
  expect(f.requests).toHaveLength(1);
  expect(f.privateBucket.calls + f.publicBucket.calls).toBeLessThan(25);
});

it('keeps a maximum-size metadata edit under the R2 request budget', async () => {
  const f = await fixture();
  const frames = Array.from({ length: 580 }, () => ({ ...f.saved.frames[0], id: webcrypto.randomUUID(), width: 1, height: 2048 }));
  const request: SaveRollRequest = { roll: { ...f.saved.roll, frameIds: frames.map(frame => frame.id), coverId: frames[0].id }, frames, mutationId: webcrypto.randomUUID() };
  let continuation: string | undefined;
  do {
    f.privateBucket.calls = f.publicBucket.calls = 0;
    const result = await mutateRoll(f.env, request.roll.id, { ...request, ...(continuation ? { continuation } : {}) });
    expect(f.privateBucket.calls + f.publicBucket.calls).toBeLessThan(1000);
    if (!result.pending) break;
    continuation = result.continuation;
  } while (true);
  const saved = await readDraft(f.env, request.roll.id);
  f.privateBucket.calls = f.publicBucket.calls = 0;
  await ownerClient.patchRoll(saved.roll.id, saved.roll.updatedAt, { coverId: frames.at(-1)!.id });
  expect(f.requests).toHaveLength(1);
  expect(f.privateBucket.calls + f.publicBucket.calls).toBeLessThan(25);
});

it('retries a failed publication with the original version and keeps the previous public roll intact', async () => {
  const f = await fixture(), input = { ...f.saved, roll: { ...f.saved.roll, name: 'Retry title' } };
  f.publicBucket.beforePut = async key => { if (key.startsWith('catalog/')) throw new Error('Storage unavailable'); };
  await expect(ownerClient.saveRoll(input)).rejects.toThrow('Cloud storage');
  const savedPrivately = await readDraft(f.env, input.roll.id);
  expect(savedPrivately.roll.name).toBe('Retry title');
  expect((await publicCatalog(f.env)).rolls[0]).toEqual(f.published);
  f.publicBucket.beforePut = undefined;
  const saved = await ownerClient.saveRoll(input);
  expect(saved.roll.updatedAt).toBe(savedPrivately.roll.updatedAt);
  expect(f.requests[0].body.mutationId).toBe(f.requests[1].body.mutationId);
  expect((await publicCatalog(f.env)).rolls[0].name).toBe('Retry title');
});

it('retries a lost success response without creating a second revision', async () => {
  const f = await fixture(), input = { ...f.saved, roll: { ...f.saved.roll, name: 'Lost response' } };
  const send = globalThis.fetch;
  let loseResponse = true;
  vi.stubGlobal('fetch', async (...args: Parameters<typeof fetch>) => {
    const response = await send(...args);
    if (loseResponse) { loseResponse = false; throw new Error('Connection lost'); }
    return response;
  });
  await expect(ownerClient.saveRoll(input)).rejects.toThrow('Connection lost');
  const published = await publicCatalog(f.env), saved = await readDraft(f.env, input.roll.id);
  const result = await ownerClient.saveRoll(input);
  expect(result).toEqual(saved);
  expect(await publicCatalog(f.env)).toEqual(published);
});

it('handles split UTF-8 progress events and retries a truncated stream with the same mutation ID', async () => {
  const f = await fixture(), input = { ...f.saved, roll: { ...f.saved.roll, name: 'Stream retry' } };
  const send = globalThis.fetch;
  let truncate = true;
  vi.stubGlobal('fetch', async (...args: Parameters<typeof fetch>) => {
    const response = await send(...args);
    const text = await response.text();
    const bytes = new TextEncoder().encode(truncate ? text.slice(0, text.indexOf('{"result":')) : text);
    truncate = false;
    return new Response(new ReadableStream<Uint8Array>({ start(controller) {
      for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3));
      controller.close();
    } }), { headers: response.headers });
  });
  const progress: OperationProgress[] = [];
  await expect(ownerClient.saveRoll(input, undefined, value => progress.push(value))).rejects.toThrow('before confirmation');
  expect(progress.some(value => value.label === 'Publishing photographs…')).toBe(true);
  const saved = await readDraft(f.env, input.roll.id);
  expect(await ownerClient.saveRoll(input, undefined, value => progress.push(value))).toEqual(saved);
  expect(f.requests[0].body.mutationId).toBe(f.requests[1].body.mutationId);
});

it('rejects stale edits and mutation ID reuse with different contents', async () => {
  const f = await fixture(), request = { ...f.saved, roll: { ...f.saved.roll, name: 'Winning edit' }, mutationId: webcrypto.randomUUID() };
  await mutateRoll(f.env, request.roll.id, request);
  await expect(mutateRoll(f.env, request.roll.id, { ...request, roll: { ...request.roll, name: 'Different content' } })).rejects.toMatchObject({ status: 400 });
  await expect(ownerClient.patchRoll(request.roll.id, f.saved.roll.updatedAt, { name: 'Stale edit' })).rejects.toThrow('another session');
  expect((await publicCatalog(f.env)).rolls[0].name).toBe('Winning edit');
});

it('trashes and restores with one request each, preserving private images and deleting public copies', async () => {
  const f = await fixture(13);
  const deleted = await ownerClient.patchRoll(f.saved.roll.id, f.saved.roll.updatedAt, { trashedAt: Date.now() });
  expect(f.requests).toHaveLength(1);
  expect((await publicCatalog(f.env)).rolls).toHaveLength(0);
  expect([...f.publicBucket.objects.keys()].filter(key => key.startsWith('rolls/'))).toHaveLength(0);
  const restored = await ownerClient.patchRoll(deleted.roll.id, deleted.roll.updatedAt, { trashedAt: null });
  expect(f.requests).toHaveLength(2);
  expect(restored.roll.trashedAt).toBeNull();
  expect((await publicCatalog(f.env)).rolls[0].frames).toHaveLength(13);
  expect((await publicCatalog(f.env)).rolls[0].frames[0].viewing.url).not.toBe(f.published.frames[0].viewing.url);
});

it('resumes failed trash cleanup without losing the saved version', async () => {
  const f = await fixture(), changes = { trashedAt: Date.now() };
  f.publicBucket.beforeDelete = async () => { throw new Error('Deletion unavailable'); };
  await expect(ownerClient.patchRoll(f.saved.roll.id, f.saved.roll.updatedAt, changes)).rejects.toThrow('Cloud storage');
  expect((await publicCatalog(f.env)).rolls).toHaveLength(0);
  f.publicBucket.beforeDelete = undefined;
  await ownerClient.patchRoll(f.saved.roll.id, f.saved.roll.updatedAt, changes);
  expect([...f.publicBucket.objects.keys()].filter(key => key.startsWith('rolls/'))).toHaveLength(0);
});

it('updates saved views privately in one patch and publishes stock changes', async () => {
  const f = await fixture();
  const view = { frameId: f.saved.frames[0].id, level: 'frame' as const, mode: 'positive' as const, brightness: 1, magnification: 1, zoom: NaN, pan: { x: 0, z: 0 }, overview: null };
  const saved = await ownerClient.patchRoll(f.saved.roll.id, f.saved.roll.updatedAt, { view });
  expect(saved.roll.view!.zoom).toBeNaN();
  expect((await publicCatalog(f.env)).rolls[0]).toEqual(f.published);
  await ownerClient.patchRoll(saved.roll.id, saved.roll.updatedAt, { stockId: 'ektachrome-e100' });
  expect(f.requests).toHaveLength(2);
  const next = (await publicCatalog(f.env)).rolls[0];
  expect(next.stockId).toBe('ektachrome-e100');
  expect(next).not.toHaveProperty('view');
});

it('validates patch fields and same-origin mutations before changing storage', async () => {
  const f = await fixture();
  await expect(ownerClient.patchRoll(f.saved.roll.id, f.saved.roll.updatedAt, { id: webcrypto.randomUUID() })).rejects.toThrow('Invalid roll changes');
  const response = await worker.fetch(new Request(`${f.env.APP_ORIGIN}/api/owner/rolls/${f.saved.roll.id}`, {
    method: 'PATCH', headers: { Origin: 'https://attacker.invalid', 'Content-Type': 'application/json' },
    body: JSON.stringify({ changes: { name: 'Spoofed' }, updatedAt: f.saved.roll.updatedAt, mutationId: webcrypto.randomUUID() }),
  }), f.env);
  expect(response.status).toBe(403);
  expect((await publicCatalog(f.env)).rolls[0]).toEqual(f.published);
});
