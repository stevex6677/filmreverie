import { createRollLayout, fitRollView, locateFrame, type RollDefinition } from '../utils/rollLayout';
import { getStripDimensions } from '../utils/loupeMapping';
import { finishTimeline, lerpCamera, lookAtPose, PACE_SCALE, tablePan, TimelineBuilder, type CameraPose, type Pace, type ReelId, type ScreeningTimeline } from './timeline';
import { ROOM_CAMERA_FOV, ROOM_ENVELOPE, ROOM_EYE, TABLE_CENTER_Z, TABLE_SURFACE_Y } from '../utils/cameraBounds';
import { SHELF_ORIGIN } from '../data/physicalScale';
import { printLayout } from './prints';

export interface ReelOptions {
  reel: ReelId; pace: Pace; aspect: number; reducedMotion?: boolean;
  /** Reversal stock has no negative stage; Develop reveals its backlight instead. */
  stockType: 'negative' | 'reversal';
  /** The reel's own settings, each 0–1 (see REEL_SETTINGS); missing values use the defaults. */
  tuning?: readonly number[];
}

/** A setting special to one reel, shown as a slider between two described ends. */
export interface ReelSetting { label: string; low: string; high: string; initial: number }
// Two at most per reel. The initial values reproduce the reviewed reels, except
// Drying Line, which now looks slightly along the line so its depth of field shows.
export const REEL_SETTINGS: Record<ReelId, readonly ReelSetting[]> = {
  tracking: [{ label: 'Distance', low: 'Close', high: 'Far', initial: .5 }, { label: 'Depth of field', low: 'Deep', high: 'Shallow', initial: .5 }],
  develop: [{ label: 'Push-in', low: 'None', high: 'Close', initial: .5 }, { label: 'Light band', low: 'Sharp', high: 'Soft', initial: .5 }],
  projector: [{ label: 'Gate weave', low: 'Steady', high: 'Loose', initial: .5 }, { label: 'Lamp flicker', low: 'None', high: 'Strong', initial: .5 }],
  darkroom: [{ label: 'Distance', low: 'Close', high: 'Far', initial: .5 }, { label: 'Camera height', low: 'Low', high: 'High', initial: .5 }],
  orbit: [{ label: 'Arc', low: 'Narrow', high: 'Wide', initial: .5 }, { label: 'Depth of field', low: 'Deep', high: 'Shallow', initial: .5 }],
  'drying-line': [{ label: 'Distance', low: 'Close', high: 'Far', initial: .5 }, { label: 'Angle', low: 'Face on', high: 'Along the line', initial: .4 }],
  documentary: [{ label: 'Drift', low: 'Still', high: 'Strong', initial: .5 }, { label: 'Dissolve', low: 'Quick', high: 'Long', initial: .5 }],
};
/** The reel's settings with defaults filled in and values clamped to 0–1. */
export function reelTuning(reel: ReelId, values?: readonly number[]) {
  return REEL_SETTINGS[reel].map((setting, i) => { const value = values?.[i]; return Number.isFinite(value) ? Math.max(0, Math.min(1, value!)) : setting.initial; });
}
/** A multiplier from 1/range to range, 1 at the midpoint. */
const around = (u: number, range: number) => range ** (2 * u - 1);
/** 0 at the low end, 1 at the midpoint, 2.5 at the high end. */
const amount = (u: number) => u <= .5 ? 2 * u : 1 + 3 * (u - .5);
// Depth of field for reels that look across the table or into the room.
const APERTURE = { tracking: .075, darkroom: .035, orbit: .03, 'drying-line': .035 };

export const REEL_LABEL: Record<ReelId, string> = { tracking: 'Tracking Shot', develop: 'Develop', projector: 'Projector', darkroom: 'Darkroom', orbit: 'Orbit', 'drying-line': 'Drying Line', documentary: 'Documentary' };
export const REEL_DESCRIPTION: Record<ReelId, string> = {
  tracking: 'A low camera tracks along each strip and moves in on details.',
  develop: 'A band of light turns each negative into a photograph.',
  projector: 'After a countdown, each frame slides into a lit projector gate.',
  darkroom: 'From the darkroom to the light table, and back into the room.',
  orbit: 'Slow arcs around each photograph on the glowing table.',
  'drying-line': 'Each strip becomes a line of prints hung in the darkroom.',
  documentary: 'Each photograph fills the screen, drifting and dissolving.',
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
  const [first, second] = reelTuning(options.reel, options.tuning);

  if (options.reel === 'tracking') {
    // A low, angled camera tracks along each strip; every few frames it pushes
    // in close and drifts across a detail of the photograph.
    const distance = 1.85 * around(first, 1.5);
    const track = (index: number): CameraPose => { const frame = locateFrame(roll, index); return { zoom: f.frame(index).zoom * distance, pan: tablePan(frame.x, frame.y), tilt: degrees(32), yaw: degrees(-8) }; };
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
    return finishTimeline(b, { ...info, revealMode: null, look: { aperture: APERTURE.tracking * amount(second) } });
  }

  if (options.reel === 'develop') {
    const push = .8 - .4 * (first - .5);
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
      b.step('tour', 'develop', i, 1.9 * holdScale, { camera: { ...frame, zoom: frame.zoom * push }, reveal: i + 1, drift: true });
      b.step('tour', 'frame', i, .9 * holdScale, { camera: { ...frame, zoom: frame.zoom * (push - .03) }, drift: true });
    }
    b.step('return', 'pull-back', n - 1, 1.7, { camera: f.overview });
    const close = b.time;
    b.step('return', 'close', n - 1, 3.6, { camera: drift(f.overview), drift: true });
    b.card('end', close + b.seconds(.4), b.time);
    b.fade(b.time - b.seconds(.9), 0); b.fade(b.time, 1);
    return finishTimeline(b, { ...info, revealMode: options.stockType === 'reversal' ? 'backlight' : 'polarity', look: { band: .06 * around(second, 3.5) } });
  }

  // Frame geometry shared by the travelling reels, in world units.
  const frameAt = (index: number) => { const frame = locateFrame(roll, index); return { ...frame, width: (frame.strip.layout.frameWidths?.[frame.localIndex] ?? frame.strip.layout.frameWidth) * frame.strip.scale, gap: frame.strip.layout.gap * frame.strip.scale }; };

  if (options.reel === 'darkroom') {
    // Open in the room, looking over the table at the film cabinet with the
    // table off; tilt down and dolly across the room as it glows on; tour each
    // strip with a lateral dolly; then lift back to eye level as the table dims.
    const fov = Math.min(90, 2 * Math.atan(Math.tan(ROOM_CAMERA_FOV * Math.PI / 360) * Math.max(1, 1.6 / aspect)) * 180 / Math.PI);
    const cabinet = lookAtPose(ROOM_EYE, SHELF_ORIGIN, fov);
    const toward = lookAtPose(ROOM_EYE, [0, TABLE_SURFACE_Y, TABLE_CENTER_Z], fov);
    const above: CameraPose = { ...f.overview, zoom: f.overview.zoom * 1.35, tilt: degrees(30) };
    const distance = around(first, 1.5), height = second - .5;
    const dolly = (index: number): CameraPose => { const frame = frameAt(index); return { zoom: f.frame(index).zoom * 1.5 * distance, pan: tablePan(frame.x, frame.y), tilt: degrees(24 - 32 * height), yaw: 0 }; };
    const drop = (index: number): CameraPose => ({ ...dolly(index), zoom: f.frame(index).zoom * 1.05 * distance, tilt: degrees(12 - 20 * height) });
    const turned: CameraPose = { ...f.overview, zoom: f.overview.zoom * 1.1, tilt: degrees(36), yaw: f.overview.yaw + degrees(20) };
    const b = new TimelineBuilder(cabinet, scale, reduced);
    b.light = 0; b.ambient = 1;
    b.fade(b.seconds(1), 0);
    b.step('establish', 'open', 0, 3, { camera: { ...cabinet, yaw: cabinet.yaw + degrees(2) }, drift: true });
    b.card('title', b.seconds(.5), b.seconds(3));
    b.step('establish', 'push', 0, 2, { camera: toward });
    b.step('establish', 'push', 0, 3.2, { camera: above, light: 1, ambient: 0, ease: 'inOut' });
    b.step('tour', 'push-in', 0, 1.8, { camera: dolly(0), beat: true });
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        if (frameAt(i).localIndex > 0) b.step('tour', 'glide', i, 1, { camera: dolly(i), beat: true });
        else if (breaks.has(i)) {
          b.step('break', 'pull-back', i, 1.6, { camera: turned });
          b.step('break', 'overview', i, 1.4, { camera: drift(turned, .5), drift: true });
          b.step('break', 'push-in', i, 1.6, { camera: dolly(i), beat: true });
        } else b.step('tour', 'glide', i, 1.8, { camera: dolly(i), beat: true });
      }
      b.step('tour', 'frame', i, 1.6 * holdScale, { camera: drop(i) });
    }
    b.step('return', 'pull-back', n - 1, 2.6, { camera: toward, light: .35 });
    const end = b.time;
    b.step('return', 'close', n - 1, 3.4, { camera: cabinet, light: 0, ambient: 1 });
    b.card('end', end + b.seconds(.4), b.time);
    b.fade(b.time - b.seconds(.9), 0); b.fade(b.time, 1);
    return finishTimeline(b, { ...info, revealMode: null, look: { aperture: APERTURE.darkroom } });
  }

  if (options.reel === 'orbit') {
    // Each photograph gets a slow descending arc that resolves top-down, so the
    // curled film shows parallax against the glowing diffuser.
    const base = f.overview.yaw;
    const arc = first - .5;
    const start = (index: number): CameraPose => { const frame = f.frame(index); return { ...frame, zoom: frame.zoom * 1.4, tilt: degrees(50 + 40 * arc), yaw: (index % 2 ? 1 : -1) * degrees(35 + 50 * arc) }; };
    const high = (yaw: number): CameraPose => ({ ...f.overview, zoom: f.overview.zoom * 1.15, tilt: degrees(42), yaw: base + degrees(yaw) });
    // Low and edge-on along the strips, but never closer than ~5 cm above a short roll.
    const grazing: CameraPose = { ...f.overview, zoom: Math.max(f.overview.zoom * .9, .3), tilt: degrees(80), yaw: degrees(90) };
    const b = new TimelineBuilder(grazing, scale, reduced);
    b.fade(b.seconds(1), 0);
    b.step('establish', 'open', 0, 1.6, { camera: { ...grazing, yaw: degrees(84) }, drift: true });
    b.step('establish', 'rise', 0, 2.6, { camera: { ...f.overview, zoom: f.overview.zoom * 1.2, tilt: degrees(50), yaw: base + degrees(30) } });
    b.card('title', b.seconds(.6), b.seconds(3.8));
    for (let i = 0; i < n; i++) {
      if (i > 0 && frameAt(i).localIndex === 0 && breaks.has(i)) {
        b.step('break', 'pull-back', i, 1.4, { camera: high(-45) });
        b.step('break', 'overview', i, 3, { camera: high(45), ease: 'inOut' });
      }
      b.step('tour', 'push', i, i === 0 ? 1.6 : 1, { camera: start(i), beat: true });
      b.step('tour', 'orbit', i, 2 * holdScale, { camera: f.frame(i), ease: 'inOut' });
      b.step('tour', 'frame', i, .7 * holdScale, { camera: drift(f.frame(i), .3), drift: true });
    }
    b.step('return', 'pull-back', n - 1, 1.6, { camera: { ...f.overview, zoom: f.overview.zoom * 1.2, tilt: degrees(60), yaw: base - Math.PI } });
    const end = b.time;
    b.step('return', 'close', n - 1, 3.6, { camera: f.overview, ease: 'inOut' });
    b.card('end', end + b.seconds(.6), b.time);
    b.fade(b.time - b.seconds(.9), 0); b.fade(b.time, 1);
    return finishTimeline(b, { ...info, revealMode: null, look: { aperture: APERTURE.orbit * amount(second) } });
  }

  if (options.reel === 'drying-line') {
    // From the lit table to the print wall: a wide shot of every line, then a
    // track along each line toward the table (−z), so prints pass right to left.
    const layout = printLayout(roll);
    // Seen at an angle, the next prints recede along the line (toward −z, screen right).
    const angle = degrees(50 * second), range = around(first, 1.6);
    const printPose = (index: number): CameraPose => {
      const print = layout.prints[index], fov = 40, tan = Math.tan(fov * Math.PI / 360);
      const distance = range * Math.max(print.paper.height * 1.4, print.paper.width * 1.45 / aspect) / (2 * tan);
      // Near the back wall the camera turns less, rather than leaving the room.
      const turn = Math.min(angle, Math.asin(Math.min(1, (ROOM_ENVELOPE.back - .3 - print.center[2]) / distance)));
      return lookAtPose([print.center[0] + distance * Math.cos(turn), print.center[1] + .03, print.center[2] + distance * Math.sin(turn)], print.center, fov);
    };
    const glance = (index: number): CameraPose => {
      const frame = frameAt(index);
      return lookAtPose([-1.7, .15, 1.5], [0, TABLE_SURFACE_Y, TABLE_CENTER_Z - frame.strip.y], 34);
    };
    // Frame every line of prints: centred on them, far enough to show them all.
    const zs = layout.prints.map(print => print.center[2]), ys = layout.lines.map(line => line.y);
    const middle: [number, number, number] = [layout.prints[0].center[0], (Math.max(...ys) + Math.min(...ys)) / 2 - .15, (Math.max(...zs) + Math.min(...zs)) / 2];
    const across = Math.max(...zs) - Math.min(...zs) + .8, high = Math.max(...ys) - Math.min(...ys) + .7;
    const reach = Math.min(2.9, Math.max(high, across / aspect) / (2 * Math.tan(31 * Math.PI / 180)));
    const wall = lookAtPose([middle[0] + reach, middle[1] + .05, middle[2]], middle, 62);
    // Rise from the table first, so the turn toward the wall passes through open air.
    const raised = lookAtPose([0, .35, .7], [0, TABLE_SURFACE_Y, TABLE_CENTER_Z], 55);
    const closing = lookAtPose([-.4, 1.1, 5.4], [-2.4, -.3, 1.8], 62);
    const b = new TimelineBuilder(f.overview, scale, reduced);
    b.fade(b.seconds(.8), 0);
    b.step('establish', 'open', 0, 3, { camera: drift(f.overview), drift: true });
    b.card('title', b.seconds(.4), b.seconds(2.8));
    b.step('establish', 'rise', 0, 1.8, { camera: raised });
    b.step('establish', 'rise', 0, 2.4, { camera: wall });
    b.step('establish', 'open', 0, 1.2, { camera: { ...wall, zoom: wall.zoom * .97 }, drift: true });
    b.step('tour', 'push-in', 0, 2, { camera: printPose(0), beat: true });
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        if (frameAt(i).localIndex === 0 && breaks.has(i)) {
          b.step('break', 'pull-back', i, 1.8, { camera: glance(i) });
          b.step('break', 'overview', i, 1.2, { camera: { ...glance(i), zoom: glance(i).zoom * .96 }, drift: true });
          b.step('break', 'push-in', i, 1.8, { camera: printPose(i), beat: true });
        } else b.step('tour', 'glide', i, frameAt(i).localIndex === 0 ? 1.6 : 1.1, { camera: printPose(i), beat: true });
      }
      b.step('tour', 'frame', i, 1.9 * holdScale, { camera: { ...printPose(i), zoom: printPose(i).zoom * .94 }, drift: true });
    }
    b.step('return', 'pull-back', n - 1, 2.6, { camera: closing });
    const end = b.time;
    b.step('return', 'close', n - 1, 3.4, { camera: { ...closing, zoom: closing.zoom * 1.04 }, drift: true });
    b.card('end', end + b.seconds(.4), b.time);
    b.fade(b.time - b.seconds(.9), 0); b.fade(b.time, 1);
    return finishTimeline(b, { ...info, revealMode: null, look: { aperture: APERTURE['drying-line'] } });
  }

  if (options.reel === 'documentary') {
    // Photograph first: each one fills the screen, drifts slowly (pushing in
    // ~10% and panning toward its longer side) and dissolves into the next.
    const push = first <= .5 ? .2 * first : .1 + .2 * (first - .5), pan = .8 * Math.min(1, 2 * first);
    const kenBurns = (index: number) => {
      const frame = frameAt(index), photo = roll.frames[index], rotation = ((photo.rotation ?? 0) % 360 + 360) % 360;
      const height = frame.strip.layout.frameHeight * frame.strip.scale;
      // Turn the camera so the photograph stands upright. The film shader rotates
      // the image clockwise by \`rotation\`, so its top faces film +x at 90°.
      const yaw = rotation === 90 ? -Math.PI / 2 : rotation === 270 ? Math.PI / 2 : rotation === 180 ? Math.PI : 0;
      const [w, h] = rotation % 180 ? [height, frame.width] : [frame.width, height];
      const photoAspect = w / h, mismatch = Math.max(photoAspect / aspect, aspect / photoAspect);
      // Fill the screen unless the shapes differ a lot; then show the whole photograph.
      const visible = mismatch < 1.35 ? Math.min(h, w / aspect) * .97 : Math.max(h, w / aspect) * 1.04;
      const zoom = visible / (2 * TAN), inner = visible * (1 - push);
      const slackX = Math.max(0, (w - inner * aspect) / 2), slackY = Math.max(0, (h - inner) / 2);
      const sign = index % 2 ? 1 : -1, horizontal = slackX >= slackY;
      const offset = (amount: number) => {
        const sx = horizontal ? amount * slackX * pan : 0, sy = horizontal ? 0 : amount * slackY * pan;
        return { x: frame.x + sx * Math.cos(yaw) - sy * Math.sin(yaw), z: TABLE_CENTER_Z - frame.y - sx * Math.sin(yaw) - sy * Math.cos(yaw) };
      };
      const start: CameraPose = { zoom, pan: offset(-sign), tilt: 0, yaw };
      const end: CameraPose = { zoom: zoom * (1 - push), pan: offset(sign), tilt: 0, yaw };
      // A photograph shown whole is letterboxed (or pillarboxed) in black.
      const matte = mismatch < 1.35 ? undefined : { x: frame.x, z: TABLE_CENTER_Z - frame.y, width: w, height: h };
      return { start, end, matte };
    };
    const dissolve = around(second, 2.2), drifting = 3.2 * holdScale;
    const b = new TimelineBuilder(f.overview, scale, reduced);
    b.fade(b.seconds(.8), 0);
    b.step('establish', 'open', 0, 3, { camera: drift(f.overview), drift: true });
    b.card('title', b.seconds(.4), b.seconds(2.8));
    const opening = kenBurns(0).matte;
    b.step('tour', 'push-in', 0, 2, { camera: kenBurns(0).start, beat: true, matte: opening && { ...opening, alpha: [0, 1] } });
    for (let i = 0; i < n; i++) {
      const { start, end, matte } = kenBurns(i), middle = lerpCamera(start, end, dissolve / (dissolve + drifting));
      const previous = i > 0 ? kenBurns(i - 1).matte : undefined;
      if (i > 0) {
        if (frameAt(i).localIndex === 0 && breaks.has(i)) {
          const strip: CameraPose = { ...f.fit(frameAt(i - 1).strip.frames.length * frameAt(i - 1).width * 1.15, f.stripHeight * 1.6, 0, frameAt(i - 1).strip.y), tilt: degrees(18) };
          b.step('break', 'pull-back', i, 1.6, { camera: strip, matte: previous && { ...previous, alpha: [1, 0] } });
          b.step('break', 'overview', i, 1.2, { camera: drift(strip, .5), drift: true });
        }
        // The next photograph appears beneath the outgoing one as it fades.
        b.camera = start;
        b.step('tour', 'glide', i, dissolve, { camera: middle, dissolve: true, ease: 'linear', drift: true, beat: true, matte });
      }
      // The first photograph arrives by the push-in and drifts for the whole span.
      b.step('tour', 'frame', i, i === 0 ? dissolve + drifting : drifting, { camera: end, ease: 'linear', drift: true, matte });
    }
    const last = kenBurns(n - 1).matte;
    b.step('return', 'pull-back', n - 1, 2.2, { camera: f.overview, matte: last && { ...last, alpha: [1, 0] } });
    const end = b.time;
    b.step('return', 'close', n - 1, 3.4, { camera: drift(f.overview), drift: true });
    b.card('end', end + b.seconds(.3), b.time);
    b.fade(b.time - b.seconds(.9), 0); b.fade(b.time, 1);
    return finishTimeline(b, { ...info, revealMode: null });
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
  return finishTimeline(b, { ...info, revealMode: null, look: { weave: .004 * amount(first), flicker: .045 * amount(second) } });
}
