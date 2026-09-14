export const FILM_FORMATS = {
  '135': { label: '35mm', width: 36, height: 24, filmWidth: 35, perStrip: 6, typicalCount: 36 },
  '645': { label: '120 · 6×4.5', width: 41.5, height: 56, filmWidth: 61, perStrip: 4, typicalCount: 16 },
  '66': { label: '120 · 6×6', width: 56, height: 56, filmWidth: 61, perStrip: 3, typicalCount: 12 },
  '67': { label: '120 · 6×7', width: 68.5, height: 56, filmWidth: 61, perStrip: 3, typicalCount: 10 },
  '69': { label: '120 · 6×9', width: 82.6, height: 56, filmWidth: 61, perStrip: 2, typicalCount: 8 },
} as const;
export type FilmFormat = keyof typeof FILM_FORMATS;
export const isFilmFormat = (value: string): value is FilmFormat => Object.hasOwn(FILM_FORMATS, value);
export function formatLayout(format: FilmFormat) {
  const f = FILM_FORMATS[format], unit = .55 / 36;
  return { frameWidth: f.width * unit, frameHeight: f.height * unit, marginY: (f.filmWidth - f.height) / 2 * unit, marginX: .08, gap: .04, perforated: format === '135' };
}

export type FrameSizing = 'fixed' | 'free';
export const FILM_UNIT = .55 / 36;
export const FRAME_GAP_MM = 3;
// Usable image span, including one advance gap per exposure; leaders are excluded.
export const NOMINAL_FILM_LENGTH_MM = { '135': 36 * (36 + FRAME_GAP_MM), '120': 728 } as const;
// Application allowance for unusually long rolls, not a claim about physical stock length.
export const EXTRA_FILM_ALLOWANCE = .25;
export const FILM_LENGTH_MM = {
  '135': NOMINAL_FILM_LENGTH_MM['135'] * (1 + EXTRA_FILM_ALLOWANCE),
  '120': NOMINAL_FILM_LENGTH_MM['120'] * (1 + EXTRA_FILM_ALLOWANCE),
} as const;
export interface FrameDimensions { width: number; height: number; rotation?: number }
export function frameAspect(format: FilmFormat, sizing: FrameSizing = 'fixed', frame?: FrameDimensions) {
  if (sizing === 'free' && frame) return (frame.rotation ?? 0) % 180 ? frame.height / frame.width : frame.width / frame.height;
  return FILM_FORMATS[format].width / FILM_FORMATS[format].height;
}
export function filmLengthUsage(format: FilmFormat, sizing: FrameSizing, frames: readonly FrameDimensions[]) {
  const height = FILM_FORMATS[format].height;
  const used = frames.reduce((sum, frame) => sum + height * frameAspect(format, sizing, frame) + FRAME_GAP_MM, 0);
  const type = format === '135' ? '135' : '120';
  const capacity = FILM_LENGTH_MM[type], nominal = NOMINAL_FILM_LENGTH_MM[type];
  return { used, capacity, nominal, usingExtra: used > nominal + 1e-7, remaining: Math.max(0, capacity - used), exceeded: used > capacity + 1e-7 };
}
export function rollFormatLabel(format: FilmFormat, sizing: FrameSizing = 'fixed') {
  return sizing === 'free' ? `${format === '135' ? '35mm' : '120'} · Free` : FILM_FORMATS[format].label;
}
