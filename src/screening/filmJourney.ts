import { filmType } from '../data/filmFormats';
import { uprightYaw } from '../utils/frameOrientation';
import { locateFrame, type RollDefinition } from '../utils/rollLayout';
import type { framing, ReelOptions } from './reels';
import { continuousPath } from './continuousPath';
import { finishTimeline, PACE_SCALE, tablePan, TimelineBuilder, type CameraPose } from './timeline';

type Treatment = 'documentary' | 'tracking' | 'orbit' | 'develop';
const radians = (degrees: number) => degrees * Math.PI / 180;

/** Uneven groups and sparse accents; repeatable for preview, seeking and export. */
export function journeyTreatments(count: number, variety: number, negative: boolean): Treatment[] {
  const treatments: Treatment[] = Array(count).fill('documentary');
  const lengths = [3, 2, 4, 3, 5, 2];
  for (let start = 0, group = 0; start < count; group++) {
    const length = Math.max(2, lengths[group % lengths.length] + Math.round(2 - 4 * variety));
    if (group % 2 === 1) treatments.fill('tracking', start, Math.min(count, start + length));
    start += length;
  }
  if (negative && count) {
    const total = count <= 5 ? 1 : Math.ceil(count * (.055 + .09 * variety));
    for (let j = 0; j < total; j++) {
      const index = Math.min(count - 1, (count === 1 ? 0 : 1) + Math.floor(j * count / total) + (j % 2));
      treatments[index] = 'develop';
      // Quiet neighbors give the reveal room to breathe.
      if (index > 0) treatments[index - 1] = 'documentary';
      if (index + 1 < count) treatments[index + 1] = 'documentary';
    }
  }
  const spacing = Math.round(11 - 6 * variety);
  for (let i = 4; i < count; i += spacing + (i % 3)) {
    if ([treatments[i - 1], treatments[i], treatments[i + 1]].includes('develop')) continue;
    treatments[i] = 'orbit';
    if (i + 1 < count) treatments[i + 1] = 'documentary';
  }
  return treatments;
}

/** A single physical trip over the film. No edit, blackout, matte or projector gate. */
export function createFilmJourney(roll: RollDefinition, options: ReelOptions, f: ReturnType<typeof framing>) {
  const [movement, variety] = options.tuning!;
  const reduced = !!options.reducedMotion, negative = options.stockType === 'negative';
  const n = roll.frames.length, medium = roll.format !== undefined && filmType(roll.format) !== '135';
  const treatments = journeyTreatments(n, variety, negative);
  // Reduced motion keeps the continuous take: flat views, almost no drift,
  // slower travel. It never invokes the other reels' fade-through-black cuts.
  const motion = reduced ? .025 : .2 + .8 * movement;
  const pace = PACE_SCALE[options.pace];
  const travelScale = (reduced ? 1.65 : 1) * (1 + (pace - 1) * .25);
  const holdScale = pace * (medium ? 1.3 : 1);
  const at = (i: number) => {
    const frame = locateFrame(roll, i);
    return { ...frame, width: (frame.strip.layout.frameWidths?.[frame.localIndex] ?? frame.strip.layout.frameWidth) * frame.strip.scale,
      height: frame.strip.layout.frameHeight * frame.strip.scale };
  };
  const views = roll.frames.map((photo, i) => {
    const frame = at(i), treatment = treatments[i];
    const orbit = treatment === 'orbit', tracking = treatment === 'tracking', developing = treatment === 'develop';
    // Groups look from alternating sides. An orbit crosses its photograph;
    // tracking stays oblique, documentary leans in, and Develop stays quieter.
    const side = [1, -1, -1, 1][Math.floor(i / 2) % 4];
    const view = (u: number) => {
      const tilt = orbit ? 40 - 14 * u : tracking ? 32 - 10 * u : developing ? 10 - 3 * u : (10 + 4 * (i % 3)) * (1 - .4 * u);
      const yaw = orbit ? -24 + 38 * u : tracking ? 16 - 8 * u : developing ? 4 - 2 * u : 8 - 12 * u;
      const drift = reduced ? .035 : developing ? .04 : tracking ? .085 : .065;
      return { pan: tablePan(frame.x + frame.width * drift * motion * (2 * u - 1),
        frame.y + (reduced || developing ? 0 : side * frame.height * .035 * motion * (1 - 2 * u))),
      tilt: reduced ? 0 : radians(tilt * motion), yaw: uprightYaw(photo) + (reduced ? 0 : radians(side * yaw * motion)) };
    };
    // Fit the actual perspective of all four film corners, not just an upright
    // rectangle. One distance envelope per passage prevents zoom pumping as
    // the heading changes, while keeping wide and portrait photos complete.
    const tan = Math.tan(Math.PI / 8);
    let fit = 0;
    for (const u of [0, .25, .5, .75, 1]) {
      const p = view(u), center = tablePan(frame.x, frame.y);
      const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
      for (const x of [-1, 1]) for (const y of [-1, 1]) {
        const dx = center.x + x * frame.width / 2 - p.pan.x, dz = center.z + y * frame.height / 2 - p.pan.z;
        const across = dx * cos - dz * sin, along = dx * sin + dz * cos;
        fit = Math.max(fit, Math.sin(p.tilt) * along + 1.1 * Math.max(Math.abs(across) / (tan * options.aspect), Math.abs(Math.cos(p.tilt) * along) / tan));
      }
    }
    return (u: number): CameraPose => ({ ...view(u), zoom: fit * (1 + (developing ? .035 : .1) * motion * (1 - u)) });
  });
  const pose = (i: number, u: number) => views[i](u);
  const opening = { ...f.overview, zoom: f.overview.zoom * 1.05, tilt: radians(12 * motion) };
  // Deliberately bypass TimelineBuilder's reduced-motion cuts for this reel.
  const b = new TimelineBuilder(opening, 1, false);
  b.fades = [{ time: 0, value: 0 }];
  b.light = .2; b.ambient = .12;
  if (negative) b.reveal = 0;
  const step = (act: Parameters<typeof b.step>[0], kind: Parameters<typeof b.step>[1], i: number, duration: number,
    camera: CameraPose, other: Omit<NonNullable<Parameters<typeof b.step>[4]>, 'camera'> = {}) => {
    // Follow the shorter rotation on approaches, including opposite portraits.
    const yaw = b.camera.yaw + Math.atan2(Math.sin(camera.yaw - b.camera.yaw), Math.cos(camera.yaw - b.camera.yaw));
    b.step(act, kind, i, duration, { ...other, camera: { ...camera, yaw }, ease: 'linear' });
  };
  const reveal = (position: number) => negative ? { reveal: position } : {};
  const intro = n < 4 ? 1.1 : 1.5;
  step('establish', 'open', 0, intro, { ...opening, zoom: f.overview.zoom }, { light: 1, ambient: 0 });
  b.card('title', .15, intro);
  for (let i = 0; i < n; i++) {
    const start = pose(i, 0), feature = treatments[i] === 'develop';
    const incoming = feature ? i : i + 1;
    if (i > 0 && at(i).localIndex === 0) {
      // Lift only enough to connect the two rows. The shared cubic velocity
      // rounds this diagonal return without an extra room tour or a pause.
      const previous = at(i - 1), current = at(i);
      const bridge: CameraPose = { zoom: Math.max(b.camera.zoom, start.zoom) * (1.25 + .1 * motion),
        pan: tablePan((previous.x + current.x) / 2, (previous.y + current.y) / 2),
        tilt: radians(15 * motion), yaw: b.camera.yaw + Math.atan2(Math.sin(start.yaw - b.camera.yaw), Math.cos(start.yaw - b.camera.yaw)) / 2 };
      step('break', 'pull-back', i, 1.05 * travelScale, bridge, reveal(incoming));
      step('tour', 'glide', i, 1.05 * travelScale, start, { beat: true });
    } else {
      const turn = Math.abs(Math.atan2(Math.sin(start.yaw - b.camera.yaw), Math.cos(start.yaw - b.camera.yaw)));
      const travel = i === 0 ? (n < 4 ? 1 : 1.35) : .7 + .75 * turn / (Math.PI / 2);
      step('tour', i === 0 ? 'push-in' : 'glide', i, travel * travelScale, start, { ...reveal(incoming), beat: true });
    }
    if (feature) {
      step('tour', 'open', i, .25, pose(i, .07));
      step('tour', 'develop', i, .95, pose(i, .3), reveal(i + 1));
    } else if (treatments[i] === 'orbit') {
      step('tour', 'orbit', i, .75 * travelScale, pose(i, .35));
    }
    // During the positive viewing passage, ordinary upcoming photographs
    // develop ahead of the camera. Stop before the next featured negative.
    const ahead = i + 1 < n && treatments[i + 1] !== 'develop' ? i + 2 : i + 1;
    const lingering = feature || i === n - 1 || i % 7 === 3;
    step('tour', 'frame', i, (lingering ? 2.7 : 2.2) * holdScale, pose(i, 1), reveal(ahead));
  }
  step('return', 'pull-back', n - 1, 1.45 * travelScale, { ...f.overview, zoom: f.overview.zoom * 1.015, tilt: radians(8 * motion) });
  const end = b.time;
  step('return', 'close', n - 1, 1.6, { ...f.overview, zoom: f.overview.zoom * 1.045, tilt: radians(4 * motion) }, { light: .75 });
  b.card('end', end + .1, b.time);
  return continuousPath(finishTimeline(b, { reel: 'film-journey', pace: options.pace, aspect: options.aspect,
    reducedMotion: reduced, frameCount: n, revealMode: negative ? 'polarity' : null,
    look: { aperture: 0, band: .07, weave: 0, flicker: 0 } }));
}
