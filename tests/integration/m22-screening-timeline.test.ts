import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BASELINE_ROLL, FULL_ROLL_FIXTURE, createRollLayout, locateFrame, type RollDefinition } from '../../src/utils/rollLayout';
import { FILM_UNIT, FRAME_GAP_MM, formatLayout } from '../../src/data/filmFormats';
import { FILM_RENDER_SCALE } from '../../src/data/physicalScale';
import { ROLL_FRAMES } from '../../src/data/rollManifest';
import { getStripDimensions } from '../../src/utils/loupeMapping';
import { ROOM_ENVELOPE, TABLE_CENTER_Z, TABLE_SURFACE_Y } from '../../src/utils/cameraBounds';
import { createScreeningTimeline, breakBoundaries, framing, tourRhythm, type ReelOptions } from '../../src/screening/reels';
import { PRINT_WALL_X } from '../../src/screening/prints';
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

  it('pause at strip boundaries in each reel\'s own way, never on the whole roll (2026-10-03 feedback)', () => {
    const boundaries = createRollLayout(FULL_ROLL_FIXTURE).slice(1).map(strip => strip.offset);
    // Projector never leaves the projection; strip changes stay behind the shutter (2026-09-27 review).
    expect(createScreeningTimeline(FULL_ROLL_FIXTURE, options('projector')).segments.some(s => s.act === 'break')).toBe(false);
    for (const reel of REEL_IDS.filter(reel => reel !== 'projector')) for (const aspect of [16 / 9, 9 / 16]) {
      const timeline = createScreeningTimeline(FULL_ROLL_FIXTURE, options(reel, { aspect }));
      const breaks = timeline.segments.filter(s => s.act === 'break');
      expect(new Set(breaks.map(s => s.frameIndex)), reel).toEqual(new Set(boundaries));
      const overview = framing(FULL_ROLL_FIXTURE, aspect).overview;
      for (const segment of breaks) for (const pose of segment.camera) {
        // Table reels stay with the strips either side; the whole roll means the start or the end.
        if (['tracking', 'develop', 'darkroom', 'orbit'].includes(reel)) expect(pose.zoom, `${reel} ${aspect}`).toBeLessThan(overview.zoom * .5);
        // Darkroom Prints stays at the print wall; Documentary on the photographs.
        if (reel === 'darkroom-prints') expect(pose.pan.x).toBeCloseTo(PRINT_WALL_X, 9);
        if (reel === 'documentary') expect(pose.tilt).toBe(0);
      }
      expect(createScreeningTimeline(BASELINE_ROLL, options(reel)).segments.some(s => s.act === 'break')).toBe(false);
      const mediumBreaks = new Set(createScreeningTimeline(medium, options(reel)).segments.filter(s => s.act === 'break').map(s => s.frameIndex)).size;
      expect(mediumBreaks).toBeGreaterThan(0);
      expect(mediumBreaks).toBeLessThan(createRollLayout(medium).length - 1);
    }
    expect(breakBoundaries(single).size).toBe(0);
    const at = (reel: ReelId) => createScreeningTimeline(FULL_ROLL_FIXTURE, options(reel));
    const pause = (timeline: ScreeningTimeline, boundary: number) => timeline.segments.find(s => s.act === 'break' && s.kind === 'overview' && s.frameIndex === boundary)!;
    // Develop stands back on the finished strip, now positive, above the next one still negative.
    const develop = at('develop');
    for (const boundary of boundaries) expect(develop.sample(pause(develop, boundary).start + .1).reveal!.position).toBe(boundary);
    // Darkroom dims the table as the dolly runs off the film.
    const darkroom = at('darkroom');
    expect(Math.min(...samples(darkroom, .1).filter(s => s.act === 'break').map(s => s.light))).toBeLessThan(.5);
    // Darkroom Prints never turns back to the film until the roll is finished.
    const prints = at('darkroom-prints');
    for (const sample of samples(prints, .1).filter(s => s.act === 'tour' || s.act === 'break')) expect(sample.camera.pan.x).toBeCloseTo(PRINT_WALL_X, 9);
    // Documentary dips through black, a chapter break, instead of dissolving.
    const documentary = at('documentary');
    for (const boundary of boundaries) {
      const dark = pause(documentary, boundary);
      expect(documentary.sample(dark.start + dark.duration / 2).fade).toBe(1);
      expect(documentary.segments.some(s => s.frameIndex === boundary && s.dissolve)).toBe(false);
    }
  });

  it('vary the rhythm with lingering looks and quick runs that pass without stopping (2026-10-03 feedback)', () => {
    const rhythm = tourRhythm(FULL_ROLL_FIXTURE);
    expect(rhythm.filter(beat => beat === 'linger')).toHaveLength(6);
    expect(new Set(rhythm.map(beat => beat[0]).join('').match(/q+/g)!.map(run => run.length))).toEqual(new Set([2, 3]));
    rhythm.forEach((beat, i) => { if (beat === 'quick') expect(locateFrame(FULL_ROLL_FIXTURE, i).localIndex).toBeGreaterThan(0); });
    for (const roll of [BASELINE_ROLL, medium, single]) expect(tourRhythm(roll)).not.toContain('quick');
    expect(tourRhythm(FULL_ROLL_FIXTURE, true)).not.toContain('quick');
    const quick = new Set(rhythm.flatMap((beat, i) => beat === 'quick' ? [i] : []));
    for (const reel of ['tracking', 'develop', 'darkroom', 'darkroom-prints'] as const) {
      const timeline = createScreeningTimeline(FULL_ROLL_FIXTURE, options(reel));
      const pan = (t: number) => timeline.sample(t).camera.pan;
      const speed = (a: number, b: number) => Math.hypot(pan(b).x - pan(a).x, pan(b).z - pan(a).z) / (b - a);
      const run = timeline.segments.filter(s => quick.has(s.frameIndex) && s.act === 'tour' && s.kind !== 'push');
      for (let i = 1; i < run.length; i++) {
        const t = run[i].start;
        if (run[i - 1].start + run[i - 1].duration !== t) continue;
        // Even speed across each joint within a run, never stopping.
        const before = speed(t - .02, t), after = speed(t, t + .02);
        expect(before, `${reel} ${run[i].frameIndex}`).toBeGreaterThan(0);
        expect(after / before, `${reel} ${run[i].frameIndex}`).toBeGreaterThan(.9); expect(after / before).toBeLessThan(1.1);
      }
    }
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
        expect(eye[1] - TABLE_SURFACE_Y, `${name} ${reel} ${sample.kind}`).toBeGreaterThan(.03);
        const room = (reel === 'darkroom' && (sample.act === 'establish' || sample.act === 'return')) || reel === 'darkroom-prints';
        if (room) {
          // Room shots stay inside the room, looking at most slightly up (as the room view does).
          expect(Math.abs(eye[0])).toBeLessThan(ROOM_ENVELOPE.width / 2); expect(eye[2]).toBeGreaterThan(ROOM_ENVELOPE.front); expect(eye[2]).toBeLessThan(ROOM_ENVELOPE.back);
          expect(tilt).toBeLessThanOrEqual(100 * Math.PI / 180);
        } else {
          expect(Math.abs(pan.x), `${name} ${reel} ${aspect}`).toBeLessThanOrEqual(halfWidth + (reel === 'projector' ? pitch : 1e-9));
          expect(Math.abs(TABLE_CENTER_Z - pan.z)).toBeLessThanOrEqual(halfHeight + 1e-6);
          expect(tilt).toBeLessThanOrEqual(80 * Math.PI / 180 + 1e-9);
        }
        expect(tilt).toBeGreaterThanOrEqual(0);
        expect(Math.abs(sample.camera.roll ?? 0)).toBeLessThanOrEqual(15 * Math.PI / 180);
      }
      // A focused frame is centered and mostly visible in the requested aspect.
      for (const segment of timeline.segments.filter(s => s.kind === 'frame' && !['tracking', 'darkroom', 'darkroom-prints', 'documentary'].includes(reel))) {
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
    const session = new ScreeningSession(FULL_ROLL_FIXTURE, { reel: 'develop', pace: 'normal', tuning: {} }, { stockType: 'negative' }, credits, 4 / 3);
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

describe('M22 Darkroom Prints and Documentary', () => {
  it('hangs one print per frame, one line per strip, along the left wall and clear of the bench', async () => {
    const { printLayout, PRINT_WALL_X } = await import('../../src/screening/prints');
    for (const [name, roll] of Object.entries(ROLLS)) {
      const { prints, lines } = printLayout(roll);
      expect(prints.map(p => p.index), name).toEqual(roll.frames.map((_, i) => i));
      expect(lines).toHaveLength(createRollLayout(roll).length);
      for (const print of prints) {
        expect(print.center[0]).toBe(PRINT_WALL_X);
        expect(print.center[1] - print.paper.height / 2, name).toBeGreaterThan(-.78); // above the printing bench top
        expect(print.hang[1]).toBeLessThan(ROOM_ENVELOPE.ceiling - .6);
        expect(print.center[2]).toBeGreaterThan(ROOM_ENVELOPE.front + .5); expect(print.center[2]).toBeLessThan(ROOM_ENVELOPE.back - .5);
        expect(print.photo.width).toBeLessThan(print.paper.width); expect(print.photo.height).toBeLessThan(print.paper.height);
      }
      // Along a line, prints run toward the table (−z), without overlapping.
      for (let i = 1; i < prints.length; i++) if (prints[i].line === prints[i - 1].line) {
        expect(prints[i - 1].center[2] - prints[i].center[2], name).toBeGreaterThan((prints[i - 1].paper.width + prints[i].paper.width) / 2);
      }
      const timeline = createScreeningTimeline(roll, options('darkroom-prints')), rhythm = tourRhythm(roll);
      for (const segment of timeline.segments.filter(s => s.kind === 'frame')) {
        // A quick print is passed without stopping: centred halfway through, or where a run settles.
        const print = prints[segment.frameIndex], quick = rhythm[segment.frameIndex] === 'quick';
        const pose = !quick ? segment.camera[0] : segment.ease === 'decelerate' ? segment.camera[1] : timeline.sample(segment.start + segment.duration / 2).camera;
        expect(pose.pan.x).toBeCloseTo(print.center[0], 9); expect(pose.pan.z).toBeCloseTo(print.center[2], 9);
        expect(TABLE_SURFACE_Y + (pose.height ?? 0)).toBeCloseTo(print.center[1], 9);
        expect(poseEye(pose)[0]).toBeGreaterThan(PRINT_WALL_X + .3);
      }
    }
  });

  it('keeps every line of prints clear of the row above, up to a 36-exposure roll', async () => {
    const { printLayout } = await import('../../src/screening/prints');
    const rotated = (roll: RollDefinition, every: number): RollDefinition => ({ ...roll, frames: roll.frames.map((frame, i) => i % every ? frame : { ...frame, rotation: 90 }) });
    const thirtySix: RollDefinition = { ...BASELINE_ROLL, rollId: '36', frames: frames(36) };
    const sixFourFive: RollDefinition = { ...medium, rollId: '645', frames: frames(16), framesPerStrip: 4, layout: formatLayout('645'), format: '645' };
    const cases = { ...ROLLS, thirtySix, portraits: rotated(thirtySix, 1), mixed: rotated(thirtySix, 3), medium: rotated(medium, 2), sixFourFive, mediumPortraits: rotated(sixFourFive, 1) };
    for (const [name, roll] of Object.entries(cases)) {
      const { prints, lines } = printLayout(roll);
      expect(prints.map(p => p.index), name).toEqual(roll.frames.map((_, i) => i));
      for (const print of prints) {
        expect(print.center[1] - print.paper.height / 2, name).toBeGreaterThan(-.72);
        expect(print.hang[1], name).toBeLessThan(ROOM_ENVELOPE.ceiling - .6);
        // Prints stay a readable size.
        expect(Math.max(print.paper.width, print.paper.height), name).toBeGreaterThan(.3);
      }
      // No print reaches the next line down, or any print on it, along the same stretch of wall.
      for (const upper of prints) for (const lower of prints) {
        const [a, b] = [lines[upper.line], lines[lower.line]];
        if (lower.line === upper.line || b.y >= a.y || b.zFrom !== a.zFrom) continue;
        expect(upper.center[1] - upper.paper.height / 2, `${name} ${upper.index}/${lower.index}`).toBeGreaterThan(b.y + .03);
      }
      // Along a line, prints run toward the table (−z), without overlapping.
      for (let i = 1; i < prints.length; i++) if (prints[i].line === prints[i - 1].line)
        expect(prints[i - 1].center[2] - prints[i].center[2], name).toBeGreaterThan((prints[i - 1].paper.width + prints[i].paper.width) / 2);
    }
  });

  it('dissolves into every photograph after the first but those after a pause, drifting and pushing in within the photo', () => {
    for (const [name, roll] of Object.entries(ROLLS)) for (const aspect of [16 / 9, 9 / 16]) {
      const timeline = createScreeningTimeline(roll, options('documentary', { aspect }));
      const pauses = breakBoundaries(roll);
      for (let i = 1; i < roll.frames.length; i++) {
        // A strip change dips through black instead (see the pause test).
        if (pauses.has(i)) continue;
        const into = timeline.segments.find(s => s.frameIndex === i && s.dissolve)!;
        expect(into, `${name} ${i}`).toBeDefined();
        const start = timeline.sample(into.start + 1e-4), middle = timeline.sample(into.start + into.duration / 2);
        expect(start.dissolve!.amount).toBeLessThan(.01); expect(middle.dissolve!.amount).toBeCloseTo(.5, 1);
        expect(start.dissolve!.from).toBeLessThan(into.start);
        // The outgoing image is the shot just before: the previous photograph.
        expect(timeline.sample(start.dissolve!.from).segment).toBe(timeline.segments.indexOf(into) - 1);
        expect(timeline.sample(into.start + into.duration + 1e-4).dissolve).toBeNull();
      }
      for (const segment of timeline.segments.filter(s => s.kind === 'frame')) {
        const frame = locateFrame(roll, segment.frameIndex), [a, b] = segment.camera;
        expect(b.zoom / a.zoom, name).toBeLessThan(.97); expect(b.zoom / a.zoom).toBeGreaterThan(.85);
        const width = (frame.strip.layout.frameWidths?.[frame.localIndex] ?? frame.strip.layout.frameWidth) * roll.scale;
        for (const pose of [a, b]) {
          expect(Math.abs(pose.pan.x - frame.x)).toBeLessThanOrEqual(width / 2);
          expect(Math.abs(TABLE_CENTER_Z - pose.pan.z - frame.y)).toBeLessThanOrEqual(frame.strip.layout.frameHeight * roll.scale / 2);
        }
      }
    }
    const reduced = createScreeningTimeline(FULL_ROLL_FIXTURE, options('documentary', { reducedMotion: true }));
    for (const segment of reduced.segments.filter(s => s.kind === 'frame' || s.dissolve)) {
      expect(segment.camera[0]).toEqual(segment.camera[1]); expect(segment.cut).toBe(false);
    }
    expect(reduced.segments.filter(s => s.dissolve)).toHaveLength(35 - breakBoundaries(FULL_ROLL_FIXTURE).size);
  });

  it('turns the camera so rotated photographs stand upright', () => {
    const rotated = { ...BASELINE_ROLL, rollId: 'rot', frames: BASELINE_ROLL.frames.map((frame, i) => ({ ...frame, rotation: [0, 90, 180, 270, 0][i] })) };
    const timeline = createScreeningTimeline(rotated, options('documentary'));
    const yaws = [0, 1, 2, 3].map(i => timeline.segments.find(s => s.kind === 'frame' && s.frameIndex === i)!.camera[1].yaw);
    expect(yaws).toEqual([0, -Math.PI / 2, Math.PI, Math.PI / 2]);
    // Upright photographs in landscape video are shown whole, pillarboxed in black.
    const mattes = [0, 1, 2, 3].map(i => timeline.segments.find(s => s.kind === 'frame' && s.frameIndex === i)!.matte);
    expect(mattes[0]).toBeNull(); expect(mattes[2]).toBeNull();
    expect(mattes[1]!.height).toBeGreaterThan(mattes[1]!.width); expect(mattes[3]!.alpha).toEqual([1, 1]);
    // Landscape photographs in portrait video are letterboxed, fading in and out.
    const tall = createScreeningTimeline(BASELINE_ROLL, options('documentary', { aspect: 9 / 16 }));
    expect(tall.segments.filter(s => s.kind === 'frame').every(s => s.matte && s.matte.width > s.matte.height)).toBe(true);
    expect(tall.segments.find(s => s.kind === 'push-in')!.matte!.alpha).toEqual([0, 1]);
    expect(tall.segments.find(s => s.act === 'return')!.matte!.alpha).toEqual([1, 0]);
  });
});

describe('M22 reel settings and depth of field (2026-09-28 feedback)', () => {
  const EXTREMES = [[0, 0], [1, 1], [0, 1], [1, 0]];
  it('give every reel at most two settings of its own, clamped, with defaults that change nothing', async () => {
    const { REEL_SETTINGS, reelTuning } = await import('../../src/screening/reels');
    for (const reel of REEL_IDS) {
      const settings = REEL_SETTINGS[reel];
      expect(settings.length, reel).toBeGreaterThanOrEqual(1); expect(settings.length).toBeLessThanOrEqual(2);
      expect(new Set(settings.map(s => s.label)).size).toBe(settings.length);
      expect(reelTuning(reel)).toEqual(settings.map(s => s.initial));
      expect(reelTuning(reel, [-3, 7])).toEqual([0, 1].slice(0, settings.length));
      expect(reelTuning(reel, [Number.NaN])).toEqual(settings.map(s => s.initial));
      const plain = createScreeningTimeline(FULL_ROLL_FIXTURE, options(reel));
      const explicit = createScreeningTimeline(FULL_ROLL_FIXTURE, options(reel, { tuning: settings.map(s => s.initial) }));
      expect(explicit.look).toEqual(plain.look);
      expect(samples(explicit, .37)).toEqual(samples(plain, .37));
    }
  });

  it('each setting changes its reel, and the camera stays in bounds at every extreme', async () => {
    const { REEL_SETTINGS } = await import('../../src/screening/reels');
    for (const reel of REEL_IDS) for (const index of REEL_SETTINGS[reel].map((_, i) => i)) {
      const at = (value: number) => { const tuning = REEL_SETTINGS[reel].map(s => s.initial); tuning[index] = value; return createScreeningTimeline(BASELINE_ROLL, options(reel, { tuning })); };
      const low = at(0), high = at(1);
      const differs = JSON.stringify(low.look) !== JSON.stringify(high.look) || JSON.stringify(samples(low, .5)) !== JSON.stringify(samples(high, .5));
      expect(differs, `${reel} ${REEL_SETTINGS[reel][index].label}`).toBe(true);
    }
    for (const roll of [BASELINE_ROLL, FULL_ROLL_FIXTURE, medium]) for (const aspect of [16 / 9, 9 / 16]) for (const reel of REEL_IDS) for (const tuning of EXTREMES) {
      const timeline = createScreeningTimeline(roll, options(reel, { aspect, tuning }));
      const visits = timeline.segments.filter(segment => segment.kind === 'frame').map(segment => segment.frameIndex);
      expect(visits).toEqual(roll.frames.map((_, i) => i));
      for (const sample of samples(timeline, 1 / 5)) {
        const eye = poseEye(sample.camera);
        expect([...eye, sample.light, sample.camera.zoom].every(Number.isFinite)).toBe(true);
        expect(eye[1] - TABLE_SURFACE_Y, `${reel} ${tuning}`).toBeGreaterThan(.03);
        expect(sample.camera.tilt).toBeGreaterThanOrEqual(0);
        const room = (reel === 'darkroom' && (sample.act === 'establish' || sample.act === 'return')) || reel === 'darkroom-prints';
        if (room) { expect(Math.abs(eye[0])).toBeLessThan(ROOM_ENVELOPE.width / 2); expect(eye[2]).toBeGreaterThan(ROOM_ENVELOPE.front); expect(eye[2]).toBeLessThan(ROOM_ENVELOPE.back); }
        else expect(sample.camera.tilt, `${reel} ${tuning}`).toBeLessThanOrEqual(80 * Math.PI / 180 + 1e-9);
      }
    }
  }, 60000);

  it('map settings to what they name', () => {
    const at = (reel: ReelId, tuning: number[]) => createScreeningTimeline(FULL_ROLL_FIXTURE, options(reel, { tuning }));
    const frame = (timeline: ScreeningTimeline, i = 3) => timeline.segments.find(s => s.kind === 'frame' && s.frameIndex === i)!;
    // Distance: the tracking camera is closer or farther from the film.
    expect(frame(at('tracking', [0, .5])).camera[1].zoom).toBeLessThan(frame(at('tracking', [.5, .5])).camera[1].zoom * .75);
    expect(frame(at('tracking', [1, .5])).camera[1].zoom).toBeGreaterThan(frame(at('tracking', [.5, .5])).camera[1].zoom * 1.3);
    // Depth of field: none at Deep, stronger toward Shallow; only reels that look across the scene have it.
    expect(at('tracking', [.5, 0]).look.aperture).toBe(0);
    expect(at('tracking', [.5, 1]).look.aperture).toBeGreaterThan(at('tracking', [.5, .5]).look.aperture * 2);
    for (const reel of ['tracking', 'darkroom', 'orbit', 'darkroom-prints'] as const) expect(at(reel, []).look.aperture, reel).toBeGreaterThan(0);
    for (const reel of ['develop', 'projector', 'documentary'] as const) expect(at(reel, []).look.aperture, reel).toBe(0);
    // Develop: no push-in at None; the band softens toward Soft.
    const still = frame(at('develop', [0, .5]), 1);
    expect(still.camera[1].zoom).toBeGreaterThan(frame(at('develop', [.5, .5]), 1).camera[1].zoom * 1.15);
    expect(at('develop', [.5, 1]).look.band).toBeGreaterThan(at('develop', [.5, 0]).look.band * 5);
    // Projector: a steady gate and lamp at the low ends.
    const steady = at('projector', [0, 0]);
    expect(steady.look.weave).toBe(0); expect(steady.look.flicker).toBe(0);
    const held = steady.segments.find(s => s.kind === 'frame' && s.frameIndex === 2)!;
    expect(steady.sample(held.start + .1).camera).toEqual(steady.sample(held.start + .3).camera);
    expect(steady.sample(held.start + .1).light).toBe(steady.sample(held.start + .3).light);
    // Darkroom: a higher camera looks more nearly straight down.
    expect(frame(at('darkroom', [.5, 1])).camera[1].tilt).toBeLessThan(frame(at('darkroom', [.5, 0])).camera[1].tilt);
    // Orbit: a wider arc swings farther around the photograph.
    const arc = (tuning: number[]) => Math.abs(at('orbit', tuning).segments.find(s => s.kind === 'orbit' && s.frameIndex === 3)!.camera[0].yaw);
    expect(arc([1, .5])).toBeGreaterThan(arc([0, .5]) * 3);
    // Darkroom Prints: face on at the low end; along the line, the camera stands back toward +z.
    const print = (tuning: number[]) => { const pose = frame(at('darkroom-prints', tuning)).camera[0]; return poseEye(pose)[2] - pose.pan.z; };
    expect(print([.5, 0])).toBeCloseTo(0, 6); expect(print([.5, 1])).toBeGreaterThan(.3);
    // Documentary: Still holds each photograph; the dissolve length sets the running time.
    for (const segment of at('documentary', [0, .5]).segments.filter(s => s.kind === 'frame')) {
      const [a, b] = segment.camera;
      expect(b.zoom).toBeCloseTo(a.zoom, 9); expect(b.pan.x).toBeCloseTo(a.pan.x, 9); expect(b.pan.z).toBeCloseTo(a.pan.z, 9);
    }
    const quick = at('documentary', [.5, 0]), long = at('documentary', [.5, 1]);
    expect(long.duration - quick.duration).toBeGreaterThan(35 * 1.5);
    expect(long.segments.find(s => s.dissolve)!.duration).toBeGreaterThan(quick.segments.find(s => s.dissolve)!.duration * 3);
  });

  it('blurs by relative defocus, not at the focus distance, and more for close focus', async () => {
    const { blurFraction, MAX_BLUR } = await import('../../src/screening/depthOfField');
    expect(blurFraction(.05, .2, .2)).toBe(0);
    expect(blurFraction(.05, .2, .26)).toBeGreaterThan(blurFraction(.05, .2, .22));
    expect(blurFraction(.05, .2, 100)).toBe(MAX_BLUR);
    expect(blurFraction(.02, .15, .15 * 1.3)).toBeGreaterThan(blurFraction(.02, 3, 3 * 1.3));
    expect(blurFraction(0, .2, 5)).toBe(0);
  });
});

describe('M22 playback smoothness (2026-09-29 feedback)', () => {
  it('steps quality down when frames miss 60 fps, back up after smooth playback, and backs off a level that fails again', async () => {
    const { PlaybackGovernor, QUALITY_LEVELS } = await import('../../src/screening/governor');
    const run = (governor: InstanceType<typeof PlaybackGovernor>, interval: number, frames: number) => { for (let i = 0; i < frames; i++) governor.frame(interval); };
    const governor = new PlaybackGovernor();
    run(governor, 1 / 60, 600); expect(governor.level).toBe(0);
    // Occasional late frames (under 10%) are tolerated.
    for (let i = 0; i < 600; i++) governor.frame(i % 20 === 0 ? 1 / 30 : 1 / 60);
    expect(governor.level).toBe(0);
    // Steady 30 fps steps all the way down: samples, then depth of field, then resolution.
    run(governor, 1 / 30, 2000);
    expect(governor.level).toBe(QUALITY_LEVELS.length - 1);
    const scales = QUALITY_LEVELS.map(q => q.scale), samples = QUALITY_LEVELS.map(q => q.samples);
    expect(scales).toEqual([...scales].sort((a, b) => b - a)); expect(samples).toEqual([...samples].sort((a, b) => b - a));
    expect(QUALITY_LEVELS[1].scale).toBe(1); expect(Math.min(...scales)).toBeGreaterThanOrEqual(.75);
    // Depth of field goes before any resolution: a scaled-up frame shows jagged edges in motion.
    expect(QUALITY_LEVELS.find(q => q.scale < 1)?.samples).toBe(0);
    // Pauses and hidden pages are ignored.
    const idle = new PlaybackGovernor(); run(idle, 2, 500); run(idle, 0, 500); expect(idle.level).toBe(0);
    // A slow device (15 fps) reaches the lowest level within a few seconds, two levels at a time.
    const slow = new PlaybackGovernor(); let frames = 0;
    while (slow.level < QUALITY_LEVELS.length - 1 && frames < 1000) { slow.frame(1 / 15); frames++; }
    expect(frames / 15).toBeLessThan(6);
    // Frames until the level changes, at a steady interval.
    const until = (interval: number) => { const from = governor.level; let n = 0; while (governor.level === from && n < 5000) { governor.frame(interval); n++; } return n; };
    const top = QUALITY_LEVELS.length - 1;
    // Smooth playback climbs back one level at a time, after a few calm seconds.
    const first = until(1 / 60);
    expect(governor.level).toBe(top - 1); expect(first / 60).toBeGreaterThan(1.5); expect(first / 60).toBeLessThan(4);
    // A restored level that fails at once waits about twice as long before the next attempt.
    expect(until(1 / 30) / 30).toBeLessThan(1.5); expect(governor.level).toBe(top);
    const second = until(1 / 60);
    expect(governor.level).toBe(top - 1); expect(second).toBeGreaterThan(first * 1.6);
  });

  it('holds the timeline while the scene prepares', async () => {
    const { ScreeningSession } = await import('../../src/screening/session');
    const session = new ScreeningSession(BASELINE_ROLL, { reel: 'tracking', pace: 'normal', tuning: {} }, { stockType: 'negative' }, { title: 'Roll', stock: 'Portra 400', format: '35mm', frames: 5 }, 16 / 9);
    session.holding = true; session.tick(.05); expect(session.time).toBe(0);
    session.holding = false; session.tick(.05); expect(session.time).toBeCloseTo(.05);
  });

  it('knows when the overlay has nothing to draw', async () => {
    const { overlayIsEmpty } = await import('../../src/screening/overlay');
    const tracking = createScreeningTimeline(BASELINE_ROLL, options('tracking'));
    expect(overlayIsEmpty(tracking.sample(0))).toBe(false); // opening from black
    expect(overlayIsEmpty(tracking.sample(tracking.frameStart(2) + .3))).toBe(true);
    const projector = createScreeningTimeline(BASELINE_ROLL, options('projector'));
    expect(overlayIsEmpty(projector.sample(projector.frameStart(2) + .3))).toBe(false); // the lit gate
  });
});
