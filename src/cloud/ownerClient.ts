import type { CloudDraft, DraftFrame, GalleryRoll, PublishResult, UploadGrant, UploadKind, UploadRequest, WithdrawResult } from './contracts';
import { IMPORT_LIMITS, type DraftPhoto } from '../storage/importPhotos';
import { sha256Hex } from '../storage/crypto';

export class OwnerSessionRequired extends Error {
  constructor(message = 'Owner authentication is required. Open Owner login, then check your session here. Your unsaved draft is retained.') { super(message); }
}

async function privateResponse(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`/api/owner/${path}`, {
    ...init, credentials: 'same-origin', cache: 'no-store', redirect: 'manual',
    headers: { Accept: 'application/json', ...init.headers },
  });
  if (response.type === 'opaqueredirect' || response.status >= 300 && response.status < 400) throw new OwnerSessionRequired();
  if (!response.ok) {
    let message = `Owner request failed (${response.status}). Your draft and any previous publication are retained.`;
    if (response.headers.get('content-type')?.includes('application/json')) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (typeof body?.error === 'string') message = body.error;
    }
    if (response.status === 401 || response.status === 403) throw new OwnerSessionRequired(message);
    throw new Error(message);
  }
  return response;
}
async function json<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await privateResponse(path, init);
  if (!response.headers.get('content-type')?.includes('application/json')) throw new OwnerSessionRequired();
  return response.json() as Promise<T>;
}
function restoreView(draft: CloudDraft): CloudDraft {
  // JSON null is the wire representation of the archive's fit-to-frame NaN.
  if (draft.roll.view && draft.roll.view.zoom === null) draft.roll.view.zoom = NaN;
  return draft;
}
const idPath = (id: string) => encodeURIComponent(id);
export const ownerClient = {
  async session(signal?: AbortSignal) {
    const session = await json<{ email: string }>('session', { signal });
    if (typeof session.email !== 'string' || !session.email) throw new OwnerSessionRequired();
    return session;
  },
  async list(signal?: AbortSignal) { return (await json<{ drafts: CloudDraft[] }>('drafts', { signal })).drafts.map(restoreView); },
  async load(id: string, signal?: AbortSignal) { return restoreView(await json<CloudDraft>(`drafts/${idPath(id)}`, { signal })); },
  async save(draft: CloudDraft, signal?: AbortSignal) {
    return restoreView(await json<CloudDraft>(`drafts/${idPath(draft.roll.id)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft), signal,
    }));
  },
  async publish(id: string, updatedAt: number, signal?: AbortSignal, progress?: () => void): Promise<GalleryRoll> {
    let continuation: string | undefined;
    for (;;) {
      signal?.throwIfAborted();
      const result = await json<PublishResult>(`drafts/${idPath(id)}/publish`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updatedAt, ...(continuation ? { continuation } : {}) }), signal,
      });
      if (!('pending' in result)) return result;
      continuation = result.continuation;
      progress?.();
    }
  },
  async withdraw(id: string, signal?: AbortSignal, progress?: () => void): Promise<{ withdrawn: true }> {
    for (;;) {
      signal?.throwIfAborted();
      const result = await json<WithdrawResult>(`publications/${idPath(id)}`, { method: 'DELETE', signal });
      if (result.withdrawn) return { withdrawn: true };
      progress?.();
    }
  },
  async image(uploadId: string, kind: UploadKind, signal?: AbortSignal) {
    const response = await privateResponse(`uploads/${idPath(uploadId)}/${kind}`, { signal, headers: { Accept: 'image/jpeg' } });
    const blob = await response.blob();
    if (blob.type !== 'image/jpeg' || !blob.size) throw new Error('Private photograph is unavailable or invalid. Retry opening this draft.');
    return blob;
  },
};

export interface OwnerPhoto extends DraftPhoto { uploadId?: string; viewingSha256?: string }
const kinds = ['viewing', 'thumbnail'] as const;

/** The caller retains completed IDs between retries; an incomplete frame never enters a draft. */
export async function uploadOwnerPhoto(photo: OwnerPhoto, signal: AbortSignal, progress: (kind: string) => void): Promise<DraftFrame> {
  if (!photo.frame) throw new Error('Remove unreadable photographs before saving.');
  signal.throwIfAborted();
  if (Math.max(photo.frame.width, photo.frame.height) > 16384 || photo.frame.width * photo.frame.height > 40_000_000) throw new Error('Photographs must be at most 40 megapixels and 16,384 pixels per side.');
  const frame = photo.frame;
  const keys = { viewing: frame.viewingKey, thumbnail: frame.thumbnailKey };
  if (photo.uploadId && photo.viewingSha256) return draftFrame(frame, photo.uploadId, photo.viewingSha256);
  const blobs = new Map(photo.blobs.map(record => [record.key, record.blob]));
  const request = {} as UploadRequest;
  for (const kind of kinds) {
    signal.throwIfAborted();
    const blob = blobs.get(keys[kind]);
    if (!blob || blob.type !== 'image/jpeg' || !blob.size) throw new Error(`The ${kind} JPEG is missing. Reopen the source photograph or backup.`);
    request[kind] = { bytes: blob.size, mime: 'image/jpeg', sha256: await sha256Hex(new Uint8Array(await blob.arrayBuffer())) };
  }
  const grant = await json<UploadGrant>('uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal });
  for (const kind of kinds) {
    signal.throwIfAborted();
    if (Date.now() >= grant.expiresAt) throw new Error('Upload authorization expired. Save again to obtain a new grant; completed photographs are retained.');
    progress(kind);
    const target = grant.uploads[kind];
    const response = await fetch(target.url, { method: 'PUT', headers: target.headers, body: blobs.get(keys[kind])!, credentials: target.url.startsWith('/api/dev-auth/upload/') ? 'same-origin' : 'omit', cache: 'no-store', redirect: 'error', signal });
    if (!response.ok) throw new Error(`The ${kind} upload failed (${response.status}). Save again to retry this photograph; earlier completed uploads are retained.`);
  }
  const complete = await json<{ id: string }>(`uploads/${idPath(grant.id)}/complete`, { method: 'POST', signal });
  if (complete.id !== grant.id) throw new Error('Upload completion could not be verified. This photograph was not saved.');
  photo.uploadId = complete.id;
  photo.viewingSha256 = request.viewing.sha256;
  return draftFrame(frame, complete.id, request.viewing.sha256);
}

function draftFrame(frame: NonNullable<OwnerPhoto['frame']>, uploadId: string, viewingSha256: string): DraftFrame {
  const ratio = Math.min(1, IMPORT_LIMITS.viewingEdge / Math.max(frame.width, frame.height));
  return { id: frame.id, rollId: frame.rollId, filename: frame.filename,
    width: Math.max(1, Math.round(frame.width * ratio)), height: Math.max(1, Math.round(frame.height * ratio)),
    rotation: frame.rotation, ...(frame.cropPosition ? { cropPosition: frame.cropPosition } : {}),
    ...(frame.filmStrength !== undefined ? { filmStrength: frame.filmStrength } : {}),
    viewingKey: frame.viewingKey, thumbnailKey: frame.thumbnailKey, viewingSha256, uploadId };
}
