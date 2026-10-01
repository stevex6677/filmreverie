import { Mp4Writer, type AudioTrack } from './mp4';
import { EXPORT_FORMATS, type ExportFormat, type ScreeningSession } from '../session';

export const EXPORT_FPS = 30;
export class ExportUnsupportedError extends Error {}

/** Encode one frame with a configuration: some devices report support, then fail to encode. */
async function encodes(config: VideoEncoderConfig) {
  let produced = false, failed = false;
  const encoder = new VideoEncoder({ output: chunk => { if (chunk.byteLength) produced = true; }, error: () => { failed = true; } });
  try {
    encoder.configure(config);
    const canvas = document.createElement('canvas'); canvas.width = config.width; canvas.height = config.height;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#6b6258'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const frame = new VideoFrame(canvas, { timestamp: 0, duration: Math.round(1e6 / EXPORT_FPS) });
    try { encoder.encode(frame, { keyFrame: true }); } finally { frame.close(); }
    await Promise.race([encoder.flush(), pause(8000).then(() => { throw new Error('timeout'); })]);
    return produced && !failed;
  } catch { return false; } finally { if (encoder.state !== 'closed') encoder.close(); }
}

/** Conservative H.264 settings; the first configuration the device actually encodes with wins. */
export async function findEncoderConfig(width: number, height: number): Promise<VideoEncoderConfig | null> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return null;
  const bitrate = width * height >= 1920 * 1080 ? 10_000_000 : width * height >= 1280 * 720 ? 5_000_000 : 3_500_000;
  const candidates = ['avc1.640028', 'avc1.4d0028', 'avc1.42001f', 'avc1.42002a'].flatMap(codec => [
    { codec, width, height, framerate: EXPORT_FPS, bitrate, avc: { format: 'avc' as const }, latencyMode: 'quality' as const },
    // Minimal form, for encoders that reject optional members.
    { codec, width, height, bitrate },
  ]);
  for (const config of candidates) {
    try {
      const result = await VideoEncoder.isConfigSupported(config);
      if (!result.supported) continue;
      const accepted = { ...config, ...result.config, codec: config.codec } as VideoEncoderConfig;
      if (await encodes(accepted)) return accepted;
    } catch { /* Try the next configuration. */ }
  }
  return null;
}

/** AAC where the browser can encode it (best compatibility), otherwise Opus. */
export async function findAudioConfig(sampleRate: number, channels: number): Promise<{ config: AudioEncoderConfig; track: AudioTrack } | null> {
  if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') return null;
  for (const [codec, kind, bitrate] of [['mp4a.40.2', 'aac', 192_000], ['opus', 'opus', 160_000]] as const) {
    const config: AudioEncoderConfig = { codec, sampleRate, numberOfChannels: channels, bitrate };
    try { if ((await AudioEncoder.isConfigSupported(config)).supported) return { config, track: { codec: kind, sampleRate, channels, bitrate } }; }
    catch { /* Try the next codec. */ }
  }
  return null;
}

/** Encode a rendered soundtrack into the writer's audio track, in 20 ms blocks. */
async function encodeAudio(buffer: AudioBuffer, writer: Mp4Writer, found: NonNullable<Awaited<ReturnType<typeof findAudioConfig>>>) {
  let failure: unknown = null;
  const encoder = new AudioEncoder({ output: (chunk, metadata) => { try { writer.addAudio(chunk, metadata); } catch (error) { failure = error; } }, error: error => { failure = error; } });
  try {
    encoder.configure(found.config);
    writer.setAudio(found.track);
    const { sampleRate, numberOfChannels: channels, length } = buffer, block = Math.round(sampleRate / 50);
    const planes = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
    for (let start = 0; start < length && !failure; start += block) {
      const frames = Math.min(block, length - start), data = new Float32Array(frames * channels);
      planes.forEach((plane, c) => data.set(plane.subarray(start, start + frames), c * frames));
      const audio = new AudioData({ format: 'f32-planar', sampleRate, numberOfFrames: frames, numberOfChannels: channels, timestamp: Math.round(start * 1e6 / sampleRate), data });
      try { encoder.encode(audio); } finally { audio.close(); }
      while (encoder.encodeQueueSize > 8 && !failure) await pause(2);
    }
    await encoder.flush();
    if (failure) throw failure;
  } finally { if (encoder.state !== 'closed') encoder.close(); }
}

/** Name the step that failed, so a report from a device says where. */
function stepError(step: string, error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return error;
  const detail = error instanceof Error ? `${error.name && error.name !== 'Error' ? `${error.name}: ` : ''}${error.message}` : String(error);
  return new Error(`${step} failed (${detail}).`);
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
export async function exportScreening(session: ScreeningSession, format: ExportFormat, { signal, onProgress, maxSeconds, size, audio, onSilent }: {
  signal: AbortSignal; onProgress: (progress: ExportProgress) => void; maxSeconds?: number;
  /** Output size instead of the format's (the showreel offers 1080p). */
  size?: { width: number; height: number };
  /** A soundtrack, already rendered to the video's length. */
  audio?: AudioBuffer;
  /** Called when the soundtrack cannot be encoded here; the video is then silent. */
  onSilent?: () => void;
}): Promise<Blob> {
  const { width, height } = size ?? EXPORT_FORMATS[format];
  const config = await findEncoderConfig(width, height);
  if (!config) throw new ExportUnsupportedError('This browser cannot encode H.264 video.');
  // The scene registers its renderer in its own effect, which can run after
  // this view's effect when the export code is already loaded.
  for (let waited = 0; !session.engine && waited < 5000 && !signal.aborted; waited += 16) await pause(16);
  if (signal.aborted) throw abortError();
  const engine = session.engine;
  if (!engine) throw new Error('The light table is not ready to render.');
  const writer = new Mp4Writer(width, height);
  if (audio) {
    const found = await findAudioConfig(audio.sampleRate, audio.numberOfChannels);
    try { if (!found) throw new Error('No audio encoder'); await encodeAudio(audio, writer, found); }
    catch (error) { if (signal.aborted) throw abortError(); console.warn('Soundtrack not encoded', error); writer.dropAudio(); onSilent?.(); }
  }
  let failure: unknown = null, step = 'Starting the encoder';
  const encoder = new VideoEncoder({ output: (chunk, metadata) => { try { writer.add(chunk, metadata); } catch (error) { failure = stepError('Writing the video', error); } }, error: error => { failure = stepError('Encoding', error); } });
  try {
    encoder.configure(config);
    step = 'Preparing the light table';
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
      if (signal.aborted) throw abortError();
      step = `Rendering frame ${frame + 1}`;
      const canvas = engine.render(time);
      step = `Encoding frame ${frame + 1}`;
      const video = new VideoFrame(canvas, { timestamp: Math.round(frame * 1e6 / EXPORT_FPS), duration: Math.round(1e6 / EXPORT_FPS) });
      try { encoder.encode(video, { keyFrame: frame % (2 * EXPORT_FPS) === 0 }); } finally { video.close(); }
      while (encoder.encodeQueueSize > 3 && !failure) await pause(4);
      const now = performance.now(); active += now - last; last = now;
      onProgress({ frame: frame + 1, total, elapsed: active, remaining: active / (frame + 1) * (total - frame - 1), paused: false, preview: canvas });
      // Yield so progress paints and Cancel remains responsive.
      await pause();
    }
    step = 'Finishing the video';
    await encoder.flush();
    if (failure) throw failure;
    step = 'Writing the video';
    return writer.finish();
  } catch (error) {
    throw error === failure ? error : stepError(step, error);
  } finally {
    if (encoder.state !== 'closed') encoder.close();
    engine.end();
  }
}
