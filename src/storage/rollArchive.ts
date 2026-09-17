import { imageHeader, IMPORT_LIMITS } from './importPhotos';
import { RollBundle, RollRepository, SavedView, validateBundle } from './rollRepository';

// Binary payloads avoid base64 expansion and preserve original bytes exactly.
// CRC32 detects accidental corruption and works at the old insecure HTTP origin.
const MAGIC = new TextEncoder().encode('DARKROOM-ROLLS-1\n');
export const ARCHIVE_LIMIT = 512 * 1024 * 1024;
const HEADER_LIMIT = 4 * 1024 * 1024;
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = (n & 1) ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function checksum(bytes: Uint8Array) {
  let n = 0xffffffff;
  for (const byte of bytes) n = crcTable[(n ^ byte) & 255] ^ (n >>> 8);
  return ((n ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}
function invalid(): never { throw new Error('Invalid or damaged Darkroom backup. No rolls were imported.'); }
const text = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 1024;
const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
function validView(v: SavedView) {
  const pan = (p: { x: number; z: number }) => p && finite(p.x) && finite(p.z);
  return v && text(v.frameId) && ['roll','strip','frame'].includes(v.level) && ['negative','positive'].includes(v.mode)
    && [v.brightness,v.magnification].every(finite) && (finite(v.zoom) || Number.isNaN(v.zoom)) && pan(v.pan)
    && (v.overview === null || (v.overview && finite(v.overview.zoom) && pan(v.overview.pan) && Number.isInteger(v.overview.frameIndex)));
}
function validateArchiveBundle(b: RollBundle) {
  if (!b || !b.roll || !Array.isArray(b.frames) || !Array.isArray(b.blobs)) invalid();
  const r = b.roll;
  if (!text(r.id) || !text(r.name) || !Array.isArray(r.frameIds) || !r.frameIds.every(text) || !text(r.coverId)
    || !finite(r.createdAt) || !finite(r.updatedAt) || !(r.trashedAt === null || finite(r.trashedAt))
    || (r.view !== undefined && !validView(r.view))) invalid();
  if (new Set(b.frames.map(f => f.id)).size !== b.frames.length) invalid();
  const keys = new Set<string>();
  for (const f of b.frames) {
    if (!f || ![f.id,f.rollId,f.filename,f.hash,f.originalKey,f.viewingKey,f.thumbnailKey].every(text)
      || !['image/jpeg','image/png'].includes(f.mime) || f.width * f.height > IMPORT_LIMITS.pixels) invalid();
    for (const key of [f.originalKey,f.viewingKey,f.thumbnailKey]) { if (keys.has(key)) invalid(); keys.add(key); }
  }
  if (b.blobs.length !== keys.size || new Set(b.blobs.map(x => x.key)).size !== keys.size
    || b.blobs.some(x => !keys.has(x.key) || !x.blob.size || !['image/jpeg','image/png'].includes(x.blob.type))) invalid();
  validateBundle(b);
}

export async function exportRolls(repository: RollRepository, ids: string[]): Promise<Blob> {
  if (!ids.length || new Set(ids).size !== ids.length) throw new Error('Choose at least one saved roll to export.');
  const rolls = [], payload: Blob[] = [];
  let size = 0;
  for (const id of ids) {
    const bundle = await repository.read(id, true);
    validateArchiveBundle(bundle);
    const blobs = [];
    for (const record of bundle.blobs) {
      size += record.blob.size;
      if (size > ARCHIVE_LIMIT - HEADER_LIMIT) throw new Error('Backup exceeds 512 MB. Export individual rolls from their Actions menu.');
      blobs.push({ key: record.key, size: record.blob.size, mime: record.blob.type, crc: checksum(new Uint8Array(await record.blob.arrayBuffer())) });
      payload.push(record.blob);
    }
    rolls.push({ roll: bundle.roll, frames: bundle.frames, blobs });
  }
  // An edited roll uses NaN zoom as a deliberate fit-to-frame sentinel.
  const header = new TextEncoder().encode(JSON.stringify({ version: 1, rolls }, (_, value) =>
    typeof value === 'number' && Number.isNaN(value) ? { darkroomNumber: 'NaN' } : value));
  if (header.length > HEADER_LIMIT) throw new Error('Backup metadata is too large. Export individual rolls.');
  const length = new Uint8Array(4); new DataView(length.buffer).setUint32(0, header.length);
  return new Blob([MAGIC, length, header, ...payload], { type: 'application/vnd.darkroom.rolls' });
}

export async function decodeArchive(file: Blob): Promise<RollBundle[]> {
  if (file.size > ARCHIVE_LIMIT || file.size < MAGIC.length + 4) invalid();
  const prefix = new Uint8Array(await file.slice(0, MAGIC.length + 4).arrayBuffer());
  if (!MAGIC.every((v, i) => prefix[i] === v)) invalid();
  const length = new DataView(prefix.buffer).getUint32(MAGIC.length);
  if (!length || length > HEADER_LIMIT || MAGIC.length + 4 + length > file.size) invalid();
  let parsed;
  try { parsed = JSON.parse(await file.slice(MAGIC.length + 4, MAGIC.length + 4 + length).text(), (_, v) =>
    v && typeof v === 'object' && Object.keys(v).length === 1 && v.darkroomNumber === 'NaN' ? NaN : v); } catch { invalid(); }
  if (parsed?.version !== 1 || !Array.isArray(parsed.rolls) || !parsed.rolls.length || parsed.rolls.length > 1000) invalid();
  let offset = MAGIC.length + 4 + length;
  const bundles: RollBundle[] = [], ids = new Set<string>();
  for (const entry of parsed.rolls) {
    if (!entry || !Array.isArray(entry.blobs) || entry.blobs.length > 3000 || ids.has(entry.roll?.id)) invalid();
    ids.add(entry.roll?.id);
    const blobs = [];
    for (const descriptor of entry.blobs) {
      if (!descriptor || !text(descriptor.key) || !Number.isSafeInteger(descriptor.size) || descriptor.size <= 0
        || offset + descriptor.size > file.size || !['image/jpeg','image/png'].includes(descriptor.mime)) invalid();
      const blob = file.slice(offset, offset + descriptor.size, descriptor.mime); offset += descriptor.size;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (checksum(bytes) !== descriptor.crc || blob.size > IMPORT_LIMITS.bytes) invalid();
      const header = imageHeader(bytes);
      if (header.mime !== descriptor.mime || !header.width || !header.height || header.width * header.height > IMPORT_LIMITS.pixels) invalid();
      blobs.push({ key: descriptor.key, blob });
    }
    const bundle = { roll: entry.roll, frames: entry.frames, blobs };
    validateArchiveBundle(bundle); bundles.push(bundle);
  }
  if (offset !== file.size) invalid();
  return bundles;
}
function newId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
}
export async function importRolls(repository: RollRepository, file: Blob): Promise<string[]> {
  const bundles = await decodeArchive(file);
  // Always import independent copies, including duplicate backups. No existing
  // roll/frame/blob key is reused, and add() is a final collision safeguard.
  const copies = bundles.map(b => {
    const id = newId(), frames = new Map(b.frames.map(f => [f.id, newId()]));
    const keys = new Map(b.blobs.map(x => [x.key, newId()]));
    return {
      roll: { ...b.roll, id, frameIds: b.roll.frameIds.map(x => frames.get(x)!), coverId: frames.get(b.roll.coverId)!,
        view: b.roll.view ? { ...b.roll.view, frameId: frames.get(b.roll.view.frameId) ?? b.roll.view.frameId } : undefined },
      frames: b.frames.map(f => ({ ...f, id: frames.get(f.id)!, rollId: id, originalKey: keys.get(f.originalKey)!, viewingKey: keys.get(f.viewingKey)!, thumbnailKey: keys.get(f.thumbnailKey)! })),
      blobs: b.blobs.map(x => ({ ...x, key: keys.get(x.key)! })),
    };
  });
  await repository.importNew(copies);
  return copies.map(b => b.roll.id);
}
