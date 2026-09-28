import { createRollLayout, fitRollView, locateFrame, type RollDefinition } from '../utils/rollLayout';
import { getStripDimensions } from '../utils/loupeMapping';
import { finishTimeline, PACE_SCALE, tablePan, TimelineBuilder, type CameraPose, type Pace, type ReelId, type ScreeningTimeline } from './timeline';

export interface ReelOptions {
  reel: ReelId; pace: Pace; aspect: number; reducedMotion?: boolean;
  /** Reversal stock has no negative stage; Develop reveals its backlight instead. */
  stockType: 'negative' | 'reversal';
}

export const REEL_LABEL: Record<ReelId, string> = { tracking: 'Tracking Shot', develop: 'Develop', projector: 'Projector' };
export const REEL_DESCRIPTION: Record<ReelId, string> = {
  tracking: 'A low camera tracks along each strip and moves in on details.',
  develop: 'A band of light turns each negative into a photograph.',
  projector: 'After a countdown, each frame slides into a lit projector gate.',
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

  if (options.reel === 'tracking') {
    // A low, angled camera tracks along each strip; every few frames it pushes
    // in close and drifts across a detail of the photograph.
    const track = (index: number): CameraPose => { const frame = locateFrame(roll, index); return { zoom: f.frame(index).zoom * 1.85, pan: tablePan(frame.x, frame.y), tilt: degrees(32), yaw: degrees(-8) }; };
    const close = (index: number, u: number, v: number): CameraPose => {
      const frame = locateFrame(roll, index), width = (frame.strip.layout.frameWidths?.[frame.localIndex] ?? frame.strip.layout.frameWidth) * frame.strip.scale;
      return { zoom: f.frame(index).zoom * .55, pan: tablePan(frame.x + u * width, frame.y + v * frame.strip.layout.frameHeight * frame.strip.scale), tilt: degrees(18), yaw: degrees(-8) };
    };
    const details = new Set(Array.from({ length: n }, (_, i) => i).filter(i => n < 6 ? i === Math.floor(n / 2) : i % 6 === 2));
    const b = new TimelineBuilder(f.overview, scale, reduced);
    b.fade(b.seconds(.9), 0);
    b.step('establish', 'open', 0, 3.2, { camera: drift(f.overview), drift: true });
    b.card('title', b.seconds(.5), b.seconds(3));
    b.step('tour', 'push-in', 0, 2.1, { camera: track(0), beat: true });
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        if (locateFrame(roll, i).localIndex > 0) b.step('tour', 'glide', i, .9, { camera: track(i), beat: true });
        else if (breaks.has(i)) {
          b.step('break', 'pull-back', i, 1.4, { camera: f.overview });
          b.step('break', 'overview', i, 1.3, { camera: drift(f.overview, .5), drift: true });
          b.step('break', 'push-in', i, 1.4, { camera: track(i), beat: true });
        } else b.step('tour', 'glide', i, 1.9, { camera: track(i), beat: true });
      }
      if (details.has(i)) {
        b.step('tour', 'frame', i, 1.1 * holdScale, { camera: drift(track(i), .5), drift: true });
        b.step('tour', 'descend', i, 1, { camera: close(i, -.2, .12) });
        b.step('tour', 'detail', i, 2.6 * holdScale, { camera: close(i, .2, -.12), drift: true });
        b.step('tour', 'rise', i, 1, { camera: track(i) });
      } else b.step('tour', 'frame', i, 2 * holdScale, { camera: drift(track(i)), drift: true });
    }
    b.step('return', 'pull-back', n - 1, 2.1, { camera: f.overview });
    const end = b.time;
    b.step('return', 'close', n - 1, 3.8, { camera: drift(f.overview), drift: true });
    b.card('end', end + b.seconds(.4), b.time);
    b.fade(b.time - b.seconds(.9), 0); b.fade(b.time, 1);
    return finishTimeline(b, { ...info, revealMode: null });
  }

  if (options.reel === 'develop') {
    const b = new TimelineBuilder(f.overview, scale, reduced);
    // The light table is off; dim room light shows the black film on a grey
    // diffuser. After the title it switches on at once, revealing the negatives.
    b.light = 0; b.reveal = 0; b.ambient = 1;
    b.fade(b.seconds(.9), 0);
    b.step('establish', 'open', 0, 3.4, { light: 0, reveal: 0, camera: drift(f.overview, .5), drift: true });
    b.card('title', b.seconds(.6), b.seconds(3));
    b.step('establish', 'open', 0, reduced ? .8 : .12, { light: 1, ambient: 0, ease: 'linear' });
    b.step('establish', 'open', 0, 1.4, { camera: drift(f.overview), drift: true });
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

  // Projector: the title on the lit table, then the room goes dark and the
  // projector lamp warms up an empty gate. The countdown leader is projected in
  // it, then black leader, and the first photograph opens on the shutter.
  // Every later photograph enters from the right and leaves to the left,
  // whatever its place on the table; a move to another strip is hidden behind
  // the closed shutter. No overview breaks interrupt the projection.
  const beat = .6;
  const width = (index: number) => { const frame = locateFrame(roll, index); return (frame.strip.layout.frameWidths?.[frame.localIndex] ?? frame.strip.layout.frameWidth) * frame.strip.scale; };
  const gate = (index: number): CameraPose => { const pose = f.frame(index); return { ...pose, zoom: pose.zoom * .8 }; };
  const shifted = (index: number, frames: number): CameraPose => {
    const pose = gate(index), pitch = width(index) + locateFrame(roll, index).strip.layout.gap * roll.scale;
    return { ...pose, pan: { ...pose.pan, x: pose.pan.x + frames * pitch } };
  };
  const aperture = (index: number) => { const frame = locateFrame(roll, index); return { width: width(index), height: frame.strip.layout.frameHeight * frame.strip.scale }; };
  const jump = medium ? .42 : .18;
  const period = (i: number) => {
    if (medium || n < 10) return medium ? 2.5 : 2;
    const phase = i % 9;
    // A change of strip needs a full beat for its hidden jump, even in a speed-up.
    return phase >= 5 && phase <= 7 ? (locateFrame(roll, i).localIndex === 0 ? 1 : .5) : phase === 8 ? 3 : 2;
  };
  const advance = { blur: medium ? .6 : 1, beat: true };
  const b = new TimelineBuilder(f.overview, scale, reduced);
  b.fade(b.seconds(.8), 0);
  b.step('establish', 'open', 0, 3, { camera: drift(f.overview), drift: true });
  b.card('title', b.seconds(.4), b.seconds(2.8));
  // Room lights down; in the dark the camera settles on the gate.
  const dark = b.time;
  b.step('establish', 'open', 0, 1, {});
  b.fade(dark, 0); b.fade(b.time, 1); b.fade(b.time + 1e-3, 0);
  b.camera = gate(0); b.aperture = aperture(0);
  b.step('establish', 'open', 0, 1.4, { lamp: 1, gate: 1 });
  const leader = b.time;
  b.step('establish', 'open', 0, 3.6, {});
  b.card('countdown', leader, b.time, 0);
  b.step('establish', 'open', 0, .45, { lamp: 0, ease: 'out' });
  b.step('tour', 'reveal', 0, jump, { lamp: null, shutter: 'open', beat: true });
  // Beats fall on a regular grid: each frame's period includes its advance.
  for (let i = 0; i < n; i++) {
    let hold = period(i) * beat - (i === 0 ? jump : 0);
    if (i > 0) {
      if (locateFrame(roll, i).localIndex === 0 && !reduced) {
        // Carry on leftward past the strip's end, then enter the next strip from its right.
        const half = jump * (medium ? .5 : .7);
        b.step('tour', 'advance', i, half, { ...advance, camera: shifted(i - 1, 1), shutter: 'close', ease: 'in' });
        b.camera = shifted(i, -1); b.aperture = aperture(i);
        b.step('tour', 'advance', i, half, { blur: advance.blur, camera: gate(i), shutter: 'open', ease: medium ? 'heavy' : 'out' });
        hold -= 2 * half;
      } else {
        b.step('tour', 'advance', i, jump, { ...advance, camera: gate(i), aperture: aperture(i), shutter: 'pulse', ease: medium ? 'heavy' : 'snap' });
        hold -= jump;
      }
    }
    b.step('tour', 'frame', i, Math.max(.08, hold), { flicker: 'gate', light: 1, weave: true });
  }
  // The shutter closes on the last frame; the room lights come back up on the roll.
  b.step('return', 'close', n - 1, .5, { shutter: 'close' });
  b.step('return', 'close', n - 1, .4, { lamp: 0 });
  const lights = b.time;
  b.fade(lights - 1e-3, 0); b.fade(lights, 1);
  b.camera = f.overview; b.gate = 0;
  b.step('return', 'pull-back', n - 1, 1.2, { lamp: null });
  b.fade(b.time, 0);
  const end = b.time;
  b.step('return', 'close', n - 1, 3.4, { camera: drift(f.overview), drift: true });
  b.card('end', end + b.seconds(.3), b.time);
  b.fade(b.time - b.seconds(.9), 0); b.fade(b.time, 1);
  return finishTimeline(b, { ...info, revealMode: null });
}
