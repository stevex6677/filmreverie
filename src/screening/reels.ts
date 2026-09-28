import { createRollLayout, fitRollView, locateFrame, type RollDefinition } from '../utils/rollLayout';
import { getStripDimensions } from '../utils/loupeMapping';
import { loupeGeometry, loupeInspectionView, type LoupeType } from '../utils/loupeView';
import { finishTimeline, PACE_SCALE, tablePan, TimelineBuilder, type CameraPose, type LoupePose, type Pace, type ReelId, type ScreeningTimeline } from './timeline';

export interface ReelOptions {
  reel: ReelId; pace: Pace; aspect: number; reducedMotion?: boolean;
  /** Reversal stock has no negative stage; Develop reveals its backlight instead. */
  stockType: 'negative' | 'reversal';
  loupe: { scale: number; type: LoupeType };
}

export const REEL_LABEL: Record<ReelId, string> = { 'loupe-walk': 'Loupe Walk', develop: 'Develop', projector: 'Projector' };
export const REEL_DESCRIPTION: Record<ReelId, string> = {
  'loupe-walk': 'The loupe glides along each strip and stops to inspect details.',
  develop: 'A band of light turns each negative into a photograph.',
  projector: 'Each frame jumps into a projector gate, in rhythm.',
};
export const PACE_LABEL: Record<Pace, string> = { relaxed: 'Relaxed', normal: 'Normal', brisk: 'Brisk' };

const TAN = Math.tan(Math.PI / 8);
const degrees = (value: number) => value * Math.PI / 180;

/** Output-aspect framing; the whole roll with a video-safe margin rather than room for controls. */
function framing(roll: RollDefinition, aspect: number) {
  const strips = createRollLayout(roll);
  const halfWidth = Math.max(...strips.map(strip => getStripDimensions(strip.layout).width * strip.scale / 2));
  const stripHeight = getStripDimensions(strips[0].layout).height * roll.scale;
  const span = strips[0].y - strips[strips.length - 1].y + stripHeight;
  const fit = (width: number, height: number, x = 0, y = 0): CameraPose => ({ zoom: Math.max(height, width / Math.max(.2, aspect)) / (2 * TAN), pan: tablePan(x, y), tilt: 0, yaw: 0 });
  const frame = (index: number): CameraPose => { const view = fitRollView(roll, 'frame', index, aspect); return { zoom: view.zoom, pan: view.pan, tilt: 0, yaw: 0 }; };
  // Portrait video turns whole-roll shots 90° so the strips run down the frame;
  // close shots keep photographs upright.
  const whole = (length: number, across: number): CameraPose => aspect < .8 ? { ...fit(across, length), yaw: Math.PI / 2 } : fit(length, across);
  return { strips, halfWidth, stripHeight, span, fit, frame, whole, overview: whole(halfWidth * 2 * 1.1, span * 1.2) };
}

function drift(pose: CameraPose, amount = 1): CameraPose {
  return { ...pose, zoom: pose.zoom * (1 - .035 * amount), yaw: pose.yaw + degrees(pose.tilt ? 1.6 : .5) * amount };
}

/** Breaks are overview shots at strip boundaries. Short rolls get fewer; medium format fewer still. */
export function breakBoundaries(roll: RollDefinition) {
  const strips = createRollLayout(roll);
  const boundaries = strips.slice(1).map(strip => strip.offset);
  if (roll.frames.length < 8) return new Set<number>();
  const medium = roll.format !== undefined && roll.format !== '135';
  const every = medium || roll.frames.length < 16 ? 2 : 1;
  return new Set(boundaries.filter((_, index) => (index + 1) % every === 0 || boundaries.length === 1));
}

export function isMediumFormat(roll: RollDefinition) { return roll.format !== undefined && roll.format !== '135'; }

export function createScreeningTimeline(roll: RollDefinition, options: ReelOptions): ScreeningTimeline {
  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 16 / 9;
  const reduced = !!options.reducedMotion;
  const scale = PACE_SCALE[options.pace] ?? 1;
  const f = framing(roll, aspect);
  const breaks = breakBoundaries(roll);
  const medium = isMediumFormat(roll);
  const n = roll.frames.length;
  const holdScale = medium ? 1.35 : 1;
  const info = { reel: options.reel, pace: options.pace, aspect, reducedMotion: reduced, frameCount: n };

  if (options.reel === 'loupe-walk') {
    const loupeRadius = loupeGeometry(options.loupe.type).radius * options.loupe.scale;
    const bottom = f.strips[f.strips.length - 1];
    const rest: LoupePose = { x: f.halfWidth + loupeRadius * 1.6, y: bottom.y, lift: 0, magnification: 4 };
    const establishing = f.whole((rest.x + loupeRadius * 2.2) * 2, f.span * 1.2);
    const at = (index: number, lift = 0, magnification = 4): LoupePose => { const frame = locateFrame(roll, index); return { x: frame.x, y: frame.y, lift, magnification }; };
    // A low, angled eye that follows the lens along the film.
    const walk = (index: number, point: LoupePose = at(index)): CameraPose => ({ zoom: f.frame(index).zoom * 1.85, pan: tablePan(point.x, point.y), tilt: degrees(32), yaw: degrees(-8) });
    const inspect = (point: LoupePose): CameraPose => { const view = loupeInspectionView(point.x, point.y, options.loupe.scale, aspect, options.loupe.type); return { zoom: view.zoom, pan: view.pan, tilt: 0, yaw: 0 }; };
    const inspections = new Set(Array.from({ length: n }, (_, i) => i).filter(i => n < 6 ? i === Math.floor(n / 2) : i % 6 === 2));
    const b = new TimelineBuilder(establishing, rest, scale, reduced);
    b.fade(b.seconds(.9), 0);
    b.step('establish', 'open', 0, 3.2, { camera: drift(establishing), drift: true });
    b.card('title', b.seconds(.5), b.seconds(3));
    b.step('establish', 'lift', 0, 2.1, { camera: walk(0), loupe: at(0), arc: loupeRadius * .5 });
    let inspected = 0;
    for (let i = 0; i < n; i++) {
      const frame = locateFrame(roll, i), wide = frame.strip.layout.frameWidths?.[frame.localIndex] ?? frame.strip.layout.frameWidth;
      if (i > 0) {
        if (frame.localIndex > 0) b.step('tour', 'glide', i, .9, { camera: walk(i), loupe: at(i), arc: loupeRadius * .18, beat: true });
        else if (breaks.has(i)) {
          b.step('break', 'pull-back', i, 1.4, { camera: f.overview, loupe: at(i - 1, loupeRadius * .35) });
          b.step('break', 'overview', i, 1.5, { loupe: at(i, loupeRadius * .35) });
          b.step('break', 'push-in', i, 1.4, { camera: walk(i), loupe: at(i), beat: true });
        } else b.step('tour', 'glide', i, 1.9, { camera: walk(i), loupe: at(i), arc: loupeRadius * .4, beat: true });
      }
      if (inspections.has(i)) {
        const magnification = inspected++ % 2 ? 4 : 8;
        const detail = { x: frame.x + wide * frame.strip.scale * .22, y: frame.y - frame.strip.layout.frameHeight * frame.strip.scale * .14, lift: 0, magnification };
        b.step('tour', 'frame', i, 1.1 * holdScale, { camera: drift(walk(i), .5), drift: true });
        b.step('tour', 'descend', i, 1, { camera: inspect(at(i)), loupe: at(i, 0, magnification) });
        b.step('tour', 'detail', i, 2.6 * holdScale, { camera: inspect(detail), loupe: detail, ease: 'inOut' });
        b.step('tour', 'rise', i, 1, { camera: walk(i), loupe: at(i) });
      } else b.step('tour', 'frame', i, 2 * holdScale, { camera: drift(walk(i)), drift: true });
    }
    b.step('return', 'set-down', n - 1, 2.1, { camera: establishing, loupe: rest, arc: loupeRadius * .5 });
    const close = b.time;
    b.step('return', 'close', n - 1, 3.8, { camera: drift(establishing), drift: true });
    b.card('end', close + b.seconds(.4), b.time);
    b.fade(b.time - b.seconds(.9), 0); b.fade(b.time, 1);
    return finishTimeline(b, { ...info, revealMode: null });
  }

  if (options.reel === 'develop') {
    const b = new TimelineBuilder(f.overview, null, scale, reduced);
    b.light = 0; b.reveal = 0;
    b.fade(b.seconds(.8), 0);
    b.step('establish', 'open', 0, 1.2, { light: 0, reveal: 0 });
    b.step('establish', 'open', 0, 1.5, { light: 1, flicker: 'on' });
    b.step('establish', 'open', 0, 2.1, { camera: drift(f.overview), drift: true });
    b.card('title', b.seconds(1.8), b.time);
    for (let i = 0; i < n; i++) {
      const frame = f.frame(i);
      if (i > 0 && locateFrame(roll, i).localIndex === 0 && breaks.has(i)) {
        b.step('break', 'pull-back', i, 1.3, { camera: f.overview });
        b.step('break', 'overview', i, 1.5, { camera: drift(f.overview, .5), drift: true });
      }
      b.step('tour', 'push', i, i === 0 ? 1.7 : 1.0, { camera: frame, beat: true });
      // The camera pushes in to fill the screen while the band crosses the frame.
      b.step('tour', 'develop', i, 1.9 * holdScale, { camera: { ...frame, zoom: frame.zoom * .8 }, reveal: i + 1, drift: true });
      b.step('tour', 'frame', i, .9 * holdScale, { camera: { ...frame, zoom: frame.zoom * .77 }, drift: true });
    }
    b.step('return', 'pull-back', n - 1, 1.7, { camera: f.overview });
    const close = b.time;
    b.step('return', 'close', n - 1, 3.6, { camera: drift(f.overview), drift: true });
    b.card('end', close + b.seconds(.4), b.time);
    b.fade(b.time - b.seconds(.9), 0); b.fade(b.time, 1);
    return finishTimeline(b, { ...info, revealMode: options.stockType === 'reversal' ? 'backlight' : 'polarity' });
  }

  // Projector: a fixed gate, with frame changes on a regular beat grid.
  const beat = .6;
  const gate = (index: number): CameraPose => { const pose = f.frame(index); return { ...pose, zoom: pose.zoom * .8 }; };
  const aperture = (index: number) => { const frame = locateFrame(roll, index); return { width: (frame.strip.layout.frameWidths?.[frame.localIndex] ?? frame.strip.layout.frameWidth) * frame.strip.scale, height: frame.strip.layout.frameHeight * frame.strip.scale }; };
  const jump = medium ? .42 : .18;
  const period = (i: number) => {
    if (medium || n < 10) return medium ? 2.5 : 2;
    const phase = i % 9;
    return phase >= 5 && phase <= 7 ? .5 : phase === 8 ? 3 : 2;
  };
  const b = new TimelineBuilder(f.overview, null, scale, reduced);
  b.fade(b.seconds(.8), 0);
  b.step('establish', 'open', 0, 3, { camera: drift(f.overview), drift: true });
  b.card('title', b.seconds(.4), b.seconds(2.8));
  b.step('tour', 'push-in', 0, 1.8, { camera: gate(0), gate: 1, aperture: aperture(0), beat: true });
  for (let i = 0; i < n; i++) {
    let hold = period(i) * beat;
    if (i > 0) {
      if (locateFrame(roll, i).localIndex === 0 && breaks.has(i)) {
        b.step('break', 'pull-back', i, 2 * beat, { camera: f.overview, gate: 0 });
        b.step('break', 'overview', i, beat, {});
        b.step('break', 'push-in', i, 2 * beat, { camera: gate(i), gate: 1, aperture: aperture(i), beat: true });
      } else {
        // The gate stays fixed while the film jumps through it.
        b.step('tour', 'advance', i, jump, { camera: gate(i), blur: medium ? .6 : 1, aperture: aperture(i), ease: medium ? 'heavy' : 'snap', beat: true });
        hold -= jump;
      }
    }
    b.step('tour', 'frame', i, Math.max(.08, hold), { flicker: 'gate', light: 1 });
  }
  b.step('return', 'pull-back', n - 1, 2 * beat, { camera: f.overview, gate: 0 });
  const close = b.time;
  b.step('return', 'close', n - 1, 3.4, { camera: drift(f.overview), drift: true });
  b.card('end', close + b.seconds(.3), b.time);
  b.fade(b.time - b.seconds(.9), 0); b.fade(b.time, 1);
  return finishTimeline(b, { ...info, revealMode: null });
}
