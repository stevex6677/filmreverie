import { createScreeningTimeline, framing } from '../screening/reels';
import { DEFAULT_LOOK, finishTimeline, lerpCamera, lookAtPose, tablePan, TimelineBuilder, type CameraPose, type ReelId, type ScreeningLook, type ScreeningSample, type ScreeningTimeline, type Segment } from '../screening/timeline';
import { fitRollView, focusTableAngle, locateFrame } from '../utils/rollLayout';
import { CAMERA_SHELF_MM, CAMERA_SHELF_ORIGIN, cameraShelfSlot, mm, SHELF_CELL_MM, SHELF_ORIGIN } from '../data/physicalScale';
import { TABLE_CENTER_Z, TABLE_SURFACE_Y } from '../utils/cameraBounds';
import { getFilmStock } from '../data/filmStocks';
import { CAMERAS } from '../data/cameras';
import type { FilmFormat } from '../data/filmFormats';
import { SHOWREEL_FORMATS, type ShowreelFormat, type ShowreelRoll } from './rolls';

/**
 * The showreel is a pure function of time, like a screening: a sequence of
 * shots, each an excerpt of a reel or a custom camera move, plus the text and
 * light effects drawn over them. The same timeline drives the live page and
 * frame-stepped export (ScreeningDirector's engine).
 *
 * Every roll lies on the light table throughout; each light-table shot and
 * reel excerpt features a different one, and the formats shot all of them.
 */
export interface ShowreelSample extends ScreeningSample {
  /** The roll the shot features (its develop band, slate and prints), or −1. */
  roll: number; shot: string;
  /** The loupe's place on the table (table-local, like the viewer's loupe), when it is in use. */
  loupe: { x: number; y: number } | null;
}

/**
 * `shift` moves a reel excerpt, framed for its roll alone, to where that roll
 * lies on the shared table. Custom shots are framed in table coordinates.
 */
export interface Shot { name: string; start: number; duration: number; roll: number; source: ScreeningTimeline; from: number; shift: boolean; loupe?: (local: number) => { x: number; y: number } }

/** Lower-left chapter caption. */
export interface Caption { start: number; end: number; chapter?: string; title: string; line?: string; top?: boolean }
/** Slate in the lower right naming the photograph in view (a frame of a roll) and its camera. */
export interface Slate { start: number; end: number; roll: number; frame: number }
/** A camera in the cabinet, labelled while it is in view. */
export interface Exhibit { start: number; end: number; name: string; year: string; position: [number, number, number] }
/** A film format on the light table, labelled above its rolls (world position of their far edge). */
export interface FormatLabel { start: number; end: number; title: string; detail: string; position: [number, number, number]; width: number }
export type Moment =
  | { kind: 'hook'; start: number; end: number; lines: readonly string[] }
  | { kind: 'title'; start: number; end: number }
  /** The New roll editor, drawn over the dimmed room: photographs dropped in, named, saved. */
  | { kind: 'new-roll'; start: number; end: number }
  | { kind: 'end'; start: number; end: number };

export interface ShowreelTimeline extends ScreeningTimeline {
  sample(time: number): ShowreelSample;
  shots: readonly Shot[];
  captions: readonly Caption[];
  slates: readonly Slate[];
  exhibits: readonly Exhibit[];
  formats: readonly FormatLabel[];
  moments: readonly Moment[];
  /** Light-leak flashes at cuts, by their peak time. */
  flashes: readonly number[];
  /** The first cut, after the title; a soundtrack's beat drop lands here. */
  cue: number;
  rolls: readonly ShowreelRoll[];
  /** The roll taken in by the New roll editor. */
  editorRoll: number;
}

export const SHOWREEL_SITE = 'filmreverie.app';
export const SHOWREEL_GITHUB = 'github.com/stevex6677/filmreverie';
/** Length of the New roll shot; the overlay's editor animation (authored over 6.8 s) is slowed to fill it. */
export const NEW_ROLL_SECONDS = 8.2;
export const NEW_ROLL_PACE = 6.8 / NEW_ROLL_SECONDS;

/**
 * Photographs the film must show (0-based, in filename order), clamped to each
 * roll's length: the third Fuji frame, the fifth Portra frame (a vertical shot,
 * seen upright) and the thirteenth (developed in the opening, then held), the ninth
 * half frame, the fifth panoramic frame, the first and seventh 6×6 frames, the first three 6×7 Provia
 * prints, the second 6×7 slide and the third and fourth 6×9 frames.
 */
export const FEATURED = { tracking: 2, hook: 12, upright: 4, half: 8, loupe: 4, medium: 6, projector: [0, 1, 2], prints: [0, 1, 2], slides: 1, sixByNine: [2, 3] } as const;

const degrees = (value: number) => value * Math.PI / 180;

/** A pose's yaw unwrapped next to a reference, so moves turn the short way. */
function near(pose: CameraPose, reference: CameraPose): CameraPose {
  let yaw = pose.yaw;
  while (yaw - reference.yaw > Math.PI) yaw -= 2 * Math.PI;
  while (yaw - reference.yaw < -Math.PI) yaw += 2 * Math.PI;
  return { ...pose, yaw };
}

/** A custom shot built on the screening timeline builder; it starts visible (no fade). */
function custom(start: CameraPose, build: (b: TimelineBuilder) => void, look: Partial<ScreeningLook> = {}, revealMode: 'polarity' | 'backlight' | null = null, fadeIn = 0) {
  const b = new TimelineBuilder(start, 1, false);
  b.fade(fadeIn, 0);
  // Every move turns the short way round.
  const step = b.step.bind(b);
  b.step = (act, kind, frame, seconds, to = {}) => step(act, kind, frame, seconds, to.camera ? { ...to, camera: near(to.camera, b.camera) } : to);
  build(b);
  return finishTimeline(b, { reel: 'darkroom', pace: 'normal', aspect: 16 / 9, reducedMotion: false, frameCount: 1, revealMode, look });
}

/** The roll of a format (`pano` for a free-sized 35mm roll) to feature, preferring the nth; any roll if there is none. */
function pick(rolls: readonly ShowreelRoll[], kind: FilmFormat | 'pano', nth = 0, avoid: readonly number[] = []) {
  const all = rolls.map((roll, index) => ({ roll, index }));
  const matches = all.filter(({ roll }) => kind === 'pano' ? roll.sizing === 'free' : roll.format === kind && roll.sizing === 'fixed');
  return (matches[nth] ?? matches.find(({ index }) => !avoid.includes(index)) ?? all.find(({ index }) => !avoid.includes(index)) ?? all[0]).index;
}

export function createShowreelTimeline(rolls: readonly ShowreelRoll[], requestedAspect = 16 / 9, formats: readonly ShowreelFormat[] = SHOWREEL_FORMATS): ShowreelTimeline {
  const aspect = Number.isFinite(requestedAspect) && requestedAspect > 0 ? requestedAspect : 16 / 9;
  // A different roll for each light-table shot and reel, from small film to
  // large; the projector screens the 6×6 roll after its close-up.
  const taken: number[] = [];
  const cast = (kind: FilmFormat | 'pano', nth = 0) => { const index = pick(rolls, kind, nth, taken); taken.push(index); return index; };
  const role = {
    tracking: cast('135', 0), hook: cast('135', 1), half: cast('135-half'), loupe: cast('pano'), medium: cast('66'),
    prints: cast('67', 0), slides: cast('67', 1), sixByNine: cast('69'), projector: -1,
  };
  role.projector = role.medium;
  const def = (roll: number) => rolls[roll].definition;
  const featured = (roll: number, index: number) => Math.max(0, Math.min(index, def(roll).frames.length - 1));
  const reel = (roll: number, id: ReelId, pace: 'relaxed' | 'normal' | 'brisk' = 'normal', tuning?: number[]) =>
    createScreeningTimeline(def(roll), { reel: id, pace, aspect, tuning, stockType: getFilmStock(rolls[roll].stockId).type });
  /** A frame's place on the shared table (table-local). */
  const spot = (roll: number, index: number) => { const frame = locateFrame(def(roll), index); return { x: frame.x + rolls[roll].offset.x, y: frame.y + rolls[roll].offset.y }; };
  /** A pose framed for a roll alone, moved to where it lies on the table. */
  const placed = (roll: number, pose: CameraPose): CameraPose => ({ ...pose, pan: { x: pose.pan.x + rolls[roll].offset.x, z: pose.pan.z - rolls[roll].offset.y } });

  const shots: Shot[] = [];
  let time = 0;
  const add = (name: string, roll: number, source: ScreeningTimeline, from = 0, to = source.duration, shift = false, loupe?: Shot['loupe']) => {
    shots.push({ name, start: time, duration: to - from, roll, source, from, shift, loupe });
    time += to - from;
    return shots[shots.length - 1];
  };

  // 1. Hook and title: the table switches on under a strip of negatives, a band
  // of light develops three of them, then the camera rises over the whole table.
  const hookRoll = role.hook, hookFrames = def(hookRoll).frames.length;
  // Three frames from the featured one, all on the roll.
  const hookFrom = Math.max(0, Math.min(FEATURED.hook, hookFrames - 3));
  const frameZoom = fitRollView(def(hookRoll), 'frame', hookFrom, aspect).zoom;
  const low = (index: number, zoom = 1.5, yaw = -16): CameraPose => { const at = spot(hookRoll, index); return { zoom: frameZoom * zoom, pan: tablePan(at.x, at.y), tilt: degrees(58), yaw: degrees(yaw) }; };
  const wide = lookAtPose([.35, .95, 3.2], [0, -.35, -.5], 50);
  const hook = custom(low(hookFrom, 1.65, -24), b => {
    b.light = 0; b.reveal = hookFrom; b.ambient = 1;
    b.step('establish', 'open', 0, 1.4, { camera: low(hookFrom, 1.55, -22), ease: 'linear' });
    // A fluorescent start: a stutter, then full light.
    b.step('establish', 'open', 0, .07, { light: .8, ambient: 0, ease: 'linear' });
    b.step('establish', 'open', 0, .09, { light: .12, ease: 'linear' });
    b.step('establish', 'open', 0, .1, { light: 1, ease: 'linear' });
    b.step('establish', 'open', 0, .45, { camera: low(hookFrom, 1.5, -20), ease: 'linear' });
    b.step('tour', 'develop', 0, 3.9, { camera: low(hookFrom + 2, 1.45, -10), reveal: hookFrom + 3, ease: 'linear' });
    b.step('tour', 'frame', 2, .8, { camera: low(hookFrom + 2, 1.42, -8), ease: 'out' });
    b.step('return', 'pull-back', 2, 2.6, { camera: wide, ease: 'inOut' });
    b.step('return', 'close', 2, 2.3, { camera: { ...wide, zoom: wide.zoom * .95, yaw: wide.yaw + degrees(3.5) }, ease: 'out' });
  }, { aperture: .045, band: .09 }, getFilmStock(rolls[hookRoll].stockId).type === 'reversal' ? 'backlight' : 'polarity', .5);
  add('hook', hookRoll, hook);
  // The title appears as the camera starts to rise.
  const titleStart = hook.segments.find(segment => segment.kind === 'pull-back')!.start;

  // 2. The darkroom: a slow lateral move past the wet side and drying line.
  const darkroom = custom(lookAtPose([-2.0, .45, 3.6], [-.6, -.15, 6.6], 56), b => {
    b.step('tour', 'glide', 0, 5.0, { camera: lookAtPose([1.3, .4, 3.83], [.75, -.2, 6.6], 56), ease: 'inOut' });
  }, { aperture: .03 });
  const room = add('darkroom', -1, darkroom);

  // 3. A new roll: the editor over the dimmed room while the camera drifts
  // toward the film shelf, so the shelf shot continues the same move.
  const shelfTarget: [number, number, number] = [-.2, SHELF_ORIGIN[1], SHELF_ORIGIN[2]];
  const shelfOpen = lookAtPose([-1.5, .75, 2.1], shelfTarget, 50);
  const newRoll = custom(lookAtPose([-2.3, .9, 2.95], shelfTarget, 52), b => {
    b.step('tour', 'glide', 0, NEW_ROLL_SECONDS, { camera: shelfOpen, ease: 'out' });
  }, { aperture: .03 });
  const newRollShot = add('new-roll', -1, newRoll);

  // 4. The film shelf (the published gallery's): across the cabinet, then in on
  // the middle row, in view from the table.
  const cell = (slot: number): [number, number, number] => [
    SHELF_ORIGIN[0] + (slot % 4 - 1.5) * mm(SHELF_CELL_MM.width),
    SHELF_ORIGIN[1] + (1.5 - Math.floor(slot / 4)) * mm(SHELF_CELL_MM.height),
    SHELF_ORIGIN[2] + mm(SHELF_CELL_MM.depth) / 2,
  ];
  const [a, c] = [cell(5), cell(6)];
  const between: [number, number, number] = [(a[0] + c[0]) / 2, a[1] - .02, a[2]];
  const shelf = custom(shelfOpen, b => {
    b.step('tour', 'glide', 0, 2.4, { camera: lookAtPose([-.55, .62, 1.0], [between[0] - .05, between[1] + .05, between[2]], 42), ease: 'inOut' });
    b.step('tour', 'frame', 0, 2.6, { camera: lookAtPose([a[0] + .35, a[1] + .05, a[2] + .95], [a[0] + .2, a[1] - .02, a[2]], 38), ease: 'inOut' });
  }, { aperture: .03 });
  const shelfShot = add('shelf', -1, shelf);

  // 5. Every format on the light table: from close over the smallest film the
  // camera rises and pulls back until all of them, up to 6×9, are in view.
  const tableLeft = formats.length ? formats[0].x - formats[0].width / 2 : -1, tableRight = formats.length ? formats[formats.length - 1].x + formats[formats.length - 1].width / 2 : 1;
  const tableDeep = Math.max(.5, ...formats.map(format => format.top * 2));
  const whole = Math.max(tableDeep * 1.2, (tableRight - tableLeft) * 1.06 / aspect) / (2 * Math.tan(Math.PI / 8));
  const first = formats[0] ?? { x: 0, top: 0 };
  const smallest: CameraPose = { zoom: whole * .36, pan: tablePan(first.x + .05, first.top * .2), tilt: degrees(50), yaw: degrees(-30) };
  const allFormats = custom(smallest, b => {
    b.step('tour', 'rise', 0, 5.0, { camera: { zoom: whole * 1.06, pan: tablePan((tableLeft + tableRight) / 2, .04), tilt: degrees(15), yaw: degrees(1.5) }, ease: 'inOut' });
    b.step('tour', 'overview', 0, 1.4, { camera: { zoom: whole * 1.04, pan: tablePan((tableLeft + tableRight) / 2, .04), tilt: degrees(14), yaw: degrees(2) }, ease: 'out' });
  }, { aperture: .02 });
  const formatsShot = add('formats', -1, allFormats);

  // 6. The light table, one roll each: 35mm in a Tracking Shot excerpt that
  // carries on to two Portra frames, a glide along the half-frame roll, the
  // panoramic roll under the loupe, then the 6×6 roll before the camera sweeps
  // down and orbits one photograph.
  const tracking = reel(role.tracking, 'tracking', 'relaxed', [.45, .35]);
  // From the whole table the camera descends, without a cut, to where the reel
  // settles on the featured frame, then follows the reel in to a detail of it.
  const trackFrame = featured(role.tracking, FEATURED.tracking);
  const trackSegment = (kind: string) => tracking.segments.find(segment => segment.kind === kind && segment.frameIndex === trackFrame);
  const trackFrom = trackSegment('frame')?.start ?? tracking.frameStart(trackFrame);
  const approach = custom(allFormats.sample(allFormats.duration).camera, b => {
    b.step('tour', 'push-in', trackFrame, 3.2, { camera: placed(role.tracking, tracking.sample(trackFrom).camera), ease: 'inOut' });
  }, { aperture: .03 });
  const approachShot = add('approach', role.tracking, approach);
  const detail = trackSegment('detail');
  const trackTo = detail ? detail.start + Math.min(detail.duration, 2.4) : trackFrom + 5;
  const trackingShot = add('tracking', role.tracking, tracking, trackFrom, trackTo, true);
  /**
   * Looking at one photograph from `back` frames before it along its strip; a
   * vertical shot is seen upright, as in the viewer's focus.
   */
  const facing = (roll: number, index: number) => {
    const zoom = fitRollView(def(roll), 'frame', index, aspect).zoom, at = spot(roll, index), layout = def(roll).layout!;
    const turn = focusTableAngle(def(roll), index).yaw;
    return (back: number, scale: number, tilt: number, yaw: number): CameraPose =>
      ({ zoom: zoom * scale, pan: tablePan(at.x - back * (layout.frameWidth + layout.gap) * def(roll).scale, at.y), tilt: degrees(tilt), yaw: turn + degrees(yaw) });
  };
  // Without a cut, from the detail across to the Portra roll below: the vertical
  // frame, turned upright, then along to the opening's frame, holding on each.
  const [uprightFrame, heldFrame] = [featured(hookRoll, FEATURED.upright), featured(hookRoll, FEATURED.hook)];
  const [upright, held] = [facing(hookRoll, uprightFrame), facing(hookRoll, heldFrame)];
  const portra = custom(placed(role.tracking, tracking.sample(trackTo).camera), b => {
    b.step('tour', 'glide', uprightFrame, 2.4, { camera: upright(0, 1.3, 20, -5), ease: 'inOut' });
    b.step('tour', 'frame', uprightFrame, 2.6, { camera: upright(0, 1.2, 14, -2), ease: 'linear' });
    b.step('tour', 'glide', heldFrame, 2.3, { camera: held(0, 1.3, 20, -5), ease: 'inOut' });
    b.step('tour', 'frame', heldFrame, 2.6, { camera: held(0, 1.2, 14, -2), ease: 'linear' });
  }, { aperture: .035 });
  const portraShot = add('portra', hookRoll, portra);
  // A short glide along the half-frame strip onto the featured photograph, which it holds.
  const halfRoll = role.half, halfFrame = featured(halfRoll, FEATURED.half), half = facing(halfRoll, halfFrame);
  const halfShot = add('half', halfRoll, custom(half(1.5, 1.9, 40, -14), b => {
    b.step('tour', 'glide', halfFrame, 1.4, { camera: half(0, 1.3, 20, -5), ease: 'out' });
    b.step('tour', 'frame', halfFrame, 2.7, { camera: half(0, 1.2, 14, -2), ease: 'linear' });
  }, { aperture: .035 }));
  // Seen from above, the loupe rides along the rebate's edge printing, then
  // drops onto the featured photograph.
  const wideRoll = role.loupe, target = featured(wideRoll, FEATURED.loupe), right = spot(wideRoll, target);
  // From the frame before, or from the featured one's left edge when it begins its strip.
  const left = locateFrame(def(wideRoll), target).localIndex > 0 ? spot(wideRoll, target - 1)
    : { x: right.x - (def(wideRoll).frameWidths?.[target] ?? def(wideRoll).layout!.frameWidth) * def(wideRoll).scale / 2, y: right.y };
  const wideZoom = fitRollView(def(wideRoll), 'frame', target, aspect).zoom;
  const loupeView = (x: number, y: number, zoom: number): CameraPose => ({ zoom: wideZoom * zoom, pan: tablePan(x, left.y + y), tilt: degrees(14), yaw: degrees(-4) });
  const travel = Math.max(.14, right.x - left.x), LOUPE_SECONDS = 4.4;
  const loupeSource = custom(loupeView(left.x + travel * .2, .065, 1.65), b => {
    b.step('tour', 'frame', target, LOUPE_SECONDS, { camera: loupeView(right.x, -.005, 1.45), ease: 'inOut' });
  }, { aperture: .03 });
  const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
  const ease = (u: number) => { const v = Math.max(0, Math.min(1, u)); return v * v * (3 - 2 * v); };
  const loupeShot = add('loupe', wideRoll, loupeSource, 0, loupeSource.duration, false, local => ({
    x: lerp(left.x + travel * .18, right.x - .02, ease(local / LOUPE_SECONDS)),
    y: left.y + .057 - .07 * ease((local - 2.2) / 1.5),
  }));
  // Medium format: the whole 6×6 roll from above, then a calm push in, staying
  // nearly overhead, onto one photograph, which it holds.
  const square = role.medium, medium = framing(def(square), aspect);
  const heroIndex = featured(square, FEATURED.medium), hero6 = spot(square, heroIndex);
  const close6 = medium.frame(heroIndex).zoom;
  const around6 = (zoom: number, tilt: number, yaw: number): CameraPose => ({ zoom: close6 * zoom, pan: tablePan(hero6.x, hero6.y), tilt: degrees(tilt), yaw: degrees(yaw) });
  const overview6 = placed(square, medium.overview);
  const mediumSource = custom({ ...overview6, zoom: overview6.zoom * 1.12, tilt: degrees(8), yaw: degrees(-1) }, b => {
    b.step('establish', 'overview', heroIndex, .8, { camera: { ...overview6, zoom: overview6.zoom * 1.09, tilt: degrees(8.5), yaw: degrees(-.5) }, ease: 'linear' });
    b.step('tour', 'push-in', heroIndex, 1.4, { camera: around6(1.04, 11, -.5), ease: 'inOut' });
    b.step('tour', 'frame', heroIndex, 1.5, { camera: around6(1, 10, 0), ease: 'linear' });
  }, { aperture: .035 });
  const mediumShot = add('medium', square, mediumSource);
  // The slides' screening, which the 6×9 shot leads into: the Develop reel's
  // moves, without its band of light (the slides are already lit).
  const developed = reel(role.slides, 'develop', 'normal', [.55, .5]);
  const slides: ScreeningTimeline = { ...developed, revealMode: null, sample: time => ({ ...developed.sample(time), reveal: null }) };
  const slideFrame = featured(role.slides, FEATURED.slides);
  // Joined as the reel's camera settles on the featured slide.
  const slideFrom = slides.segments.find(segment => segment.kind === 'develop' && segment.frameIndex === slideFrame)?.start ?? slides.frameStart(slideFrame);
  // 6×9: each featured frame whole, with its rebate, from nearly overhead; a
  // slight push on each and a glide along the strip between them. Then,
  // without a cut, the camera arcs up and over to the slide, arriving at rest
  // as the reel's push-in begins.
  const [nineFirst, nineLast] = [featured(role.sixByNine, FEATURED.sixByNine[0]), featured(role.sixByNine, FEATURED.sixByNine[1])];
  const [nineA, nineB] = [facing(role.sixByNine, nineFirst), facing(role.sixByNine, nineLast)];
  const NINE_VIEWING = 4.1, ARC_SECONDS = 2.8, ARC_STEPS = 56;
  const sixByNineShot = add('six-by-nine', role.sixByNine, custom(nineA(0, 1.14, 8, 0), b => {
    b.step('tour', 'frame', nineFirst, 1.4, { camera: nineA(0, 1.1, 8, 0), ease: 'linear' });
    b.step('tour', 'glide', nineLast, 1.3, { camera: nineB(0, 1.1, 8, 0), ease: 'inOut' });
    b.step('tour', 'frame', nineLast, 1.4, { camera: nineB(0, 1.06, 8, 0), ease: 'linear' });
    // One eased path, lifted in the middle, in short linear steps: no change of pace or direction along the way.
    const from = b.camera, to = near(placed(role.slides, slides.sample(slideFrom).camera), from);
    for (let k = 1; k <= ARC_STEPS; k++) {
      const u = k / ARC_STEPS, eased = u * u * (3 - 2 * u), lift = Math.exp(Math.log(2.2) * Math.sin(Math.PI * eased));
      const pose = lerpCamera(from, to, eased);
      b.step('tour', 'glide', k < ARC_STEPS / 2 ? nineLast : slideFrame, ARC_SECONDS / ARC_STEPS, { camera: { ...pose, zoom: pose.zoom * lift }, ease: 'linear' });
    }
  }, { aperture: .03 }));

  // 7. Screenings, a different roll in each: the Develop reel's moves over the
  // slides, Darkroom Prints and the Projector.
  const segmentEnd = (source: ScreeningTimeline, kind: string, index: number, fallback: number) => {
    const found = source.segments.filter(segment => segment.kind === kind && segment.frameIndex === index).at(-1);
    return found ? found.start + found.duration : fallback;
  };
  // The slide, held as the reel pushes in; the 6×9 shot leads into it.
  const slidesShot = add('slides', role.slides, slides, slideFrom, segmentEnd(slides, 'frame', slideFrame, slideFrom + 5), true);
  // Darkroom Prints: briskly along the roll's first three prints on the darkroom wall.
  const prints = reel(role.prints, 'darkroom-prints', 'brisk', [.5, .45]);
  // Joined as the camera pushes in from the wall toward the first print.
  const wall = prints.segments.find(segment => segment.kind === 'push-in')!.start + .4;
  const lastPrint = featured(role.prints, FEATURED.prints[FEATURED.prints.length - 1]);
  // The reel would linger on the last print; it is held as long as the first.
  const printHold = (index: number) => prints.segments.find(segment => segment.kind === 'frame' && segment.frameIndex === index);
  const [firstHold, lastHold] = [printHold(featured(role.prints, FEATURED.prints[0])), printHold(lastPrint)];
  const printsShot = add('prints', role.prints, prints, wall, lastHold ? lastHold.start + Math.min(lastHold.duration, firstHold?.duration ?? 1.8) : wall + 6);
  const projector = reel(role.projector, 'projector', 'normal', [.5, .5]);
  const leader = projector.cards.find(card => card.kind === 'countdown')!;
  const projectorFrom = leader.start + 2.3;
  const projected = featured(role.projector, FEATURED.projector[FEATURED.projector.length - 1]);
  // Only the featured frames are screened: it leaves as the last of them ends.
  const projectorShot = add('projector', role.projector, projector, projectorFrom, segmentEnd(projector, 'frame', projected, projectorFrom + 6), true);
  const countdownEnd = projectorShot.start + leader.end - projectorFrom;

  // 8. The camera cabinet: across the five cameras, then in on the last.
  const tier = CAMERA_SHELF_ORIGIN[1] + cameraShelfSlot(0).y + mm(21);
  const lip = CAMERA_SHELF_ORIGIN[0] - mm(CAMERA_SHELF_MM.depth);
  const cameraAt = (index: number): [number, number, number] => {
    const slot = cameraShelfSlot(index);
    return [CAMERA_SHELF_ORIGIN[0] - slot.z, tier + .1, CAMERA_SHELF_ORIGIN[2] + slot.x];
  };
  const along = (z: number, distance: number, fov = 40): CameraPose => lookAtPose([cameraAt(0)[0] - distance, tier + .3, z - .25], [cameraAt(0)[0], tier + .2, z], fov);
  const hero = cameraAt(CAMERAS.length - 1);
  const cabinet = custom(along(cameraAt(0)[2] + .1, 1.55), b => {
    b.step('tour', 'glide', 0, 3.7, { camera: along(hero[2] - .25, 1.45), ease: 'inOut' });
    b.step('tour', 'push-in', 0, 2.2, { camera: lookAtPose([hero[0] - .78, hero[1] + .14, hero[2] - .34], [hero[0], hero[1] + .03, hero[2] + .02], 34), ease: 'inOut' });
    b.step('return', 'pull-back', 0, 3.1, { camera: lookAtPose([hero[0] - 2.2, hero[1] + .4, hero[2] - 1.3], [hero[0] - .1, hero[1] - .05, hero[2] - .7], 46), ease: 'inOut' });
  }, { aperture: .03 });
  const cabinetShot = add('cabinet', -1, cabinet);
  const duration = time;

  // The end card comes up as the camera pulls back from the last camera.
  const end = cabinetShot.start + cabinet.segments.find(segment => segment.kind === 'pull-back')!.start + .3;
  const moments: Moment[] = [
    { kind: 'hook', start: .45, end: titleStart - .1, lines: ['Your photographs.', 'On real film.'] },
    { kind: 'title', start: titleStart + .25, end: room.start - .15 },
    { kind: 'new-roll', start: newRollShot.start, end: newRollShot.start + newRollShot.duration },
    { kind: 'end', start: end, end: duration },
  ];
  const named = (shot: Shot) => rolls[shot.roll];
  const captions: Caption[] = [
    { start: room.start + .35, end: room.start + room.duration - .3, chapter: '01  ·  The darkroom', title: 'Step inside.', line: 'A fully modeled 3D darkroom to explore.' },
    { start: shelfShot.start + .3, end: shelfShot.start + shelfShot.duration - .25, chapter: '03  ·  The film shelf', title: 'Every roll, boxed and shelved.', line: 'Real Kodak and Fujifilm stocks, each with a cover photo.' },
    { start: formatsShot.start + .5, end: formatsShot.start + formatsShot.duration - .2, chapter: '04  ·  The light table', title: 'Every format, true to size.', line: 'Half frame to 6×9, side by side at their real dimensions.' },
    { start: approachShot.start + approachShot.duration * .6, end: portraShot.start + portraShot.duration - .2, chapter: '04  ·  The light table', title: 'Lifelike film borders.', line: 'Sprocket holes and edge codes, simulated for a more realistic view.' },
    { start: halfShot.start + .3, end: halfShot.start + halfShot.duration - .2, chapter: '04  ·  The light table', title: 'Half frame, side by side.', line: 'Two 18 × 24 mm photographs in the space of one 35mm frame.' },
    { start: loupeShot.start + .25, end: loupeShot.start + loupeShot.duration - .2, chapter: '04  ·  The light table', title: 'A loupe for every grain.', line: 'Glide it over the film and magnify up to 10×.' },
    { start: mediumShot.start + .3, end: mediumShot.start + mediumShot.duration - .25, chapter: '04  ·  The light table', title: 'Medium format, up close.', line: `${named(mediumShot).formatLabel.replace('120 · ', '')} negatives, the size of your palm.` },
    { start: sixByNineShot.start + .3, end: sixByNineShot.start + NINE_VIEWING, chapter: '04  ·  The light table', title: 'The whole frame, edge to edge.', line: `${named(sixByNineShot).formatLabel.replace('120 · ', '')} film, from rebate to rebate, at its true size.` },
    { start: slidesShot.start + .3, end: slidesShot.start + slidesShot.duration - .25, chapter: '05  ·  Screenings', title: 'Your roll, as a film.', line: 'Screenings move through your photographs one frame at a time.' },
    { start: printsShot.start + .3, end: printsShot.start + printsShot.duration - .25, chapter: '05  ·  Screenings', title: 'Print every frame.', line: 'Each photograph enlarged onto paper and hung up to dry.' },
    { start: countdownEnd + .25, end: projectorShot.start + projectorShot.duration - .2, chapter: '05  ·  Screenings', title: 'Screen any roll.', line: 'Seven cinematic reels, exported as video.' },
    { start: cabinetShot.start + .4, end: end - .3, chapter: '06  ·  The camera cabinet', title: 'Five classic cameras.', line: 'Modeled in 3D, to turn over in your hands.', top: true },
  ];
  // The photograph in view is named in the corner, from the first single-roll light table shot to the last
  // screening: from its shot's start, or halfway through the move onto it, until the camera leaves it; not
  // over the projector's leader. Consecutive views of one photograph, or of one title on a roll, share a slate.
  const featuring: [Shot, number[]][] = [[approachShot, [trackFrame]], [trackingShot, [trackFrame]],
    [portraShot, [uprightFrame, heldFrame]], [halfShot, [halfFrame]], [loupeShot, [target]], [mediumShot, [heroIndex]],
    [sixByNineShot, [nineFirst, nineLast]], [slidesShot, [slideFrame]], [printsShot, FEATURED.prints.map(index => featured(role.prints, index))],
    [projectorShot, FEATURED.projector.map(index => featured(role.projector, index))]];
  const slates: Slate[] = [];
  let previous = -1;
  for (const [shot, frames] of featuring) frames.forEach((frame, i) => {
    const held = shot.source.segments.filter(segment => segment.frameIndex === frame && segment.kind !== 'open');
    if (!held.length) return;
    const at = (segment: Segment) => shot.start + segment.start - shot.from, last = held.at(-1)!;
    const from = Math.max(shot.start, at(held[0])), to = Math.min(shot.start + shot.duration, at(last) + last.duration);
    const previousSlate = slates.at(-1), titles = rolls[shot.roll].titles;
    const same = previousSlate && previousSlate.roll === shot.roll && (previousSlate.frame === frame || (titles[frame] && titles[previousSlate.frame] === titles[frame]));
    if (previousSlate && same && from - previous < 1e-6) previousSlate.end = to - .15;
    else if (previousSlate && i > 0 && from - previous < 1e-6) {
      // Within a shot the slates change over halfway through the move.
      const handover = from + (held[0].kind === 'frame' ? 0 : held[0].duration / 2);
      previousSlate.end = handover - .05;
      slates.push({ start: handover + .05, end: to - .15, roll: shot.roll, frame });
    } else slates.push({ start: from + .4, end: to - .15, roll: shot.roll, frame });
    previous = to;
  });
  // Each format is named above its rolls in turn, smallest first, as the camera rises.
  const formatLabels: FormatLabel[] = formats.map((format, index) => ({ title: format.title, detail: format.detail,
    position: [format.x, TABLE_SURFACE_Y + .004, TABLE_CENTER_Z - format.top - mm(5)], width: format.width,
    start: formatsShot.start + .8 + index * .65, end: formatsShot.start + formatsShot.duration - .15 }));
  const glide = cabinetShot.start;
  // Labels sit on the shelf's front edge, below each camera, while it is in view.
  const exhibits: Exhibit[] = CAMERAS.map((camera, index) => ({ name: camera.name, year: String(camera.introduced), position: [lip + .02, tier - .015, cameraAt(index)[2]],
    start: glide + .3 + index * .3, end: index === CAMERAS.length - 1 ? end - .25 : glide + 3.6 }));
  // Light leaks cover the cuts; the projector cuts into darkness instead, and
  // the shelf continues the new roll's move.
  const flashes = [room.start, newRollShot.start, formatsShot.start, halfShot.start, loupeShot.start, mediumShot.start, sixByNineShot.start, printsShot.start, cabinetShot.start];

  const sample = (requested: number): ShowreelSample => {
    const t = Math.max(0, Math.min(duration, Number.isFinite(requested) ? requested : 0));
    let index = 0;
    while (index + 1 < shots.length && shots[index + 1].start <= t) index++;
    const shot = shots[index], local = shot.from + (t - shot.start);
    const base = shot.source.sample(local);
    const offset = shot.shift ? rolls[shot.roll].offset : null;
    return {
      ...base, time: t, segment: index * 1000 + base.segment,
      camera: offset ? placed(shot.roll, base.camera) : base.camera,
      matte: offset && base.matte ? { ...base.matte, x: base.matte.x + offset.x, z: base.matte.z - offset.y } : base.matte,
      // Each reel's own title and end cards are replaced by the showreel's titles.
      card: base.card?.kind === 'countdown' ? base.card : null,
      dissolve: base.dissolve ? { key: index * 1000 + base.dissolve.key, from: shot.start + base.dissolve.from - shot.from, amount: base.dissolve.amount } : null,
      look: shot.source.look, roll: shot.roll, shot: shot.name, loupe: shot.loupe?.(local - shot.from) ?? null,
    };
  };
  return {
    reel: 'darkroom', pace: 'normal', aspect, reducedMotion: false, frameCount: 1, look: DEFAULT_LOOK,
    duration, segments: [], cards: [], fades: [], beats: [], revealMode: null, sample, frameStart: () => 0,
    shots, captions, slates, exhibits, formats: formatLabels, moments, flashes, rolls, cue: room.start, editorRoll: role.tracking,
  };
}

/** A single held pose, for framing shots during development (`/showreel?look=ex,ey,ez,tx,ty,tz,fov`). */
export function createLookTimeline(rolls: readonly ShowreelRoll[], values: number[], roll = -1): ShowreelTimeline {
  const [ex, ey, ez, tx, ty, tz, fov = 50] = values;
  const pose = lookAtPose([ex, ey, ez], [tx, ty, tz], fov);
  const source = custom(pose, b => b.step('tour', 'frame', 0, 60, { camera: pose }), { aperture: 0 });
  const timeline = createShowreelTimeline(rolls);
  const shot: Shot = { name: 'look', start: 0, duration: 60, roll, source, from: 0, shift: false };
  return { ...timeline, duration: 60, shots: [shot], captions: [], slates: [], exhibits: [], formats: [], moments: [], flashes: [], cue: 0,
    sample: time => ({ ...source.sample(time), look: source.look, roll, shot: 'look', loupe: null }) };
}
