import { createRollLayout, fitRollView, locateFrame, type RollDefinition } from '../utils/rollLayout';
import { getStripDimensions } from '../utils/loupeMapping';
import { finishTimeline, lerpCamera, lookAtPose, PACE_SCALE, tablePan, TimelineBuilder, type CameraPose, type Pace, type ReelId, type ScreeningTimeline } from './timeline';
import { ROOM_CAMERA_FOV, ROOM_ENVELOPE, ROOM_EYE, TABLE_CENTER_Z, TABLE_SURFACE_Y } from '../utils/cameraBounds';
import { SHELF_ORIGIN } from '../data/physicalScale';
import { printLayout, PRINT_WALL_X } from './prints';
import { isVertical, uprightYaw } from '../utils/frameOrientation';

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
// Darkroom Prints, which now looks slightly along the line so its depth of field shows.
export const REEL_SETTINGS: Record<ReelId, readonly ReelSetting[]> = {
  tracking: [{ label: 'Distance', low: 'Close', high: 'Far', initial: .5 }, { label: 'Depth of field', low: 'Deep', high: 'Shallow', initial: .5 }],
  develop: [{ label: 'Push-in', low: 'None', high: 'Close', initial: .5 }, { label: 'Light band', low: 'Sharp', high: 'Soft', initial: .5 }],
  projector: [{ label: 'Gate weave', low: 'Steady', high: 'Loose', initial: .5 }, { label: 'Lamp flicker', low: 'None', high: 'Strong', initial: .5 }],
  darkroom: [{ label: 'Distance', low: 'Close', high: 'Far', initial: .5 }, { label: 'Camera height', low: 'Low', high: 'High', initial: .5 }],
  orbit: [{ label: 'Arc', low: 'Narrow', high: 'Wide', initial: .5 }, { label: 'Depth of field', low: 'Deep', high: 'Shallow', initial: .5 }],
  'darkroom-prints': [{ label: 'Distance', low: 'Close', high: 'Far', initial: .5 }, { label: 'Angle', low: 'Face on', high: 'Along the line', initial: .4 }],
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
const APERTURE = { tracking: .075, darkroom: .035, orbit: .03, 'darkroom-prints': .035 };

export const REEL_LABEL: Record<ReelId, string> = { tracking: 'Tracking Shot', develop: 'Develop', projector: 'Projector', darkroom: 'Darkroom', orbit: 'Orbit', 'darkroom-prints': 'Darkroom Prints', documentary: 'Documentary' };
export const REEL_DESCRIPTION: Record<ReelId, string> = {
  tracking: 'A low camera tracks along each strip and moves in on details.',
  develop: 'A band of light turns each negative into a photograph.',
  projector: 'After a countdown, each frame slides into a lit projector gate.',
  darkroom: 'From the darkroom to the light table, and back into the room.',
  orbit: 'Slow arcs around each photograph on the glowing table.',
  'darkroom-prints': 'Every photograph enlarged onto paper and hung up to dry.',
  documentary: 'Each photograph fills the screen, drifting and dissolving.',
};
export const PACE_LABEL: Record<Pace, string> = { relaxed: 'Relaxed', normal: 'Normal', brisk: 'Brisk' };

const TAN = Math.tan(Math.PI / 8);
const degrees = (value: number) => value * Math.PI / 180;

/** Output-aspect framing; the whole roll with a video-safe margin rather than room for controls. */
export function framing(roll: RollDefinition, aspect: number) {
  const strips = createRollLayout(roll);
  const halfWidth = Math.max(...strips.map(strip => getStripDimensions(strip.layout).width * strip.scale / 2));
  const stripHeight = getStripDimensions(strips[0].layout).height * roll.scale;
  const span = strips[0].y - strips[strips.length - 1].y + stripHeight;
  const fit = (width: number, height: number, x = 0, y = 0): CameraPose => ({ zoom: Math.max(height, width / Math.max(.2, aspect)) / (2 * TAN), pan: tablePan(x, y), tilt: 0, yaw: 0 });
  // Close on one frame, turned so a vertical shot stands upright.
  const frame = (index: number): CameraPose => { const view = fitRollView(roll, 'frame', index, aspect); return { zoom: view.zoom, pan: view.pan, tilt: 0, yaw: uprightYaw(roll.frames[index]) }; };
  // Portrait video turns whole-roll shots 90° so the strips run down the frame;
  // close shots keep photographs upright.
  const whole = (length: number, across: number): CameraPose => aspect < .8 ? { ...fit(across, length), yaw: Math.PI / 2 } : fit(length, across);
  // A band across the strips around row y, `across` deep, with as much of their length as the aspect allows.
  const band = (y: number, across: number): CameraPose => aspect < .8 ? { ...fit(across, 0, 0, y), yaw: Math.PI / 2 } : fit(0, across, 0, y);
  return { strips, halfWidth, stripHeight, span, fit, frame, whole, band, overview: whole(halfWidth * 2 * 1.1, span * 1.2) };
}

function drift(pose: CameraPose, amount = 1): CameraPose {
  return { ...pose, zoom: pose.zoom * (1 - .035 * amount), yaw: pose.yaw + degrees(pose.tilt ? 1.6 : .5) * amount };
}

/** Breaks are pauses at strip boundaries, each reel's own. Short rolls get fewer; medium format fewer still. */
export function breakBoundaries(roll: RollDefinition) {
  const strips = createRollLayout(roll);
  const boundaries = strips.slice(1).map(strip => strip.offset);
  if (roll.frames.length < 8) return new Set<number>();
  const medium = roll.format !== undefined && roll.format !== '135';
  const every = medium || roll.frames.length < 16 ? 2 : 1;
  return new Set(boundaries.filter((_, index) => (index + 1) % every === 0 || boundaries.length === 1));
}

export function isMediumFormat(roll: RollDefinition) { return roll.format !== undefined && roll.format !== '135'; }

/** How long the tour stays with a frame: a lingering look, an even hold, or a pass in a quick run. */
export type Rhythm = 'linger' | 'hold' | 'quick';
const QUICK_PHASES = new Set([3, 4, 9, 10, 11]);
/**
 * The tour's rhythm, shared by every reel but Projector (which keeps its own
 * beat grid). Every sixth frame, or the middle one of a short roll, is a
 * lingering look. On 35 mm rolls of ten or more frames, runs of two and then
 * three quick frames follow it, never across a strip boundary. Medium format
 * and reduced motion keep an even pace between the lingering looks.
 */
export function tourRhythm(roll: RollDefinition, reduced = false): Rhythm[] {
  const n = roll.frames.length, runs = !reduced && !isMediumFormat(roll) && n >= 10;
  return roll.frames.map((_, i) => {
    if (n < 6 ? i === Math.floor(n / 2) : i % 6 === 2) return 'linger';
    return runs && QUICK_PHASES.has(i % 12) && locateFrame(roll, i).localIndex > 0 ? 'quick' : 'hold';
  });
}
/** The last frame of the quick run starting at `index`. */
function runEnd(rhythm: readonly Rhythm[], index: number) { let end = index; while (rhythm[end + 1] === 'quick') end++; return end; }

/**
 * A run of quick frames passes without stopping: the camera accelerates out of
 * the last hold, crosses each frame at an even speed (a frame pitch a second)
 * and settles on the run's last frame. `pass(i, u)` is the pose over frame i,
 * moved u half-pitches along the film.
 */
function passRun(b: TimelineBuilder, from: number, to: number, pass: (index: number, u: number) => CameraPose) {
  const speed = 2; // half-pitches a second
  const gap = (a: CameraPose, c: CameraPose) => Math.hypot(a.pan.x - c.pan.x, a.pan.z - c.pan.z);
  // The run leaves wherever the last hold settled (usually the previous frame's centre, 1.6 half-pitches back).
  const lead = Math.max(.4, gap(b.camera, pass(from, -.4)) / gap(pass(from, 0), pass(from, 1)));
  for (let i = from; i <= to; i++) {
    const last = i === to;
    b.step('tour', 'glide', i, i === from ? 2 * lead / speed : 1.2 / speed, { camera: pass(i, -.4), ease: i === from ? 'accelerate' : 'linear', beat: true });
    b.step('tour', 'frame', i, last ? 2 * .4 / speed : .8 / speed, { camera: pass(i, last ? 0 : .4), ease: last ? 'decelerate' : 'linear' });
  }
}

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

  const rhythm = tourRhythm(roll, reduced);
  /** The heading that shows frame `index` upright; reels add their own angle to it. */
  const turn = (index: number) => uprightYaw(roll.frames[index]);
  // Frame geometry shared by the travelling reels, in world units.
  const frameAt = (index: number) => { const frame = locateFrame(roll, index); return { ...frame, width: (frame.strip.layout.frameWidths?.[frame.localIndex] ?? frame.strip.layout.frameWidth) * frame.strip.scale, gap: frame.strip.layout.gap * frame.strip.scale }; };
  const pitch = (index: number) => frameAt(index).width + frameAt(index).gap;
  /** A pose moved u half-pitches along the film (+x), for runs of quick frames. */
  const along = (pose: CameraPose, index: number, u: number): CameraPose => ({ ...pose, pan: { ...pose.pan, x: pose.pan.x + u * pitch(index) / 2 } });
  /** The two strips either side of the boundary before frame `index`, cropped to their middle. */
  const pair = (index: number): CameraPose => {
    const above = frameAt(index - 1).strip.y, below = frameAt(index).strip.y;
    return f.band((above + below) / 2, (above - below + f.stripHeight) * 1.5);
  };

  if (options.reel === 'tracking') {
    // A low, angled camera tracks along each strip; every few frames it pushes
    // in close and drifts across a detail of the photograph.
    const distance = 1.85 * around(first, 1.5);
    const track = (index: number): CameraPose => { const frame = locateFrame(roll, index); return { zoom: f.frame(index).zoom * distance, pan: tablePan(frame.x, frame.y), tilt: degrees(32), yaw: turn(index) + degrees(-8) }; };
    const close = (index: number, u: number, v: number): CameraPose => {
      const frame = locateFrame(roll, index), width = (frame.strip.layout.frameWidths?.[frame.localIndex] ?? frame.strip.layout.frameWidth) * frame.strip.scale;
      return { zoom: f.frame(index).zoom * .55, pan: tablePan(frame.x + u * width, frame.y + v * frame.strip.layout.frameHeight * frame.strip.scale), tilt: degrees(18), yaw: turn(index) + degrees(-8) };
    };
    // Strip change: the dolly runs on past the last frame, cranes up and round
    // to look down the next strip from its start, then swings down onto it.
    const runOut = (index: number): CameraPose => { const frame = frameAt(index), pose = track(index); return { ...pose, zoom: pose.zoom * 1.3, tilt: degrees(44), yaw: degrees(-8), pan: tablePan(Math.min(f.halfWidth, frame.x + frame.width * .8), frame.y) }; };
    // Low beside the strip's first frame, focused just past it, so the rest of the strip recedes out of focus.
    const raking = (index: number): CameraPose => { const frame = frameAt(index); return { zoom: f.frame(index).zoom * 1.6, pan: tablePan(frame.x + pitch(index) * .5, frame.y), tilt: degrees(50), yaw: degrees(-70) }; };
    const b = new TimelineBuilder(f.overview, scale, reduced);
    b.fade(b.seconds(.9), 0);
    b.step('establish', 'open', 0, 3.2, { camera: drift(f.overview), drift: true });
    b.card('title', b.seconds(.5), b.seconds(3));
    b.step('tour', 'push-in', 0, 2.1, { camera: track(0), beat: true });
    for (let i = 0; i < n; i++) {
      if (rhythm[i] === 'quick') { const end = runEnd(rhythm, i); passRun(b, i, end, (index, u) => along(track(index), index, u)); i = end; continue; }
      if (i > 0) {
        if (locateFrame(roll, i).localIndex > 0) b.step('tour', 'glide', i, .9, { camera: track(i), beat: true });
        else if (breaks.has(i)) {
          b.step('break', 'pull-back', i, 1.1, { camera: runOut(i - 1) });
          b.step('break', 'rise', i, 1.8, { camera: raking(i) });
          b.step('break', 'overview', i, .8, { camera: drift(raking(i), .4), drift: true });
          b.step('break', 'push-in', i, 1.5, { camera: track(i), beat: true });
        } else b.step('tour', 'glide', i, 1.9, { camera: track(i), beat: true });
      }
      if (rhythm[i] === 'linger') {
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
    // A quick run stands back far enough to follow the band across frames without stopping.
    const sweep = (index: number): CameraPose => ({ ...f.frame(index), zoom: f.frame(index).zoom * 1.6 });
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
        // Strip change: stand back on the finished strip, now positive, above
        // the next one still waiting in negative.
        b.step('break', 'pull-back', i, 1.3, { camera: pair(i) });
        b.step('break', 'overview', i, 1.5, { camera: drift(pair(i), .5), drift: true });
      }
      if (rhythm[i] === 'quick') {
        const opens = rhythm[i - 1] !== 'quick', closes = rhythm[i + 1] !== 'quick';
        if (opens) b.step('tour', 'push', i, 1, { camera: sweep(i - 1) });
        b.step('tour', 'frame', i, opens || closes ? 2 : 1, { camera: sweep(i), reveal: i + 1, beat: true,
          ease: opens && closes ? 'inOut' : opens ? 'accelerate' : closes ? 'decelerate' : 'linear' });
        continue;
      }
      // A lingering look lets the band cross slowly and stays with the photograph.
      const linger = rhythm[i] === 'linger';
      b.step('tour', 'push', i, i === 0 ? 1.7 : 1.0, { camera: frame, beat: true });
      // The camera pushes in to fill the screen while the band crosses the frame.
      b.step('tour', 'develop', i, (linger ? 2.8 : 1.9) * holdScale, { camera: { ...frame, zoom: frame.zoom * push }, reveal: i + 1, drift: true });
      b.step('tour', 'frame', i, (linger ? 1.6 : .9) * holdScale, { camera: { ...frame, zoom: frame.zoom * (push - .03) }, drift: true });
    }
    b.step('return', 'pull-back', n - 1, 1.7, { camera: f.overview });
    const close = b.time;
    b.step('return', 'close', n - 1, 3.6, { camera: drift(f.overview), drift: true });
    b.card('end', close + b.seconds(.4), b.time);
    b.fade(b.time - b.seconds(.9), 0); b.fade(b.time, 1);
    return finishTimeline(b, { ...info, revealMode: options.stockType === 'reversal' ? 'backlight' : 'polarity', look: { band: .06 * around(second, 3.5) } });
  }

  if (options.reel === 'darkroom') {
    // Open in the room, looking over the table at the film cabinet with the
    // table off; tilt down and dolly across the room as it glows on; tour each
    // strip with a lateral dolly; then lift back to eye level as the table dims.
    const fov = Math.min(90, 2 * Math.atan(Math.tan(ROOM_CAMERA_FOV * Math.PI / 360) * Math.max(1, 1.6 / aspect)) * 180 / Math.PI);
    const cabinet = lookAtPose(ROOM_EYE, SHELF_ORIGIN, fov);
    const toward = lookAtPose(ROOM_EYE, [0, TABLE_SURFACE_Y, TABLE_CENTER_Z], fov);
    const above: CameraPose = { ...f.overview, zoom: f.overview.zoom * 1.35, tilt: degrees(30) };
    const distance = around(first, 1.5), height = second - .5;
    // A vertical shot is approached from its foot, so it stands upright as the camera leans in.
    const dolly = (index: number): CameraPose => { const frame = frameAt(index); return { zoom: f.frame(index).zoom * 1.5 * distance, pan: tablePan(frame.x, frame.y), tilt: degrees(24 - 32 * height), yaw: turn(index) }; };
    const drop = (index: number): CameraPose => ({ ...dolly(index), zoom: f.frame(index).zoom * 1.05 * distance, tilt: degrees(12 - 20 * height) });
    // Strip change: the dolly runs off the end of the film into the dark as the
    // table dims, then makes a higher pass back over the next strip as it glows up.
    const dark = (index: number): CameraPose => { const frame = frameAt(index); return { ...dolly(index), yaw: 0, pan: tablePan(Math.min(f.halfWidth, frame.x + frame.width * .9), frame.y) }; };
    const higher = (index: number): CameraPose => { const pose = dolly(index); return { ...pose, zoom: pose.zoom * 1.8, pan: tablePan(0, frameAt(index).y), tilt: degrees(38), yaw: degrees(16) }; };
    const b = new TimelineBuilder(cabinet, scale, reduced);
    b.light = 0; b.ambient = 1;
    b.fade(b.seconds(1), 0);
    b.step('establish', 'open', 0, 3, { camera: { ...cabinet, yaw: cabinet.yaw + degrees(2) }, drift: true });
    b.card('title', b.seconds(.5), b.seconds(3));
    b.step('establish', 'push', 0, 2, { camera: toward });
    b.step('establish', 'push', 0, 3.2, { camera: above, light: 1, ambient: 0, ease: 'inOut' });
    b.step('tour', 'push-in', 0, 1.8, { camera: dolly(0), beat: true });
    for (let i = 0; i < n; i++) {
      if (rhythm[i] === 'quick') { const end = runEnd(rhythm, i); passRun(b, i, end, (index, u) => along(dolly(index), index, u)); i = end; continue; }
      if (i > 0) {
        if (frameAt(i).localIndex > 0) b.step('tour', 'glide', i, 1, { camera: dolly(i), beat: true });
        else if (breaks.has(i)) {
          b.step('break', 'pull-back', i, 1.5, { camera: dark(i - 1), light: .15 });
          b.step('break', 'overview', i, 2.2, { camera: higher(i), light: 1 });
          b.step('break', 'push-in', i, 1.4, { camera: dolly(i), beat: true });
        } else b.step('tour', 'glide', i, 1.8, { camera: dolly(i), beat: true });
      }
      b.step('tour', 'frame', i, 1.6 * holdScale, { camera: drop(i) });
      // A lingering look leans in further and creeps across the photograph.
      if (rhythm[i] === 'linger') b.step('tour', 'detail', i, 2.4 * holdScale, { camera: along({ ...drop(i), zoom: drop(i).zoom * .78 }, i, .25), drift: true });
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
    // A lingering look swings wider and slower; a quick one barely turns.
    const start = (index: number, swing = 1): CameraPose => { const frame = f.frame(index); return { ...frame, zoom: frame.zoom * 1.4, tilt: degrees(50 + 40 * arc), yaw: frame.yaw + (index % 2 ? 1 : -1) * swing * degrees(35 + 50 * arc) }; };
    // Strip change: a low arc around the boundary, the two strips sweeping past.
    const ring = (index: number, yaw: number, tilt: number): CameraPose => ({ ...pair(index), zoom: pair(index).zoom * .75, tilt: degrees(tilt), yaw: base + degrees(yaw) });
    // Low and edge-on along the strips, but never closer than ~5 cm above a short roll.
    const grazing: CameraPose = { ...f.overview, zoom: Math.max(f.overview.zoom * .9, .3), tilt: degrees(80), yaw: degrees(90) };
    const b = new TimelineBuilder(grazing, scale, reduced);
    b.fade(b.seconds(1), 0);
    b.step('establish', 'open', 0, 1.6, { camera: { ...grazing, yaw: degrees(84) }, drift: true });
    b.step('establish', 'rise', 0, 2.6, { camera: { ...f.overview, zoom: f.overview.zoom * 1.2, tilt: degrees(50), yaw: base + degrees(30) } });
    b.card('title', b.seconds(.6), b.seconds(3.8));
    for (let i = 0; i < n; i++) {
      if (i > 0 && frameAt(i).localIndex === 0 && breaks.has(i)) {
        b.step('break', 'pull-back', i, 1.4, { camera: ring(i, -40, 50) });
        b.step('break', 'overview', i, 2.6, { camera: ring(i, 40, 42), ease: 'inOut' });
      }
      const beat = rhythm[i], hold = beat === 'linger' ? 1.4 : beat === 'quick' ? .5 : 1;
      b.step('tour', 'push', i, i === 0 ? 1.6 : beat === 'quick' ? .8 : 1, { camera: start(i, beat === 'linger' ? 1.35 : beat === 'quick' ? .45 : 1), beat: true });
      b.step('tour', 'orbit', i, 2 * hold * holdScale, { camera: f.frame(i), ease: 'inOut' });
      b.step('tour', 'frame', i, .7 * hold * holdScale, { camera: drift(f.frame(i), .3), drift: true });
    }
    b.step('return', 'pull-back', n - 1, 1.6, { camera: { ...f.overview, zoom: f.overview.zoom * 1.2, tilt: degrees(60), yaw: base - Math.PI } });
    const end = b.time;
    b.step('return', 'close', n - 1, 3.6, { camera: f.overview, ease: 'inOut' });
    b.card('end', end + b.seconds(.6), b.time);
    b.fade(b.time - b.seconds(.9), 0); b.fade(b.time, 1);
    return finishTimeline(b, { ...info, revealMode: null, look: { aperture: APERTURE.orbit * amount(second) } });
  }

  if (options.reel === 'darkroom-prints') {
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
    // Quick prints pass without stopping, moving along the line (−z).
    const passPrint = (index: number, u: number): CameraPose => {
      const pose = printPose(index), step = Math.abs(layout.prints[index].center[2] - layout.prints[index - 1].center[2]);
      return { ...pose, pan: { ...pose.pan, z: pose.pan.z - u * step / 2 } };
    };
    // Strip change, without leaving the prints: step back from the wall and walk
    // back along it, the finished line above and the next one below, to its first print.
    // The walk ends a little along from the first print, so the room's corner stays out of view.
    const walk = (index: number, from: number, along = 0): CameraPose => {
      const above = layout.prints[index - 1], below = layout.prints[index];
      const top = above.center[1] + above.paper.height / 2, bottom = below.center[1] - below.paper.height / 2;
      const middle: [number, number, number] = [PRINT_WALL_X, (top + bottom) / 2, layout.prints[from].center[2] - along];
      const reach = Math.min(2.6, (top - bottom) * 1.25 / (2 * Math.tan(25 * Math.PI / 180)));
      return lookAtPose([middle[0] + reach, middle[1] + .04, middle[2]], middle, 50);
    };
    // Frame every line of prints: centred on them, from the top line to the lowest paper edge.
    const zs = layout.prints.map(print => print.center[2]);
    const top = Math.max(...layout.lines.map(line => line.y)) + .04, bottom = Math.min(...layout.prints.map(print => print.center[1] - print.paper.height / 2));
    const middle: [number, number, number] = [layout.prints[0].center[0], (top + bottom) / 2, (Math.max(...zs) + Math.min(...zs)) / 2];
    const across = Math.max(...zs) - Math.min(...zs) + .8, high = top - bottom + .3;
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
      if (rhythm[i] === 'quick') { const end = runEnd(rhythm, i); passRun(b, i, end, passPrint); i = end; continue; }
      if (i > 0) {
        if (frameAt(i).localIndex === 0 && breaks.has(i)) {
          b.step('break', 'pull-back', i, 1.4, { camera: walk(i, i - 1) });
          b.step('break', 'overview', i, 2.6, { camera: walk(i, i, .3) });
          b.step('break', 'push-in', i, 1.6, { camera: printPose(i), beat: true });
        } else b.step('tour', 'glide', i, frameAt(i).localIndex === 0 ? 1.6 : 1.1, { camera: printPose(i), beat: true });
      }
      // A lingering look leans in toward the print.
      const linger = rhythm[i] === 'linger';
      b.step('tour', 'frame', i, (linger ? 3 : 1.9) * holdScale, { camera: { ...printPose(i), zoom: printPose(i).zoom * (linger ? .8 : .94) }, drift: true });
    }
    b.step('return', 'pull-back', n - 1, 2.6, { camera: closing });
    const end = b.time;
    b.step('return', 'close', n - 1, 3.4, { camera: { ...closing, zoom: closing.zoom * 1.04 }, drift: true });
    b.card('end', end + b.seconds(.4), b.time);
    b.fade(b.time - b.seconds(.9), 0); b.fade(b.time, 1);
    return finishTimeline(b, { ...info, revealMode: null, look: { aperture: APERTURE['darkroom-prints'] } });
  }

  if (options.reel === 'documentary') {
    // Photograph first: each one fills the screen, drifts slowly (pushing in
    // ~10% and panning toward its longer side) and dissolves into the next.
    const push = first <= .5 ? .2 * first : .1 + .2 * (first - .5), pan = .8 * Math.min(1, 2 * first);
    const kenBurns = (index: number, travel = 1) => {
      const frame = frameAt(index), photo = roll.frames[index];
      const height = frame.strip.layout.frameHeight * frame.strip.scale;
      // Turn the camera so the photograph stands upright.
      const yaw = turn(index);
      const [w, h] = isVertical(photo) ? [height, frame.width] : [frame.width, height];
      const photoAspect = w / h, mismatch = Math.max(photoAspect / aspect, aspect / photoAspect);
      // Fill the screen unless the shapes differ a lot; then show the whole photograph.
      const visible = mismatch < 1.35 ? Math.min(h, w / aspect) * .97 : Math.max(h, w / aspect) * 1.04;
      const zoom = visible / (2 * TAN), inner = visible * (1 - push * travel);
      const slackX = Math.max(0, (w - inner * aspect) / 2), slackY = Math.max(0, (h - inner) / 2);
      const sign = index % 2 ? 1 : -1, horizontal = slackX >= slackY;
      const offset = (amount: number) => {
        const sx = horizontal ? amount * slackX * pan : 0, sy = horizontal ? 0 : amount * slackY * pan;
        return { x: frame.x + sx * Math.cos(yaw) - sy * Math.sin(yaw), z: TABLE_CENTER_Z - frame.y - sx * Math.sin(yaw) - sy * Math.cos(yaw) };
      };
      const start: CameraPose = { zoom, pan: offset(-sign), tilt: 0, yaw };
      const end: CameraPose = { zoom: zoom * (1 - push * travel), pan: offset(sign), tilt: 0, yaw };
      // A photograph shown whole is letterboxed (or pillarboxed) in black.
      const matte = mismatch < 1.35 ? undefined : { x: frame.x, z: TABLE_CENTER_Z - frame.y, width: w, height: h };
      return { start, end, matte };
    };
    // A lingering photograph drifts longer; quick ones drift less, briefly, and dissolve sooner.
    const dissolve = around(second, 2.2), drifting = 3.2 * holdScale;
    const pacing = { linger: { drift: 1.6, travel: 1, dissolve: 1 }, hold: { drift: 1, travel: 1, dissolve: 1 }, quick: { drift: .55, travel: .6, dissolve: .7 } };
    const b = new TimelineBuilder(f.overview, scale, reduced);
    b.fade(b.seconds(.8), 0);
    b.step('establish', 'open', 0, 3, { camera: drift(f.overview), drift: true });
    b.card('title', b.seconds(.4), b.seconds(2.8));
    const opening = kenBurns(0).matte;
    b.step('tour', 'push-in', 0, 2, { camera: kenBurns(0).start, beat: true, matte: opening && { ...opening, alpha: [0, 1] } });
    for (let i = 0; i < n; i++) {
      const pace = pacing[rhythm[i]], into = dissolve * pace.dissolve, hold = drifting * pace.drift;
      const { start, end, matte } = kenBurns(i, pace.travel), middle = lerpCamera(start, end, into / (into + hold));
      if (i > 0) {
        if (frameAt(i).localIndex === 0 && breaks.has(i)) {
          // Strip change: a chapter break. The photograph drifts on into black,
          // a breath of darkness, then the next one comes up out of it.
          const previous = kenBurns(i - 1).matte, out = b.time;
          b.step('break', 'pull-back', i, 1.2, { camera: { ...b.camera, zoom: b.camera.zoom * .985 }, ease: 'linear', drift: true, matte: previous });
          b.fade(out, 0); b.fade(b.time, 1);
          b.camera = start;
          b.step('break', 'overview', i, .5, { matte });
          const up = b.time;
          b.step('tour', 'glide', i, into, { camera: middle, ease: 'linear', drift: true, beat: true, matte });
          b.fade(up, 1); b.fade(b.time, 0);
        } else {
          // The next photograph appears beneath the outgoing one as it fades.
          b.camera = start;
          b.step('tour', 'glide', i, into, { camera: middle, dissolve: true, ease: 'linear', drift: true, beat: true, matte });
        }
      }
      // The first photograph arrives by the push-in and drifts for the whole span.
      b.step('tour', 'frame', i, i === 0 ? into + hold : hold, { camera: end, ease: 'linear', drift: true, matte });
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
  // The gate turns with the camera for a vertical shot; the aperture is in screen terms.
  const aperture = (index: number) => {
    const frame = locateFrame(roll, index), across = frame.strip.layout.frameHeight * frame.strip.scale;
    return isVertical(roll.frames[index]) ? { width: across, height: width(index) } : { width: width(index), height: across };
  };
  // A new strip, or a turn to or from a vertical shot, happens behind the closed shutter.
  const hidden = (index: number) => index > 0 && (locateFrame(roll, index).localIndex === 0 || turn(index) !== turn(index - 1));
  const jump = medium ? .42 : .18;
  const period = (i: number) => {
    if (medium || n < 10) return medium ? 2.5 : 2;
    const phase = i % 9;
    // A change of strip needs a full beat for its hidden jump, even in a speed-up.
    return phase >= 5 && phase <= 7 ? (hidden(i) ? 1 : .5) : phase === 8 ? 3 : 2;
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
      if (hidden(i) && !reduced) {
        // Carry on along the film past the frame (or the strip's end), then enter the next from its far side.
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
