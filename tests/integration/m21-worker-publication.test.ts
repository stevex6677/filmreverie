// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import type { GalleryRoll, PublishResult, UploadRequest } from '../../src/cloud/contracts';
import { completeUpload, completedUpload, grantUpload, privateImage, publicCatalog, publishDraft, readDraft, saveDraft, withdrawPublication } from '../../cloudflare/storage';
import { hash, kinds } from '../../cloudflare/types';
import { barrier, draftFixture, environment, photograph, uploadFixture } from './m21-worker-fixtures';
import type { Env } from '../../cloudflare/types';

beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
async function finish(env: Env, id: string, updatedAt: number): Promise<GalleryRoll> {
  let result: PublishResult = await publishDraft(env, id, updatedAt);
  while ('pending' in result) result = await publishDraft(env, id, updatedAt, result.continuation);
  return result;
}

describe('M21 private derivative boundary', () => {
  it('saves, publishes and clears optional camera metadata while rejecting invalid values', async () => {
    const { env, privateBucket } = environment(), { draft } = await draftFixture(env, privateBucket);
    expect(draft.roll.camera).toBeUndefined();
    for (const camera of [42, 'x'.repeat(121)]) {
      await expect(saveDraft(env, draft.roll.id, { ...draft, roll: { ...draft.roll, camera: camera as string } })).rejects.toMatchObject({ status: 400 });
    }
    const saved = await saveDraft(env, draft.roll.id, { ...draft, roll: { ...draft.roll, camera: '  Nikon F3  ' } });
    expect((await readDraft(env, saved.roll.id)).roll.camera).toBe('Nikon F3');
    expect((await finish(env, saved.roll.id, saved.roll.updatedAt)).camera).toBe('Nikon F3');
    expect((await publicCatalog(env)).rolls[0].camera).toBe('Nikon F3');
    const cleared = await saveDraft(env, saved.roll.id, { ...saved, roll: { ...saved.roll, camera: '' } });
    expect((await readDraft(env, saved.roll.id)).roll.camera).toBeUndefined();
    expect((await finish(env, cleared.roll.id, cleared.roll.updatedAt)).camera).toBeUndefined();
  });

  it('retains cloud Trash across reads, rejects publication until restored, and republishes restored rolls', async () => {
    const { env, privateBucket } = environment(), { draft } = await draftFixture(env, privateBucket);
    await finish(env, draft.roll.id, draft.roll.updatedAt);
    await withdrawPublication(env, draft.roll.id);
    const deleted = await saveDraft(env, draft.roll.id, { ...draft, roll: { ...draft.roll, trashedAt: Date.now() } });
    expect((await readDraft(env, draft.roll.id)).roll.trashedAt).toBe(deleted.roll.trashedAt);
    expect((await publicCatalog(env)).rolls).toHaveLength(0);
    await expect(finish(env, draft.roll.id, deleted.roll.updatedAt)).rejects.toMatchObject({ status: 409 });
    const restored = await saveDraft(env, draft.roll.id, { ...deleted, roll: { ...deleted.roll, trashedAt: null } });
    await finish(env, draft.roll.id, restored.roll.updatedAt);
    expect((await publicCatalog(env)).rolls[0].id).toBe(draft.roll.id);
    await expect(saveDraft(env, draft.roll.id, { ...restored, roll: { ...restored.roll, trashedAt: -1 } })).rejects.toMatchObject({ status: 400 });
  });

  it('seals only two streamed derivatives at unique keys and ignores staged replay', async () => {
    const { env, privateBucket } = environment(), { bytes, grant } = await uploadFixture(env, privateBucket);
    const completed = await completedUpload(env, grant.id);
    expect(Object.keys(completed.images).sort()).toEqual([...kinds].sort());
    expect(Object.keys(grant.uploads).sort()).toEqual([...kinds].sort());
    expect([...privateBucket.objects.keys()].some(key => key.includes('original'))).toBe(false);
    for (const kind of kinds) {
      expect(completed.images[kind].key).toMatch(new RegExp(`^sealed/${grant.id}/[^/]+/${kind}$`));
      const object = await privateImage(env, grant.id, kind);
      expect(new Uint8Array(await new Response(object.body as unknown as ReadableStream).arrayBuffer())).toEqual(bytes);
      await privateBucket.put(`staging/${grant.id}/${kind}`, new Uint8Array([1, 2, 3]), { httpMetadata: { contentType: 'image/jpeg' } });
    }
    await completeUpload(env, grant.id);
    for (const kind of kinds) expect(privateBucket.objects.get(completed.images[kind].key)?.bytes).toEqual(bytes);
  });
  it('fails closed for incomplete, wrong-sized, wrong-MIME, expired and invalid grants without body inspection', async () => {
    const { env, privateBucket } = environment(), bytes = photograph();
    const image = { bytes: bytes.length, mime: 'image/jpeg', sha256: await hash(bytes) } as const;
    for (const request of [{ viewing: image, thumbnail: image, original: image },
      { viewing: { ...image, mime: 'image/png' }, thumbnail: image },
      { viewing: { ...image, bytes: 5 * 1024 * 1024 + 1 }, thumbnail: image }] as unknown as UploadRequest[])
      await expect(grantUpload(env, request)).rejects.toMatchObject({ status: 400 });
    const grant = await grantUpload(env, { viewing: image, thumbnail: image });
    await expect(completeUpload(env, grant.id)).rejects.toMatchObject({ status: 400 });
    await privateBucket.put(`staging/${grant.id}/viewing`, bytes, { httpMetadata: { contentType: 'text/html' } });
    await privateBucket.put(`staging/${grant.id}/thumbnail`, bytes, { httpMetadata: { contentType: 'image/jpeg' } });
    await expect(completeUpload(env, grant.id)).rejects.toMatchObject({ status: 400 });
    await privateBucket.put(`staging/${grant.id}/viewing`, bytes.subarray(0, -1), { httpMetadata: { contentType: 'image/jpeg' } });
    await expect(completeUpload(env, grant.id)).rejects.toMatchObject({ status: 400 });
    expect([...privateBucket.objects.keys()].filter(key => key.startsWith('sealed/'))).toEqual([]);
    vi.useFakeTimers(); vi.setSystemTime(grant.expiresAt);
    await expect(completeUpload(env, grant.id)).rejects.toMatchObject({ status: 410 });
    vi.useRealTimers();
    // R2 must reject mismatched bytes during sealing even when size/type match.
    const opaque = new Uint8Array(bytes.length).fill(42);
    const newGrant = await grantUpload(env, { viewing: image, thumbnail: image });
    for (const kind of kinds) await privateBucket.put(`staging/${newGrant.id}/${kind}`, opaque, { httpMetadata: { contentType: 'image/jpeg' } });
    await expect(completeUpload(env, newGrant.id)).rejects.toThrow('checksum mismatch');
    expect(privateBucket.objects.has(`uploads/completed/${newGrant.id}.json`)).toBe(false);
    expect([...privateBucket.objects.keys()].filter(key => key.startsWith('sealed/'))).toEqual([]);
  });
});

describe('M21 atomic drafts, public catalog and withdrawal', () => {
  it('derives all private/public keys and URLs, reads committed public catalog on each GET, never writes originals', async () => {
    const { env, privateBucket, publicBucket } = environment(), { draft } = await draftFixture(env, privateBucket);
    expect(await publicCatalog(env)).toEqual({ version: 1, rolls: [] });
    const published = await finish(env, draft.roll.id, draft.roll.updatedAt);
    expect(await publicCatalog(env)).toEqual({ version: 1, rolls: [published] });
    const publicJson = JSON.stringify(published);
    for (const secret of [draft.frames[0].filename, draft.frames[0].viewingKey,
      'uploadId', 'sealed/', 'viewingKey', 'originalKey']) expect(publicJson).not.toContain(secret);
    const pointer = JSON.parse(new TextDecoder().decode(privateBucket.objects.get('catalog/head.json')!.bytes));
    expect(pointer.catalogKey).toMatch(/^catalog\/versions\/[0-9a-f-]+\.json$/);
    expect(publicBucket.objects.has(pointer.catalogKey)).toBe(true);
    for (const kind of kinds) {
      const reference = published.frames[0][kind], key = new URL(reference.url).pathname.slice(1);
      const object = publicBucket.objects.get(key)!;
      expect(object.bytes.length).toBe(reference.bytes);
      expect(await hash(object.bytes)).toBe(reference.sha256);
      expect(object.httpMetadata.contentType).toBe('image/jpeg');
      expect(reference.url.startsWith(`${env.PHOTO_ORIGIN}/rolls/`)).toBe(true);
    }
    expect([...publicBucket.objects.keys()].some(key => key.includes('original'))).toBe(false);
    publicBucket.objects.delete(pointer.catalogKey);
    await expect(publicCatalog(env)).rejects.toMatchObject({ status: 503 });
    await expect(finish(env, draft.roll.id, draft.roll.updatedAt - 1)).rejects.toMatchObject({ status: 409 });
  });
  it('validates derivative metadata and uses immutable draft snapshots and CAS', async () => {
    const { env, privateBucket } = environment(), { draft } = await draftFixture(env, privateBucket), gate = barrier();
    const frame = draft.frames[0];
    await expect(saveDraft(env, draft.roll.id, { ...draft, frames: [{ ...frame, viewingSha256: '0'.repeat(64) }] })).rejects.toMatchObject({ status: 400 });
    await expect(saveDraft(env, draft.roll.id, { ...draft, frames: [{ ...frame, hash: '0'.repeat(64) } as typeof frame] })).rejects.toMatchObject({ status: 400 });
    await expect(saveDraft(env, draft.roll.id, { ...draft, frames: [{ ...frame, width: 40000 }] })).rejects.toMatchObject({ status: 400 });
    let pause = true;
    privateBucket.beforePut = async key => { if (pause && key.startsWith('drafts/heads/')) { pause = false; await gate.block(); } };
    const loser = saveDraft(env, draft.roll.id, { ...draft, roll: { ...draft.roll, name: 'Losing edit' } }).catch(error => error);
    await gate.entered;
    const winner = await saveDraft(env, draft.roll.id, { ...draft, roll: { ...draft.roll, name: 'Winning edit' }, frames: [{ ...frame, viewingKey: 'spoofed-private-key' }] });
    gate.release();
    expect(await loser).toMatchObject({ status: 409 });
    expect((await readDraft(env, draft.roll.id)).roll.name).toBe('Winning edit');
    expect(winner.frames[0].viewingKey).toBe(frame.viewingKey);
    await expect(saveDraft(env, draft.roll.id, draft)).rejects.toMatchObject({ status: 409 });
  });
  it('retains previous catalog and removes partial images/catalog versions on publication failure or conflict', async () => {
    const { env, privateBucket, publicBucket } = environment(), { draft } = await draftFixture(env, privateBucket);
    const first = await finish(env, draft.roll.id, draft.roll.updatedAt);
    const before = [...publicBucket.objects.keys()].sort();
    const newFrame = { ...draft.frames[0], id: webcrypto.randomUUID() };
    const changed = await saveDraft(env, draft.roll.id, { roll: { ...draft.roll, frameIds: [newFrame.id], coverId: newFrame.id }, frames: [newFrame] });
    publicBucket.beforePut = async key => { if (key.endsWith('thumbnail.jpg')) throw new Error('Storage unavailable'); };
    await expect(finish(env, draft.roll.id, changed.roll.updatedAt)).rejects.toThrow('Storage unavailable');
    expect(await publicCatalog(env)).toEqual({ version: 1, rolls: [first] });
    expect([...publicBucket.objects.keys()].sort()).toEqual(before);
    const gate = barrier(); let pause = true;
    publicBucket.beforePut = async key => { if (pause && key.endsWith('viewing.jpg')) { pause = false; await gate.block(); } };
    const loser = finish(env, draft.roll.id, changed.roll.updatedAt).catch(error => error);
    await gate.entered;
    const winner = await finish(env, draft.roll.id, changed.roll.updatedAt);
    gate.release();
    expect(await loser).toMatchObject({ status: 409 });
    expect(await publicCatalog(env)).toEqual({ version: 1, rolls: [winner] });
    expect([...publicBucket.objects.keys()].filter(key => key.startsWith('rolls/')).every(key => key.includes(first.revision) || key.includes(winner.revision))).toBe(true);
  });
  it('does not delete committed photographs if pending-operation cleanup fails or continuation is replayed', async () => {
    const { env, privateBucket, publicBucket } = environment(), { draft } = await draftFixture(env, privateBucket);
    privateBucket.beforeDelete = async keys => {
      if (keys.some(key => key.startsWith('publications/pending/'))) throw new Error('Pending cleanup unavailable');
    };
    const published = await publishDraft(env, draft.roll.id, draft.roll.updatedAt);
    if ('pending' in published) throw new Error('Expected a complete one-frame publication');
    expect((await publicCatalog(env)).rolls).toEqual([published]);
    const replay = await publishDraft(env, draft.roll.id, draft.roll.updatedAt, published.revision);
    expect(replay).toEqual(published);
    for (const kind of kinds) expect(publicBucket.objects.has(new URL(published.frames[0][kind].url).pathname.slice(1))).toBe(true);
  });
  it('bounds per-request publication work and publishes a large roll only after the final batch', async () => {
    const { env, privateBucket, publicBucket } = environment(), { draft } = await draftFixture(env, privateBucket);
    const frames = Array.from({ length: 13 }, (_, index) => ({ ...draft.frames[0], id: webcrypto.randomUUID(), filename: `frame-${index}.jpg` }));
    const large = await saveDraft(env, draft.roll.id, { roll: { ...draft.roll, frameIds: frames.map(frame => frame.id), coverId: frames[0].id }, frames });
    privateBucket.calls = publicBucket.calls = 0;
    const first = await publishDraft(env, large.roll.id, large.roll.updatedAt);
    expect(first).toMatchObject({ pending: true });
    expect(privateBucket.calls + publicBucket.calls).toBeLessThanOrEqual(50);
    expect(await publicCatalog(env)).toEqual({ version: 1, rolls: [] });
    if (!('pending' in first)) throw new Error('Expected a continuation');
    let continuation = first.continuation;
    let result: PublishResult;
    do {
      privateBucket.calls = publicBucket.calls = 0;
      result = await publishDraft(env, large.roll.id, large.roll.updatedAt, continuation);
      expect(privateBucket.calls + publicBucket.calls).toBeLessThanOrEqual(50);
      if ('pending' in result) continuation = result.continuation;
    } while ('pending' in result);
    expect(result.frames).toHaveLength(13);
    expect((await publicCatalog(env)).rolls).toEqual([result]);
  });
  it('invalidates in-flight publications, retains a tombstone on delete failure and isolates later generations', async () => {
    const { env, privateBucket, publicBucket } = environment(), { draft } = await draftFixture(env, privateBucket);
    await finish(env, draft.roll.id, draft.roll.updatedAt);
    const newFrame = { ...draft.frames[0], id: webcrypto.randomUUID() };
    const changed = await saveDraft(env, draft.roll.id, { roll: { ...draft.roll, frameIds: [newFrame.id], coverId: newFrame.id }, frames: [newFrame] });
    const gate = barrier(); let pause = true;
    publicBucket.beforePut = async key => { if (pause && key.endsWith('viewing.jpg')) { pause = false; await gate.block(); } };
    const publication = finish(env, draft.roll.id, changed.roll.updatedAt).catch(error => error);
    await gate.entered;
    publicBucket.beforeDelete = async () => { throw new Error('Delete unavailable'); };
    await expect(withdrawPublication(env, draft.roll.id)).rejects.toThrow('Delete unavailable');
    expect(await publicCatalog(env)).toEqual({ version: 1, rolls: [] });
    await expect(finish(env, draft.roll.id, changed.roll.updatedAt)).rejects.toMatchObject({ status: 409 });
    publicBucket.beforeDelete = undefined;
    while (!(await withdrawPublication(env, draft.roll.id)).withdrawn) { /* bounded cleanup */ }
    gate.release();
    expect(await publication).toMatchObject({ status: 409 });
    expect([...publicBucket.objects.keys()].filter(key => key.startsWith('rolls/'))).toEqual([]);
    const next = await finish(env, draft.roll.id, changed.roll.updatedAt);
    expect(next.frames[0].viewing.url).toContain(`/rolls/${draft.roll.id}/1/`);
  });
  it('resumes withdrawal over multiple requests without touching a later generation', async () => {
    const { env, privateBucket, publicBucket } = environment(), { draft } = await draftFixture(env, privateBucket);
    const frames = Array.from({ length: 13 }, () => ({ ...draft.frames[0], id: webcrypto.randomUUID() }));
    const large = await saveDraft(env, draft.roll.id, { roll: { ...draft.roll, frameIds: frames.map(frame => frame.id), coverId: frames[0].id }, frames });
    await finish(env, large.roll.id, large.roll.updatedAt);
    expect(await withdrawPublication(env, large.roll.id)).toEqual({ withdrawn: false });
    expect(await publicCatalog(env)).toEqual({ version: 1, rolls: [] });
    while (!(await withdrawPublication(env, large.roll.id)).withdrawn) { /* bounded cleanup */ }
    expect([...publicBucket.objects.keys()].filter(key => key.startsWith('rolls/'))).toEqual([]);
    const next = await finish(env, large.roll.id, large.roll.updatedAt);
    expect(next.frames[0].viewing.url).toContain(`/rolls/${large.roll.id}/1/`);
  });
  it('deletes generation nine even when ten sorts first and leaves generation eleven untouched', async () => {
    const { env, privateBucket, publicBucket } = environment(), id = webcrypto.randomUUID();
    await privateBucket.put('catalog/head.json', JSON.stringify({
      catalogKey: null, withdrawals: {}, generations: { [id]: 10 }, revision: webcrypto.randomUUID(),
    }));
    const oldKey = `rolls/${id}/9/older/viewing.jpg`;
    await publicBucket.put(oldKey, photograph());
    for (let index = 0; index < 25; index++) await publicBucket.put(`rolls/${id}/10/old-${index}/viewing.jpg`, photograph());
    const newer = `rolls/${id}/11/newer/viewing.jpg`;
    await publicBucket.put(newer, photograph());
    let withdrawn = false;
    while (!withdrawn) {
      privateBucket.calls = publicBucket.calls = 0;
      ({ withdrawn } = await withdrawPublication(env, id));
      expect(privateBucket.calls + publicBucket.calls).toBeLessThanOrEqual(50);
    }
    expect([...publicBucket.objects.keys()].filter(key => key.startsWith(`rolls/${id}/`))).toEqual([newer]);
    expect(publicBucket.objects.has(oldKey)).toBe(false);
  });
});

it('publishes crop and title edits without copying unchanged images, then withdraws reused images', async () => {
  const { env, privateBucket, publicBucket } = environment(), { draft } = await draftFixture(env, privateBucket);
  const first = await finish(env, draft.roll.id, draft.roll.updatedAt);
  const writes: string[] = [];
  publicBucket.beforePut = async key => { if(key.startsWith('rolls/'))writes.push(key); };
  const saved = await saveDraft(env, draft.roll.id, { ...draft, roll: { ...draft.roll, name: 'New title' },
    frames: [{ ...draft.frames[0], rotation: 90, uprightRotation: 180, cropPosition: { x: .5, y: 0 }, filmStrength: 20 }] });
  // Which way is up only matters to the editor; the private draft keeps it.
  expect(saved.frames[0]).toMatchObject({ rotation: 90, uprightRotation: 180 });
  const edited = await finish(env, saved.roll.id, saved.roll.updatedAt);
  expect(writes).toEqual([]);
  expect(edited.name).toBe('New title');
  expect(edited.frames[0]).toMatchObject({ rotation: 90, cropPosition: { x: .5, y: 0 }, filmStrength: 20,
    viewing: first.frames[0].viewing, thumbnail: first.frames[0].thumbnail });
  while (!(await withdrawPublication(env, saved.roll.id)).withdrawn) { /* bounded cleanup */ }
  expect([...publicBucket.objects.keys()].filter(key => key.startsWith('rolls/'))).toEqual([]);
  const restored = await finish(env, saved.roll.id, saved.roll.updatedAt);
  expect(writes).toHaveLength(2);
  expect(restored.frames[0].viewing.url).not.toBe(first.frames[0].viewing.url);
});

it('copies only changed image bytes and keeps reused images intact if catalog commit fails', async () => {
  const { env, privateBucket, publicBucket } = environment(), { draft } = await draftFixture(env, privateBucket);
  const second = { ...draft.frames[0], id: webcrypto.randomUUID() };
  const two = await saveDraft(env, draft.roll.id, { roll: { ...draft.roll, frameIds: [...draft.roll.frameIds, second.id] }, frames: [...draft.frames, second] });
  const first = await finish(env, two.roll.id, two.roll.updatedAt);
  const replacement = await uploadFixture(env, privateBucket, new Uint8Array([...photograph(), 0]));
  const changed = await saveDraft(env, two.roll.id, { ...two, frames: [two.frames[0], { ...second,
    uploadId: replacement.grant.id, viewingSha256: replacement.request.viewing.sha256 }] });
  const writes: string[] = [];
  publicBucket.beforePut = async key => { if(key.startsWith('rolls/'))writes.push(key); };
  privateBucket.beforePut = async key => { if(key==='catalog/head.json')throw new Error('Catalog unavailable'); };
  await expect(finish(env, changed.roll.id, changed.roll.updatedAt)).rejects.toThrow('Catalog unavailable');
  expect(writes).toHaveLength(2);
  expect((await publicCatalog(env)).rolls).toEqual([first]);
  for(const frame of first.frames)for(const kind of kinds)expect(publicBucket.objects.has(new URL(frame[kind].url).pathname.slice(1))).toBe(true);
  privateBucket.beforePut = undefined; writes.length = 0;
  const edited = await finish(env, changed.roll.id, changed.roll.updatedAt);
  expect(writes).toHaveLength(2);
  expect(edited.frames[0].viewing).toEqual(first.frames[0].viewing);
  expect(edited.frames[1].viewing.sha256).toBe(replacement.request.viewing.sha256);
  expect(edited.frames[1].viewing.url).not.toBe(first.frames[1].viewing.url);
});
