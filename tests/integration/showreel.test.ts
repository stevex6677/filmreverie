import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SHOWREEL_ROLLS } from '../../src/showreel/rolls';
import { createShowreelTimeline, SHOWREEL_GITHUB, SHOWREEL_SITE } from '../../src/showreel/timeline';
import { poseEye } from '../../src/screening/timeline';
import { ROOM_ENVELOPE } from '../../src/utils/cameraBounds';
import manifest from '../../src/data/showreelRolls.json' with { type: 'json' };

const root = path.resolve(__dirname, '../..');
const timeline = createShowreelTimeline(SHOWREEL_ROLLS);
const every = (step: number) => Array.from({ length: Math.floor(timeline.duration / step) + 1 }, (_, i) => timeline.sample(i * step));

describe('Showreel', () => {
  it('runs about a minute as a deterministic function of time', () => {
    expect(timeline.duration).toBeGreaterThan(57);
    expect(timeline.duration).toBeLessThan(63);
    const again = createShowreelTimeline(SHOWREEL_ROLLS);
    expect(every(.37)).toEqual(Array.from({ length: Math.floor(again.duration / .37) + 1 }, (_, i) => again.sample(i * .37)));
    expect(timeline.sample(-3)).toEqual(timeline.sample(0));
    expect(timeline.sample(timeline.duration + 5)).toEqual(timeline.sample(timeline.duration));
  });

  it('visits the darkroom, film shelf, light table reels and camera cabinet with both sample rolls', () => {
    expect(timeline.shots.map(shot => shot.name)).toEqual(['hook', 'darkroom', 'shelf', 'tracking', 'loupe', 'orbit', 'documentary', 'drying', 'projector', 'cabinet']);
    let end = 0;
    for (const shot of timeline.shots) { expect(shot.start).toBeCloseTo(end, 6); expect(shot.duration).toBeGreaterThan(2); end = shot.start + shot.duration; }
    expect(end).toBeCloseTo(timeline.duration, 6);
    expect(new Set(timeline.shots.map(shot => shot.roll))).toEqual(new Set([0, 1]));
    // Five existing reels appear as excerpts.
    expect(timeline.shots.filter(shot => shot.source.reel !== 'darkroom').map(shot => shot.source.reel)).toEqual(['tracking', 'orbit', 'documentary', 'drying-line', 'projector']);
    // The corner slate names the roll in view on every reel shot.
    for (const shot of timeline.shots.slice(3, 9)) expect(timeline.slates.find(slate => slate.start <= shot.start + .5 && slate.end >= shot.start + .5)?.roll).toBe(shot.roll);
  });

  it('keeps the camera inside the room and the loupe only in its shot', () => {
    for (const sample of every(1 / 15)) {
      const [x, y, z] = poseEye(sample.camera);
      expect(Math.abs(x)).toBeLessThan(ROOM_ENVELOPE.width / 2);
      expect(y).toBeGreaterThan(ROOM_ENVELOPE.floor);
      expect(y).toBeLessThan(ROOM_ENVELOPE.ceiling);
      expect(z).toBeGreaterThan(ROOM_ENVELOPE.front);
      expect(z).toBeLessThan(ROOM_ENVELOPE.back);
      expect(sample.loupe !== null).toBe(sample.shot === 'loupe');
      expect(Number.isFinite(sample.light) && sample.fade >= 0 && sample.fade <= 1).toBe(true);
    }
  });

  it('places titles within the film without overlapping captions', () => {
    for (const item of [...timeline.captions, ...timeline.moments, ...timeline.slates, ...timeline.exhibits]) {
      expect(item.start).toBeGreaterThanOrEqual(0);
      expect(item.end).toBeLessThanOrEqual(timeline.duration + 1e-9);
      expect(item.end).toBeGreaterThan(item.start);
    }
    const captions = [...timeline.captions].sort((a, b) => a.start - b.start);
    captions.slice(1).forEach((caption, i) => expect(caption.start).toBeGreaterThanOrEqual(captions[i].end));
    expect(timeline.moments.at(-1)).toMatchObject({ kind: 'end', end: timeline.duration });
    expect([SHOWREEL_SITE, SHOWREEL_GITHUB]).toEqual(['filmreverie.app', 'github.com/stevex6677/filmreverie']);
  });

  it('bundles two licensed sample rolls with published photographs', () => {
    expect(SHOWREEL_ROLLS.map(roll => [roll.format, roll.stockId])).toEqual([['135', 'portra-400'], ['66', 'ektar-100']]);
    for (const roll of manifest.rolls) for (const frame of roll.frames) {
      expect(frame.source.license).toBe('CC0');
      expect(frame.source.sha1).toMatch(/^[0-9a-f]{40}$/);
      expect(frame.source.imageUrl).toMatch(/^https:\/\/upload\.wikimedia\.org\//);
      for (const file of [frame.src, frame.src.replace(/\.jpg$/, '.thumb.jpg')]) expect(fs.existsSync(path.join(root, 'public', file)), file).toBe(true);
    }
  });
});
