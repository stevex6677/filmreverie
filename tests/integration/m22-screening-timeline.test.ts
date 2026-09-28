import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BASELINE_ROLL, FULL_ROLL_FIXTURE, createRollLayout, locateFrame, type RollDefinition } from '../../src/utils/rollLayout';
import { FILM_UNIT, FRAME_GAP_MM, formatLayout } from '../../src/data/filmFormats';
import { FILM_RENDER_SCALE } from '../../src/data/physicalScale';
import { ROLL_FRAMES } from '../../src/data/rollManifest';
import { getStripDimensions } from '../../src/utils/loupeMapping';
import { ROOM_ENVELOPE, TABLE_CENTER_Z, TABLE_SURFACE_Y } from '../../src/utils/cameraBounds';
import { createScreeningTimeline, breakBoundaries, type ReelOptions } from '../../src/screening/reels';
import { PACES, PACE_SCALE, REEL_IDS, poseEye, revealEdge, type ReelId, type ScreeningTimeline } from '../../src/screening/timeline';

const frames = (count: number) => Array.from({ length: count }, (_, i) => ({ ...ROLL_FRAMES[i % ROLL_FRAMES.length], id: `f${i + 1}`, order: i + 1 }));
const medium: RollDefinition = { rollId: 'm', label: 'Medium · 120 · 6×6', frames: frames(12), framesPerStrip: 3, scale: FILM_RENDER_SCALE, layout: formatLayout('66'), format: '66', fixture: false };
const freeLayout = { ...formatLayout('135'), gap: FRAME_GAP_MM * FILM_UNIT };
const free: RollDefinition = { rollId: 'free', label: 'Free · 35mm · Free', frames: frames(14), framesPerStrip: 6, scale: FILM_RENDER_SCALE, layout: freeLayout, format: '135', fixture: false,
  frameWidths: frames(14).map((_, i) => freeLayout.frameHeight * [1.5, 1, 2.2, .75][i % 4]), stripLength: 230 * FILM_UNIT };
const single: RollDefinition = { ...BASELINE_ROLL, rollId: 'one', frames: frames(1) };
const ROLLS = { baseline: BASELINE_ROLL, full: FULL_ROLL_FIXTURE, medium, free, single };
const options = (reel: ReelId, extra: Partial<ReelOptions> = {}): ReelOptions => ({ reel, pace: 'normal', aspect: 16 / 9, stockType: 'negative', ...extra });
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
      expect(timeline.cards.map(card => card.kind)).toEqual(reel === 'projector' ? ['title', 'countdown', 'end'] : ['title', 'end']);
      const starts = roll.frames.map((_, i) => timeline.frameStart(i));
      expect(starts).toEqual([...starts].sort((a, b) => a - b));
      expect(new Set(starts).size).toBe(roll.frames.length);
    }
  });

  it('take an overview break at strip boundaries, fewer on short and medium-format rolls', () => {
    const boundaries = createRollLayout(FULL_ROLL_FIXTURE).slice(1).map(strip => strip.offset);
    // Projector never leaves the projection for an overview (2026-09-27 review).
    expect(createScreeningTimeline(FULL_ROLL_FIXTURE, options('projector')).segments.some(s => s.act === 'break')).toBe(false);
    for (const reel of ['tracking', 'develop'] as const) {
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
    const walk = createScreeningTimeline(FULL_ROLL_FIXTURE, options('tracking'));
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

  it('keep the camera above the table and aimed at the film for every roll and aspect', () => {
    for (const [name, roll] of Object.entries(ROLLS)) for (const aspect of [16 / 9, 9 / 16, 1]) for (const reel of REEL_IDS) {
      const timeline = createScreeningTimeline(roll, options(reel, { aspect }));
      const strips = createRollLayout(roll);
      const halfWidth = Math.max(...strips.map(s => getStripDimensions(s.layout).width * s.scale / 2));
      // Projector may look one frame beyond a strip's end while its shutter hides the jump.
      const pitch = Math.max(...roll.frames.map((_, i) => { const frame = locateFrame(roll, i); return ((frame.strip.layout.frameWidths?.[frame.localIndex] ?? frame.strip.layout.frameWidth) + frame.strip.layout.gap) * roll.scale; }));
      const halfHeight = strips[0].y + getStripDimensions(strips[0].layout).height * roll.scale / 2;
      for (const sample of samples(timeline, 1 / 15)) {
        const { zoom, pan, tilt } = sample.camera, eye = poseEye(sample.camera);
        expect([zoom, pan.x, pan.z, tilt, sample.light, sample.fade, ...eye].every(Number.isFinite), name).toBe(true);
        // Flyover skims ~3 mm above the film (which lies ~5 mm above the diffuser); others stay well clear.
        expect(eye[1] - TABLE_SURFACE_Y, `${name} ${reel} ${sample.kind}`).toBeGreaterThan(reel === 'flyover' ? .012 : .03);
        const room = reel === 'darkroom' && (sample.act === 'establish' || sample.act === 'return');
        if (room) {
          // Room shots stay inside the room, looking at most slightly up (as the room view does).
          expect(Math.abs(eye[0])).toBeLessThan(ROOM_ENVELOPE.width / 2); expect(eye[2]).toBeGreaterThan(ROOM_ENVELOPE.front); expect(eye[2]).toBeLessThan(ROOM_ENVELOPE.back);
          expect(tilt).toBeLessThanOrEqual(100 * Math.PI / 180);
        } else {
          expect(Math.abs(pan.x), `${name} ${reel} ${aspect}`).toBeLessThanOrEqual(halfWidth + (reel === 'projector' || reel === 'flyover' ? pitch : 1e-9));
          expect(Math.abs(TABLE_CENTER_Z - pan.z)).toBeLessThanOrEqual(halfHeight + 1e-6);
          expect(tilt).toBeLessThanOrEqual(80 * Math.PI / 180 + 1e-9);
        }
        expect(tilt).toBeGreaterThanOrEqual(0);
        expect(Math.abs(sample.camera.roll ?? 0)).toBeLessThanOrEqual(15 * Math.PI / 180);
      }
      // A focused frame is centered and mostly visible in the requested aspect.
      for (const segment of timeline.segments.filter(s => s.kind === 'frame' && reel !== 'tracking' && reel !== 'darkroom')) {
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
    for (const reel of ['tracking', 'projector'] as const) expect(createScreeningTimeline(BASELINE_ROLL, options(reel)).sample(10).reveal).toBeNull();
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
        expect(segment.blur).toBe(0); expect(segment.weave).toBe(false); expect(segment.light.flicker).toBeUndefined();
        const moves = JSON.stringify(segment.camera[0]) !== JSON.stringify(segment.camera[1]);
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
      const [title, end] = timeline.cards.filter(card => card.kind !== 'countdown');
      expect(title.start).toBeLessThan(timeline.frameStart(0)); expect(end.end).toBe(timeline.duration);
      expect(timeline.sample((title.start + title.end) / 2).card).toMatchObject({ kind: 'title', opacity: 1 });
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

describe('M22 reel revisions (2026-09-27 feedback)', () => {
  it('Tracking Shot moves the camera in on details without the loupe', () => {
    const timeline = createScreeningTimeline(FULL_ROLL_FIXTURE, options('tracking'));
    expect(timeline.segments.filter(s => s.kind === 'detail').length).toBeGreaterThanOrEqual(5);
    for (const segment of timeline.segments.filter(s => s.kind === 'detail')) {
      expect(segment.camera[0].zoom).toBeLessThan(createScreeningTimeline(FULL_ROLL_FIXTURE, options('develop')).segments.find(s => s.kind === 'push' && s.frameIndex === segment.frameIndex)!.camera[1].zoom);
      expect(segment.camera[0].pan.x).not.toBe(segment.camera[1].pan.x);
    }
    expect(Object.keys(timeline.sample(20))).not.toContain('loupe');
  });

  it('Develop brings the table light up smoothly, without flicker', () => {
    for (const stockType of ['negative', 'reversal'] as const) {
      const timeline = createScreeningTimeline(FULL_ROLL_FIXTURE, options('develop', { stockType }));
      const opening = samples(timeline, 1 / 60).filter(sample => sample.act === 'establish').map(sample => sample.light);
      expect(opening[0]).toBe(0); expect(opening.at(-1)).toBe(1);
      for (let i = 1; i < opening.length; i++) expect(opening[i]).toBeGreaterThanOrEqual(opening[i - 1]);
    }
  });

  it('Projector always brings the next photograph in from the right, hiding strip jumps behind the shutter', () => {
    for (const [name, roll] of Object.entries(ROLLS)) for (const aspect of [16 / 9, 9 / 16]) {
      const timeline = createScreeningTimeline(roll, options('projector', { aspect }));
      const countdown = timeline.cards.find(card => card.kind === 'countdown')!;
      // The countdown is projected in the lamp-lit gate, straight before the first photograph.
      for (const t of [countdown.start + .01, (countdown.start + countdown.end) / 2, countdown.end - .01]) {
        const sample = timeline.sample(t);
        expect(sample.lamp, name).toBe(1); expect(sample.fade).toBe(0); expect(sample.aperture).not.toBeNull();
      }
      const reveal = timeline.segments.find(s => s.kind === 'reveal')!;
      expect(reveal.frameIndex).toBe(0); expect(reveal.start - countdown.end).toBeLessThan(.6);
      expect(timeline.segments.filter(s => s.start > countdown.end && s.start < reveal.start).every(s => s.lamp !== null)).toBe(true);
      const advances = timeline.segments.filter(s => s.kind === 'advance');
      expect(advances.length, name).toBeGreaterThanOrEqual(roll.frames.length - 1); // the first opens on the shutter
      for (const segment of advances) {
        // Camera moves right, so the film image moves left; never vertically.
        expect(segment.camera[1].pan.x, `${name} ${segment.frameIndex}`).toBeGreaterThan(segment.camera[0].pan.x);
        expect(segment.camera[1].pan.z).toBeCloseTo(segment.camera[0].pan.z, 12);
        expect(segment.camera[0].yaw).toBe(0); expect(segment.camera[1].yaw).toBe(0);
      }
      const ordered = timeline.segments;
      for (let i = 1; i < ordered.length; i++) {
        const before = ordered[i - 1], after = ordered[i];
        if (JSON.stringify(before.camera[1]) === JSON.stringify(after.camera[0])) continue;
        // Cuts happen only in darkness: a strip change behind the closed shutter,
        // or moving to and from the gate while the room is black.
        const end = timeline.sample(before.start + before.duration - 1e-6), start = timeline.sample(after.start);
        const hidden = (sample: typeof end) => sample.shutter > .99 || sample.fade > .99 || sample.lamp === 0;
        expect(hidden(end) && hidden(start), `${name} ${before.kind}→${after.kind}`).toBe(true);
      }
      expect(samples(timeline, 1 / 24).some(sample => sample.dust > 0 && sample.shutter > 0)).toBe(true);
      const hold = ordered.find(s => s.kind === 'frame')!;
      const poses = [.2, .5, .8].map(u => timeline.sample(hold.start + hold.duration * u).camera.pan.x);
      expect(new Set(poses).size).toBe(3); // gate weave
      expect(Math.max(...poses) - Math.min(...poses)).toBeLessThan(hold.aperture!.width * .01);
    }
    const reduced = createScreeningTimeline(FULL_ROLL_FIXTURE, options('projector', { reducedMotion: true }));
    expect(samples(reduced, .1).every(sample => sample.dust === 0)).toBe(true);
  });
});

describe('M22 screening session', () => {
  it('plays, pauses, seeks by frame and never advances while paused or exporting', async () => {
    const { ScreeningSession } = await import('../../src/screening/session');
    const credits = { title: 'Roll', stock: 'Portra 400', format: '35mm', frames: 36 };
    const session = new ScreeningSession(FULL_ROLL_FIXTURE, { reel: 'develop', pace: 'normal', format: '16:9' }, { stockType: 'negative' }, credits, 4 / 3);
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

describe('M22 Develop opening (2026-09-27 review)', () => {
  it('shows black film on a dim diffuser, then switches the table on at once', () => {
    for (const reducedMotion of [false, true]) {
      const timeline = createScreeningTimeline(FULL_ROLL_FIXTURE, options('develop', { reducedMotion }));
      const title = timeline.cards[0];
      const dim = timeline.sample((title.start + title.end) / 2);
      expect(dim.light).toBe(0); expect(dim.ambient).toBe(1); expect(dim.fade).toBe(0);
      const on = timeline.segments.find(s => s.light.from === 0 && s.light.to === 1)!;
      expect(on.start).toBeGreaterThanOrEqual(title.end - 1e-9);
      expect(on.duration).toBeLessThanOrEqual(reducedMotion ? .8 : .15);
      expect(on.ambient).toEqual([1, 0]);
      expect(timeline.sample(on.start + on.duration + .01).light).toBe(1);
    }
  });
});
