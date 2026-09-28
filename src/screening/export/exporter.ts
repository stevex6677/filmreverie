import { Mp4Writer } from './mp4';
import { EXPORT_FORMATS, type ExportFormat, type ScreeningSession } from '../session';

export const EXPORT_FPS = 30;
export class ExportUnsupportedError extends Error {}

/** Conservative H.264 settings; the first configuration the device accepts wins. */
export async function findEncoderConfig(width: number, height: number): Promise<VideoEncoderConfig | null> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return null;
  const base = { width, height, framerate: EXPORT_FPS, bitrate: width * height >= 1280 * 720 ? 5_000_000 : 3_500_000, avc: { format: 'avc' as const }, latencyMode: 'quality' as const };
  for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42001f', 'avc1.42002a']) {
    try {
      const result = await VideoEncoder.isConfigSupported({ ...base, codec });
      if (result.supported) return { ...base, ...result.config, codec };
    } catch { /* Try the next profile. */ }
  }
  return null;
}

export interface ExportProgress { frame: number; total: number; elapsed: number; remaining: number | null; paused: boolean; preview: HTMLCanvasElement | null }

const visible = (signal: AbortSignal) => new Promise<void>(resolve => {
  if (document.visibilityState !== 'hidden' || signal.aborted) return resolve();
  const done = () => { if (document.visibilityState !== 'hidden' || signal.aborted) { document.removeEventListener('visibilitychange', done); signal.removeEventListener('abort', done); resolve(); } };
  document.addEventListener('visibilitychange', done); signal.addEventListener('abort', done);
});
const pause = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
const abortError = () => new DOMException('Export cancelled.', 'AbortError');

/**
 * Frame-stepped export: for each video frame n, render the timeline at n/30 s
 * at the exact output size and encode it. Slow devices take longer, but the
 * video is always smooth. Rendering pauses while the page is hidden.
 */
export async function exportScreening(session: ScreeningSession, format: ExportFormat, { signal, onProgress, maxSeconds }: { signal: AbortSignal; onProgress: (progress: ExportProgress) => void; maxSeconds?: number }): Promise<Blob> {
  const { width, height } = EXPORT_FORMATS[format];
  const config = await findEncoderConfig(width, height);
  if (!config) throw new ExportUnsupportedError('This browser cannot encode H.264 video.');
  const engine = session.engine;
  if (!engine) throw new Error('The light table is not ready to render.');
  const writer = new Mp4Writer(width, height);
  let failure: unknown = null;
  const encoder = new VideoEncoder({ output: (chunk, metadata) => { try { writer.add(chunk, metadata); } catch (error) { failure = error; } }, error: error => { failure = error; } });
  encoder.configure(config);
  try {
    await engine.begin(width, height);
    const duration = Math.min(session.timeline.duration, maxSeconds ?? Infinity);
    const total = Math.max(1, Math.round(duration * EXPORT_FPS));
    let active = 0, last = performance.now();
    for (let frame = 0; frame < total; frame++) {
      if (signal.aborted) throw abortError();
      if (document.visibilityState === 'hidden') {
        onProgress({ frame, total, elapsed: active, remaining: null, paused: true, preview: null });
        await visible(signal); last = performance.now();
        if (signal.aborted) throw abortError();
      }
      if (failure) throw failure;
      const time = frame / EXPORT_FPS;
      await engine.prepare(time, signal);
      const canvas = engine.render(time);
      const video = new VideoFrame(canvas, { timestamp: Math.round(frame * 1e6 / EXPORT_FPS), duration: Math.round(1e6 / EXPORT_FPS) });
      try { encoder.encode(video, { keyFrame: frame % (2 * EXPORT_FPS) === 0 }); } finally { video.close(); }
      while (encoder.encodeQueueSize > 3 && !failure) await pause(4);
      const now = performance.now(); active += now - last; last = now;
      onProgress({ frame: frame + 1, total, elapsed: active, remaining: active / (frame + 1) * (total - frame - 1), paused: false, preview: canvas });
      // Yield so progress paints and Cancel remains responsive.
      await pause();
    }
    await encoder.flush();
    if (failure) throw failure;
    return writer.finish();
  } finally {
    if (encoder.state !== 'closed') encoder.close();
    engine.end();
  }
}
