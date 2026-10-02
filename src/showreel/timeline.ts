import { createScreeningTimeline, framing } from '../screening/reels';
import { DEFAULT_LOOK, finishTimeline, lookAtPose, tablePan, TimelineBuilder, type CameraPose, type ReelId, type ScreeningLook, type ScreeningSample, type ScreeningTimeline } from '../screening/timeline';
import { fitRollView, locateFrame } from '../utils/rollLayout';
import { CAMERA_SHELF_MM, CAMERA_SHELF_ORIGIN, cameraShelfSlot, mm, SHELF_CELL_MM, SHELF_ORIGIN } from '../data/physicalScale';
import { getFilmStock } from '../data/filmStocks';
import { CAMERAS } from '../data/cameras';
import type { ShowreelRoll } from './rolls';

/**
 * The showreel is a pure function of time, like a screening: a sequence of
 * shots, each an excerpt of a reel or a custom camera move, plus the text and
 * light effects drawn over them. The same timeline drives the live page and
 * frame-stepped export (ScreeningDirector's engine).
 */
export interface ShowreelSample extends ScreeningSample {
  roll: number; shot: string;
  /** The loupe's place on the table (table-local, like the viewer's loupe), when it is in use. */
  loupe: { x: number; y: number } | null;
}

export interface Shot { name: string; start: number; duration: number; roll: number; source: ScreeningTimeline; from: number; loupe?: (local: number) => { x: number; y: number } }

/** Lower-left chapter caption. */
export interface Caption { start: number; end: number; chapter?: string; title: string; line?: string; top?: boolean }
/** Slate in the lower right naming the roll on the table. */
export interface Slate { start: number; end: number; roll: number }
/** A camera in the cabinet, labelled while it is in view. */
export interface Exhibit { start: number; end: number; name: string; year: string; position: [number, number, number] }
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
  moments: readonly Moment[];
  /** Light-leak flashes at cuts, by their peak time. */
  flashes: readonly number[];
  /** The first cut, after the title; a soundtrack's beat drop lands here. */
  cue: number;
  rolls: readonly ShowreelRoll[];
}

export const SHOWREEL_SITE = 'filmreverie.app';
export const SHOWREEL_GITHUB = 'github.com/stevex6677/filmreverie';
/** Length of the New roll shot; the overlay's editor animation is timed within it. */
export const NEW_ROLL_SECONDS = 6.8;

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

export function createShowreelTimeline(rolls: readonly ShowreelRoll[], requestedAspect = 16 / 9): ShowreelTimeline {
  const aspect = Number.isFinite(requestedAspect) && requestedAspect > 0 ? requestedAspect : 16 / 9;
  const [coast, peaks] = rolls;
  const reel = (roll: number, id: ReelId, pace: 'relaxed' | 'normal' | 'brisk' = 'normal', tuning?: number[]) =>
    createScreeningTimeline(rolls[roll].definition, { reel: id, pace, aspect, tuning, stockType: getFilmStock(rolls[roll].stockId).type });

  const shots: Shot[] = [];
  let time = 0;
  const add = (name: string, roll: number, source: ScreeningTimeline, from = 0, to = source.duration, loupe?: Shot['loupe']) => {
    shots.push({ name, start: time, duration: to - from, roll, source, from, loupe });
    time += to - from;
    return shots[shots.length - 1];
  };

  // 1. Hook and title: the table switches on under the first strip, a band of
  // light develops three negatives, then the camera rises over the room.
  const frame = (index: number) => locateFrame(coast.definition, index);
  const frameZoom = fitRollView(coast.definition, 'frame', 0, aspect).zoom;
  const low = (index: number, zoom = 1.5, yaw = -16): CameraPose => ({ zoom: frameZoom * zoom, pan: tablePan(frame(index).x, frame(index).y), tilt: degrees(58), yaw: degrees(yaw) });
  const wide = lookAtPose([.35, .95, 3.2], [0, -.35, -.5], 50);
  const hook = custom(low(0, 1.65, -24), b => {
    b.light = 0; b.reveal = 0; b.ambient = 1;
    b.step('establish', 'open', 0, 1.1, { camera: low(0, 1.55, -22), ease: 'linear' });
    // A fluorescent start: a stutter, then full light.
    b.step('establish', 'open', 0, .07, { light: .8, ambient: 0, ease: 'linear' });
    b.step('establish', 'open', 0, .09, { light: .12, ease: 'linear' });
    b.step('establish', 'open', 0, .1, { light: 1, ease: 'linear' });
    b.step('establish', 'open', 0, .35, { camera: low(0, 1.5, -20), ease: 'linear' });
    b.step('tour', 'develop', 0, 2.9, { camera: low(2, 1.45, -10), reveal: 3, ease: 'linear' });
    b.step('tour', 'frame', 2, .45, { camera: low(2, 1.42, -8), ease: 'out' });
    b.step('return', 'pull-back', 2, 2.4, { camera: wide, ease: 'inOut' });
    b.step('return', 'close', 2, 2.2, { camera: { ...wide, zoom: wide.zoom * .95, yaw: wide.yaw + degrees(3.5) }, ease: 'out' });
  }, { aperture: .045, band: .09 }, 'polarity', .5);
  add('hook', 0, hook);
  // The title appears as the camera starts to rise.
  const titleStart = hook.segments.find(segment => segment.kind === 'pull-back')!.start;

  // 2. The darkroom: a slow lateral move past the wet side and drying line.
  const darkroom = custom(lookAtPose([-2.0, .45, 3.6], [-.6, -.15, 6.6], 56), b => {
    b.step('tour', 'glide', 0, 4.0, { camera: lookAtPose([1.3, .4, 3.83], [.75, -.2, 6.6], 56), ease: 'inOut' });
  }, { aperture: .03 });
  const room = add('darkroom', 0, darkroom);

  // 3. A new roll: the editor over the dimmed room while the camera drifts
  // toward the film shelf, so the shelf shot continues the same move.
  const shelfTarget: [number, number, number] = [-.2, SHELF_ORIGIN[1], SHELF_ORIGIN[2]];
  const shelfOpen = lookAtPose([-1.5, .75, 2.1], shelfTarget, 50);
  const newRoll = custom(lookAtPose([-2.3, .9, 2.95], shelfTarget, 52), b => {
    b.step('tour', 'glide', 0, NEW_ROLL_SECONDS, { camera: shelfOpen, ease: 'out' });
  }, { aperture: .03 });
  const newRollShot = add('new-roll', 0, newRoll);

  // 4. The film shelf: across the cabinet, then in on the sample rolls.
  const cell = (slot: number): [number, number, number] => [
    SHELF_ORIGIN[0] + (slot % 4 - 1.5) * mm(SHELF_CELL_MM.width),
    SHELF_ORIGIN[1] + (1.5 - Math.floor(slot / 4)) * mm(SHELF_CELL_MM.height),
    SHELF_ORIGIN[2] + mm(SHELF_CELL_MM.depth) / 2,
  ];
  const [a, c] = [cell(coast.stored.shelfSlot!), cell(peaks.stored.shelfSlot!)];
  const between: [number, number, number] = [(a[0] + c[0]) / 2, a[1] - .02, a[2]];
  const shelf = custom(shelfOpen, b => {
    b.step('tour', 'glide', 0, 1.9, { camera: lookAtPose([-.55, .62, 1.0], [between[0] - .05, between[1] + .05, between[2]], 42), ease: 'inOut' });
    b.step('tour', 'frame', 0, 2.3, { camera: lookAtPose([a[0] + .35, a[1] + .05, a[2] + .95], [a[0] + .2, a[1] - .02, a[2]], 38), ease: 'inOut' });
  }, { aperture: .03 });
  const shelfShot = add('shelf', 0, shelf);

  // 5. The light table: the 35mm roll in a reel excerpt and under the loupe,
  // then the whole medium-format roll before the camera sweeps down onto it.
  const tracking = reel(0, 'tracking', 'brisk', [.45, .35]);
  const trackFrom = tracking.frameStart(2);
  const trackShot = add('tracking', 0, tracking, trackFrom, trackFrom + 4.3);
  // Seen from above, the loupe rides along the rebate's edge printing, then
  // drops onto a busy photograph.
  const [left, right] = [frame(6), frame(7)];
  const loupeView = (x: number, y: number, zoom: number): CameraPose => ({ zoom: frameZoom * zoom, pan: tablePan(x, left.y + y), tilt: degrees(14), yaw: degrees(-4) });
  const loupeSource = custom(loupeView(left.x - .055, .065, 1.8), b => {
    b.step('tour', 'frame', 6, 3.4, { camera: loupeView(right.x - .05, -.005, 1.6), ease: 'inOut' });
  }, { aperture: .03 });
  const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
  const ease = (u: number) => { const v = Math.max(0, Math.min(1, u)); return v * v * (3 - 2 * v); };
  const loupeShot = add('loupe', 0, loupeSource, 0, loupeSource.duration, local => ({
    x: lerp(left.x - .02, right.x - .02, ease(local / 3.4)),
    y: left.y + .057 - .07 * ease((local - 1.6) / 1.2),
  }));
  // Medium format: the whole 6×6 roll from above, then a descending arc onto
  // one photograph that keeps orbiting it, low over the glowing diffuser.
  const medium = framing(peaks.definition, aspect);
  const hero6 = locateFrame(peaks.definition, 1);
  const close6 = medium.frame(1).zoom;
  const around6 = (zoom: number, tilt: number, yaw: number): CameraPose => ({ zoom: close6 * zoom, pan: tablePan(hero6.x, hero6.y), tilt: degrees(tilt), yaw: degrees(yaw) });
  const mediumSource = custom({ ...medium.overview, zoom: medium.overview.zoom * 1.24, tilt: degrees(10), yaw: degrees(-3) }, b => {
    b.step('establish', 'overview', 1, 2.1, { camera: { ...medium.overview, zoom: medium.overview.zoom * 1.14, tilt: degrees(16), yaw: degrees(2) }, ease: 'linear' });
    b.step('tour', 'push-in', 1, 2.3, { camera: around6(1.35, 58, -38), ease: 'inOut' });
    b.step('tour', 'orbit', 1, 2.6, { camera: around6(1.1, 46, 34), ease: 'inOut' });
  }, { aperture: .035 });
  const mediumShot = add('medium', 1, mediumSource);

  // 6. Screenings: more of the photographs, through two more reels.
  // Darkroom Prints: the mountain roll's prints on the darkroom wall, then in on the first.
  const prints = reel(1, 'darkroom-prints', 'normal', [.5, .45]);
  // From the wide view of the wall (the hold before the first push-in).
  const wall = prints.segments.find(segment => segment.kind === 'push-in')!.start - 1.0;
  const printsShot = add('prints', 1, prints, wall, wall + 5.2);
  const projector = reel(1, 'projector', 'normal', [.5, .5]);
  const leader = projector.cards.find(card => card.kind === 'countdown')!;
  const projectorFrom = leader.start + 2.1;
  const projectorShot = add('projector', 1, projector, projectorFrom, projector.frameStart(3) + .65);
  const countdownEnd = projectorShot.start + leader.end - projectorFrom;

  // 7. The camera cabinet: across the five cameras, then in on the last.
  const tier = CAMERA_SHELF_ORIGIN[1] + cameraShelfSlot(0).y + mm(21);
  const lip = CAMERA_SHELF_ORIGIN[0] - mm(CAMERA_SHELF_MM.depth);
  const cameraAt = (index: number): [number, number, number] => {
    const slot = cameraShelfSlot(index);
    return [CAMERA_SHELF_ORIGIN[0] - slot.z, tier + .1, CAMERA_SHELF_ORIGIN[2] + slot.x];
  };
  const along = (z: number, distance: number, fov = 40): CameraPose => lookAtPose([cameraAt(0)[0] - distance, tier + .3, z - .25], [cameraAt(0)[0], tier + .2, z], fov);
  const hero = cameraAt(CAMERAS.length - 1);
  const cabinet = custom(along(cameraAt(0)[2] + .1, 1.55), b => {
    b.step('tour', 'glide', 0, 4.0, { camera: along(hero[2] - .25, 1.45), ease: 'inOut' });
    b.step('tour', 'push-in', 0, 2.0, { camera: lookAtPose([hero[0] - .78, hero[1] + .14, hero[2] - .34], [hero[0], hero[1] + .03, hero[2] + .02], 34), ease: 'inOut' });
    b.step('return', 'pull-back', 0, 3.0, { camera: lookAtPose([hero[0] - 2.2, hero[1] + .4, hero[2] - 1.3], [hero[0] - .1, hero[1] - .05, hero[2] - .7], 46), ease: 'inOut' });
  }, { aperture: .03 });
  const cabinetShot = add('cabinet', 1, cabinet);
  const duration = time;

  // The end card comes up as the camera pulls back from the last camera.
  const end = cabinetShot.start + cabinet.segments.find(segment => segment.kind === 'pull-back')!.start + .3;
  const moments: Moment[] = [
    { kind: 'hook', start: .45, end: titleStart - .1, lines: ['Your photographs.', 'On real film.'] },
    { kind: 'title', start: titleStart + .25, end: room.start - .15 },
    { kind: 'new-roll', start: newRollShot.start, end: newRollShot.start + newRollShot.duration },
    { kind: 'end', start: end, end: duration },
  ];
  const captions: Caption[] = [
    { start: room.start + .35, end: room.start + room.duration - .3, chapter: '01  ·  The darkroom', title: 'Step inside.', line: 'A fully modeled 3D darkroom to explore.' },
    { start: shelfShot.start + .3, end: shelfShot.start + shelfShot.duration - .25, chapter: '03  ·  The film shelf', title: 'Every roll, boxed and shelved.', line: 'Real Kodak and Fujifilm stocks, each with a cover photo.' },
    { start: trackShot.start + .3, end: trackShot.start + trackShot.duration - .2, chapter: '04  ·  The light table', title: 'Lifelike film borders.', line: 'Sprocket holes and edge codes, simulated for a more realistic view.' },
    { start: loupeShot.start + .25, end: loupeShot.start + loupeShot.duration - .2, chapter: '04  ·  The light table', title: 'A loupe for every grain.', line: 'Glide it over the film and magnify up to 10×.' },
    { start: mediumShot.start + .3, end: mediumShot.start + 3.6, chapter: '04  ·  The light table', title: 'Medium format, too.', line: '35mm and 120: 6×4.5, 6×6, 6×7 and 6×9.' },
    { start: printsShot.start + .3, end: printsShot.start + printsShot.duration - .25, chapter: '05  ·  Screenings', title: 'Print every frame.', line: 'Each photograph enlarged onto paper and hung up to dry.' },
    { start: countdownEnd + .25, end: projectorShot.start + projectorShot.duration - .2, chapter: '05  ·  Screenings', title: 'Screen any roll.', line: 'Seven cinematic reels, exported as video.' },
    { start: cabinetShot.start + .4, end: end - .3, chapter: '06  ·  The camera cabinet', title: 'Five classic cameras.', line: 'Modeled in 3D, to turn over in your hands.', top: true },
  ];
  // The roll in view is named in the corner, from the light table to the last screening.
  const slates: Slate[] = [];
  for (const shot of shots.slice(shots.indexOf(trackShot), shots.indexOf(projectorShot) + 1)) {
    const last = slates.at(-1);
    if (last && last.roll === shot.roll && Math.abs(last.end + .15 - shot.start) < 1e-6) last.end = shot.start + shot.duration - .15;
    else slates.push({ start: shot.start + .4, end: shot.start + shot.duration - .15, roll: shot.roll });
  }
  const glide = cabinetShot.start;
  // Labels sit on the shelf's front edge, below each camera, while it is in view.
  const exhibits: Exhibit[] = CAMERAS.map((camera, index) => ({ name: camera.name, year: String(camera.introduced), position: [lip + .02, tier - .015, cameraAt(index)[2]],
    start: glide + .3 + index * .3, end: index === CAMERAS.length - 1 ? end - .25 : glide + 3.8 }));
  // Light leaks cover the cuts; the projector cuts into darkness instead, and
  // the shelf continues the new roll's move.
  const flashes = [room.start, newRollShot.start, trackShot.start, loupeShot.start, mediumShot.start, printsShot.start, cabinetShot.start];

  const sample = (requested: number): ShowreelSample => {
    const t = Math.max(0, Math.min(duration, Number.isFinite(requested) ? requested : 0));
    let index = 0;
    while (index + 1 < shots.length && shots[index + 1].start <= t) index++;
    const shot = shots[index], local = shot.from + (t - shot.start);
    const base = shot.source.sample(local);
    return {
      ...base, time: t, segment: index * 1000 + base.segment,
      // Each reel's own title and end cards are replaced by the showreel's titles.
      card: base.card?.kind === 'countdown' ? base.card : null,
      dissolve: base.dissolve ? { key: index * 1000 + base.dissolve.key, from: shot.start + base.dissolve.from - shot.from, amount: base.dissolve.amount } : null,
      look: shot.source.look, roll: shot.roll, shot: shot.name, loupe: shot.loupe?.(local - shot.from) ?? null,
    };
  };
  return {
    reel: 'darkroom', pace: 'normal', aspect, reducedMotion: false, frameCount: 1, look: DEFAULT_LOOK,
    duration, segments: [], cards: [], fades: [], beats: [], revealMode: null, sample, frameStart: () => 0,
    shots, captions, slates, exhibits, moments, flashes, rolls, cue: room.start,
  };
}

/** A single held pose, for framing shots during development (`/showreel?look=ex,ey,ez,tx,ty,tz,fov`). */
export function createLookTimeline(rolls: readonly ShowreelRoll[], values: number[], roll = 0): ShowreelTimeline {
  const [ex, ey, ez, tx, ty, tz, fov = 50] = values;
  const pose = lookAtPose([ex, ey, ez], [tx, ty, tz], fov);
  const source = custom(pose, b => b.step('tour', 'frame', 0, 60, { camera: pose }), { aperture: 0 });
  const timeline = createShowreelTimeline(rolls);
  const shot: Shot = { name: 'look', start: 0, duration: 60, roll, source, from: 0 };
  return { ...timeline, duration: 60, shots: [shot], captions: [], slates: [], exhibits: [], moments: [], flashes: [], cue: 0,
    sample: time => ({ ...source.sample(time), look: source.look, roll, shot: 'look', loupe: null }) };
}
