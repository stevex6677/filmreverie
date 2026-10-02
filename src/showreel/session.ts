import { ScreeningSession } from '../screening/session';
import { drawShowreelOverlay, loadShowreelPhotos } from './overlay';
import { createLookTimeline, createShowreelTimeline, type ShowreelSample, type ShowreelTimeline } from './timeline';
import type { ShowreelRoll } from './rolls';
import { loadSettings, type ShowreelSettings } from './settings';

/**
 * A screening session whose timeline is the showreel. It plays through the
 * same director as roll screenings, so frame-stepped export works unchanged.
 * `look` holds one camera pose instead, for framing shots during development.
 */
export function createShowreelSession(rolls: readonly ShowreelRoll[], look?: number[]) {
  class ShowreelSession extends ScreeningSession {
    declare timeline: ShowreelTimeline;
    /** Look and soundtrack choices, read by every drawn frame. */
    settings: ShowreelSettings = loadSettings();
    /** While a soundtrack plays, its clock drives the timeline (picture follows the music). */
    clock: (() => number | null) | null = null;
    build(aspect: number) { return look ? createLookTimeline(rolls, look) : createShowreelTimeline(rolls, aspect); }
    tick(delta: number) {
      const now = this.playing && !this.exporting && !this.holding ? this.clock?.() : null;
      if (now === null || now === undefined) { super.tick(delta); return; }
      this.seek(now);
      if (this.time >= this.timeline.duration) { this.playing = false; this.emit(); }
    }
  }
  const session = new ShowreelSession(rolls[0].definition, { reel: 'darkroom', pace: 'normal', tuning: {} }, { stockType: 'negative' },
    { title: 'Film Reverie', stock: '', format: '', frames: 0 }, 16 / 9);
  session.decorate = (ctx, width, height, sample) => drawShowreelOverlay(ctx, width, height, sample as ShowreelSample, session.timeline, session.settings);
  session.steadyQuality = true;
  // Held at the opening until the darkroom has loaded.
  session.pause();
  return session;
}
export type ShowreelSession = ReturnType<typeof createShowreelSession>;

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * A pre-roll before playback: renders moments across the whole film once,
 * through the same engine as export, so every shader compiles and every
 * texture reaches the GPU while the loading screen is up. Otherwise the
 * first sight of the wet side, the loupe or the cameras stalls for seconds.
 */
export async function prerollShowreel(session: ShowreelSession, width: number, height: number, onProgress: (done: number) => void, signal: AbortSignal) {
  // The New roll editor draws photographs into the overlay; they load first.
  await loadShowreelPhotos(session.timeline);
  while ((!session.engine || session.holding) && !signal.aborted) await pause(50);
  const engine = session.engine;
  if (!engine || signal.aborted) return;
  const { shots, duration } = session.timeline;
  const times = [...new Set([
    ...shots.flatMap(shot => [shot.start + .05, shot.start + shot.duration / 2, shot.start + shot.duration - .05]),
    ...Array.from({ length: Math.floor(duration / .5) + 1 }, (_, i) => i * .5),
  ].map(time => Math.round(time * 100) / 100))].sort((a, b) => a - b);
  await engine.begin(width, height);
  try {
    for (const [index, time] of times.entries()) {
      if (signal.aborted) break;
      await engine.prepare(time, signal);
      engine.render(time);
      onProgress((index + 1) / times.length);
      // Let the browser finish the frame's GPU work before the next.
      await pause(0);
    }
  } finally { engine.end(); }
}
