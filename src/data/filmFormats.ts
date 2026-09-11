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
