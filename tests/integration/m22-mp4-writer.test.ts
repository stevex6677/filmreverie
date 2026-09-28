import { describe, expect, it } from 'vitest';
import { Mp4Writer, type VideoChunk } from '../../src/screening/export/mp4';
import { readMp4 } from '../helpers/mp4';

const chunk = (index: number, pts: number, key: boolean, size = 10 + index): VideoChunk => {
  const data = new Uint8Array(size).fill(index + 1);
  return { type: key ? 'key' : 'delta', timestamp: Math.round(pts * 1e6 / 30), duration: Math.round(1e6 / 30), byteLength: size, copyTo: dest => dest.set(data) };
};
const description = new Uint8Array([1, 0x42, 0xc0, 0x1f, 0xff, 0xe1, 0, 4, 0x67, 0x42, 0xc0, 0x1f, 1, 0, 2, 0x68, 0xce]);

describe('M22 MP4 writer', () => {
  it('writes a fast-start, silent H.264 track with exact dimensions, frame rate, duration and samples', async () => {
    const writer = new Mp4Writer(1280, 720);
    for (let i = 0; i < 90; i++) writer.add(chunk(i, i, i % 60 === 0), i === 0 ? { decoderConfig: { description } } : undefined);
    const bytes = new Uint8Array(await writer.finish().arrayBuffer());
    const mp4 = readMp4(bytes);
    expect(mp4.order).toEqual(['ftyp', 'moov', 'mdat']);
    expect(mp4.sampleEntry).toBe('avc1'); expect(mp4.hasAvcC).toBe(true);
    expect([mp4.width, mp4.height]).toEqual([1280, 720]);
    expect(mp4.stts).toEqual([[90, mp4.timescale / 30]]);
    expect(mp4.duration / mp4.timescale).toBeCloseTo(3, 6);
    expect(mp4.movieDuration / mp4.movieTimescale).toBeCloseTo(3, 3);
    expect(mp4.keyframes).toEqual([1, 61]);
    expect(mp4.ctts).toEqual([]); expect(mp4.editMediaTime).toBeNull();
    expect(mp4.sizes).toEqual(Array.from({ length: 90 }, (_, i) => 10 + i));
    expect(mp4.chunkOffset).toBe(mp4.mdatData);
    expect(mp4.mdatSize).toBe(mp4.sizes.reduce((a, b) => a + b, 0));
    expect(bytes[mp4.chunkOffset]).toBe(1); expect(bytes[mp4.chunkOffset + 10]).toBe(2);
  });

  it('keeps reordered B-frames presentable with composition offsets and an edit list', async () => {
    const writer = new Mp4Writer(720, 1280);
    [[0, true], [3, false], [1, false], [2, false], [6, false], [4, false], [5, false]].forEach(([pts, key], i) => writer.add(chunk(i, pts as number, key as boolean), i === 0 ? { decoderConfig: { description } } : undefined));
    const mp4 = readMp4(new Uint8Array(await writer.finish().arrayBuffer()));
    const delta = mp4.timescale / 30;
    expect([mp4.width, mp4.height]).toEqual([720, 1280]);
    expect(mp4.stts).toEqual([[7, delta]]);
    const offsets = mp4.ctts.flatMap(([count, offset]) => Array(count).fill(offset / delta));
    const decode = [0, 1, 2, 3, 4, 5, 6], presented = decode.map((d, i) => d + offsets[i] - mp4.editMediaTime! / delta);
    expect(presented).toEqual([0, 3, 1, 2, 6, 4, 5]);
    expect(Math.min(...offsets)).toBeGreaterThanOrEqual(0);
  });

  it('rejects streams without a leading key frame or decoder configuration', () => {
    expect(() => new Mp4Writer(2, 2).add(chunk(0, 0, false))).toThrow(/key frame/);
    const writer = new Mp4Writer(2, 2); writer.add(chunk(0, 0, true));
    expect(() => writer.finish()).toThrow(/decoder configuration/);
    expect(() => new Mp4Writer(2, 2).finish()).toThrow(/No video/);
  });
});
