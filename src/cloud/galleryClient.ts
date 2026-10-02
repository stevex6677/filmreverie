import { FILM_FORMATS, FILM_UNIT, FRAME_GAP_MM, filmLengthUsage, formatLayout, frameAspect, isFilmFormat, rollFormatLabel } from '../data/filmFormats';
import { isFilmStockId, supportsFilmFormat } from '../data/filmStocks';
import { FILM_RENDER_SCALE } from '../data/physicalScale';
import { sha256Hex } from '../storage/crypto';
import type { SavedView } from '../storage/rollRepository';
import type { RollDefinition } from '../utils/rollLayout';
import type { GalleryCatalog, GalleryImage, GalleryRoll } from './contracts';

export interface GalleryRuntime {
  definition: RollDefinition;
  view?: SavedView;
  dispose: () => void;
  stockId: GalleryRoll['stockId'];
  filmStrength?: number;
}
export interface GalleryImageBytes { frameId: string; kind: 'viewing' | 'thumbnail'; bytes: ArrayBuffer; mime: string }
export interface GalleryProgress {
  receivedBytes: number; totalBytes: number; completedImages: number; totalImages: number;
  phase: 'downloading' | 'verifying' | 'saving';
}
export interface GalleryDownloadOptions {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  onProgress?: (progress: GalleryProgress) => void;
}

function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function positiveInteger(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0; }
function publicImage(value: unknown): value is GalleryImage {
  if (!object(value) || typeof value.url !== 'string' || !positiveInteger(value.bytes) || typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256)) return false;
  try {
    const url = new URL(value.url, globalThis.location?.href ?? 'https://gallery.invalid/');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    const privateProxy = ['macbook', 'macbook.tail2b1388.ts.net'].includes(url.hostname)
      && url.origin === globalThis.location?.origin && url.pathname.startsWith('/api/dev-images/rolls/') && !url.search;
    return (url.protocol === 'https:' || (url.protocol === 'http:' && (local || privateProxy))) && !url.username && !url.password && !url.hash && !/^\/api\/owner(?:\/|$)/.test(decodeURIComponent(url.pathname));
  } catch { return false; }
}
export function validateGalleryRoll(value: unknown): asserts value is GalleryRoll {
  if (!object(value) || typeof value.id !== 'string' || !value.id || typeof value.revision !== 'string' || !value.revision || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 120 || typeof value.stockId !== 'string' || !isFilmStockId(value.stockId) || typeof value.format !== 'string' || !isFilmFormat(value.format) || !supportsFilmFormat(value.stockId, value.format) || !Array.isArray(value.frames) || !value.frames.length || !Number.isFinite(value.publishedAt) || (value.sizing !== undefined && value.sizing !== 'fixed' && value.sizing !== 'free') || (value.filmStrength !== undefined && (typeof value.filmStrength !== 'number' || !Number.isFinite(value.filmStrength) || value.filmStrength < 0 || value.filmStrength > 100))) throw new Error('The gallery returned invalid roll metadata.');
  if (value.camera !== undefined && (typeof value.camera !== 'string' || value.camera.length > 120)) throw new Error('The gallery returned invalid camera metadata.');
  const ids = new Set<string>();
  for (const frame of value.frames) {
    if (!object(frame) || typeof frame.id !== 'string' || !frame.id || ids.has(frame.id) || !positiveInteger(frame.width) || !positiveInteger(frame.height) || ![0, 90, 180, 270].includes(frame.rotation as number) || !publicImage(frame.viewing) || !publicImage(frame.thumbnail)) throw new Error('The gallery returned invalid image metadata.');
    if (frame.cropPosition !== undefined && (!object(frame.cropPosition) || [frame.cropPosition.x, frame.cropPosition.y].some(n => typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 1))) throw new Error('The gallery returned an invalid crop.');
    if (frame.filmStrength !== undefined && (typeof frame.filmStrength !== 'number' || !Number.isFinite(frame.filmStrength) || frame.filmStrength < 0 || frame.filmStrength > 100)) throw new Error('The gallery returned an invalid film strength.');
    ids.add(frame.id);
  }
  const roll = value as unknown as GalleryRoll;
  if (typeof value.coverId !== 'string' || !ids.has(value.coverId) || !Number.isSafeInteger(galleryBytes(roll)) || filmLengthUsage(roll.format, roll.sizing ?? 'fixed', roll.frames).exceeded) throw new Error('The gallery returned an invalid roll layout.');
}
export function parseGalleryCatalog(value: unknown): GalleryCatalog {
  if (!object(value) || value.version !== 1 || !Array.isArray(value.rolls)) throw new Error('The gallery catalog is unavailable or unsupported.');
  const ids = new Set<string>();
  for (const roll of value.rolls) {
    validateGalleryRoll(roll);
    if (ids.has(roll.id)) throw new Error('The gallery catalog has duplicate rolls.');
    ids.add(roll.id);
  }
  return value as unknown as GalleryCatalog;
}
export async function fetchGallery(signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<GalleryCatalog> {
  const response = await fetcher('/api/gallery', { credentials: 'omit', cache: 'no-store', redirect: 'error', signal });
  if (!response.ok) throw new Error(`Published gallery unavailable (${response.status}).`);
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Published gallery is not configured at this address.');
  return parseGalleryCatalog(await response.json());
}
export function galleryBytes(roll: GalleryRoll): number { return roll.frames.reduce((sum, frame) => sum + frame.viewing.bytes + frame.thumbnail.bytes, 0); }
export async function downloadGalleryImage(image: GalleryImage, options: { signal?: AbortSignal; fetcher?: typeof fetch; onBytes?: (bytes: number) => void; onVerifying?: () => void } = {}): Promise<{ bytes: ArrayBuffer; mime: string }> {
  if (!publicImage(image)) throw new Error('Invalid public image reference.');
  options.signal?.throwIfAborted();
  const response = await (options.fetcher ?? fetch)(image.url, { credentials: 'omit', cache: 'no-store', redirect: 'error', signal: options.signal });
  if (!response.ok) throw new Error(`Published image unavailable (${response.status}).`);
  const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
  if (!/^image\/(jpeg|png|webp|avif)$/.test(mime)) throw new Error('The gallery did not return a display image.');
  let bytes: ArrayBuffer;
  if (response.body) {
    const reader = response.body.getReader(), parts: Uint8Array<ArrayBuffer>[] = [];
    let received = 0;
    const cancel = () => { void reader.cancel(options.signal?.reason).catch(() => {}); };
    options.signal?.addEventListener('abort', cancel, { once: true });
    try {
      while (true) {
        options.signal?.throwIfAborted();
        const part = await reader.read();
        if (part.done) break;
        received += part.value.byteLength;
        if (received > image.bytes) throw new Error('Published image size does not match its revision.');
        parts.push(part.value as Uint8Array<ArrayBuffer>);
        options.onBytes?.(received);
      }
      bytes = await new Blob(parts).arrayBuffer();
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    finally { options.signal?.removeEventListener('abort', cancel); reader.releaseLock(); }
  } else {
    bytes = await response.arrayBuffer();
    options.onBytes?.(bytes.byteLength);
  }
  options.signal?.throwIfAborted();
  if (bytes.byteLength !== image.bytes) throw new Error('Published image size does not match its revision.');
  options.onVerifying?.();
  if (await sha256Hex(new Uint8Array(bytes)) !== image.sha256) throw new Error('Published image checksum does not match its revision.');
  options.signal?.throwIfAborted();
  return { bytes, mime };
}

export async function downloadGalleryRoll(roll: GalleryRoll, kinds: readonly GalleryImageBytes['kind'][], options: GalleryDownloadOptions = {}): Promise<GalleryImageBytes[]> {
  validateGalleryRoll(roll);
  const totalBytes = roll.frames.reduce((sum, frame) => sum + kinds.reduce((n, kind) => n + frame[kind].bytes, 0), 0);
  const progress: GalleryProgress = { receivedBytes: 0, totalBytes, completedImages: 0, totalImages: roll.frames.length * kinds.length, phase: 'downloading' };
  const images: GalleryImageBytes[] = [];
  options.onProgress?.({ ...progress });
  for (const frame of roll.frames) for (const kind of kinds) {
    const before = progress.receivedBytes;
    progress.phase = 'downloading';
    const image = await downloadGalleryImage(frame[kind], { signal: options.signal, fetcher: options.fetcher,
      onBytes: bytes => { progress.receivedBytes = before + bytes; options.onProgress?.({ ...progress }); },
      onVerifying: () => { progress.phase = 'verifying'; options.onProgress?.({ ...progress }); } });
    images.push({ frameId: frame.id, kind, ...image });
    progress.completedImages++;
    options.onProgress?.({ ...progress });
  }
  return images;
}

export function createGalleryRuntime(roll: GalleryRoll, images: readonly GalleryImageBytes[]): GalleryRuntime {
  validateGalleryRoll(roll);
  const urls: string[] = [];
  let references = 1, disposed = false;
  const release = () => { if (--references === 0) urls.forEach(url => URL.revokeObjectURL(url)); };
  const imageUrl = (image: GalleryImageBytes) => {
    const url = URL.createObjectURL(new Blob([image.bytes], { type: image.mime }));
    urls.push(url); return url;
  };
  try {
    const layout = { ...formatLayout(roll.format), gap: FRAME_GAP_MM * FILM_UNIT };
    const frames = roll.frames.map((frame, index) => {
      const viewing = images.find(image => image.frameId === frame.id && image.kind === 'viewing');
      if (!viewing) throw new Error('This saved gallery revision is incomplete.');
      const thumbnail = images.find(image => image.frameId === frame.id && image.kind === 'thumbnail');
      const src = imageUrl(viewing), title = `${roll.name} · ${index + 1}`;
      return { id: frame.id, order: index + 1, src, thumbnailSrc: thumbnail ? imageUrl(thumbnail) : src, title, alt: title, aspectRatio: frame.width / frame.height, rotation: frame.rotation, cropPosition: frame.cropPosition, filmStrength: frame.filmStrength, sourceWidth: frame.width, sourceHeight: frame.height };
    });
    const definition: RollDefinition = {
      rollId: `gallery:${roll.id}:${roll.revision}`, label: `${roll.name} · ${rollFormatLabel(roll.format, roll.sizing)}`, frames,
      framesPerStrip: FILM_FORMATS[roll.format].perStrip, scale: FILM_RENDER_SCALE, fixture: false, imported: false, format: roll.format, layout,
      frameWidths: roll.sizing === 'free' ? roll.frames.map(frame => layout.frameHeight * frameAspect(roll.format, 'free', frame)) : undefined,
      stripLength: roll.sizing === 'free' ? 230 * FILM_UNIT : undefined,
      retainResources: () => {
        if (references === 0) throw new Error('This gallery view has already been released.');
        references++; let active = true;
        return () => { if (active) { active = false; release(); } };
      },
    };
    return { definition, stockId: roll.stockId, filmStrength: roll.filmStrength, dispose: () => { if (!disposed) { disposed = true; release(); } } };
  } catch (error) { urls.forEach(url => URL.revokeObjectURL(url)); throw error; }
}
export async function openLiveGalleryRoll(roll: GalleryRoll, options: GalleryDownloadOptions = {}): Promise<GalleryRuntime> {
  const snapshot = structuredClone(roll);
  return createGalleryRuntime(snapshot, await downloadGalleryRoll(snapshot, ['viewing'], options));
}
