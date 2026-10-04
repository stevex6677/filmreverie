import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { BASELINE_ROLL, FULL_ROLL_FIXTURE, locateFrame, type RollDefinition } from '../../src/utils/rollLayout';
import { formatLayout } from '../../src/data/filmFormats';
import { TABLE_CENTER_Z, TABLE_SURFACE_Y } from '../../src/utils/cameraBounds';
import { createScreeningTimeline, type ReelOptions } from '../../src/screening/reels';
import { journeyTreatments } from '../../src/screening/filmJourney';
import { applyScreeningPose } from '../../src/screening/camera';
import { poseEye, type CameraPose } from '../../src/screening/timeline';

const build = (roll = FULL_ROLL_FIXTURE, extra: Partial<ReelOptions> = {}) => createScreeningTimeline(roll,
  { reel: 'film-journey', pace: 'normal', aspect: 16 / 9, stockType: 'negative', ...extra });
const vector = (p: CameraPose) => [...poseEye(p), p.pan.x, p.pan.z, p.yaw, p.tilt, Math.log(p.zoom)];
const mixed: RollDefinition = { ...FULL_ROLL_FIXTURE, frames: FULL_ROLL_FIXTURE.frames.map((f, i) => ({ ...f,
  rotation: [0, 90, 270, 0][i % 4], uprightRotation: 0 })) };
const medium: RollDefinition = { ...mixed, format: '67', layout: formatLayout('67'), framesPerStrip: 3, frames: mixed.frames.slice(0, 10) };
const free: RollDefinition = { ...mixed, frames: mixed.frames.slice(0, 13), frameWidths: Array.from({ length: 13 }, (_, i) => formatLayout('135').frameHeight * [1, 2.4, .7][i % 3]), stripLength: 2.2 };

describe('Film Journey', () => {
  it('has no edits, hidden jumps or projector/print effects, including reduced motion and bookends', () => {
    for (const roll of [BASELINE_ROLL, mixed, medium, free]) for (const reducedMotion of [false, true]) {
      const t = build(roll, { reducedMotion });
      expect(t.cards.map(c => c.kind)).toEqual(['title', 'end']);
      expect(t.segments.filter(s => s.kind === 'frame').map(s => s.frameIndex)).toEqual(roll.frames.map((_, i) => i));
      for (const [i, s] of t.segments.entries()) {
        expect(s.cut || s.dissolve || s.weave).toBe(false);
        expect(s.shutter).toBeNull(); expect(s.matte).toBeNull(); expect(s.lamp).toBeNull(); expect(s.gate).toEqual([0, 0]);
        if (i) expect(s.camera[0]).toEqual(t.segments[i - 1].camera[1]);
        // Every passage moves, even at the minimum setting and while developing.
        expect(vector(t.sample(s.start + s.duration * .2).camera)).not.toEqual(vector(t.sample(s.start + s.duration * .8).camera));
      }
      for (let time = 0; time <= t.duration; time += .2) expect(t.sample(time).fade).toBe(0);
    }
  });

  it('carries continuous position AND velocity across every camera joint at both movement extremes', () => {
    for (const roll of [mixed, medium, free]) for (const aspect of [16 / 9, 1, 9 / 16]) for (const movement of [0, 1]) {
      const t = build(roll, { aspect, tuning: [movement, .5] }), h = 1e-4;
      for (const segment of t.segments.slice(1)) {
        const time = segment.start, before = vector(t.sample(time - h).camera), at = vector(t.sample(time).camera), after = vector(t.sample(time + h).camera);
        for (let axis = 0; axis < at.length; axis++) {
          expect(Math.abs(after[axis] - before[axis])).toBeLessThan(.002);
          expect(Math.abs((at[axis] - before[axis]) / h - (after[axis] - at[axis]) / h)).toBeLessThan(.004);
        }
      }
    }
  });

  it('only develops negative stocks, never undoes a reveal, and allows a positive viewing passage after each feature', () => {
    for (const tuning of [[0, 0], [.65, .5], [1, 1]]) {
      const t = build(FULL_ROLL_FIXTURE, { tuning });
      const features = t.segments.filter(s => s.kind === 'develop');
      expect(features.length).toBeGreaterThan(0); expect(features.length).toBeLessThanOrEqual(7);
      let previous = 0;
      for (let time = 0; time <= t.duration; time += .05) {
        const r = t.sample(time).reveal!;
        expect(r.mode).toBe('polarity'); expect(r.position).toBeGreaterThanOrEqual(previous - 1e-9); previous = r.position;
      }
      expect(t.sample(t.duration).reveal!.position).toBe(36);
      for (const s of features) {
        expect(s.reveal).toEqual([s.frameIndex, s.frameIndex + 1]);
        const viewing = t.segments.find(v => v.frameIndex === s.frameIndex && v.kind === 'frame')!;
        expect(viewing.reveal![0]).toBeGreaterThanOrEqual(s.frameIndex + 1);
        expect(viewing.duration).toBeGreaterThanOrEqual(2.5);
      }
      const reversal = build(FULL_ROLL_FIXTURE, { stockType: 'reversal', tuning });
      expect(reversal.revealMode).toBeNull();
      expect(reversal.segments.some(s => s.kind === 'develop' || s.reveal !== null)).toBe(false);
    }
  });

  it('keeps the complete photograph visible and upright during viewing, including portrait and free-format frames', () => {
    for (const roll of [mixed, medium, free]) for (const aspect of [16 / 9, 1, 9 / 16]) for (const movement of [0, 1]) {
      const t = build(roll, { aspect, tuning: [movement, 1] }), camera = new PerspectiveCamera(45, aspect);
      for (const s of t.segments.filter(s => s.kind === 'frame')) for (const u of [.05, .5, .95]) {
        const p = t.sample(s.start + s.duration * u).camera, frame = locateFrame(roll, s.frameIndex);
        applyScreeningPose(camera, p);
        const w = (frame.strip.layout.frameWidths?.[frame.localIndex] ?? frame.strip.layout.frameWidth) * frame.strip.scale;
        const h = frame.strip.layout.frameHeight * frame.strip.scale;
        for (const x of [-1, 1]) for (const y of [-1, 1]) {
          const corner = new Vector3(frame.x + x * w / 2, TABLE_SURFACE_Y, TABLE_CENTER_Z - frame.y + y * h / 2).project(camera);
          expect(Math.abs(corner.x)).toBeLessThan(1); expect(Math.abs(corner.y)).toBeLessThan(1);
        }
      }
    }
  });

  it('varies treatment frequency, keeps Develop and Orbit apart, and scales down for short rolls', () => {
    const low = journeyTreatments(36, 0, true), high = journeyTreatments(36, 1, true);
    expect(high.filter(t => t === 'develop').length).toBeGreaterThan(low.filter(t => t === 'develop').length);
    const changes = (list: string[]) => list.filter((t, i) => i && list[i - 1] !== t).length;
    expect(changes(high)).toBeGreaterThan(changes(low));
    for (const negative of [false, true]) {
      const list = journeyTreatments(36, .5, negative);
      expect(new Set(list)).toEqual(new Set(negative ? ['documentary', 'tracking', 'orbit', 'develop'] : ['documentary', 'tracking', 'orbit']));
      list.forEach((t, i) => { if (t === 'develop') { expect(list[i - 1]).not.toBe('orbit'); expect(list[i + 1]).not.toBe('orbit'); } });
    }
    expect(journeyTreatments(3, 1, true).filter(t => t === 'develop')).toHaveLength(1);
    const one = build({ ...BASELINE_ROLL, frames: BASELINE_ROLL.frames.slice(0, 1) });
    expect(one.duration).toBeLessThan(14);
  });

  it('shows distinctly oblique views from both sides at the default movement, while Develop stays quieter', () => {
    const t = build();
    const views = t.segments.filter(s => s.kind === 'frame');
    const poses = views.flatMap(s => s.camera);
    expect(Math.max(...poses.map(p => p.tilt))).toBeGreaterThan(25 * Math.PI / 180);
    expect(Math.max(...poses.map(p => p.yaw))).toBeGreaterThan(8 * Math.PI / 180);
    expect(Math.min(...poses.map(p => p.yaw))).toBeLessThan(-8 * Math.PI / 180);
    const motion = (timeline: typeof t) => timeline.segments.filter(s => s.kind === 'frame')
      .reduce((sum, s) => sum + Math.hypot(s.camera[1].pan.x - s.camera[0].pan.x, s.camera[1].pan.z - s.camera[0].pan.z), 0);
    expect(motion(t)).toBeGreaterThan(motion(build(FULL_ROLL_FIXTURE, { tuning: [0, .5] })) * 3);
    for (const s of t.segments.filter(s => s.kind === 'develop')) {
      expect(Math.abs(s.camera[1].yaw - s.camera[0].yaw)).toBeLessThan(2 * Math.PI / 180);
      expect(s.camera[0].tilt).toBeLessThan(10 * Math.PI / 180);
    }
  });

  it('keeps Normal pace brisk enough for a full roll, with time to see every photograph', () => {
    // Before the faster revision these ran about 34 and 186 seconds.
    expect(build(BASELINE_ROLL).duration).toBeLessThan(26);
    expect(build().duration).toBeLessThan(140);
    for (const s of build().segments.filter(s => s.kind === 'frame')) {
      expect(s.duration).toBeGreaterThanOrEqual(2);
      expect(s.duration).toBeLessThan(3);
    }
  });

  it('spends most time viewing, changes holds more than travel with Pace, and reduces motion without introducing cuts', () => {
    const normal = build(), relaxed = build(FULL_ROLL_FIXTURE, { pace: 'relaxed' }), reduced = build(FULL_ROLL_FIXTURE, { reducedMotion: true });
    const sum = (t: typeof normal, kind: string) => t.segments.filter(s => s.kind === kind).reduce((total, s) => total + s.duration, 0);
    // Faster holds still occupy the majority of the reel; Develop and Orbit
    // passages also show the photograph but aren't counted as settled viewing.
    expect(sum(normal, 'frame') / normal.duration).toBeGreaterThan(.6);
    expect(sum(relaxed, 'frame') / sum(normal, 'frame')).toBeCloseTo(1.3);
    expect(sum(relaxed, 'glide') / sum(normal, 'glide')).toBeLessThan(1.1);
    expect(sum(reduced, 'glide')).toBeGreaterThan(sum(normal, 'glide'));
    const travel = (t: typeof normal) => t.segments.filter(s => s.kind === 'frame').reduce((total, s) => total + Math.abs(s.camera[1].pan.x - s.camera[0].pan.x), 0);
    expect(travel(reduced)).toBeLessThan(travel(normal) * .1);
    expect(reduced.segments.every(s => !s.cut && !s.dissolve)).toBe(true);
    for (const aspect of [1, 9 / 16]) expect(build(FULL_ROLL_FIXTURE, { aspect }).duration).toBe(normal.duration);
  });
});
