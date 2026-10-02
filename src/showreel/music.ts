import type { ShowreelTrack } from './settings';

// The soundtrack is placed so the track's beat drop lands on the showreel's
// cue (its first cut), with a short fade in and a fade out to the last frame.
// If the track's cue is earlier than the opening, start from its beginning.
// Preview and export share the placement and the volume envelope.

const FADE_IN = .35, FADE_OUT = 3.2;
export const SOUNDTRACK_RATE = 48000;

/** Seconds into the track at timeline time 0; never insert opening silence. */
export const trackOffset = (track: ShowreelTrack, cue: number) => Math.max(0, track.drop - cue);

/** The volume envelope at timeline time `time`. */
export function soundtrackGain(time: number, duration: number, volume: number) {
  const smooth = (u: number) => { const v = Math.max(0, Math.min(1, u)); return v * v * (3 - 2 * v); };
  return volume * smooth(time / FADE_IN) * smooth((duration - time) / FADE_OUT);
}
function envelope(from: number, duration: number, volume: number) {
  const points = Math.max(2, Math.ceil((duration - from) * 40));
  return Float32Array.from({ length: points }, (_, i) => soundtrackGain(from + (duration - from) * i / (points - 1), duration, volume));
}

async function decode(context: BaseAudioContext, track: ShowreelTrack) {
  const response = await fetch(track.src);
  if (!response.ok) throw new Error(`The soundtrack could not be loaded (${response.status}).`);
  return context.decodeAudioData(await response.arrayBuffer());
}

/** The soundtrack for export, rendered to the film's exact length. */
export async function renderSoundtrack(track: ShowreelTrack, cue: number, duration: number, volume: number, loop = false) {
  const context = new OfflineAudioContext(2, Math.ceil(duration * SOUNDTRACK_RATE), SOUNDTRACK_RATE);
  const source = context.createBufferSource(), gain = context.createGain();
  source.buffer = await decode(context, track);
  source.loop = loop;
  gain.gain.setValueCurveAtTime(envelope(0, duration, volume), 0, duration);
  source.connect(gain).connect(context.destination);
  const offset = trackOffset(track, cue);
  source.start(Math.max(0, -offset), loop ? Math.max(0, offset) % source.buffer.duration : Math.max(0, offset));
  return context.startRendering();
}

/**
 * Live playback. While it plays, its clock drives the showreel's timeline, so
 * picture and music stay together even when frames are slow.
 */
export class SoundtrackPlayer {
  private context: AudioContext | null = null;
  private buffers = new Map<string, Promise<AudioBuffer>>();
  private source: AudioBufferSourceNode | null = null;
  private origin = 0;
  /** Increments on every start and stop, so a superseded start never plays. */
  private generation = 0;
  private starting = false;
  /** Playing or about to. */
  get active() { return this.starting || !!this.source; }

  private audio() { return this.context ??= new AudioContext({ latencyHint: 'playback', sampleRate: SOUNDTRACK_RATE }); }
  /** Unlock audio during a user gesture, before the scene finishes preparing. */
  unlock() { return this.audio().resume(); }
  /** Decode ahead of playback. */
  load(track: ShowreelTrack) {
    if (!this.buffers.has(track.id)) {
      const pending = decode(this.audio(), track);
      pending.catch(() => this.buffers.delete(track.id));
      this.buffers.set(track.id, pending);
    }
    return this.buffers.get(track.id)!;
  }
  /** Start at timeline `time`. Call from a user gesture the first time (autoplay rules). */
  async play(track: ShowreelTrack, time: number, cue: number, duration: number, volume: number, loop = false) {
    this.stop();
    const generation = this.generation, context = this.audio();
    this.starting = true;
    try {
      const resumed = context.resume();
      const buffer = await this.load(track);
      await resumed;
      if (generation !== this.generation || time >= duration) return;
      this.begin(buffer, time, trackOffset(track, cue), duration - time, envelope(time, duration, volume), loop);
    } finally { if (generation === this.generation) this.starting = false; }
  }

  /** A short listen from just before the beat drop, for choosing a track. */
  async audition(track: ShowreelTrack, volume: number) {
    this.stop();
    const generation = this.generation, context = this.audio();
    this.starting = true;
    try {
      const resumed = context.resume();
      const buffer = await this.load(track);
      await resumed;
      if (generation !== this.generation) return;
      const length = 12, curve = Float32Array.from({ length: 200 }, (_, i) => volume * Math.min(1, i / 8, (199 - i) / 30));
      this.begin(buffer, 0, Math.max(0, track.drop - 4), length, curve);
    } finally { if (generation === this.generation) this.starting = false; }
  }

  private begin(buffer: AudioBuffer, time: number, offset: number, length: number, curve: Float32Array, loop = false) {
    const context = this.context!;
    const source = context.createBufferSource(), gain = context.createGain(), start = context.currentTime + .03;
    source.buffer = buffer;
    source.loop = loop;
    gain.gain.setValueCurveAtTime(curve, start, length);
    source.connect(gain).connect(context.destination);
    const at = offset + time;
    // Before the track begins, wait for it; otherwise start partway through.
    source.start(start + Math.max(0, -at), loop ? Math.max(0, at) % buffer.duration : Math.max(0, at));
    source.stop(start + length);
    source.onended = () => { if (this.source === source) { this.source = null; this.onEnded?.(); } };
    this.source = source;
    this.origin = start - time + (context.outputLatency || context.baseLatency || 0);
  }
  /** Called when playback or an audition reaches its end by itself. */
  onEnded: (() => void) | null = null;
  stop() {
    this.generation++; this.starting = false;
    if (!this.source) return;
    const source = this.source; this.source = null;
    try { source.stop(); } catch { /* Already ended. */ }
    source.disconnect();
  }
  private lastClock = { audio: -1, wall: 0 };
  /**
   * Timeline time by the audio clock while it actually advances, otherwise
   * null: suspended by autoplay rules, or a stalled or missing output device
   * (a context can report "running" with its clock stopped). The picture then
   * keeps its own time instead of freezing.
   */
  now() {
    const context = this.context;
    if (!this.source || context?.state !== 'running') return null;
    const audio = context.currentTime, wall = performance.now();
    if (audio !== this.lastClock.audio) this.lastClock = { audio, wall };
    else if (wall - this.lastClock.wall > 250) return null;
    return audio - this.origin;
  }
  dispose() { this.stop(); void this.context?.close(); this.context = null; }
}
