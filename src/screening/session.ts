import { useSyncExternalStore } from 'react';
import type { RollDefinition } from '../utils/rollLayout';
import { createScreeningTimeline, type ReelOptions } from './reels';
import type { Pace, ReelId, ScreeningSample, ScreeningTimeline } from './timeline';

export const EXPORT_FORMATS = {
  '16:9': { width: 1280, height: 720, label: 'Landscape 16:9' },
  '9:16': { width: 720, height: 1280, label: 'Portrait 9:16' },
  '1:1': { width: 720, height: 720, label: 'Square 1:1' },
} as const;
export type ExportFormat = keyof typeof EXPORT_FORMATS;
export const isExportFormat = (value: unknown): value is ExportFormat => typeof value === 'string' && Object.hasOwn(EXPORT_FORMATS, value);

/** Reel and pace, and each reel's own settings (kept when switching reels). */
export interface ScreeningChoice { reel: ReelId; pace: Pace; tuning: Partial<Record<ReelId, readonly number[]>> }
/** Text drawn into the rendered frames. Never filenames, IDs or storage references. */
export interface ScreeningCredits { title: string; stock: string; format: string; frames: number }

/** Renders timeline states at an exact size, owned by the scene while screening. */
export interface ScreeningEngine {
  begin(width: number, height: number): Promise<void>;
  prepare(time: number, signal: AbortSignal): Promise<void>;
  render(time: number): HTMLCanvasElement;
  end(): void;
}

export interface ScreeningSnapshot { time: number; playing: boolean; frameIndex: number; focusFrame: number; exporting: boolean; duration: number }

/**
 * One screening of the current roll. It never changes viewer state: the scene
 * reads its samples as render overrides, so exiting restores the table exactly.
 */
export class ScreeningSession {
  timeline: ScreeningTimeline;
  time = 0;
  playing = true;
  exporting = false;
  /** Held at its current moment while the scene prepares (shader compilation). */
  holding = false;
  sample: ScreeningSample;
  /** Frame whose texture loads first; ahead of the camera so it is ready on arrival. */
  focusFrame = 0;
  overlay: HTMLCanvasElement | null = null;
  engine: ScreeningEngine | null = null;
  textureReady: (index: number) => boolean = () => true;
  private listeners = new Set<() => void>();
  private snapshot: ScreeningSnapshot;

  constructor(readonly roll: RollDefinition, readonly choice: ScreeningChoice, readonly options: Omit<ReelOptions, 'reel' | 'pace' | 'aspect' | 'tuning'>, readonly credits: ScreeningCredits, aspect: number) {
    this.timeline = this.build(aspect);
    this.sample = this.timeline.sample(0);
    this.snapshot = this.read();
  }
  build(aspect: number) { return createScreeningTimeline(this.roll, { ...this.options, reel: this.choice.reel, pace: this.choice.pace, tuning: this.choice.tuning[this.choice.reel], aspect }); }
  setAspect(aspect: number) {
    if (!(aspect > 0) || Math.abs(aspect - this.timeline.aspect) < .001) return;
    // Durations do not depend on aspect, so the current moment is preserved.
    this.timeline = this.build(aspect); this.seek(this.time);
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  private read(): ScreeningSnapshot {
    return { time: Math.round(this.time * 10) / 10, playing: this.playing, frameIndex: this.sample.frameIndex, focusFrame: this.focusFrame, exporting: this.exporting, duration: this.timeline.duration };
  }
  emit() {
    const next = this.read(), prev = this.snapshot;
    if (Object.keys(next).some(key => next[key as keyof ScreeningSnapshot] !== prev[key as keyof ScreeningSnapshot])) { this.snapshot = next; this.listeners.forEach(listener => listener()); }
  }
  seek(time: number) {
    this.time = Math.max(0, Math.min(this.timeline.duration, time));
    this.sample = this.timeline.sample(this.time);
    this.focusFrame = this.timeline.sample(this.time + 1.2).frameIndex;
    this.emit();
  }
  tick(delta: number) {
    if (!this.playing || this.exporting || this.holding) return;
    this.seek(this.time + Math.min(.1, Math.max(0, delta)));
    if (this.time >= this.timeline.duration) { this.playing = false; this.emit(); }
  }
  play() { if (this.time >= this.timeline.duration) this.seek(0); this.playing = true; this.emit(); }
  pause() { this.playing = false; this.emit(); }
  toggle() { if (this.playing) this.pause(); else this.play(); }
  step(direction: -1 | 1) {
    // From the establishing shot, Next goes to the first frame.
    if (direction > 0 && this.sample.act === 'establish') { this.seek(this.timeline.frameStart(0)); return; }
    const current = this.sample.frameIndex, start = this.timeline.frameStart(current);
    // Previous restarts the current frame first, like a media player.
    const target = direction < 0 && this.time - start > 1 ? current : current + direction;
    if (target >= this.timeline.frameCount) this.seek(this.timeline.segments.find(s => s.act === 'return')?.start ?? this.timeline.duration);
    else this.seek(target < 0 ? 0 : this.timeline.frameStart(target));
  }
  setExporting(exporting: boolean) { this.exporting = exporting; if (exporting) this.playing = false; this.emit(); }
}

export function useScreeningSnapshot(session: ScreeningSession) {
  return useSyncExternalStore(session.subscribe, session.getSnapshot);
}
