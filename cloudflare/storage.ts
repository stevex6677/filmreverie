import type { R2Bucket, R2ObjectBody } from '@cloudflare/workers-types';
import type { CloudDraft, GalleryCatalog, GalleryRoll, PublishResult, UploadRequest } from '../src/cloud/contracts';
import { validateBundle } from '../src/storage/rollRepository';
import { CatalogState, CompletedUpload, DraftHead, DraftSnapshot, Env, HttpError, ImageRecord, Kind, PendingPublication, PendingUpload, kinds, requireValue, validId } from './types';
import { signUpload, stagingKey, UPLOAD_LIFETIME_MS } from './signing';

const imageLimits = { viewing: 5 * 1024 * 1024, thumbnail: 512 * 1024 } as const;
const privateMetadata = { contentType: 'application/json', cacheControl: 'private, no-store' };
const catalogKey = 'catalog/head.json';
async function record<T>(bucket: R2Bucket, key: string): Promise<{ value: T; etag: string } | null> {
  const object = await bucket.get(key);
  return object ? { value: await object.json<T>(), etag: object.etag } : null;
}
// A cleanup page is deliberately bounded: R2 calls count against Workers Free's
// 50-subrequest limit, including work performed after the response.
async function removePage(bucket: R2Bucket, prefix: string): Promise<boolean> {
  const page = await bucket.list({ prefix, limit: 24 });
  if (!page.objects.length && page.truncated) throw new HttpError(503, 'Public storage pagination did not advance.');
  if (!page.objects.length) return true;
  await bucket.delete(page.objects.map(object => object.key));
  return !page.truncated;
}
async function catalog(env: Env) {
  return await record<CatalogState>(env.PRIVATE_BUCKET, catalogKey)
    ?? { value: { catalogKey: null, withdrawals: {}, generations: {}, revision: '' } as CatalogState, etag: undefined };
}
async function catalogValue(env: Env, key: string | null): Promise<GalleryCatalog> {
  if (!key) return { version: 1, rolls: [] };
  const object = await record<GalleryCatalog>(env.PUBLIC_BUCKET, key);
  if (!object) throw new HttpError(503, 'The committed gallery version is unavailable.');
  return object.value;
}
async function commitCatalog(env: Env, next: CatalogState, etag?: string) {
  next.revision = crypto.randomUUID();
  return env.PRIVATE_BUCKET.put(catalogKey, JSON.stringify(next), { httpMetadata: privateMetadata, onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: '*' } });
}
export async function publicCatalog(env: Env) {
  return catalogValue(env, (await catalog(env)).value.catalogKey);
}
export async function grantUpload(env: Env, value: UploadRequest) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === kinds.length && Object.keys(value).every(key => kinds.includes(key as Kind)), 'Only viewing and thumbnail JPEG derivatives can be uploaded.');
  const request = {} as UploadRequest;
  for (const kind of kinds) {
    const image = value[kind];
    requireValue(image && Number.isSafeInteger(image.bytes) && image.bytes > 0 && image.bytes <= imageLimits[kind]
      && image.mime === 'image/jpeg' && typeof image.sha256 === 'string' && /^[a-f0-9]{64}$/.test(image.sha256),
    'Use valid JPEG derivative metadata within upload limits.');
    request[kind] = { bytes: image.bytes, mime: image.mime, sha256: image.sha256 };
  }
  const id = crypto.randomUUID(), now = Date.now();
  const pending: PendingUpload = { id, expiresAt: now + UPLOAD_LIFETIME_MS, request };
  const grant = await signUpload(env, id, request, now);
  const written = await env.PRIVATE_BUCKET.put(`uploads/pending/${id}.json`, JSON.stringify(pending), { httpMetadata: privateMetadata, onlyIf: { etagDoesNotMatch: '*' } });
  if (!written) throw new HttpError(409, 'Upload grant conflicted. Retry the upload.');
  return grant;
}
export async function completedUpload(env: Env, id: string): Promise<CompletedUpload> {
  const completed = await record<CompletedUpload>(env.PRIVATE_BUCKET, `uploads/completed/${id}.json`);
  if (!completed || completed.value.id !== id || kinds.some(kind => {
    const image = completed.value.images?.[kind];
    return !image || !image.key.startsWith(`sealed/${id}/`) || !image.key.endsWith(`/${kind}`)
      || image.mime !== 'image/jpeg' || !Number.isSafeInteger(image.bytes) || image.bytes < 1
      || image.bytes > imageLimits[kind] || !/^[a-f0-9]{64}$/.test(image.sha256);
  })) throw new HttpError(400, 'Complete each photograph upload before saving a draft.');
  return completed.value;
}
export async function completeUpload(env: Env, id: string) {
  const completedKey = `uploads/completed/${id}.json`;
  if (await env.PRIVATE_BUCKET.head(completedKey)) return { id };
  const pending = await record<PendingUpload>(env.PRIVATE_BUCKET, `uploads/pending/${id}.json`);
  if (!pending) throw new HttpError(404, 'Upload authorization was not found.');
  if (pending.value.id !== id || !Number.isSafeInteger(pending.value.expiresAt)
    || pending.value.expiresAt > Date.now() + UPLOAD_LIFETIME_MS
    || !pending.value.request || kinds.some(kind => {
      const image = pending.value.request[kind];
      return !image || !Number.isSafeInteger(image.bytes) || image.bytes < 1 || image.bytes > imageLimits[kind]
        || image.mime !== 'image/jpeg' || typeof image.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(image.sha256);
    })) throw new HttpError(400, 'Upload authorization metadata is invalid.');
  if (Date.now() >= pending.value.expiresAt) throw new HttpError(410, 'Upload authorization expired. Obtain a new upload grant.');
  // Validate BOTH staged objects via HEAD before copying any body. The signed
  // browser PUT binds the supplied digest; the Worker never computes a digest.
  for (const kind of kinds) {
    const expected = pending.value.request[kind];
    const staged = await env.PRIVATE_BUCKET.head(stagingKey(id, kind));
    if (!staged) throw new HttpError(400, 'Both derivatives must finish uploading before completion.');
    if (staged.size !== expected.bytes || staged.httpMetadata?.contentType !== expected.mime)
      throw new HttpError(400, 'Uploaded size or media type does not match its grant.');
  }
  const prefix = `sealed/${id}/${crypto.randomUUID()}/`;
  const images = {} as Record<Kind, ImageRecord>;
  let committed = false;
  try {
    for (const kind of kinds) {
      const expected = pending.value.request[kind];
      const source = await env.PRIVATE_BUCKET.get(stagingKey(id, kind));
      if (!source || source.size !== expected.bytes || source.httpMetadata?.contentType !== expected.mime)
        throw new HttpError(400, 'Uploaded size or media type changed before sealing.');
      const key = `${prefix}${kind}`;
      const written = await env.PRIVATE_BUCKET.put(key, source.body, { onlyIf: { etagDoesNotMatch: '*' },
        httpMetadata: { contentType: 'image/jpeg', cacheControl: 'private, no-store' } });
      if (!written) throw new HttpError(409, 'A private photograph version conflicted.');
      images[kind] = { key, bytes: expected.bytes, sha256: expected.sha256, mime: 'image/jpeg' };
    }
    const result = await env.PRIVATE_BUCKET.put(completedKey, JSON.stringify({ id, images } satisfies CompletedUpload),
      { httpMetadata: privateMetadata, onlyIf: { etagDoesNotMatch: '*' } });
    committed = !!result;
    if (!result && !await env.PRIVATE_BUCKET.head(completedKey)) throw new HttpError(409, 'Upload completion conflicted. Retry completion.');
    return { id };
  } finally {
    if (!committed) await env.PRIVATE_BUCKET.delete(kinds.map(kind => `${prefix}${kind}`));
  }
}
export async function privateImage(env: Env, id: string, kind: Kind): Promise<R2ObjectBody> {
  const upload = await completedUpload(env, id);
  const object = await env.PRIVATE_BUCKET.get(upload.images[kind].key);
  if (!object) throw new HttpError(404, 'Private photograph was not found.');
  return object;
}

async function draftHead(env: Env, id: string) {
  return record<DraftHead>(env.PRIVATE_BUCKET, `drafts/heads/${id}.json`);
}
export async function readDraft(env: Env, id: string): Promise<CloudDraft> {
  const head = await draftHead(env, id);
  if (!head) throw new HttpError(404, 'Private draft was not found.');
  const snapshot = await record<DraftSnapshot>(env.PRIVATE_BUCKET, head.value.snapshot);
  if (!snapshot) throw new HttpError(503, 'Private draft storage is unavailable.');
  return snapshot.value.draft;
}
export async function listDrafts(env: Env) {
  const drafts: CloudDraft[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.PRIVATE_BUCKET.list({ prefix: 'drafts/heads/', cursor });
    for (const object of page.objects) drafts.push(await readDraft(env, object.key.slice('drafts/heads/'.length, -5)));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return { drafts: drafts.sort((a, b) => b.roll.updatedAt - a.roll.updatedAt) };
}
function checkDraft(value: CloudDraft, id: string) {
  requireValue(value && typeof value === 'object' && value.roll && Array.isArray(value.frames) && value.frames.length > 0 && value.frames.length <= 585, 'Invalid private draft.');
  const roll = value.roll;
  requireValue(roll.id === id && typeof roll.name === 'string' && typeof roll.stockId === 'string' && typeof roll.format === 'string'
    && Array.isArray(roll.frameIds) && roll.frameIds.every(validId) && validId(roll.coverId)
    && Number.isSafeInteger(roll.createdAt) && roll.createdAt >= 0 && Number.isSafeInteger(roll.updatedAt) && roll.updatedAt >= 0
    && (roll.filmStrength === undefined || Number.isFinite(roll.filmStrength) && roll.filmStrength >= 0 && roll.filmStrength <= 100)
    && (roll.trashedAt === null || Number.isSafeInteger(roll.trashedAt) && roll.trashedAt >= 0)
    && (roll.shelfSlot === undefined || Number.isSafeInteger(roll.shelfSlot) && roll.shelfSlot >= 0), 'Invalid roll metadata.');
  requireValue(new Set(value.frames.map(frame => frame?.id)).size === value.frames.length, 'Duplicate frames are not allowed.');
  for (const frame of value.frames) {
    requireValue(frame && validId(frame.id) && validId(frame.uploadId) && typeof frame.filename === 'string' && frame.filename.length <= 512
      && Number.isSafeInteger(frame.width) && frame.width > 0 && frame.width <= 2048
      && Number.isSafeInteger(frame.height) && frame.height > 0 && frame.height <= 2048
      && frame.width * frame.height <= 2048 * 2048
      && typeof frame.viewingSha256 === 'string' && /^[a-f0-9]{64}$/.test(frame.viewingSha256)
      && !('originalKey' in frame) && !('hash' in frame) && !('mime' in frame), 'Invalid derivative frame metadata.');
  }
  if (roll.view !== undefined) {
    const view = roll.view;
    requireValue(view && roll.frameIds.includes(view.frameId) && ['roll', 'strip', 'frame'].includes(view.level) && ['negative', 'positive'].includes(view.mode)
      && [view.brightness, view.magnification].every(Number.isFinite) && (view.zoom === null || Number.isFinite(view.zoom))
      && view.pan && [view.pan.x, view.pan.z].every(Number.isFinite)
      && (view.filmScale === undefined || Number.isFinite(view.filmScale))
      && (view.overview === null || view.overview && Number.isFinite(view.overview.zoom) && Number.isInteger(view.overview.frameIndex)
        && view.overview.pan && [view.overview.pan.x, view.overview.pan.z].every(Number.isFinite)), 'Invalid saved view.');
  }
  try { validateBundle({ roll, frames: value.frames }); }
  catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'Invalid roll.'); }
}
export async function saveDraft(env: Env, id: string, value: CloudDraft): Promise<CloudDraft> {
  checkDraft(value, id);
  const head = await draftHead(env, id);
  let previous: CloudDraft | undefined;
  if (head) {
    const snapshot = await record<DraftSnapshot>(env.PRIVATE_BUCKET, head.value.snapshot);
    if (!snapshot) throw new HttpError(503, 'Private draft storage is unavailable.');
    previous = snapshot.value.draft;
    if (previous.roll.updatedAt !== value.roll.updatedAt) throw new HttpError(409, 'This draft changed in another session. Reopen it before saving.');
  }
  const frames: CloudDraft['frames'] = [];
  for (const frame of value.frames) {
    const upload = await completedUpload(env, frame.uploadId), images = upload.images;
    requireValue(frame.viewingSha256 === images.viewing.sha256, 'Frame digest does not match its completed viewing derivative.');
    frames.push({ id: frame.id, rollId: id, uploadId: frame.uploadId, filename: frame.filename,
      width: frame.width, height: frame.height, rotation: frame.rotation, viewingSha256: images.viewing.sha256,
      ...(frame.cropPosition ? { cropPosition: { x: frame.cropPosition.x, y: frame.cropPosition.y } } : {}),
      ...(frame.filmStrength !== undefined ? { filmStrength: frame.filmStrength } : {}),
      viewingKey: images.viewing.key, thumbnailKey: images.thumbnail.key });
  }
  const roll = value.roll;
  const draft: CloudDraft = { roll: { id, name: roll.name.trim(), stockId: roll.stockId, format: roll.format, sizing: roll.sizing,
    filmStrength: roll.filmStrength, frameIds: [...roll.frameIds], coverId: roll.coverId, createdAt: previous?.roll.createdAt ?? roll.createdAt,
    updatedAt: Math.max(Date.now(), (previous?.roll.updatedAt ?? 0) + 1), trashedAt: roll.trashedAt, shelfSlot: roll.shelfSlot, view: roll.view }, frames };
  const snapshot = `drafts/snapshots/${id}/${crypto.randomUUID()}.json`;
  await env.PRIVATE_BUCKET.put(snapshot, JSON.stringify({ draft } satisfies DraftSnapshot), { httpMetadata: privateMetadata, onlyIf: { etagDoesNotMatch: '*' } });
  let committed = false;
  try {
    committed = !!await env.PRIVATE_BUCKET.put(`drafts/heads/${id}.json`, JSON.stringify({ snapshot } satisfies DraftHead), {
      httpMetadata: privateMetadata, onlyIf: head ? { etagMatches: head.etag } : { etagDoesNotMatch: '*' },
    });
    if (!committed) throw new HttpError(409, 'This draft changed concurrently. Reopen it before saving.');
    return draft;
  } finally { if (!committed) await env.PRIVATE_BUCKET.delete(snapshot); }
}

const publicationBatch = 6;
export async function publishDraft(env: Env, id: string, updatedAt: number, continuation?: string): Promise<PublishResult> {
  const state = await catalog(env);
  if (state.value.withdrawals[id]) throw new HttpError(409, 'Withdrawal is still in progress. Finish withdrawal before publishing.');
  const head = await draftHead(env, id);
  if (!head) throw new HttpError(404, 'Private draft was not found.');
  const snapshot = await record<DraftSnapshot>(env.PRIVATE_BUCKET, head.value.snapshot);
  if (!snapshot) throw new HttpError(503, 'Private draft storage is unavailable.');
  const draft = snapshot.value.draft;
  if (draft.roll.trashedAt !== null) throw new HttpError(409, 'Restore this roll from Trash before publishing.');
  if (draft.roll.updatedAt !== updatedAt) throw new HttpError(409, 'This draft changed since preview. Reopen it before publishing.');
  let pending: PendingPublication, pendingEtag: string | undefined;
  if (continuation) {
    if (!validId(continuation)) throw new HttpError(400, 'Invalid publication continuation.');
    const stored = await record<PendingPublication>(env.PRIVATE_BUCKET, `publications/pending/${continuation}.json`);
    if (!stored) throw new HttpError(409, 'Publication continuation expired or was already completed.');
    pending = stored.value; pendingEtag = stored.etag;
    if (pending.id !== id || pending.revision !== continuation || pending.snapshot !== head.value.snapshot
      || pending.updatedAt !== updatedAt) throw new HttpError(409, 'Publication no longer matches the saved draft.');
  } else {
    const roll = draft.roll, revision = crypto.randomUUID();
    pending = { id, revision, snapshot: head.value.snapshot, updatedAt,
      catalogEtag: state.etag, catalogKey: state.value.catalogKey, generation: state.value.generations[id] ?? 0,
      nextFrame: 0, publication: { id, revision, name: roll.name, stockId: roll.stockId, format: roll.format,
        sizing: roll.sizing, filmStrength: roll.filmStrength, coverId: roll.coverId, frames: [], publishedAt: Date.now() } };
    const created = await env.PRIVATE_BUCKET.put(`publications/pending/${revision}.json`, JSON.stringify(pending),
      { httpMetadata: privateMetadata, onlyIf: { etagDoesNotMatch: '*' } });
    if (!created) throw new HttpError(409, 'Publication revision conflicted.');
    pendingEtag = created.etag;
  }
  const pendingKey = `publications/pending/${pending.revision}.json`;
  const prefix = `rolls/${id}/${pending.generation}/${pending.revision}/`;
  if (pending.catalogEtag !== state.etag && state.value.catalogKey) {
    const current = await catalogValue(env, state.value.catalogKey);
    const published = current.rolls.find(roll => roll.id === id && roll.revision === pending.revision);
    if (published) {
      await env.PRIVATE_BUCKET.delete(pendingKey).catch(() => {});
      return published;
    }
  }
  if (pending.cleanup) {
    const done = await removePage(env.PUBLIC_BUCKET, prefix);
    if (done) {
      await env.PRIVATE_BUCKET.delete(pendingKey);
      throw new HttpError(409, 'Publication conflicted; the prior gallery remains unchanged.');
    }
    return { pending: true, continuation: pending.revision };
  }
  if (pending.catalogEtag !== state.etag || pending.catalogKey !== state.value.catalogKey
    || pending.generation !== (state.value.generations[id] ?? 0)) {
    // The committed pointer changed while an earlier batch was in flight.
    const result = await env.PRIVATE_BUCKET.put(pendingKey, JSON.stringify({ ...pending, cleanup: true } satisfies PendingPublication),
      { httpMetadata: privateMetadata, onlyIf: { etagMatches: pendingEtag! } });
    if (!result) throw new HttpError(409, 'Publication continuation is already being processed.');
    const done = await removePage(env.PUBLIC_BUCKET, prefix);
    if (done) await env.PRIVATE_BUCKET.delete(pendingKey);
    if (!done) return { pending: true, continuation: pending.revision };
    throw new HttpError(409, 'The gallery changed concurrently. The previous complete publication is retained.');
  }
  // A single invocation streams at most six frames (36 R2 image operations),
  // leaving room for metadata, the immutable catalog and the CAS pointer.
  const publication: GalleryRoll = { ...pending.publication, frames: [...pending.publication.frames] };
  try {
    for (let index = pending.nextFrame; index < Math.min(draft.roll.frameIds.length, pending.nextFrame + publicationBatch); index++) {
      const frame = draft.frames.find(candidate => candidate.id === draft.roll.frameIds[index]);
      if (!frame) throw new HttpError(409, 'Saved draft frame is missing.');
      const upload = await completedUpload(env, frame.uploadId);
      const publicFrame: GalleryRoll['frames'][number] = { id: frame.id, width: frame.width, height: frame.height, rotation: frame.rotation,
        ...(frame.cropPosition ? { cropPosition: { x: frame.cropPosition.x, y: frame.cropPosition.y } } : {}),
        ...(frame.filmStrength !== undefined ? { filmStrength: frame.filmStrength } : {}),
        viewing: null!, thumbnail: null! };
      for (const kind of kinds) {
        const image = upload.images[kind], source = await env.PRIVATE_BUCKET.get(image.key);
        if (!source || source.size !== image.bytes || source.httpMetadata?.contentType !== 'image/jpeg')
          throw new HttpError(409, 'A sealed derivative is unavailable or has changed. The previous publication is unchanged.');
        const key = `${prefix}${frame.id}/${kind}.jpg`;
        const written = await env.PUBLIC_BUCKET.put(key, source.body, { onlyIf: { etagDoesNotMatch: '*' },
          httpMetadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=0, must-revalidate' } });
        if (!written) throw new HttpError(409, 'Public image version conflicted. The previous publication is unchanged.');
        publicFrame[kind] = { url: `${env.PHOTO_ORIGIN}/${key}`, bytes: image.bytes, sha256: image.sha256 };
      }
      publication.frames.push(publicFrame);
    }
    const next: PendingPublication = { ...pending, nextFrame: publication.frames.length, publication };
    const advanced = await env.PRIVATE_BUCKET.put(pendingKey, JSON.stringify(next),
      { httpMetadata: privateMetadata, onlyIf: { etagMatches: pendingEtag! } });
    if (!advanced) throw new HttpError(409, 'Publication continuation is already being processed.');
    pending = next; pendingEtag = advanced.etag;
    if (next.nextFrame < draft.roll.frameIds.length) return { pending: true, continuation: pending.revision };
    const old = await catalogValue(env, pending.catalogKey);
    const key = `catalog/versions/${crypto.randomUUID()}.json`;
    const version: GalleryCatalog = { version: 1, rolls: [...old.rolls.filter(roll => roll.id !== id), publication] };
    const written = await env.PUBLIC_BUCKET.put(key, JSON.stringify(version),
      { httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' }, onlyIf: { etagDoesNotMatch: '*' } });
    if (!written) throw new HttpError(409, 'Public catalog version conflicted.');
    try {
      if (!await commitCatalog(env, { ...state.value, catalogKey: key }, pending.catalogEtag))
        throw new HttpError(409, 'The gallery changed concurrently. The previous complete publication is retained.');
    } catch (error) {
      await env.PUBLIC_BUCKET.delete(key);
      throw error;
    }
    await env.PRIVATE_BUCKET.delete(pendingKey).catch(() => {});
    return publication;
  } catch (error) {
    // A competing invocation of the SAME continuation may own the progress
    // CAS. Never delete objects that its successful publication may reference.
    const latest = await record<PendingPublication>(env.PRIVATE_BUCKET, pendingKey);
    if (latest?.etag === pendingEtag) {
      const marked = await env.PRIVATE_BUCKET.put(pendingKey, JSON.stringify({ ...pending, cleanup: true } satisfies PendingPublication),
        { httpMetadata: privateMetadata, onlyIf: { etagMatches: latest.etag } });
      if (marked) {
        const done = await removePage(env.PUBLIC_BUCKET, prefix);
        if (!done) return { pending: true, continuation: pending.revision };
        await env.PRIVATE_BUCKET.delete(pendingKey);
      }
    }
    throw error;
  }
}
export async function withdrawPublication(env: Env, id: string) {
  let state = await catalog(env), tombstone = state.value.withdrawals[id];
  if (!tombstone) {
    tombstone = { generation: state.value.generations[id] ?? 0, token: crypto.randomUUID() };
    const old = await catalogValue(env, state.value.catalogKey);
    const key = `catalog/versions/${crypto.randomUUID()}.json`;
    const version: GalleryCatalog = { version: 1, rolls: old.rolls.filter(roll => roll.id !== id) };
    const written = await env.PUBLIC_BUCKET.put(key, JSON.stringify(version),
      { httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' }, onlyIf: { etagDoesNotMatch: '*' } });
    if (!written) throw new HttpError(409, 'Public catalog version conflicted.');
    try {
      const next: CatalogState = { ...state.value, catalogKey: key,
        withdrawals: { ...state.value.withdrawals, [id]: tombstone },
        generations: { ...state.value.generations, [id]: tombstone.generation + 1 } };
      if (!await commitCatalog(env, next, state.etag)) throw new HttpError(409, 'The gallery changed concurrently. Retry withdrawal.');
    } catch (error) {
      await env.PUBLIC_BUCKET.delete(key);
      throw error;
    }
  }
  // Scan each exact numeric generation, not a lexicographically sorted roll
  // prefix: \"10/\" precedes \"9/\" and could conceal older images in a page.
  // Persist progress after at most 12 generations (<=24 delete/list calls).
  let nextGeneration = tombstone.nextGeneration ?? 0;
  let scanned = 0;
  for (; nextGeneration <= tombstone.generation && scanned < 12; scanned++) {
    const prefix = `rolls/${id}/${nextGeneration}/`;
    const page = await env.PUBLIC_BUCKET.list({ prefix, limit: 24 });
    if (!page.objects.length && page.truncated) throw new HttpError(503, 'Public storage pagination did not advance.');
    if (page.objects.length) await env.PUBLIC_BUCKET.delete(page.objects.map(object => object.key));
    if (page.truncated) break;
    nextGeneration++;
  }
  state = await catalog(env);
  if (state.value.withdrawals[id]?.token === tombstone.token) {
    const withdrawals = { ...state.value.withdrawals };
    if (nextGeneration > tombstone.generation) delete withdrawals[id];
    else withdrawals[id] = { ...tombstone, nextGeneration };
    if (!await commitCatalog(env, { ...state.value, withdrawals }, state.etag))
      throw new HttpError(409, 'Images were withdrawn, but catalog cleanup conflicted. Retry withdrawal to finish.');
  }
  return { withdrawn: nextGeneration > tombstone.generation };
}
