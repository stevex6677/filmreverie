// Minimal ISO BMFF (MP4) writer for one H.264 video track from WebCodecs,
// with an optional AAC or Opus audio track (the showreel's soundtrack).
// M22.1 chose this in-repo writer over a muxer dependency: the maintained
// options were either deprecated (mp4-muxer, MIT) or large and MPL-licensed
// (Mediabunny). Screening needs only a single silent AVC track, fast-start
// layout and composition offsets, which fits in a few kilobytes.

export interface VideoChunk {
  type: 'key' | 'delta'; timestamp: number; duration: number | null; byteLength: number;
  copyTo(destination: Uint8Array): void;
}
export interface ChunkMetadata { decoderConfig?: { description?: AllowSharedBufferSource; colorSpace?: VideoColorSpaceInit } }
export type AudioChunk = Omit<VideoChunk, 'type'>;
export interface AudioTrack { codec: 'aac' | 'opus'; sampleRate: number; channels: number; bitrate: number }

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
/** MPEG-4 descriptor (ISO 14496-1) with a four-byte size, as in esds. */
function descriptor(tag: number, ...parts: Uint8Array[]) {
  const body = concat(parts), n = body.length;
  return concat([u8(tag), new Uint8Array([0x80 | (n >> 21) & 0x7f, 0x80 | (n >> 14) & 0x7f, 0x80 | (n >> 7) & 0x7f, n & 0x7f]), body]);
}
/** AudioSpecificConfig for AAC-LC, when the encoder supplies none. */
export function aacConfig(sampleRate: number, channels: number) {
  const index = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000].indexOf(sampleRate);
  if (index < 0) throw new Error(`Unsupported AAC sample rate ${sampleRate}.`);
  return new Uint8Array([2 << 3 | index >> 1, (index & 1) << 7 | channels << 3]);
}
/**
 * The AudioSpecificConfig in an AAC encoder's description. Chrome supplies it
 * bare; WebKit (Safari, and every iPad browser) supplies a whole MPEG-4
 * ES_Descriptor (an esds payload) around it. Writing that wrapper as the config
 * leaves players unable to decode the track, so the video plays silent.
 */
export function aacSpecificConfig(description: Uint8Array): Uint8Array | null {
  if (description[0] !== 3) return description;
  const read = (at: number, end: number): Uint8Array | null => {
    while (at + 2 <= end) {
      const tag = description[at++];
      let length = 0, byte = 0x80;
      for (let i = 0; i < 4 && byte & 0x80 && at < end; i++) { byte = description[at++]; length = length << 7 | byte & 0x7f; }
      const body = at, next = Math.min(end, at + length);
      if (tag === 5) return description.slice(body, next);
      if (tag === 3) {
        // ES_ID, then flags for an optional dependency, URL and OCR stream.
        const flags = description[body + 2];
        let inner = body + 3;
        if (flags & 0x80) inner += 2;
        if (flags & 0x40) inner += 1 + description[inner];
        if (flags & 0x20) inner += 2;
        const found = read(inner, next); if (found) return found;
      } else if (tag === 4) { const found = read(body + 13, next); if (found) return found; }
      at = next;
    }
    return null;
  };
  return read(0, description.length);
}
const MATRIX = concat([0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000].map(u32));

const PRIMARIES: Record<string, number> = { bt709: 1, bt470bg: 5, smpte170m: 6, bt2020: 9, smpte432: 12 };
const TRANSFER: Record<string, number> = { bt709: 1, smpte170m: 6, linear: 8, 'iec61966-2-1': 13, pq: 16, hlg: 18 };
const MATRIX_COEFFICIENTS: Record<string, number> = { rgb: 0, bt709: 1, bt470bg: 5, smpte170m: 6, 'bt2020-ncl': 9 };

function toBytes(source: AllowSharedBufferSource) {
  return source instanceof ArrayBuffer || (typeof SharedArrayBuffer !== 'undefined' && source instanceof SharedArrayBuffer)
    ? new Uint8Array(source.slice(0)) : new Uint8Array((source as ArrayBufferView).buffer.slice((source as ArrayBufferView).byteOffset, (source as ArrayBufferView).byteOffset + (source as ArrayBufferView).byteLength));
}

/** Split an Annex B byte stream (start-code delimited) into NAL units. */
export function annexBUnits(data: Uint8Array): Uint8Array[] {
  const starts: { at: number; size: number }[] = [];
  for (let i = 0; i + 3 <= data.length; i++) {
    if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1) { starts.push({ at: i + 3, size: i > 0 && data[i - 1] === 0 ? 4 : 3 }); i += 2; }
  }
  return starts.map((start, n) => data.subarray(start.at, n + 1 < starts.length ? starts[n + 1].at - starts[n + 1].size : data.length)).filter(unit => unit.length);
}
export const isAnnexB = (data: Uint8Array) => data.length > 4 && data[0] === 0 && data[1] === 0 && (data[2] === 1 || (data[2] === 0 && data[3] === 1));

/** AVCDecoderConfigurationRecord from one SPS and one PPS. */
export function avcDecoderConfig(sps: Uint8Array, pps: Uint8Array) {
  const profile = sps[1], high = [100, 110, 122, 144].includes(profile);
  return concat([new Uint8Array([1, profile, sps[2], sps[3], 0xff, 0xe1]), u16(sps.length), sps, u8(1), u16(pps.length), pps,
    // High profiles carry chroma format and bit depths (4:2:0, 8-bit), with no SPS extensions.
    ...(high ? [new Uint8Array([0xfc | 1, 0xf8, 0xf8, 0])] : [])]);
}

export class Mp4Writer {
  private samples: { data: Uint8Array; pts: number; key: boolean }[] = [];
  private description: Uint8Array | null = null;
  private colorSpace: VideoColorSpaceInit | undefined;
  private lastDuration = 0;
  /** Decided on the first chunk: WebCodecs avcC output, or Annex B to convert. */
  private annexB: boolean | null = null;
  private audio: { track: AudioTrack; description: Uint8Array | null; samples: { data: Uint8Array; duration: number }[] } | null = null;
  readonly timescale = 90000;
  constructor(readonly width: number, readonly height: number) {}

  get sampleCount() { return this.samples.length; }
  get byteLength() { return this.samples.reduce((n, s) => n + s.data.length, 0); }

  /** Starts an audio track; encoded chunks follow through addAudio, in order. */
  setAudio(track: AudioTrack) { this.audio = { track, description: null, samples: [] }; }
  dropAudio() { this.audio = null; }
  addAudio(chunk: AudioChunk, metadata?: ChunkMetadata) {
    if (!this.audio) throw new Error('Set the audio track before adding audio.');
    if (metadata?.decoderConfig?.description) this.audio.description = toBytes(metadata.decoderConfig.description);
    const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
    const rate = this.audio.track.sampleRate;
    this.audio.samples.push({ data, duration: Math.round((chunk.duration ?? (this.audio.track.codec === 'aac' ? 1024 : 960) * 1e6 / rate) * rate / 1e6) });
  }

  add(chunk: VideoChunk, metadata?: ChunkMetadata) {
    if (metadata?.decoderConfig?.description) this.description = toBytes(metadata.decoderConfig.description);
    if (metadata?.decoderConfig?.colorSpace) this.colorSpace = metadata.decoderConfig.colorSpace;
    if (!this.samples.length && chunk.type !== 'key') throw new Error('The first video chunk must be a key frame.');
    let data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
    // A 256–511 byte length-prefixed unit also starts 00 00 01, so decide once.
    if (this.annexB === null) this.annexB = !this.description && isAnnexB(data);
    // Some encoders (WebKit among them) may emit Annex B with in-band parameter
    // sets instead of avcC. Build the record from them and store length-prefixed
    // NAL units without the parameter sets or access unit delimiters.
    if (this.annexB) {
      const units = annexBUnits(data), type = (unit: Uint8Array) => unit[0] & 0x1f;
      const sps = units.find(unit => type(unit) === 7), pps = units.find(unit => type(unit) === 8);
      if (!this.description && sps && pps) this.description = avcDecoderConfig(sps, pps);
      data = concat(units.filter(unit => ![7, 8, 9].includes(type(unit))).flatMap(unit => [u32(unit.length), unit]));
    }
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
    // An audio track, when present, follows all video samples in mdat as one chunk.
    const audio = this.audio?.samples.length ? this.audio : null;
    const audioMs = audio ? Math.round(audio.samples.reduce((n, s) => n + s.duration, 0) * 1000 / audio.track.sampleRate) : 0;
    const moov = (chunkOffset: number) => box('moov',
      fullBox('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(Math.max(movieDuration, audioMs)), u32(0x00010000), u16(0x0100), zeros(10), MATRIX, zeros(24), u32(audio ? 3 : 2)),
      box('trak',
        fullBox('tkhd', 0, 3, u32(0), u32(0), u32(1), u32(0), u32(movieDuration), zeros(8), u16(0), u16(0), u16(0), u16(0), MATRIX, u32(this.width * 65536), u32(this.height * 65536)),
        ...(shift ? [box('edts', fullBox('elst', 0, 0, u32(1), u32(movieDuration), u32(shift), i32(0x00010000)))] : []),
        box('mdia',
          fullBox('mdhd', 0, 0, u32(0), u32(0), u32(this.timescale), u32(mediaDuration), u16(0x55c4), u16(0)),
          fullBox('hdlr', 0, 0, u32(0), text.encode('vide'), zeros(12), text.encode('VideoHandler\0')),
          box('minf', fullBox('vmhd', 0, 1, zeros(8)), box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1))), stbl(chunkOffset)))),
      ...(audio ? [this.audioTrak(audio, chunkOffset + this.byteLength)] : []));
    const ftyp = box('ftyp', text.encode('isom'), u32(512), text.encode('isomiso2avc1mp41'));
    const payload = this.byteLength + (audio ? audio.samples.reduce((n, s) => n + s.data.length, 0) : 0);
    if (payload + 8 > 0xffffffff) throw new Error('The video is too large to save.');
    // Fast start: the index precedes the media, so playback can begin at once.
    const header = moov(0).length;
    const index = moov(ftyp.length + header + 8);
    return new Blob([ftyp, index, u32(payload + 8), text.encode('mdat'), ...this.samples.map(s => s.data), ...(audio ? audio.samples.map(s => s.data) : [])] as BlobPart[], { type: 'video/mp4' });
  }

  private audioTrak(audio: NonNullable<Mp4Writer['audio']>, chunkOffset: number) {
    const { track, samples } = audio, rate = track.sampleRate, n = samples.length;
    const mediaDuration = samples.reduce((sum, s) => sum + s.duration, 0);
    const movieDuration = Math.round(mediaDuration * 1000 / rate);
    const runs = samples.reduce<[number, number][]>((out, s) => { const last = out.at(-1); if (last && last[1] === s.duration) last[0]++; else out.push([1, s.duration]); return out; }, []);
    const fields = [zeros(6), u16(1), zeros(8), u16(track.channels), u16(16), u16(0), u16(0), u32(rate * 65536)];
    let entry: Uint8Array;
    if (track.codec === 'aac') {
      const config = (audio.description && aacSpecificConfig(audio.description)) ?? aacConfig(rate, track.channels);
      entry = box('mp4a', ...fields, fullBox('esds', 0, 0, descriptor(3, u16(2), u8(0),
        descriptor(4, u8(0x40), u8(0x15), zeros(3), u32(track.bitrate), u32(track.bitrate), descriptor(5, config)),
        descriptor(6, u8(2)))));
    } else {
      // An OpusHead description carries the encoder's pre-skip (little-endian).
      const head = audio.description, preSkip = head && head.length >= 12 && text.encode('OpusHead').every((c, i) => head[i] === c) ? head[10] | head[11] << 8 : 312;
      entry = box('Opus', ...fields, box('dOps', u8(0), u8(track.channels), u16(preSkip), u32(rate), u16(0), u8(0)));
    }
    return box('trak',
      fullBox('tkhd', 0, 3, u32(0), u32(0), u32(2), u32(0), u32(movieDuration), zeros(8), u16(0), u16(0), u16(0x0100), u16(0), MATRIX, u32(0), u32(0)),
      box('mdia',
        fullBox('mdhd', 0, 0, u32(0), u32(0), u32(rate), u32(mediaDuration), u16(0x55c4), u16(0)),
        fullBox('hdlr', 0, 0, u32(0), text.encode('soun'), zeros(12), text.encode('SoundHandler\0')),
        box('minf', fullBox('smhd', 0, 0, u16(0), u16(0)), box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1))),
          box('stbl', fullBox('stsd', 0, 0, u32(1), entry),
            fullBox('stts', 0, 0, u32(runs.length), ...runs.flatMap(([count, delta]) => [u32(count), u32(delta)])),
            fullBox('stsc', 0, 0, u32(1), u32(1), u32(n), u32(1)),
            fullBox('stsz', 0, 0, u32(0), u32(n), ...samples.map(s => u32(s.data.length))),
            fullBox('stco', 0, 0, u32(1), u32(chunkOffset))))));
  }
}
