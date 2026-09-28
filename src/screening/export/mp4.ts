// Minimal ISO BMFF (MP4) writer for one H.264 video track from WebCodecs.
// M22.1 chose this in-repo writer over a muxer dependency: the maintained
// options were either deprecated (mp4-muxer, MIT) or large and MPL-licensed
// (Mediabunny). Screening needs only a single silent AVC track, fast-start
// layout and composition offsets, which fits in a few kilobytes.

export interface VideoChunk {
  type: 'key' | 'delta'; timestamp: number; duration: number | null; byteLength: number;
  copyTo(destination: Uint8Array): void;
}
export interface ChunkMetadata { decoderConfig?: { description?: AllowSharedBufferSource; colorSpace?: VideoColorSpaceInit } }

const text = new TextEncoder();
function bytes(size: number, write: (view: DataView) => void) { const out = new Uint8Array(size); write(new DataView(out.buffer)); return out; }
const u8 = (n: number) => new Uint8Array([n & 255]);
const u16 = (n: number) => bytes(2, v => v.setUint16(0, n));
const u32 = (n: number) => bytes(4, v => v.setUint32(0, n >>> 0));
const i32 = (n: number) => bytes(4, v => v.setInt32(0, n));
const zeros = (n: number) => new Uint8Array(n);
function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0; for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}
function box(type: string, ...parts: Uint8Array[]) {
  const body = concat(parts);
  return concat([u32(body.length + 8), text.encode(type), body]);
}
const fullBox = (type: string, version: number, flags: number, ...parts: Uint8Array[]) => box(type, u8(version), u8(flags >> 16), u16(flags & 0xffff), ...parts);
const MATRIX = concat([0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000].map(u32));

const PRIMARIES: Record<string, number> = { bt709: 1, bt470bg: 5, smpte170m: 6, bt2020: 9, smpte432: 12 };
const TRANSFER: Record<string, number> = { bt709: 1, smpte170m: 6, linear: 8, 'iec61966-2-1': 13, pq: 16, hlg: 18 };
const MATRIX_COEFFICIENTS: Record<string, number> = { rgb: 0, bt709: 1, bt470bg: 5, smpte170m: 6, 'bt2020-ncl': 9 };

function toBytes(source: AllowSharedBufferSource) {
  return source instanceof ArrayBuffer || (typeof SharedArrayBuffer !== 'undefined' && source instanceof SharedArrayBuffer)
    ? new Uint8Array(source.slice(0)) : new Uint8Array((source as ArrayBufferView).buffer.slice((source as ArrayBufferView).byteOffset, (source as ArrayBufferView).byteOffset + (source as ArrayBufferView).byteLength));
}

export class Mp4Writer {
  private samples: { data: Uint8Array; pts: number; key: boolean }[] = [];
  private description: Uint8Array | null = null;
  private colorSpace: VideoColorSpaceInit | undefined;
  private lastDuration = 0;
  readonly timescale = 90000;
  constructor(readonly width: number, readonly height: number) {}

  get sampleCount() { return this.samples.length; }
  get byteLength() { return this.samples.reduce((n, s) => n + s.data.length, 0); }

  add(chunk: VideoChunk, metadata?: ChunkMetadata) {
    if (metadata?.decoderConfig?.description) this.description = toBytes(metadata.decoderConfig.description);
    if (metadata?.decoderConfig?.colorSpace) this.colorSpace = metadata.decoderConfig.colorSpace;
    if (!this.samples.length && chunk.type !== 'key') throw new Error('The first video chunk must be a key frame.');
    const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
    this.samples.push({ data, pts: Math.round(chunk.timestamp * this.timescale / 1e6), key: chunk.type === 'key' });
    if (chunk.duration) this.lastDuration = Math.round(chunk.duration * this.timescale / 1e6);
  }

  finish(): Blob {
    if (!this.samples.length) throw new Error('No video frames were encoded.');
    if (!this.description) throw new Error('The encoder did not provide an AVC decoder configuration.');
    const n = this.samples.length, first = Math.min(...this.samples.map(s => s.pts));
    const pts = this.samples.map(s => s.pts - first);
    const sorted = [...pts].sort((a, b) => a - b);
    // Decode times are the sorted presentation times. Any B-frame reordering
    // becomes a non-negative composition offset, compensated by the edit list.
    const shift = Math.max(0, ...pts.map((p, i) => sorted[i] - p));
    const dts = sorted;
    const deltas = dts.map((d, i) => i + 1 < n ? dts[i + 1] - d : this.lastDuration || (n > 1 ? dts[n - 1] - dts[n - 2] : 3000));
    const mediaDuration = dts[n - 1] + deltas[n - 1];
    const movieDuration = Math.round(mediaDuration * 1000 / this.timescale);
    const runs = <T,>(values: T[]) => values.reduce<[number, T][]>((out, value) => { const last = out.at(-1); if (last && last[1] === value) last[0]++; else out.push([1, value]); return out; }, []);
    const offsets = pts.map((p, i) => p - dts[i] + shift);
    const cs = this.colorSpace ?? { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false };

    const stbl = (chunkOffset: number) => box('stbl',
      fullBox('stsd', 0, 0, u32(1), box('avc1', zeros(6), u16(1), zeros(16), u16(this.width), u16(this.height),
        u32(0x00480000), u32(0x00480000), u32(0), u16(1), zeros(32), u16(0x18), bytes(2, v => v.setInt16(0, -1)),
        box('avcC', this.description!),
        box('colr', text.encode('nclx'), u16(PRIMARIES[cs.primaries ?? ''] ?? 1), u16(TRANSFER[cs.transfer ?? ''] ?? 1), u16(MATRIX_COEFFICIENTS[cs.matrix ?? ''] ?? 1), u8(cs.fullRange ? 0x80 : 0)))),
      fullBox('stts', 0, 0, ...(() => { const r = runs(deltas); return [u32(r.length), ...r.flatMap(([count, delta]) => [u32(count), u32(delta)])]; })()),
      ...(offsets.some(o => o !== 0) ? [fullBox('ctts', 0, 0, ...(() => { const r = runs(offsets); return [u32(r.length), ...r.flatMap(([count, offset]) => [u32(count), u32(offset)])]; })())] : []),
      fullBox('stss', 0, 0, u32(this.samples.filter(s => s.key).length), ...this.samples.flatMap((s, i) => s.key ? [u32(i + 1)] : [])),
      fullBox('stsc', 0, 0, u32(1), u32(1), u32(n), u32(1)),
      fullBox('stsz', 0, 0, u32(0), u32(n), ...this.samples.map(s => u32(s.data.length))),
      fullBox('stco', 0, 0, u32(1), u32(chunkOffset)));
    const moov = (chunkOffset: number) => box('moov',
      fullBox('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(movieDuration), u32(0x00010000), u16(0x0100), zeros(10), MATRIX, zeros(24), u32(2)),
      box('trak',
        fullBox('tkhd', 0, 3, u32(0), u32(0), u32(1), u32(0), u32(movieDuration), zeros(8), u16(0), u16(0), u16(0), u16(0), MATRIX, u32(this.width * 65536), u32(this.height * 65536)),
        ...(shift ? [box('edts', fullBox('elst', 0, 0, u32(1), u32(movieDuration), u32(shift), i32(0x00010000)))] : []),
        box('mdia',
          fullBox('mdhd', 0, 0, u32(0), u32(0), u32(this.timescale), u32(mediaDuration), u16(0x55c4), u16(0)),
          fullBox('hdlr', 0, 0, u32(0), text.encode('vide'), zeros(12), text.encode('VideoHandler\0')),
          box('minf', fullBox('vmhd', 0, 1, zeros(8)), box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1))), stbl(chunkOffset)))));
    const ftyp = box('ftyp', text.encode('isom'), u32(512), text.encode('isomiso2avc1mp41'));
    const payload = this.byteLength;
    if (payload + 8 > 0xffffffff) throw new Error('The video is too large to save.');
    // Fast start: the index precedes the media, so playback can begin at once.
    const header = moov(0).length;
    const index = moov(ftyp.length + header + 8);
    return new Blob([ftyp, index, u32(payload + 8), text.encode('mdat'), ...this.samples.map(s => s.data)] as BlobPart[], { type: 'video/mp4' });
  }
}
