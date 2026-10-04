import { FILM_MODEL_UNIT } from './physicalScale';

export const FILM_FORMATS = {
  '135': { label: '35mm', width: 36, height: 24, filmWidth: 35, perStrip: 6, typicalCount: 36 },
  '135-half': { label: '35mm · Half frame', width: 18, height: 24, filmWidth: 35, perStrip: 12, typicalCount: 72 },
  '645': { label: '120 · 6×4.5', width: 41.5, height: 56, filmWidth: 61, perStrip: 4, typicalCount: 16 },
  '66': { label: '120 · 6×6', width: 56, height: 56, filmWidth: 61, perStrip: 3, typicalCount: 12 },
  '67': { label: '120 · 6×7', width: 68.5, height: 56, filmWidth: 61, perStrip: 3, typicalCount: 10 },
  '69': { label: '120 · 6×9', width: 82.6, height: 56, filmWidth: 61, perStrip: 2, typicalCount: 8 },
} as const;
export type FilmFormat = keyof typeof FILM_FORMATS;
export const isFilmFormat = (value: string): value is FilmFormat => Object.hasOwn(FILM_FORMATS, value);
/** Frame size and film stock type are independent: half frame uses a 35mm cartridge. */
export const filmType = (format: FilmFormat | '120') => format === '135' || format === '135-half' ? '135' : '120';
export function formatLayout(format: FilmFormat) {
  const f = FILM_FORMATS[format], unit = FILM_MODEL_UNIT;
  return { frameWidth: f.width * unit, frameHeight: f.height * unit, marginY: (f.filmWidth - f.height) / 2 * unit, marginX: .08, gap: format === '135-half' ? frameGapMm(format) * unit : .04, perforated: filmType(format) === '135' };
}

export type FrameSizing = 'fixed' | 'free';
export const FILM_UNIT = FILM_MODEL_UNIT;
export const FRAME_GAP_MM = 3;
// Two half-frame advances occupy one full-frame advance. Free sizing keeps its usual spacing.
export const frameGapMm = (format: FilmFormat, sizing: FrameSizing = 'fixed') => format === '135-half' && sizing === 'fixed' ? FRAME_GAP_MM / 2 : FRAME_GAP_MM;
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
  const used = frames.reduce((sum, frame) => sum + height * frameAspect(format, sizing, frame) + frameGapMm(format, sizing), 0);
  const type = filmType(format);
  const capacity = FILM_LENGTH_MM[type], nominal = NOMINAL_FILM_LENGTH_MM[type];
  return { used, capacity, nominal, usingExtra: used > nominal + 1e-7, remaining: Math.max(0, capacity - used), exceeded: used > capacity + 1e-7 };
}
export function rollFormatLabel(format: FilmFormat, sizing: FrameSizing = 'fixed') {
  return sizing === 'free' ? `${filmType(format) === '135' ? '35mm' : '120'} · Free` : FILM_FORMATS[format].label;
}
