import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SHOWREEL_FORMATS, SHOWREEL_ROLLS, SHOWREEL_TABLE } from '../../src/showreel/rolls';
import { createShowreelTimeline, SHOWREEL_GITHUB, SHOWREEL_SITE } from '../../src/showreel/timeline';
import { locateFrame } from '../../src/utils/rollLayout';
import { poseEye } from '../../src/screening/timeline';
import { ROOM_ENVELOPE } from '../../src/utils/cameraBounds';
import { FILM_FORMATS } from '../../src/data/filmFormats';
import manifest from '../../src/data/showreelRolls.json' with { type: 'json' };
const root = path.resolve(__dirname, '../..');
const timeline = createShowreelTimeline(SHOWREEL_ROLLS);
const every = (step: number) => Array.from({ length: Math.floor(timeline.duration / step) + 1 }, (_, i) => timeline.sample(i * step));

describe('Showreel', () => {
  it('runs a minute and a half as a deterministic function of time', () => {
    expect(timeline.duration).toBeGreaterThan(88);
    expect(timeline.duration).toBeLessThan(92);
    const again = createShowreelTimeline(SHOWREEL_ROLLS);
    expect(every(.37)).toEqual(Array.from({ length: Math.floor(again.duration / .37) + 1 }, (_, i) => again.sample(i * .37)));
    expect(timeline.sample(-3)).toEqual(timeline.sample(0));
    expect(timeline.sample(timeline.duration + 5)).toEqual(timeline.sample(timeline.duration));
  });

  it('visits the darkroom, new roll editor, film shelf, every format, then features a different roll in each light table shot and reel', () => {
    expect(timeline.shots.map(shot => shot.name)).toEqual(['hook', 'darkroom', 'new-roll', 'shelf', 'formats', 'tracking', 'loupe', 'medium', 'slides', 'orbit', 'prints', 'projector', 'cabinet']);
    let end = 0;
    for (const shot of timeline.shots) { expect(shot.start).toBeCloseTo(end, 6); expect(shot.duration).toBeGreaterThan(2); end = shot.start + shot.duration; }
    expect(end).toBeCloseTo(timeline.duration, 6);
    // Every roll is featured; each reel excerpt features a different one, and the
    // projector screens the 6×6 roll after its close-up. Room, shelf and formats shots feature none.
    const featured = timeline.shots.filter(shot => shot.roll >= 0).map(shot => shot.roll);
    expect(new Set(featured)).toEqual(new Set(SHOWREEL_ROLLS.map((_, index) => index)));
    const reels = timeline.shots.filter(shot => shot.source.reel !== 'darkroom').map(shot => shot.roll);
    expect(new Set(reels).size).toBe(reels.length);
    const roll = (name: string) => SHOWREEL_ROLLS[timeline.shots.find(shot => shot.name === name)!.roll];
    expect(['tracking', 'hook', 'loupe', 'medium', 'slides', 'orbit', 'prints', 'projector'].map(name => [roll(name).format, roll(name).sizing])).toEqual([
      ['135', 'fixed'], ['135', 'fixed'], ['135', 'free'], ['66', 'fixed'], ['67', 'fixed'], ['69', 'fixed'], ['67', 'fixed'], ['66', 'fixed']]);
    // Slides light up from beneath; the hook develops negatives.
    expect(roll('slides').stockId).toBe('ektachrome-e100');
    expect(roll('hook').stockId).toBe('portra-160');
    // Five existing reels appear as excerpts, each moved to where its roll lies.
    expect(timeline.shots.filter(shot => shot.source.reel !== 'darkroom').map(shot => [shot.source.reel, shot.shift])).toEqual([['tracking', true], ['develop', true], ['orbit', true], ['darkroom-prints', false], ['projector', true]]);
    // The corner slate names the roll in view on every single-roll light table and screening shot.
    for (const shot of timeline.shots.slice(5, 12)) expect(timeline.slates.find(slate => slate.start <= shot.start + .5 && slate.end >= shot.start + .5)?.roll).toBe(shot.roll);
  });

  it('lays every roll on one light table, in columns from the smallest format to the largest, without overlaps', () => {
    expect(SHOWREEL_FORMATS.map(format => format.title)).toEqual(['35mm', 'Panoramic', '6×6', '6×7', '6×9']);
    expect(SHOWREEL_FORMATS.map(format => format.detail)).toEqual(['35mm film  ·  24 × 36 mm', '35mm film  ·  24 × 66 mm', '120 film  ·  56 × 56 mm', '120 film  ·  56 × 69 mm', '120 film  ·  56 × 83 mm']);
    expect(SHOWREEL_FORMATS.flatMap(format => format.rolls).sort()).toEqual(SHOWREEL_ROLLS.map((_, index) => index));
    const box = (roll: typeof SHOWREEL_ROLLS[number]) => ({ left: roll.offset.x - roll.width / 2, right: roll.offset.x + roll.width / 2, bottom: roll.offset.y - roll.height / 2, top: roll.offset.y + roll.height / 2 });
    for (const [i, a] of SHOWREEL_ROLLS.entries()) {
      const ba = box(a);
      // On the illuminated panel (the table's frame is 0.1 wide).
      expect(Math.abs(ba.left) + .1).toBeLessThan(SHOWREEL_TABLE.width / 2);
      expect(Math.abs(ba.right) + .1).toBeLessThan(SHOWREEL_TABLE.width / 2);
      expect(ba.top + .1).toBeLessThan(SHOWREEL_TABLE.height / 2);
      expect(ba.bottom - .1).toBeGreaterThan(-SHOWREEL_TABLE.height / 2);
      for (const b of SHOWREEL_ROLLS.slice(i + 1)) {
        const bb = box(b);
        expect(ba.right < bb.left || bb.right < ba.left || ba.top < bb.bottom || bb.top < ba.bottom).toBe(true);
      }
    }
    // Left to right, each column holds a larger frame than the last.
    for (const [i, format] of SHOWREEL_FORMATS.entries()) if (i) expect(format.x).toBeGreaterThan(SHOWREEL_FORMATS[i - 1].x);
    // The formats shot names each one in turn, smallest first, and ends on the whole table.
    const shot = timeline.shots.find(item => item.name === 'formats')!;
    expect(timeline.formats.map(item => item.title)).toEqual(SHOWREEL_FORMATS.map(format => format.title));
    timeline.formats.forEach((item, i) => { expect(item.start).toBeGreaterThan(shot.start); expect(item.end).toBeLessThanOrEqual(shot.start + shot.duration); if (i) expect(item.start).toBeGreaterThan(timeline.formats[i - 1].start); });
    expect(timeline.sample(shot.start + shot.duration - .05).camera.zoom).toBeGreaterThan(timeline.sample(shot.start + .05).camera.zoom * 2);
  });

  it('shows the requested photographs', () => {
    const shot = (name: string) => timeline.shots.find(item => item.name === name)!;
    const frames = (name: string) => { const s = shot(name), seen = new Set<number>(); for (let t = s.start; t < s.start + s.duration; t += .05) seen.add(timeline.sample(t).frameIndex); return seen; };
    const file = (name: string, index: number) => SHOWREEL_ROLLS[shot(name).roll].definition.frames[index].src.split('/').pop();
    // 1. The third Fuji 200 frame, in the Tracking Shot.
    expect(frames('tracking')).toContain(2); expect(file('tracking', 2)).toBe('000039180026.jpg');
    // 2. The thirteenth Portra 160 frame develops in the opening.
    const hook = shot('hook'), positions = every(.05).filter(sample => sample.shot === 'hook' && sample.reveal).map(sample => sample.reveal!.position);
    expect(Math.min(...positions)).toBeLessThanOrEqual(12); expect(Math.max(...positions)).toBeGreaterThanOrEqual(13);
    expect(file('hook', 12)).toBe('000034220013.jpg'); expect(hook.roll).toBe(1);
    // 3. The loupe settles on the fifth panoramic frame.
    const pano = SHOWREEL_ROLLS[shot('loupe').roll], fifth = locateFrame(pano.definition, 4);
    const loupe = timeline.sample(shot('loupe').start + shot('loupe').duration - .05).loupe!;
    expect(Math.abs(loupe.x - (fifth.x + pano.offset.x))).toBeLessThan(pano.definition.frameWidths![4] * pano.definition.scale / 2);
    expect(Math.abs(loupe.y - (fifth.y + pano.offset.y))).toBeLessThan(.03);
    expect(file('loupe', 4)).toBe('000022530008.jpg');
    // 4. The first and seventh 6×6 frames: the projector opens on the first, the close-up orbits the seventh.
    expect(frames('medium')).toContain(6); expect(file('medium', 6)).toBe('000033310007.jpg');
    expect([...frames('projector')]).toEqual(expect.arrayContaining([0, 1, 2])); expect(file('projector', 0)).toBe('000022510006.jpg');
    // 5. The first three 6×7 Provia frames as prints.
    expect([...frames('prints')]).toEqual(expect.arrayContaining([0, 1, 2]));
    // 6. The third 6×7 Ektachrome slide lights up.
    expect(frames('slides')).toContain(2); expect(file('slides', 2)).toBe('000023360005.jpg');
    // 7. The third and fourth 6×9 frames, orbited in turn.
    expect([...frames('orbit')]).toEqual(expect.arrayContaining([2, 3])); expect([file('orbit', 2), file('orbit', 3)]).toEqual(['000023350004.jpg', '000101150001.jpg']);
  });

  it('frames reel excerpts on their roll where it lies on the table', () => {
    for (const name of ['tracking', 'slides', 'orbit', 'projector']) {
      const shot = timeline.shots.find(item => item.name === name)!, offset = SHOWREEL_ROLLS[shot.roll].offset;
      const local = shot.source.sample(shot.from + 1), placed = timeline.sample(shot.start + 1);
      expect(placed.camera.pan.x).toBeCloseTo(local.camera.pan.x + offset.x, 9);
      expect(placed.camera.pan.z).toBeCloseTo(local.camera.pan.z - offset.y, 9);
      expect(placed.roll).toBe(shot.roll);
    }
  });

  it('shows the New roll editor over a move that the film shelf shot continues', () => {
    const shot = (name: string) => timeline.shots.find(item => item.name === name)!;
    const editor = timeline.moments.find(moment => moment.kind === 'new-roll')!;
    expect(editor).toMatchObject({ start: shot('new-roll').start, end: shot('shelf').start });
    const joint = shot('shelf').start;
    expect(timeline.sample(joint - 1e-6).camera).toMatchObject({ zoom: expect.closeTo(timeline.sample(joint).camera.zoom, 4) });
    expect(poseEye(timeline.sample(joint - 1e-6).camera).map(v => v.toFixed(3))).toEqual(poseEye(timeline.sample(joint).camera).map(v => v.toFixed(3)));
    // No light leak at that join.
    expect(timeline.flashes).not.toContain(joint);
  });

  it('opens the medium-format shot on the whole roll before closing in on one photograph', () => {
    const shot = timeline.shots.find(item => item.name === 'medium')!;
    expect(SHOWREEL_ROLLS[shot.roll].format).toBe('66');
    const opening = timeline.sample(shot.start + .1).camera, close = timeline.sample(shot.start + shot.duration - .05).camera;
    expect(opening.zoom).toBeGreaterThan(close.zoom * 2);
    expect(close.tilt).toBeGreaterThan(opening.tilt + .4);
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

  it('reads every roll from the showreel photo folder in place', () => {
    expect(SHOWREEL_ROLLS.map(roll => [roll.format, roll.sizing, roll.stockId, roll.definition.frames.length])).toEqual([
      ['135', 'fixed', 'fuji-200', 9], ['135', 'fixed', 'portra-160', 20], ['135', 'free', 'ektachrome-e100', 6], ['66', 'fixed', 'gold-200', 9],
      ['67', 'fixed', 'provia-100', 5], ['67', 'fixed', 'ektachrome-e100', 6], ['69', 'fixed', 'ektachrome-e100', 7]]);
    for (const [index, roll] of manifest.rolls.entries()) {
      expect(roll.folder).toMatch(new RegExp(`^${index + 1}_`));
      for (const frame of roll.frames) {
        expect(frame.src).toBe(`/assets/photos/showreel/${roll.folder}/${frame.src.split('/').pop()}`);
        expect(fs.existsSync(path.join(root, 'public', frame.src)), frame.src).toBe(true);
        // A vertical photograph lies across a landscape gate, as the importer places it.
        expect(frame.rotation).toBe(frame.width < frame.height && roll.format !== '66' ? 90 : 0);
      }
    }
    // Free frames run as long as the photographs; fixed ones fill the gate.
    const pano = SHOWREEL_ROLLS.find(roll => roll.sizing === 'free')!;
    expect(pano.definition.frameWidths!.every(width => width / pano.definition.layout!.frameHeight > 2.7)).toBe(true);
    expect(FILM_FORMATS[pano.format].height).toBe(24);
  });
});
