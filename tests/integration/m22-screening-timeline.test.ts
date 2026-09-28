import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BASELINE_ROLL, FULL_ROLL_FIXTURE, createRollLayout, locateFrame, type RollDefinition } from '../../src/utils/rollLayout';
import { FILM_UNIT, FRAME_GAP_MM, formatLayout } from '../../src/data/filmFormats';
import { FILM_RENDER_SCALE } from '../../src/data/physicalScale';
import { ROLL_FRAMES } from '../../src/data/rollManifest';
import { getStripDimensions } from '../../src/utils/loupeMapping';
import { loupeGeometry, LOUPE_SIZE_SCALE } from '../../src/utils/loupeView';
import { TABLE_CENTER_Z } from '../../src/utils/cameraBounds';
import { createScreeningTimeline, breakBoundaries, type ReelOptions } from '../../src/screening/reels';
import { PACES, PACE_SCALE, REEL_IDS, revealEdge, type ReelId, type ScreeningTimeline } from '../../src/screening/timeline';

const frames = (count: number) => Array.from({ length: count }, (_, i) => ({ ...ROLL_FRAMES[i % ROLL_FRAMES.length], id: `f${i + 1}`, order: i + 1 }));
const medium: RollDefinition = { rollId: 'm', label: 'Medium · 120 · 6×6', frames: frames(12), framesPerStrip: 3, scale: FILM_RENDER_SCALE, layout: formatLayout('66'), format: '66', fixture: false };
const freeLayout = { ...formatLayout('135'), gap: FRAME_GAP_MM * FILM_UNIT };
const free: RollDefinition = { rollId: 'free', label: 'Free · 35mm · Free', frames: frames(14), framesPerStrip: 6, scale: FILM_RENDER_SCALE, layout: freeLayout, format: '135', fixture: false,
  frameWidths: frames(14).map((_, i) => freeLayout.frameHeight * [1.5, 1, 2.2, .75][i % 4]), stripLength: 230 * FILM_UNIT };
const single: RollDefinition = { ...BASELINE_ROLL, rollId: 'one', frames: frames(1) };
const ROLLS = { baseline: BASELINE_ROLL, full: FULL_ROLL_FIXTURE, medium, free, single };
const loupe = { scale: FILM_RENDER_SCALE * LOUPE_SIZE_SCALE.medium, type: 'classic' as const };
const options = (reel: ReelId, extra: Partial<ReelOptions> = {}): ReelOptions => ({ reel, pace: 'normal', aspect: 16 / 9, stockType: 'negative', loupe, ...extra });
const samples = (timeline: ScreeningTimeline, step = 1 / 30) => Array.from({ length: Math.floor(timeline.duration / step) + 1 }, (_, i) => timeline.sample(i * step));
const ACT_ORDER = { establish: 0, tour: 1, break: 1, return: 2 };

describe('M22 screening timelines', () => {
  it('are deterministic pure functions of roll, reel, aspect, pace and time', () => {
    for (const reel of REEL_IDS) {
      const a = createScreeningTimeline(FULL_ROLL_FIXTURE, options(reel)), b = createScreeningTimeline(FULL_ROLL_FIXTURE, options(reel));
      expect(a.duration).toBe(b.duration);
      expect(samples(a, .37)).toEqual(samples(b, .37));
      expect(a.sample(12.345)).toEqual(a.sample(12.345));
      expect(a.sample(-5)).toEqual(a.sample(0));
      expect(a.sample(a.duration + 10)).toEqual(a.sample(a.duration));
    }
  });

  it('visit every frame exactly once, in order, with establish, tour and return acts', () => {
    for (const [name, roll] of Object.entries(ROLLS)) for (const reel of REEL_IDS) for (const reducedMotion of [false, true]) {
      const timeline = createScreeningTimeline(roll, options(reel, { reducedMotion }));
      const visits = timeline.segments.filter(segment => segment.kind === 'frame').map(segment => segment.frameIndex);
      expect(visits, `${name} ${reel}`).toEqual(roll.frames.map((_, i) => i));
      const order = timeline.segments.map(segment => segment.frameIndex);
      expect(order).toEqual([...order].sort((a, b) => a - b));
      const acts = timeline.segments.map(segment => ACT_ORDER[segment.act]);
      expect(acts).toEqual([...acts].sort((a, b) => a - b));
      expect(timeline.segments[0].act).toBe('establish');
      expect(timeline.segments.at(-1)!.act).toBe('return');
      expect(timeline.segments.some(segment => segment.act === 'tour')).toBe(true);
      for (let i = 1; i < timeline.segments.length; i++) expect(timeline.segments[i].start).toBeCloseTo(timeline.segments[i - 1].start + timeline.segments[i - 1].duration, 9);
      expect(timeline.cards.map(card => card.kind)).toEqual(['title', 'end']);
      const starts = roll.frames.map((_, i) => timeline.frameStart(i));
      expect(starts).toEqual([...starts].sort((a, b) => a - b));
      expect(new Set(starts).size).toBe(roll.frames.length);
    }
  });

  it('take an overview break at strip boundaries, fewer on short and medium-format rolls', () => {
    const boundaries = createRollLayout(FULL_ROLL_FIXTURE).slice(1).map(strip => strip.offset);
    for (const reel of REEL_IDS) {
      const timeline = createScreeningTimeline(FULL_ROLL_FIXTURE, options(reel));
      for (const boundary of boundaries) expect(timeline.segments.some(s => s.act === 'break' && s.kind === 'overview' && s.frameIndex === boundary), `${reel} ${boundary}`).toBe(true);
      expect(timeline.segments.filter(s => s.act === 'break' && s.kind === 'overview')).toHaveLength(boundaries.length);
      expect(createScreeningTimeline(BASELINE_ROLL, options(reel)).segments.some(s => s.act === 'break')).toBe(false);
      const mediumBreaks = createScreeningTimeline(medium, options(reel)).segments.filter(s => s.act === 'break' && s.kind === 'overview').length;
      expect(mediumBreaks).toBeGreaterThan(0);
      expect(mediumBreaks).toBeLessThan(createRollLayout(medium).length - 1);
    }
    expect(breakBoundaries(single).size).toBe(0);
  });

  it('scale every reel by pace and give 120 frames longer holds', () => {
    for (const reel of REEL_IDS) {
      const durations = PACES.map(pace => createScreeningTimeline(FULL_ROLL_FIXTURE, options(reel, { pace })).duration);
      expect(durations[0]).toBeGreaterThan(durations[1]);
      expect(durations[1]).toBeGreaterThan(durations[2]);
      PACES.forEach((pace, i) => expect(durations[i] / durations[1]).toBeCloseTo(PACE_SCALE[pace], 6));
      const hold = (roll: RollDefinition) => Math.min(...createScreeningTimeline(roll, options(reel)).segments.filter(s => s.kind === 'frame').map(s => s.duration));
      expect(hold(medium)).toBeGreaterThan(hold(BASELINE_ROLL));
    }
    const walk = createScreeningTimeline(FULL_ROLL_FIXTURE, options('loupe-walk'));
    // About 3–4 s per frame across the tour, including inspections and breaks.
    const tour = walk.segments.filter(s => s.act === 'tour' || s.act === 'break').reduce((sum, s) => sum + s.duration, 0);
    expect(tour / 36).toBeGreaterThan(3); expect(tour / 36).toBeLessThan(4.2);
    const projector = createScreeningTimeline(FULL_ROLL_FIXTURE, options('projector'));
    const periods = projector.beats.slice(1).map((beat, i) => beat - projector.beats[i]);
    expect(Math.min(...periods)).toBeGreaterThan(.25);
    expect(periods.filter(p => p < .5).length).toBeGreaterThan(3); // speed-up runs
    // Frame changes fall on a regular half-beat grid, ready for a soundtrack.
    for (const beat of projector.beats) expect(Math.abs((beat - projector.beats[0]) / .3 - Math.round((beat - projector.beats[0]) / .3))).toBeLessThan(1e-6);
  });

  it('keep the camera above the table and loupe and aimed at the film for every roll and aspect', () => {
    for (const [name, roll] of Object.entries(ROLLS)) for (const aspect of [16 / 9, 9 / 16, 1]) for (const reel of REEL_IDS) {
      const timeline = createScreeningTimeline(roll, options(reel, { aspect }));
      const strips = createRollLayout(roll);
      const halfWidth = Math.max(...strips.map(s => getStripDimensions(s.layout).width * s.scale / 2));
      const halfHeight = strips[0].y + getStripDimensions(strips[0].layout).height * roll.scale / 2;
      const radius = loupeGeometry('classic').radius * loupe.scale;
      for (const sample of samples(timeline, 1 / 15)) {
        const { zoom, pan, tilt } = sample.camera;
        expect([zoom, pan.x, pan.z, tilt, sample.light, sample.fade].every(Number.isFinite), name).toBe(true);
        const height = zoom * Math.cos(tilt);
        expect(height).toBeGreaterThan(.03);
        if (sample.loupe) expect(height, `${name} ${reel} ${sample.kind}`).toBeGreaterThan(.008 + sample.loupe.lift + .222 * loupe.scale);
        expect(Math.abs(pan.x), `${name} ${reel} ${aspect}`).toBeLessThanOrEqual(halfWidth + radius * 1.6);
        expect(Math.abs(TABLE_CENTER_Z - pan.z)).toBeLessThanOrEqual(halfHeight + 1e-6);
        expect(tilt).toBeGreaterThanOrEqual(0); expect(tilt).toBeLessThanOrEqual(50 * Math.PI / 180);
      }
      // A focused frame is centered and mostly visible in the requested aspect.
      for (const segment of timeline.segments.filter(s => s.kind === 'frame' && reel !== 'loupe-walk')) {
        const frame = locateFrame(roll, segment.frameIndex), pose = segment.camera[1];
        expect(pose.pan.x).toBeCloseTo(frame.x, 9); expect(TABLE_CENTER_Z - pose.pan.z).toBeCloseTo(frame.y, 9);
        const width = (frame.strip.layout.frameWidths?.[frame.localIndex] ?? frame.strip.layout.frameWidth) * roll.scale;
        expect(2 * pose.zoom * Math.tan(Math.PI / 8) * aspect).toBeGreaterThan(width * .9);
      }
    }
  }, 60000); // An exhaustive sweep of every roll, aspect and reel.

  it('develop reveals every negative in order and uses a backlight reveal for reversal stock', () => {
    for (const stockType of ['negative', 'reversal'] as const) {
      const timeline = createScreeningTimeline(FULL_ROLL_FIXTURE, options('develop', { stockType }));
      expect(timeline.revealMode).toBe(stockType === 'reversal' ? 'backlight' : 'polarity');
      const positions = samples(timeline, .1).map(sample => sample.reveal!.position);
      expect(positions[0]).toBe(0); expect(positions.at(-1)).toBe(36);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
      expect(timeline.sample(.5).light).toBe(0);
      expect(timeline.sample(timeline.duration - 2).light).toBe(1);
      for (const segment of timeline.segments.filter(s => s.kind === 'frame')) expect(segment.reveal![1]).toBe(segment.frameIndex + 1);
    }
    for (const reel of ['loupe-walk', 'projector'] as const) expect(createScreeningTimeline(BASELINE_ROLL, options(reel)).sample(10).reveal).toBeNull();
  });

  it('places the develop band continuously along each strip, including free-format frames', () => {
    for (const roll of [FULL_ROLL_FIXTURE, free, medium]) for (const strip of createRollLayout(roll)) {
      const width = getStripDimensions(strip.layout).width;
      expect(revealEdge(roll, strip.index, strip.offset)).toBe(-1e3);
      expect(revealEdge(roll, strip.index, strip.offset + strip.frames.length)).toBe(1e3);
      const edges = Array.from({ length: 50 }, (_, i) => revealEdge(roll, strip.index, strip.offset + .001 + i * (strip.frames.length - .002) / 49));
      expect(edges).toEqual([...edges].sort((a, b) => a - b));
      expect(edges[0]).toBeGreaterThanOrEqual(-width / 2); expect(edges.at(-1)).toBeLessThanOrEqual(width / 2);
    }
  });

  it('replace fast moves, blur and flicker with slow cuts under reduced motion', () => {
    for (const reel of REEL_IDS) {
      const timeline = createScreeningTimeline(FULL_ROLL_FIXTURE, options(reel, { reducedMotion: true }));
      expect(timeline.reducedMotion).toBe(true);
      for (const segment of timeline.segments) {
        expect(segment.blur).toBe(0); expect(segment.arc).toBe(0); expect(segment.light.flicker).toBeUndefined();
        const moves = JSON.stringify(segment.camera[0]) !== JSON.stringify(segment.camera[1]) || (segment.loupe && JSON.stringify(segment.loupe[0]) !== JSON.stringify(segment.loupe[1]));
        if (moves && segment.kind !== 'develop') expect(segment.cut, `${reel} ${segment.kind}`).toBe(true);
        if (segment.cut) expect(segment.duration).toBeGreaterThanOrEqual(1.1 - 1e-9);
      }
      for (const sample of samples(timeline, .1)) expect(sample.blur).toBe(0);
      const cut = timeline.segments.find(segment => segment.cut)!;
      expect(timeline.sample(cut.start + cut.duration * .25).camera).toEqual(cut.camera[0]);
      expect(timeline.sample(cut.start + cut.duration * .5).fade).toBeCloseTo(1, 6);
      expect(timeline.sample(cut.start + cut.duration * .75).camera).toEqual(cut.camera[1]);
    }
    const normal = createScreeningTimeline(FULL_ROLL_FIXTURE, options('projector'));
    expect(normal.segments.some(segment => segment.blur > 0)).toBe(true);
  });

  it('fades in from dark, shows the title and end cards, and closes on dark', () => {
    for (const reel of REEL_IDS) {
      const timeline = createScreeningTimeline(BASELINE_ROLL, options(reel));
      expect(timeline.sample(0).fade).toBe(1);
      const [title, end] = timeline.cards;
      expect(title.start).toBeLessThan(timeline.frameStart(0)); expect(end.end).toBe(timeline.duration);
      expect(timeline.sample((title.start + title.end) / 2).card).toEqual({ kind: 'title', opacity: 1 });
      expect(timeline.sample(title.end + .01).card).toBeNull();
      expect(timeline.sample(timeline.duration - 1).card?.kind).toBe('end');
      expect(timeline.sample(timeline.duration).fade).toBe(1);
      expect(timeline.sample(timeline.frameStart(2) + .01).fade).toBe(0);
    }
  });

  it('never imports roll storage, publishing or saved views', () => {
    const dir = path.resolve('src/screening');
    for (const file of fs.readdirSync(dir, { recursive: true }) as string[]) {
      if (!/\.tsx?$/.test(file)) continue;
      const source = fs.readFileSync(path.join(dir, file), 'utf8');
      expect(source, file).not.toMatch(/rollRepository|guestRolls|adminRepository|cloud\/|indexedDB|localStorage|fetch\(/);
    }
  });
});

describe('M22 screening session', () => {
  it('plays, pauses, seeks by frame and never advances while paused or exporting', async () => {
    const { ScreeningSession } = await import('../../src/screening/session');
    const credits = { title: 'Roll', stock: 'Portra 400', format: '35mm', frames: 36 };
    const session = new ScreeningSession(FULL_ROLL_FIXTURE, { reel: 'develop', pace: 'normal', format: '16:9' }, { stockType: 'negative', loupe }, credits, 4 / 3);
    const events: number[] = []; session.subscribe(() => events.push(session.time));
    session.tick(.05); expect(session.time).toBeCloseTo(.05);
    session.tick(5); expect(session.time).toBeCloseTo(.15); // a stalled frame advances at most 0.1 s
    session.pause(); session.tick(1); expect(session.time).toBeCloseTo(.15);
    session.step(1); expect(session.sample.frameIndex).toBe(0); expect(session.time).toBe(session.timeline.frameStart(0));
    session.step(1); expect(session.sample.frameIndex).toBe(1);
    session.seek(session.timeline.frameStart(1) + 1.5); session.step(-1); expect(session.time).toBe(session.timeline.frameStart(1));
    session.step(-1); expect(session.time).toBe(session.timeline.frameStart(0));
    session.seek(session.timeline.frameStart(35)); session.step(1); expect(session.sample.act).toBe('return');
    const moment = session.time; session.setAspect(16 / 9);
    expect(session.time).toBe(moment); expect(session.timeline.aspect).toBeCloseTo(16 / 9);
    session.setExporting(true); session.play(); session.tick(1); expect(session.time).toBe(moment);
    session.setExporting(false); session.seek(session.timeline.duration); session.play(); expect(session.time).toBe(0);
    expect(events.length).toBeGreaterThan(5);
  });
});
