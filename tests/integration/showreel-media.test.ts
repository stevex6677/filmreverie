import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { aacConfig, Mp4Writer, type VideoChunk } from '../../src/screening/export/mp4';
import { parseBoxes, type Mp4Box } from '../helpers/mp4';
import { soundtrackGain, trackOffset } from '../../src/showreel/music';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, SHOWREEL_TRACKS } from '../../src/showreel/settings';
import { createShowreelTimeline } from '../../src/showreel/timeline';
import { SHOWREEL_ROLLS } from '../../src/showreel/rolls';
import music from '../../src/data/showreelMusic.json' with { type: 'json' };

const root = path.resolve(__dirname, '../..');
const video = (index: number): VideoChunk => ({ type: index ? 'delta' : 'key', timestamp: Math.round(index * 1e6 / 30), duration: Math.round(1e6 / 30), byteLength: 12, copyTo: dest => dest.set(new Uint8Array(12).fill(index + 1)) });
const description = new Uint8Array([1, 0x42, 0xc0, 0x1f, 0xff, 0xe1, 0, 4, 0x67, 0x42, 0xc0, 0x1f, 1, 0, 2, 0x68, 0xce]);
const all = (boxes: Mp4Box[]): Mp4Box[] => boxes.flatMap(box => [box, ...all(box.children)]);
const text = (box: Mp4Box, from: number, length: number) => String.fromCharCode(...Array.from({ length }, (_, i) => box.body.getUint8(from + i)));

describe('MP4 writer with a soundtrack', () => {
  it('adds an AAC track after the video samples, with its own sample table', async () => {
    const writer = new Mp4Writer(1920, 1080);
    for (let i = 0; i < 60; i++) writer.add(video(i), i ? undefined : { decoderConfig: { description } });
    writer.setAudio({ codec: 'aac', sampleRate: 48000, channels: 2, bitrate: 192000 });
    for (let i = 0; i < 94; i++) writer.addAudio({ timestamp: Math.round(i * 1024 * 1e6 / 48000), duration: Math.round(1024 * 1e6 / 48000), byteLength: 5, copyTo: dest => dest.set([200, 201, 202, 203, 204]) },
      i ? undefined : { decoderConfig: { description: aacConfig(48000, 2) } });
    const bytes = new Uint8Array(await writer.finish().arrayBuffer());
    const top = parseBoxes(new DataView(bytes.buffer)), boxes = all(top);
    expect(top.map(box => box.type)).toEqual(['ftyp', 'moov', 'mdat']);
    const traks = top[1].children.filter(box => box.type === 'trak');
    expect(traks).toHaveLength(2);
    const handlers = boxes.filter(box => box.type === 'hdlr').map(box => text(box, 8, 4));
    expect(handlers).toEqual(['vide', 'soun']);
    const stsd = boxes.filter(box => box.type === 'stsd').map(box => text(box, 12, 4));
    expect(stsd).toEqual(['avc1', 'mp4a']);
    // The AAC-LC config (48 kHz stereo) is in the esds decoder-specific info.
    expect(Array.from(bytes).join(',')).toContain([0x05, 0x80, 0x80, 0x80, 2, 0x11, 0x90].join(','));
    const mvhd = top[1].children.find(box => box.type === 'mvhd')!;
    expect(mvhd.body.getUint32(96)).toBe(3);
    // Audio media time: 94 frames of 1024 samples at 48 kHz.
    const mdhd = all(traks[1].children).find(box => box.type === 'mdhd')!;
    expect([mdhd.body.getUint32(12), mdhd.body.getUint32(16)]).toEqual([48000, 94 * 1024]);
    // Chunk offsets: the audio chunk begins right after the video samples in mdat.
    const [videoOffset, audioOffset] = boxes.filter(box => box.type === 'stco').map(box => box.body.getUint32(8));
    expect(audioOffset - videoOffset).toBe(60 * 12);
    expect(bytes[audioOffset]).toBe(200);
    const mdat = top[2];
    expect(mdat.size - 8).toBe(60 * 12 + 94 * 5);
  });

  it('writes the same silent file when no audio is added', async () => {
    const write = async (withAudio: boolean) => {
      const writer = new Mp4Writer(640, 360);
      for (let i = 0; i < 10; i++) writer.add(video(i), i ? undefined : { decoderConfig: { description } });
      if (withAudio) { writer.setAudio({ codec: 'aac', sampleRate: 48000, channels: 2, bitrate: 1 }); writer.dropAudio(); }
      return new Uint8Array(await writer.finish().arrayBuffer());
    };
    expect(await write(true)).toEqual(await write(false));
  });

  it('describes AAC-LC as AudioSpecificConfig', () => {
    expect(Array.from(aacConfig(48000, 2))).toEqual([0x11, 0x90]);
    expect(Array.from(aacConfig(44100, 1))).toEqual([0x12, 0x08]);
    expect(() => aacConfig(7000, 2)).toThrow();
  });
});

describe('Showreel soundtrack', () => {
  const timeline = createShowreelTimeline(SHOWREEL_ROLLS);
  it('aligns later musical cues without delaying tracks with early cues', () => {
    expect(timeline.cue).toBe(timeline.shots.find(shot => shot.name === 'darkroom')!.start);
    for (const track of SHOWREEL_TRACKS) {
      if (track.drop >= timeline.cue) expect(trackOffset(track, timeline.cue) + timeline.cue).toBeCloseTo(track.drop, 9);
      else expect(trackOffset(track, timeline.cue)).toBe(0);
    }
    for (const id of ['dream-pop', 'autumn']) {
      const track = SHOWREEL_TRACKS.find(track => track.id === id)!;
      expect(trackOffset(track, timeline.cue), `${id} must play during the opening`).toBe(0);
    }
  });

  it('fades in, holds the chosen volume and fades out to the last frame', () => {
    const d = timeline.duration;
    expect(soundtrackGain(0, d, .8)).toBe(0);
    expect(soundtrackGain(10, d, .8)).toBeCloseTo(.8, 9);
    expect(soundtrackGain(d - 1, d, .8)).toBeGreaterThan(0);
    expect(soundtrackGain(d - 1, d, .8)).toBeLessThan(.8);
    expect(soundtrackGain(d, d, .8)).toBe(0);
  });

  it('bundles CC0 excerpts long enough for the film', () => {
    const d = timeline.duration;
    for (const track of music.tracks) {
      expect(track.source.license).toBe('CC0');
      expect(track.source.sha256).toMatch(/^[0-9a-f]{64}$/);
      const file = path.join(root, 'public', track.src);
      expect(fs.existsSync(file), file).toBe(true);
      // Published excerpts are 110 s, 192 kbps: they cover the film after the offset.
      expect(trackOffset(track, timeline.cue) + d).toBeLessThan(110);
      expect(fs.statSync(file).size).toBeGreaterThan(1e6);
    }
    expect(SHOWREEL_TRACKS.some(track => track.id === music.default)).toBe(true);
  });
});

describe('Showreel settings', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  const storage = () => { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } }; };
  it('default to the reviewed look and remember changes', () => {
    vi.stubGlobal('localStorage', storage());
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    saveSettings({ ...DEFAULT_SETTINGS, grain: .9, music: 'none', resolution: '720p', titles: false });
    expect(loadSettings()).toMatchObject({ grain: .9, music: 'none', resolution: '720p', titles: false });
  });
  it('replace invalid values with defaults', () => {
    vi.stubGlobal('localStorage', storage());
    localStorage.setItem('film-reverie-showreel-settings', JSON.stringify({ grain: 7, vignette: 'x', music: 'unknown', resolution: '4k', volume: -1 }));
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, grain: 1, volume: 0 });
  });
});
