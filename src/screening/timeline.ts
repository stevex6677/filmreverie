import { createRollLayout, type RollDefinition } from '../utils/rollLayout';
import { getFrameBounds, getStripDimensions } from '../utils/loupeMapping';
import { TABLE_CENTER_Z } from '../utils/cameraBounds';

// A screening is a pure function of (roll, reel, aspect, pace, t). The same
// timeline drives live preview and frame-stepped export, and is tested without
// WebGL. Segments keep explicit timing so a later soundtrack can align to beats.

export const REEL_IDS = ['loupe-walk', 'develop', 'projector'] as const;
export type ReelId = typeof REEL_IDS[number];
export const PACES = ['relaxed', 'normal', 'brisk'] as const;
export type Pace = typeof PACES[number];
export const PACE_SCALE: Record<Pace, number> = { relaxed: 1.3, normal: 1, brisk: .72 };
export type Act = 'establish' | 'tour' | 'break' | 'return';
export type SegmentKind = 'open' | 'lift' | 'glide' | 'frame' | 'descend' | 'detail' | 'rise' | 'push' | 'develop' | 'advance'
  | 'pull-back' | 'overview' | 'push-in' | 'set-down' | 'close';

export interface CameraPose { zoom: number; pan: { x: number; z: number }; tilt: number; yaw: number }
export interface LoupePose { x: number; y: number; lift: number; magnification: number }
export type Ease = 'linear' | 'inOut' | 'out' | 'snap' | 'heavy';
export interface Reveal { mode: 'polarity' | 'backlight'; position: number }

export interface Segment {
  act: Act; kind: SegmentKind; start: number; duration: number; frameIndex: number;
  camera: [CameraPose, CameraPose]; loupe: [LoupePose, LoupePose] | null;
  /** Height of the loupe's arc above the film while it travels. */
  arc: number;
  light: { from: number; to: number; flicker?: 'on' | 'gate' };
  reveal: [number, number] | null;
  blur: number; gate: number; ease: Ease;
  /** Reduced motion: hold, dip through dark, then hold at the destination. */
  cut: boolean;
}
export interface CardSpan { kind: 'title' | 'end'; start: number; end: number; fade: number }
export interface FadeKey { time: number; value: number }

export interface ScreeningSample {
  time: number; act: Act; kind: SegmentKind; segment: number; frameIndex: number;
  camera: CameraPose; loupe: LoupePose | null; light: number;
  reveal: Reveal | null; card: { kind: 'title' | 'end'; opacity: number } | null;
  fade: number; blur: number; gate: number;
}

export interface ScreeningTimeline {
  reel: ReelId; pace: Pace; aspect: number; reducedMotion: boolean; frameCount: number;
  duration: number; segments: readonly Segment[]; cards: readonly CardSpan[]; fades: readonly FadeKey[];
  /** Frame-change times. A future soundtrack aligns these to its beat grid. */
  beats: readonly number[];
  revealMode: Reveal['mode'] | null;
  sample(time: number): ScreeningSample;
  /** Start of the segment that brings frame `index` into view. */
  frameStart(index: number): number;
}

export const EASE: Record<Ease, (u: number) => number> = {
  linear: u => u,
  inOut: u => u * u * u * (u * (6 * u - 15) + 10),
  out: u => 1 - Math.pow(1 - u, 3),
  snap: u => u < .5 ? 16 * u ** 5 : 1 - Math.pow(-2 * u + 2, 5) / 2,
  // A heavier medium-format advance: it overruns by a hair, then settles.
  heavy: u => { const c = 1.2, v = u - 1; return 1 + (c + 1) * v ** 3 + c * v ** 2; },
};

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
export function lerpCamera(a: CameraPose, b: CameraPose, u: number): CameraPose {
  if (u <= 0) return a;
  if (u >= 1) return b;
  // Geometric distance keeps perceived zoom speed constant between a frame and the roll.
  return { zoom: Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), u)), pan: { x: lerp(a.pan.x, b.pan.x, u), z: lerp(a.pan.z, b.pan.z, u) }, tilt: lerp(a.tilt, b.tilt, u), yaw: lerp(a.yaw, b.yaw, u) };
}
function lerpLoupe(a: LoupePose, b: LoupePose, u: number, arc: number, raw: number): LoupePose {
  return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), lift: lerp(a.lift, b.lift, u) + arc * Math.sin(Math.PI * Math.min(1, Math.max(0, raw))), magnification: lerp(a.magnification, b.magnification, u) };
}
const samePose = (a: CameraPose, b: CameraPose) => a.zoom === b.zoom && a.pan.x === b.pan.x && a.pan.z === b.pan.z && a.tilt === b.tilt && a.yaw === b.yaw;
const sameLoupe = (a: LoupePose | null, b: LoupePose | null) => a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.lift === b.lift);

/** Deterministic flicker in [0, 1], stepped like a mains-driven lamp or shutter. */
export function flicker(time: number, rate = 24) {
  const n = Math.floor(time * rate);
  const hash = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return hash - Math.floor(hash);
}
function lightAt(light: Segment['light'], u: number, time: number, local: number) {
  const base = lerp(light.from, light.to, u);
  if (light.flicker === 'gate') return base * (1 - .045 * flicker(time));
  if (light.flicker === 'on') {
    // A cold tube strikes twice, drops out, then holds.
    const steps = [0, .55, .05, .8, .25, 1];
    const index = Math.min(steps.length - 1, Math.floor(local * steps.length));
    return base * steps[index];
  }
  return base;
}

export class TimelineBuilder {
  time = 0;
  segments: Segment[] = [];
  cards: CardSpan[] = [];
  fades: FadeKey[] = [{ time: 0, value: 1 }];
  beats: number[] = [];
  light = 1;
  reveal: number | null = null;
  constructor(public camera: CameraPose, public loupe: LoupePose | null, private scale: number, private reduced: boolean) {}
  seconds(value: number) { return value * this.scale; }
  step(act: Act, kind: SegmentKind, frameIndex: number, seconds: number, to: {
    camera?: CameraPose; loupe?: LoupePose | null; arc?: number; light?: number; flicker?: 'on' | 'gate';
    reveal?: number; blur?: number; gate?: number; ease?: Ease; beat?: boolean; drift?: boolean;
  } = {}) {
    let camera = to.camera ?? this.camera;
    const loupe = to.loupe === undefined ? this.loupe : to.loupe;
    // Reduced motion removes the gentle drift of holds entirely.
    if (this.reduced && to.drift) camera = this.camera;
    const travels = !samePose(this.camera, camera) || !sameLoupe(this.loupe, loupe);
    const cut = this.reduced && travels && !to.drift;
    let duration = this.seconds(seconds);
    if (cut) duration = Math.max(duration, this.seconds(1.1));
    const light = this.reduced && to.flicker === 'on' ? { from: this.light, to: to.light ?? this.light }
      : { from: this.light, to: to.light ?? this.light, flicker: this.reduced ? undefined : to.flicker };
    const reveal = to.reveal === undefined ? (this.reveal === null ? null : [this.reveal, this.reveal] as [number, number]) : [this.reveal ?? to.reveal, to.reveal] as [number, number];
    if (to.beat) this.beats.push(this.time);
    this.segments.push({ act, kind, start: this.time, duration, frameIndex, camera: [this.camera, camera],
      loupe: this.loupe && loupe ? [this.loupe, loupe] : loupe ? [loupe, loupe] : null,
      arc: this.reduced ? 0 : to.arc ?? 0, light, reveal, blur: this.reduced ? 0 : to.blur ?? 0, gate: to.gate ?? 0,
      ease: to.ease ?? 'inOut', cut });
    this.time += duration; this.camera = camera; this.loupe = loupe;
    this.light = to.light ?? this.light;
    if (to.reveal !== undefined) this.reveal = to.reveal;
  }
  card(kind: CardSpan['kind'], start: number, end: number) { this.cards.push({ kind, start, end, fade: Math.min(this.seconds(.6), (end - start) / 3) }); }
  fade(time: number, value: number) { this.fades.push({ time, value }); }
}

export function finishTimeline(builder: TimelineBuilder, info: { reel: ReelId; pace: Pace; aspect: number; reducedMotion: boolean; frameCount: number; revealMode: Reveal['mode'] | null }): ScreeningTimeline {
  const segments = builder.segments, cards = builder.cards, duration = builder.time;
  const fades = [...builder.fades].sort((a, b) => a.time - b.time);
  const starts = new Map<number, number>();
  for (const segment of segments) if (segment.act !== 'establish' && !starts.has(segment.frameIndex)) starts.set(segment.frameIndex, segment.start);
  const sample = (requested: number): ScreeningSample => {
    const time = Math.max(0, Math.min(duration, Number.isFinite(requested) ? requested : 0));
    let low = 0, high = segments.length - 1;
    while (low < high) { const mid = (low + high + 1) >> 1; if (segments[mid].start <= time) low = mid; else high = mid - 1; }
    const index = low, segment = segments[index];
    const local = segment.duration > 0 ? Math.min(1, (time - segment.start) / segment.duration) : 1;
    const eased = segment.cut ? (local < .5 ? 0 : 1) : EASE[segment.ease](local);
    const camera = lerpCamera(segment.camera[0], segment.camera[1], eased);
    const loupe = segment.loupe ? lerpLoupe(segment.loupe[0], segment.loupe[1], eased, segment.arc, local) : null;
    const position = segment.reveal ? lerp(segment.reveal[0], segment.reveal[1], segment.kind === 'develop' ? local : eased) : null;
    let fade = 0;
    for (let i = 0; i < fades.length; i++) {
      const next = fades[i + 1];
      if (!next || time < next.time) { fade = next ? lerp(fades[i].value, next.value, (time - fades[i].time) / Math.max(1e-6, next.time - fades[i].time)) : fades[i].value; break; }
    }
    if (segment.cut) fade = Math.max(fade, 1 - Math.abs(2 * local - 1));
    const card = cards.find(span => time >= span.start && time <= span.end);
    return {
      time, act: segment.act, kind: segment.kind, segment: index, frameIndex: segment.frameIndex,
      camera, loupe, light: Math.max(0, lightAt(segment.light, eased, time, local)),
      reveal: position === null || !info.revealMode ? null : { mode: info.revealMode, position },
      card: card ? { kind: card.kind, opacity: Math.min(1, (time - card.start) / card.fade, (card.end - time) / card.fade) } : null,
      fade: Math.max(0, Math.min(1, fade)), blur: segment.blur * Math.sin(Math.PI * local), gate: segment.gate,
    };
  };
  return { ...info, duration, segments, cards, fades, beats: builder.beats, sample,
    frameStart: index => starts.get(Math.max(0, Math.min(info.frameCount - 1, index))) ?? 0 };
}

// Framing uses the requested output aspect, never the live viewport.
export const tablePan = (x: number, y: number) => ({ x, z: TABLE_CENTER_Z - y });

/** Strip-local x (in the strip's unscaled layout units) of a develop band at roll position p. */
export function revealEdge(roll: RollDefinition, stripIndex: number, position: number) {
  const strip = createRollLayout(roll)[stripIndex];
  if (!strip) return -1e3;
  const count = strip.frames.length, local = position - strip.offset;
  if (local <= 0) return -1e3;
  if (local >= count) return 1e3;
  const k = Math.floor(local), frac = local - k, half = strip.layout.gap / 2, width = getStripDimensions(strip.layout).width;
  const bounds = getFrameBounds(k, strip.layout);
  const start = k === 0 ? -width / 2 : bounds.minX - half, end = k === count - 1 ? width / 2 : bounds.maxX + half;
  return lerp(start, end, frac);
}
