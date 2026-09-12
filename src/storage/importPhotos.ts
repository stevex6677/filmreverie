import { BlobRecord, StoredFrame } from './rollRepository';
import { normalizeNativeImage } from './nativeImage';
export const IMPORT_LIMITS = { files: 72, bytes: 40 * 1024 * 1024, pixels: 40_000_000, batchBytes: 300 * 1024 * 1024, viewingEdge: 2048, thumbnailEdge: 256, concurrency: 1 };
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
function canvasBlob(canvas: HTMLCanvasElement) { return new Promise<Blob>((resolve,reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image conversion failed.')), 'image/jpeg', .92)); }
async function derivative(bitmap: ImageBitmap, edge: number) {
  const ratio = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Image processing is unavailable.');
  ctx.fillStyle = '#000'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  try { return await canvasBlob(canvas); } finally { canvas.width = canvas.height = 1; }
}
export async function processPhotos(files: readonly File[], rollId: string, signal: AbortSignal, progress: (done: number, total: number) => void, existing: readonly DraftPhoto[] = []): Promise<DraftPhoto[]> {
  if(!crypto.subtle)throw new Error('Photo import needs a secure connection. Open the HTTPS preview address and try again.');
  if (!files.length || files.length + existing.length > IMPORT_LIMITS.files) throw new Error('Choose between 1 and 72 photographs per import.');
  if (files.reduce((sum,f) => sum + f.size,0) + existing.reduce((sum,p)=>sum+(p.blobs.find(b=>b.key===p.frame?.originalKey)?.blob.size??0),0) > IMPORT_LIMITS.batchBytes) throw new Error('This draft would exceed 300 MB. Choose a smaller batch.');
  const photos: DraftPhoto[] = [], hashes = new Set<string>(existing.flatMap(p=>p.frame?[p.frame.hash]:[]));
  try {
    for (const file of naturalFiles(files)) {
      signal.throwIfAborted();
      const id = crypto.randomUUID(), photo: DraftPhoto = { id, filename: file.name, blobs: [], duplicate: false, keepDuplicate: false };
      try {
        if (file.size > IMPORT_LIMITS.bytes) throw new Error('File exceeds the 40 MB limit.');
        const inputBytes = new Uint8Array(await file.arrayBuffer());
        const normalized = await normalizeNativeImage(file,inputBytes,signal);
        const source=normalized.file;
        photo.notice=normalized.notice;photo.filename=source.name;
        const bytes = source===file?inputBytes:new Uint8Array(await source.arrayBuffer()), header = imageHeader(bytes);
        if (!header.width || !header.height || header.width * header.height > IMPORT_LIMITS.pixels) throw new Error('Image exceeds the 40 megapixel limit or has invalid dimensions.');
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b => b.toString(16).padStart(2,'0')).join('');
        // Chrome applies EXIF orientation here once. Derived JPEGs contain no EXIF orientation.
        const bitmap = await createImageBitmap(new Blob([bytes], { type: header.mime }), { imageOrientation: 'from-image' });
        try {
          signal.throwIfAborted();
          const viewing = await derivative(bitmap, IMPORT_LIMITS.viewingEdge), thumbnail = await derivative(bitmap, IMPORT_LIMITS.thumbnailEdge);
          photo.frame = { id, rollId, filename: source.name, mime: header.mime, width: bitmap.width, height: bitmap.height, rotation: 0, hash, originalKey: `${id}:original`, viewingKey: `${id}:view`, thumbnailKey: `${id}:thumb` };
          // Store self-contained original bytes, independent of the picker handle.
          photo.blobs = [{ key: photo.frame.originalKey, blob: new Blob([bytes], {type:header.mime}) }, { key: photo.frame.viewingKey, blob: viewing }, { key: photo.frame.thumbnailKey, blob: thumbnail }];
          photo.preview = URL.createObjectURL(thumbnail); photo.reviewPreview = URL.createObjectURL(viewing); photo.duplicate = hashes.has(hash); hashes.add(hash);
        } finally { bitmap.close(); }
      } catch (error) { if (signal.aborted) throw error; photo.error = error instanceof Error ? error.message : 'Cannot decode this image.'; }
      photos.push(photo); progress(photos.length, files.length);
    }
    signal.throwIfAborted(); return photos;
  } catch (error) { releaseDraft(photos); throw error; }
}
export function releaseDraft(photos: readonly DraftPhoto[]) { photos.forEach(p => { if (p.preview) URL.revokeObjectURL(p.preview); if(p.reviewPreview) URL.revokeObjectURL(p.reviewPreview); }); }
