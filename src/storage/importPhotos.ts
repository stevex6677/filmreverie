import { BlobRecord, StoredFrame } from './rollRepository';
import { normalizeNativeImage } from './nativeImage';
import { FILM_LENGTH_MM, FRAME_GAP_MM } from '../data/filmFormats';
import { generateUuid } from './crypto';
import { processImage } from './processImage';
// Even zero-width frames cannot fit more advances than this. Actual capacity is measured after sizing.
export const IMPORT_LIMITS = { files: Math.ceil(FILM_LENGTH_MM['135'] / FRAME_GAP_MM), bytes: 40 * 1024 * 1024, pixels: 40_000_000, batchBytes: 300 * 1024 * 1024, viewingEdge: 2048, thumbnailEdge: 256, concurrency: 1 };
export interface DraftPhoto { id: string; filename: string; frame?: StoredFrame; blobs: BlobRecord[]; preview?: string; reviewPreview?: string; error?: string; notice?: string; duplicate: boolean; keepDuplicate: boolean }
export function naturalFiles(files: readonly File[]) { return files.map((file, index) => ({ file, index })).sort((a,b) => a.file.name.localeCompare(b.file.name, undefined, { numeric: true }) || a.index - b.index).map(x => x.file); }
export function imageHeader(bytes: Uint8Array): { mime: string; width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && bytes.slice(0,8).every((b,i) => b === [137,80,78,71,13,10,26,10][i])) return { mime: 'image/png', width: view.getUint32(16), height: view.getUint32(20) };
  if (bytes[0] === 255 && bytes[1] === 216) {
    let i = 2;
    while (i + 8 < bytes.length) {
      if (bytes[i++] !== 255) continue;
      const marker = bytes[i++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0xff || marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
      const length = view.getUint16(i);
      if (length < 2) break;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) return { mime: 'image/jpeg', height: view.getUint16(i+3), width: view.getUint16(i+5) };
      i += length;
    }
  }
  throw new Error('Unreadable or unsupported file. Choose a JPEG or PNG positive scan.');
}
export async function processPhotos(files: readonly File[], rollId: string, signal: AbortSignal, progress: (done: number, total: number) => void, existing: readonly DraftPhoto[] = []): Promise<DraftPhoto[]> {
  if (!files.length || files.length + existing.length > IMPORT_LIMITS.files) throw new Error(`Choose between 1 and ${IMPORT_LIMITS.files} photographs per draft; the final limit depends on film length.`);
  if (files.reduce((sum,f) => sum + f.size,0) + existing.reduce((sum,p)=>sum+(p.blobs.find(b=>b.key===p.frame?.originalKey)?.blob.size??0),0) > IMPORT_LIMITS.batchBytes) throw new Error('This draft would exceed 300 MB. Choose a smaller batch.');
  const photos: DraftPhoto[] = [], hashes = new Set<string>(existing.flatMap(p=>p.frame?[p.frame.hash]:[]));
  try {
    for (const file of naturalFiles(files)) {
      signal.throwIfAborted();
      const id = generateUuid(), photo: DraftPhoto = { id, filename: file.name, blobs: [], duplicate: false, keepDuplicate: false };
      try {
        if (file.size > IMPORT_LIMITS.bytes) throw new Error('File exceeds the 40 MB limit.');
        const inputBytes = new Uint8Array(await file.arrayBuffer());
        const normalized = await normalizeNativeImage(file,inputBytes,signal);
        const source=normalized.file;
        photo.notice=normalized.notice;photo.filename=source.name;
        const bytes = source===file?inputBytes:new Uint8Array(await source.arrayBuffer()), header = imageHeader(bytes);
        if (!header.width || !header.height || header.width * header.height > IMPORT_LIMITS.pixels) throw new Error('Image exceeds the 40 megapixel limit or has invalid dimensions.');
        const original = new Blob([bytes], { type: header.mime });
        const { hash, width, height, viewing, thumbnail } = await processImage(original, signal);
        signal.throwIfAborted();
        photo.frame = { id, rollId, filename: source.name, mime: header.mime, width, height, rotation: 0, hash, originalKey: `${id}:original`, viewingKey: `${id}:view`, thumbnailKey: `${id}:thumb` };
        photo.blobs = [{ key: photo.frame.originalKey, blob: original }, { key: photo.frame.viewingKey, blob: viewing }, { key: photo.frame.thumbnailKey, blob: thumbnail }];
        photo.preview = URL.createObjectURL(thumbnail); photo.reviewPreview = URL.createObjectURL(viewing); photo.duplicate = hashes.has(hash); hashes.add(hash);
      } catch (error) { if (signal.aborted) throw error; photo.error = error instanceof Error ? error.message : 'Cannot decode this image.'; }
      photos.push(photo); progress(photos.length, files.length);
    }
    signal.throwIfAborted(); return photos;
  } catch (error) { releaseDraft(photos); throw error; }
}
export function releaseDraft(photos: readonly DraftPhoto[]) { photos.forEach(p => { if (p.preview) URL.revokeObjectURL(p.preview); if(p.reviewPreview) URL.revokeObjectURL(p.reviewPreview); }); }
